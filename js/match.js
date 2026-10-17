/**
 * Spades by Hadzz - Authoritative Match Engine (shared)
 * Runs on the online server (server/server.js) AND in the browser for offline
 * Pass & Play. Uses the same rules engine (js/engine.js) and fair bot AI (js/bot.js)
 * as the offline game. Each seat's snapshot only ever contains its own hand.
 * Requires js/engine.js and js/bot.js to be loaded first.
 */
(function (root) {
'use strict';

const SH = (root.SpadesHadzz = root.SpadesHadzz || {});
const env = typeof process !== 'undefined' && process.env ? process.env : {};

const COMPASS = ['South', 'West', 'North', 'East'];
const COMPASS_LETTER = ['S', 'W', 'N', 'E'];
// 3-player cutthroat: South, West, East (clockwise, no North)
const COMPASS_3 = ['South', 'West', 'East'];
const COMPASS_LETTER_3 = ['S', 'W', 'E'];
const DIFFICULTIES = ['Beginner', 'Easy', 'Medium', 'Hard', 'Impossible'];

const TIMING = {
  roundAutoAdvanceMs: 30000,
  turnMs: 45000 // Online: a human who doesn't act in time gets one auto-move
};

// Automated tests run whole matches quickly
const FAST_TIMERS = env.SPADES_FAST_TIMERS
  ? { botBidMs: 2, botPlayMs: 2, trickPauseMs: 2, roundAutoAdvanceMs: 150, turnMs: Number(env.SPADES_TURN_MS) || 5000 }
  : null;

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  root.crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

class OnlineMatch {
  /**
   * @param {object} opts
   * @param {Array<{userId: string|null, name: string, avatar: string}>} opts.seats  4 seats (null userId = AI bot)
   * @param {number} opts.targetScore 250 | 500
   * @param {string} opts.difficulty  Bot AI level
   * @param {(match: OnlineMatch) => void} opts.onUpdate  called after every state change
   * @param {(match: OnlineMatch) => void} opts.onGameOver
   * @param {string} [opts.speed]  'relaxed' | 'normal' | 'fast' table pace
   * @param {number|null} [opts.turnMs]  human turn limit; null = wait forever (Pass & Play)
   */
  constructor({ seats, targetScore, difficulty, onUpdate, onGameOver, speed, turnMs }) {
    this.matchId = `om_${Date.now().toString(36)}_${randomHex(4)}`;
    this.speed = SH.GAME_SPEEDS && SH.GAME_SPEEDS[speed] ? speed : 'normal';
    this.timing = {
      ...SH.getGameSpeed(this.speed),
      roundAutoAdvanceMs: TIMING.roundAutoAdvanceMs,
      turnMs: turnMs === undefined ? TIMING.turnMs : turnMs,
      ...(FAST_TIMERS || {})
    };
    if (turnMs === null) this.timing.turnMs = null;
    this.manualPause = false;
    this.humanCount = seats.filter(x => x.userId).length; // 2-human or 4-human match
    this.targetScore = Number(targetScore) === 250 ? 250 : 500;
    this.difficulty = DIFFICULTIES.includes(difficulty) ? difficulty : 'Medium';
    this.onUpdate = onUpdate || (() => {});
    this.onGameOver = onGameOver || (() => {});

    this.roundNumber = 0;
    // 4 seats = two partnerships; 3 seats = cutthroat (every player is their own "team")
    this.numSeats = seats.length === 3 ? 3 : 4;
    this.numTeams = this.numSeats === 3 ? 3 : 2;
    this.tricksPerRound = this.numSeats === 3 ? 17 : 13;
    this.dealerSeat = this.numSeats - 2; // Advances once in Round 1 so South bids & leads first
    this.teamScores = Array(this.numTeams).fill(0); // 4p: [Blue (0 & 2), Red (1 & 3)] · 3p: per seat
    this.teamBags = Array(this.numTeams).fill(0);
    const botNames = SH.pickBotNames(4, seats.filter(x => x.userId).map(x => x.name));
    this.players = seats.map((s, seat) => ({
      seat,
      compass: (this.numSeats === 3 ? COMPASS_3 : COMPASS)[seat],
      team: this.numSeats === 3 ? seat : seat % 2,
      userId: s.userId || null,
      name: s.userId ? s.name : (s.name || botNames[seat] || `Bot ${seat + 1}`),
      avatar: s.avatar || 'free_ace',
      account: s.userId ? (s.account || null) : null,
      isBot: !s.userId,
      wasHuman: Boolean(s.userId), // stays true if a human quits and a bot takes over
      connected: Boolean(s.userId),
      away: false, // Left the table (bot covers) but kept the seat to resume later
      hand: [],
      bid: null,
      tricks: 0
    }));

    this.phase = 'bidding';
    this.turnSeat = 0;
    this.leadSeat = 0;
    this.spadesBroken = false;
    this.trickNumber = 1;
    this.currentTrick = [];
    this.lastCompletedTrick = [];
    this.playedHistory = [];
    this.lastTrickWinner = null;
    this.roundSummary = null;
    this.nextRoundAcks = new Set();
    this.seq = 0;
    this.lastEvent = null;
    this.timer = null;
    this.turnKey = null;
    this.turnDeadline = null;
    this.paused = false;
    this.destroyed = false;
  }

  // ---------------------------------------------------------------- helpers

  isBotControlled(seat) {
    const p = this.players[seat];
    return p.isBot || !p.connected || p.away;
  }

  /** At least one human is connected and sitting at the table. */
  hasActiveHuman() {
    return this.players.some(p => !p.isBot && p.connected && !p.away);
  }

  seatOfUser(userId) {
    const p = this.players.find(pl => pl.userId === userId);
    return p ? p.seat : -1;
  }

  humanSeats() {
    return this.players.filter(p => !p.isBot);
  }

  _event(type, data = {}) {
    this.seq += 1;
    this.lastEvent = { seq: this.seq, type, ...data };
  }

  _changed() {
    if (this.destroyed) return;
    this._scheduleAutomation(); // first, so snapshots carry the fresh turn timer
    this.onUpdate(this);
  }

  _clearTimer() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  _scheduleAutomation() {
    this._clearTimer();
    if (this.destroyed) return;

    // Everyone left the table (or the device app is paused): freeze so it can be resumed later
    this.paused = (this.manualPause || !this.hasActiveHuman()) && this.phase !== 'game_over';
    if (this.paused) {
      this.turnKey = null;
      this.turnDeadline = null;
      return;
    }

    const isTurnPhase = this.phase === 'bidding' || this.phase === 'playing';
    if (isTurnPhase && !this.isBotControlled(this.turnSeat)) {
      // Human turn timer (kept across unrelated updates, reset when the turn changes)
      if (this.timing.turnMs === null) {
        this.turnKey = null;
        this.turnDeadline = null;
        return; // No turn limit: wait for the human
      }
      const key = `${this.roundNumber}:${this.phase}:${this.trickNumber}:${this.currentTrick.length}:${this.turnSeat}`;
      if (key !== this.turnKey) {
        this.turnKey = key;
        this.turnDeadline = Date.now() + this.timing.turnMs;
      }
      const seat = this.turnSeat;
      this.timer = setTimeout(() => this._autoMoveForHuman(seat), Math.max(0, this.turnDeadline - Date.now()));
      return;
    }
    this.turnKey = null;
    this.turnDeadline = null;

    if (this.phase === 'bidding' && this.isBotControlled(this.turnSeat)) {
      const seat = this.turnSeat;
      this.timer = setTimeout(() => this._runBotBid(seat), this.timing.botBidMs);
    } else if (this.phase === 'playing' && this.isBotControlled(this.turnSeat)) {
      const seat = this.turnSeat;
      this.timer = setTimeout(() => this._runBotPlay(seat), this.timing.botPlayMs);
    } else if (this.phase === 'trick_pause') {
      this.timer = setTimeout(() => this._completeTrick(), this.timing.trickPauseMs);
    } else if (this.phase === 'round_over') {
      if (this._allHumansAcked()) {
        this.timer = setTimeout(() => this.startNextRound(), 400);
      } else {
        this.timer = setTimeout(() => this.startNextRound(), this.timing.roundAutoAdvanceMs);
      }
    }
  }

  _allHumansAcked() {
    const needed = this.players.filter(p => !p.isBot && p.connected);
    return needed.every(p => this.nextRoundAcks.has(p.seat));
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.startNextRound();
  }

  destroy() {
    this.destroyed = true;
    this._clearTimer();
  }

  startNextRound() {
    if (this.destroyed || this.phase === 'game_over') return;
    if (this.roundNumber > 0 && this.phase !== 'round_over') return;
    this._clearTimer();

    this.roundNumber += 1;
    this.roundId = `${this.matchId}_r${this.roundNumber}`;
    const n = this.numSeats;
    this.dealerSeat = (this.dealerSeat + 1) % n;
    const firstActor = (this.dealerSeat + 1) % n;

    // Fresh server-side cryptographic shuffle & clockwise deal every round
    const hands = SH.dealHands(n, this.dealerSeat);
    for (let s = 0; s < n; s++) {
      this.players[s].hand = hands[s];
      this.players[s].bid = null;
      this.players[s].tricks = 0;
    }

    this.phase = 'bidding';
    this.turnSeat = firstActor;
    this.leadSeat = firstActor;
    this.spadesBroken = false;
    this.trickNumber = 1;
    this.currentTrick = [];
    this.lastCompletedTrick = [];
    this.playedHistory = [];
    this.lastTrickWinner = null;
    this.roundSummary = null;
    this.nextRoundAcks = new Set();

    this._event('round_dealt', { roundNumber: this.roundNumber });
    this._changed();
  }

  // ---------------------------------------------------------------- actions

  submitBid(seat, rawBid) {
    if (this.phase !== 'bidding') return { ok: false, code: 'not_bidding', message: 'Bidding is closed.' };
    if (this.turnSeat !== seat) return { ok: false, code: 'not_your_turn', message: 'Please wait for your turn to bid.' };
    const bid = Number(rawBid);
    if (!Number.isInteger(bid) || bid < 0 || bid > 10) {
      return { ok: false, code: 'bad_bid', message: 'Bids must be a whole number from 0 (Nil) to 10.' };
    }

    this.players[seat].bid = bid;
    if (this.players.every(p => p.bid !== null)) {
      this.phase = 'playing';
      this.turnSeat = this.leadSeat;
    } else {
      this.turnSeat = (this.turnSeat + 1) % this.numSeats;
    }
    this._event('bid', { seat, bid, auto: this.autoMoveSeat === seat });
    this._changed();
    return { ok: true };
  }

  playCard(seat, cardId) {
    if (this.phase !== 'playing') return { ok: false, code: 'not_playing', message: 'Cards cannot be played right now.' };
    if (this.turnSeat !== seat) return { ok: false, code: 'not_your_turn', message: 'Please wait for your turn to play a card.' };
    const player = this.players[seat];
    const card = player.hand.find(c => c.id === cardId);
    const check = SH.validateCardPlay(card, player.hand, this.currentTrick, this.spadesBroken);
    if (!check.valid) return { ok: false, code: 'illegal_play', message: check.reason };

    player.hand = player.hand.filter(c => c.id !== card.id);
    this.currentTrick.push({ seat, card });

    let brokeSpades = false;
    if (card.suit === 'S' && !this.spadesBroken) {
      this.spadesBroken = true;
      brokeSpades = true;
    }

    if (this.currentTrick.length < this.numSeats) {
      this.turnSeat = (this.turnSeat + 1) % this.numSeats;
    } else {
      this.phase = 'trick_pause';
      this.lastTrickWinner = SH.resolveTrickWinner(this.currentTrick);
    }

    this._event(brokeSpades ? 'spades_broken' : 'card_played', { seat, cardId: card.id, auto: this.autoMoveSeat === seat });
    this._changed();
    return { ok: true };
  }

  ackNextRound(seat) {
    if (this.phase !== 'round_over') return { ok: false, code: 'not_round_over', message: 'The round is still in progress.' };
    this.nextRoundAcks.add(seat);
    this._scheduleAutomation();
    this.onUpdate(this);
    return { ok: true };
  }

  /** Pass & Play: freeze/unfreeze the whole table (e.g. while the app is on another screen). */
  setPaused(paused) {
    if (this.manualPause === Boolean(paused)) return;
    this.manualPause = Boolean(paused);
    this._scheduleAutomation();
    this.onUpdate(this);
  }

  setSeatAway(seat, away) {
    const p = this.players[seat];
    if (!p || p.isBot || p.away === away) return;
    p.away = away;
    this._event(away ? 'player_away' : 'player_returned', { seat });
    this._changed();
  }

  setSeatConnected(seat, connected) {
    const p = this.players[seat];
    if (!p || p.isBot || p.connected === connected) return;
    p.connected = connected;
    this._event(connected ? 'player_reconnected' : 'player_disconnected', { seat });
    this._changed();
  }

  /** A human permanently leaves; their seat becomes an AI bot for the rest of the match. */
  convertSeatToBot(seat) {
    const p = this.players[seat];
    if (!p || p.isBot) return;
    p.isBot = true;
    p.connected = false;
    p.userId = null;
    p.name = `${p.name} (Bot)`;
    this._event('player_quit', { seat });
    this._changed();
  }

  // ---------------------------------------------------------------- bots

  _autoMoveForHuman(seat) {
    if (this.destroyed || this.turnSeat !== seat || this.isBotControlled(seat)) return;
    this.autoMoveSeat = seat;
    if (this.phase === 'bidding') this._runBotBid(seat);
    else if (this.phase === 'playing') this._runBotPlay(seat);
    this.autoMoveSeat = null;
  }

  _runBotBid(seat) {
    if (this.destroyed || this.phase !== 'bidding' || this.turnSeat !== seat) return;
    const player = this.players[seat];
    const bid = SH.chooseBotBid({
      ownHand: [...player.hand],
      seat,
      bids: this.players.map(p => p.bid),
      difficulty: this.difficulty,
      numPlayers: this.numSeats
    });
    this.submitBid(seat, Math.max(0, Math.min(10, Math.round(bid))));
  }

  _runBotPlay(seat) {
    if (this.destroyed || this.phase !== 'playing' || this.turnSeat !== seat) return;
    const bot = this.players[seat];
    // Bots receive public information only (own hand, bids, played history)
    let card = SH.chooseBotCard({
      ownHand: [...bot.hand],
      seat,
      bids: this.players.map(p => p.bid),
      tricksWon: this.players.map(p => p.tricks),
      currentTrick: [...this.currentTrick],
      playedHistory: [...this.playedHistory],
      spadesBroken: this.spadesBroken,
      teamBags: [...this.teamBags],
      difficulty: this.difficulty,
      numPlayers: this.numSeats
    });
    if (!card || !SH.validateCardPlay(card, bot.hand, this.currentTrick, this.spadesBroken).valid) {
      card = SH.getLegalCards(bot.hand, this.currentTrick, this.spadesBroken)[0];
    }
    this.playCard(seat, card.id);
  }

  // ---------------------------------------------------------------- tricks & scoring

  _completeTrick() {
    if (this.destroyed || this.phase !== 'trick_pause') return;
    const winnerSeat = this.lastTrickWinner;
    const ledSuit = this.currentTrick[0].card.suit;
    for (const play of this.currentTrick) {
      this.playedHistory.push({ seat: play.seat, card: play.card, ledSuit, trickNumber: this.trickNumber });
    }
    this.players[winnerSeat].tricks += 1;
    this.lastCompletedTrick = [...this.currentTrick];
    this.currentTrick = [];

    if (this.trickNumber >= this.tricksPerRound) {
      this._evaluateRoundEnd(winnerSeat);
      return;
    }

    this.trickNumber += 1;
    this.leadSeat = winnerSeat;
    this.turnSeat = winnerSeat;
    this.lastTrickWinner = null;
    this.phase = 'playing';
    this._event('trick_won', { seat: winnerSeat });
    this._changed();
  }

  _evaluateRoundEnd(lastWinnerSeat) {
    const p = this.players;
    const teams = this.numSeats === 3
      ? p.map((pl, i) => SH.computeSoloRoundScore(pl, this.teamScores[i], this.teamBags[i]))
      : [
          SH.computeTeamRoundScore(p[0], p[2], this.teamScores[0], this.teamBags[0]),
          SH.computeTeamRoundScore(p[1], p[3], this.teamScores[1], this.teamBags[1])
        ];

    this.teamScores = teams.map(t => t.newScore);
    this.teamBags = teams.map(t => t.newBags);

    // Round won by the single highest positive net round score
    const bestDelta = Math.max(...teams.map(t => t.netDelta));
    const topRound = teams.map((t, i) => i).filter(i => teams[i].netDelta === bestDelta);
    const roundWinnerTeam = bestDelta > 0 && topRound.length === 1 ? topRound[0] : null;

    // Match ends when someone reaches the target with a unique top score (ties play another round)
    const bestScore = Math.max(...this.teamScores);
    const leaders = this.teamScores.map((sc, i) => i).filter(i => this.teamScores[i] === bestScore);
    const someoneReached = this.teamScores.some(sc => sc >= this.targetScore);
    const tied = leaders.length > 1;
    const matchFinished = someoneReached && !tied;
    const matchWinnerTeam = matchFinished ? leaders[0] : null;

    this.roundSummary = {
      roundNumber: this.roundNumber,
      roundKey: `online_round_${this.roundId}`,
      matchKey: `online_match_${this.matchId}`,
      teams,
      solo: this.numSeats === 3,
      roundWinnerTeam,
      matchFinished,
      matchWinnerTeam,
      tieBreaker: someoneReached && tied,
      targetScore: this.targetScore
    };
    this.phase = matchFinished ? 'game_over' : 'round_over';
    this.lastTrickWinner = null;
    this._event(matchFinished ? 'game_over' : 'round_over', { seat: lastWinnerSeat });
    this._changed();
    if (matchFinished) this.onGameOver(this);
  }

  // ---------------------------------------------------------------- serialization

  /** Full state for saving a Pass & Play game on the device. */
  serialize() {
    const keys = ['matchId', 'humanCount', 'numSeats', 'numTeams', 'tricksPerRound', 'speed', 'targetScore', 'difficulty', 'roundNumber', 'roundId', 'dealerSeat', 'teamScores', 'teamBags',
      'players', 'phase', 'turnSeat', 'leadSeat', 'spadesBroken', 'trickNumber', 'currentTrick', 'lastCompletedTrick',
      'playedHistory', 'lastTrickWinner', 'roundSummary', 'seq', 'lastEvent'];
    const data = {};
    for (const k of keys) data[k] = this[k];
    data.nextRoundAcks = [...this.nextRoundAcks];
    data.turnMs = this.timing.turnMs;
    return JSON.parse(JSON.stringify(data));
  }

  /** Rebuilds a saved match; call `resume()` to restart its timers. */
  static restore(data, { onUpdate, onGameOver, speed } = {}) {
    const m = new OnlineMatch({
      seats: data.players.map(p => ({ userId: p.userId, name: p.name, avatar: p.avatar, account: p.account })),
      targetScore: data.targetScore,
      difficulty: data.difficulty,
      speed: speed || data.speed,
      turnMs: data.turnMs === undefined ? null : data.turnMs,
      onUpdate,
      onGameOver
    });
    const { nextRoundAcks, turnMs, speed: savedSpeed, ...rest } = data;
    Object.assign(m, rest);
    m.nextRoundAcks = new Set(nextRoundAcks || []);
    return m;
  }

  resume() {
    this._scheduleAutomation();
    this.onUpdate(this);
  }

  /** Changes table pace mid-game (Settings → Game Speed). */
  setSpeed(speed) {
    if (!SH.GAME_SPEEDS || !SH.GAME_SPEEDS[speed]) return;
    this.speed = speed;
    Object.assign(this.timing, SH.getGameSpeed(speed), FAST_TIMERS || {});
  }

  /** Personalized snapshot: only `seat`'s own hand is ever included. */
  snapshotFor(seat) {
    return {
      matchId: this.matchId,
      roundId: this.roundId,
      seq: this.seq,
      lastEvent: this.lastEvent,
      mySeat: seat,
      humanCount: this.humanCount,
      numSeats: this.numSeats,
      tricksPerRound: this.tricksPerRound,
      targetScore: this.targetScore,
      difficulty: this.difficulty,
      roundNumber: this.roundNumber,
      phase: this.phase,
      turnSeat: this.turnSeat,
      leadSeat: this.leadSeat,
      dealerSeat: this.dealerSeat,
      spadesBroken: this.spadesBroken,
      trickNumber: this.trickNumber,
      teamScores: [...this.teamScores],
      teamBags: [...this.teamBags],
      players: this.players.map(p => ({
        seat: p.seat,
        compass: p.compass,
        compassLetter: (this.numSeats === 3 ? COMPASS_LETTER_3 : COMPASS_LETTER)[p.seat],
        team: p.team,
        name: p.name,
        avatar: p.avatar,
        account: p.account || null,
        isBot: p.isBot,
        wasHuman: Boolean(p.wasHuman),
        botControlled: this.isBotControlled(p.seat),
        connected: p.connected,
        away: p.away,
        bid: p.bid,
        tricks: p.tricks,
        handCount: p.hand.length
      })),
      hand: seat >= 0 && seat < this.numSeats ? this.players[seat].hand.map(c => ({ ...c })) : [],
      currentTrick: this.currentTrick.map(t => ({ seat: t.seat, card: { ...t.card } })),
      lastTrickWinner: this.lastTrickWinner,
      paused: this.paused,
      turnMsLeft: this.turnDeadline ? Math.max(0, this.turnDeadline - Date.now()) : null,
      roundSummary: this.roundSummary,
      nextRoundAcks: [...this.nextRoundAcks],
      nextRoundNeeded: this.players.filter(pl => !pl.isBot && pl.connected).map(pl => pl.seat)
    };
  }
}

SH.OnlineMatch = OnlineMatch;
SH.MATCH_COMPASS = COMPASS;
if (typeof module === 'object' && module.exports) {
  module.exports = { OnlineMatch, COMPASS, DIFFICULTIES, TIMING };
}
})(typeof globalThis !== 'undefined' ? globalThis : window);
