// Spades by Hadzz — server end-to-end test
// Real server + real WebSocket clients (needs Node 22+ for the global WebSocket).
// Run:  node tests/server.e2e.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
require(path.join(ROOT, 'js/engine.js'));
require(path.join(ROOT, 'js/bot.js'));
const SH = globalThis.SpadesHadzz;

const PORT = 18000 + Math.floor(Math.random() * 1000);
const DATA_DIR = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'spades-e2e-'));
const URL = `ws://127.0.0.1:${PORT}/ws`;

let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, SPADES_FAST_TIMERS: '1', SPADES_MSG_LIMIT: '100000', SPADES_TURN_MS: '1500' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });

class Client {
  constructor(name, password = `pw_${name}_secret`) {
    this.name = name; this.password = password; this.session = null; this.lastActSeq = -1; this.inbox = []; this.waiters = [];
    this.match = null; this.room = undefined; this.social = null; this.chats = []; this.autoplay = false; this.matchStates = 0;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (e) => this.onMsg(JSON.parse(e.data));
    });
  }
  onMsg(m) {
    this.inbox.push(m);
    if (m.t === 'match:state') { if (!this.firstMatch) this.firstMatch = m.match; this.match = m.match; this.matchStates++; if (this.autoplay) this.act(); }
    if (m.t === 'room:state') this.room = m.room;
    if (m.t === 'welcome' && m.session) this.session = m.session;
    if (m.t === 'social:state') this.social = m;
    if (m.t === 'chat') this.chats.push(m);
    this.waiters = this.waiters.filter(w => { if (w.pred(m)) { w.resolve(m); return false; } return true; });
  }
  send(t, p = {}) { this.ws.send(JSON.stringify({ t, ...p })); }
  waitFor(pred, ms = 3000, label = '') {
    const found = this.inbox.find(pred);
    if (found) { this.inbox = this.inbox.filter(x => x !== found); return Promise.resolve(found); }
    return new Promise((resolve, reject) => {
      const w = { pred, resolve: (m) => { clearTimeout(timer); this.inbox = this.inbox.filter(x => x !== m); resolve(m); } };
      const timer = setTimeout(() => { this.waiters = this.waiters.filter(x => x !== w); reject(new Error(`${this.name} timeout waiting for ${label}`)); }, ms);
      this.waiters.push(w);
    });
  }
  clear() { this.inbox = []; }
  register(username = this.name) { this.send('auth:register', { username, password: this.password, avatar: 'free_ace' }); }
  login(username = this.name, password = this.password) { this.send('auth:login', { username, password }); }
  resume() { this.send('hello', { session: this.session }); }
  act() {
    const m = this.match;
    if (m && m.seq === this.lastActSeq && !(m.phase === 'round_over' && !this.ackedRound?.has(m.roundNumber))) return;
    if (m) this.lastActSeq = m.seq;
    if (!m || m.turnSeat !== m.mySeat) {
      if (m && m.phase === 'round_over' && !m.nextRoundAcks.includes(m.mySeat) && !(this.ackedRound ||= new Set()).has(m.roundNumber)) { this.ackedRound.add(m.roundNumber); this.send('game:next_round'); }
      return;
    }
    if (m.phase === 'bidding') this.send('game:bid', { bid: SH.chooseBotBid({ ownHand: m.hand, seat: m.mySeat, bids: m.players.map(p => p.bid), difficulty: 'Hard', numPlayers: m.numSeats }) });
    if (m.phase === 'playing') {
      this.history = m.trickNumber === 1 && m.currentTrick.length <= 1 && m.roundNumber !== this.histRound ? [] : (this.history || []);
      this.histRound = m.roundNumber;
      const card = SH.chooseBotCard({ ownHand: m.hand, seat: m.mySeat, bids: m.players.map(p => p.bid), tricksWon: m.players.map(p => p.tricks), currentTrick: m.currentTrick, playedHistory: [], spadesBroken: m.spadesBroken, teamBags: m.teamBags, difficulty: 'Hard', numPlayers: m.numSeats });
      this.send('game:play', { cardId: card.id });
    }
  }
  close() { this.ws.close(); }
}

async function main() {
  // wait for server
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/healthz`); if (r.ok) break; } catch (e) { /* retry */ }
    await sleep(100);
  }
  const page = await fetch(`http://127.0.0.1:${PORT}/`); ok(page.ok && (await page.text()).includes('Spades Royale'), 'HTTP serves index.html');
  const dbLeak = await fetch(`http://127.0.0.1:${PORT}/server/data/db.json`); ok(dbLeak.status === 404, 'HTTP does not expose server data files');

  // ---------------- identity
  const A = new Client('Alice'), B = new Client('Bob'), C = new Client('Cara'), D = new Client('Dan');
  for (const c of [A, B, C, D]) { await c.connect(); c.register(); }
  for (const c of [A, B, C, D]) { const w = await c.waitFor(m => m.t === 'welcome', 3000, 'welcome'); ok(w.user.username === c.name && !w.nameError, `${c.name} registered online`); }

  const Imp = new Client('Eve');
  await Imp.connect(); Imp.register('alice');
  const taken = await Imp.waitFor(m => m.t === 'error', 3000, 'taken');
  ok(taken.code === 'taken_username', 'taken_username when registering "alice" (case-insensitive)');
  Imp.register('<script>');
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'invalid_username', 'invalid_username rejects HTML characters');
  Imp.send('auth:register', { username: 'Shorty', password: '123' });
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'weak_password', 'weak_password for < 6 chars');
  Imp.login('Alice', 'wrong-password');
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'bad_credentials', 'bad_credentials for wrong password');
  Imp.send('room:create', { mode: 4 });
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'not_identified', 'actions require login');
  Imp.send('hello', { session: 'forged-session-token' });
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'session_expired', 'forged session rejected');

  // Alice logs in from a 2nd device with her password → same account
  const A2 = new Client('Alice'); await A2.connect(); A2.login('ALICE');
  const a2w = await A2.waitFor(m => m.t === 'welcome');
  ok(a2w.user.username === 'Alice' && a2w.session && a2w.session !== A.session, 'login from second device (case-insensitive) gets own session, same account');
  A2.close();
  // session resume on a fresh connection
  const A3 = new Client('Alice'); A3.session = A.session; await A3.connect(); A3.resume();
  ok((await A3.waitFor(m => m.t === 'welcome')).user.username === 'Alice', 'saved session resumes login');
  A3.send('account:rename', { username: 'bob' });
  ok((await A3.waitFor(m => m.t === 'error')).code === 'taken_username', 'rename to an existing username is blocked');
  A3.close();
  // lockout after repeated bad passwords
  const L = new Client('Locker'); await L.connect(); L.register(); await L.waitFor(m => m.t === 'welcome');
  const atk = new Client('x'); await atk.connect();
  let lastCode = '';
  for (let i = 0; i < 9; i++) { atk.login('Locker', 'nope' + i); lastCode = (await atk.waitFor(m => m.t === 'error')).code; }
  ok(lastCode === 'locked', 'account locks after repeated wrong passwords');
  atk.close(); L.close();

  // ---------------- lobby errors
  A.send('room:join', { code: 'HDZ-ZZZZ' });
  ok((await A.waitFor(m => m.t === 'error')).code === 'invalid_code', 'invalid_code for unknown room');

  A.send('room:create', { mode: 4, team: 'blue', settings: { targetScore: 250, difficulty: 'Hard' } });
  const roomMsg = await A.waitFor(m => m.t === 'room:state' && m.room);
  const code = roomMsg.room.code;
  ok(/^HDZ-[A-Z2-9]{4}$/.test(code) && roomMsg.room.mode === 4, `room created ${code}`);
  ok(roomMsg.room.seats[0].userId && roomMsg.room.hostId, 'host seated South (Team Blue)');

  B.send('room:join', { code: code.toLowerCase().replace('-', ''), team: 'blue' });
  const bRoom = await B.waitFor(m => m.t === 'room:state' && m.room && m.room.code === code);
  ok(bRoom.room.seats[2].kind === 'human', 'Bob joined with lowercase code → North (partner, opposite)');
  C.send('room:join', { code, team: 'blue' }); // blue full → auto red
  await C.waitFor(m => m.t === 'room:state' && m.room);
  D.send('room:join', { code, team: 'red' });
  const dRoom = await D.waitFor(m => m.t === 'room:state' && m.room);
  ok(dRoom.room.humans === 4 && dRoom.room.seats.every(s => s.kind === 'human'), '4/4 humans seated');
  ok(dRoom.room.seats[1].team === 'red' && dRoom.room.seats[3].team === 'red', 'Team Red = West & East');

  C.send('room:team', { team: 'blue' });
  ok((await C.waitFor(m => m.t === 'error')).code === 'team_full', 'team_full when switching to a full team');

  Imp.register('Eve'); await Imp.waitFor(m => m.t === 'welcome');
  Imp.send('room:join', { code });
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'full_room', 'full_room for 5th player');

  B.send('room:start');
  ok((await B.waitFor(m => m.t === 'error')).code === 'not_host', 'only host can start');
  A.send('room:start');
  ok((await A.waitFor(m => m.t === 'error')).code === 'not_ready', 'start blocked until all ready');

  // ---------------- friends & presence (before the match)
  A.send('user:search', { query: 'bo' });
  const sr = await A.waitFor(m => m.t === 'search:result');
  ok(sr.state === 'found' && sr.results[0].username === 'Bob' && sr.results[0].relation === 'none', 'search finds Bob');
  A.send('user:search', { query: 'nobody' });
  ok((await A.waitFor(m => m.t === 'search:result')).state === 'not_found', 'search not_found');
  A.send('friend:request', { userId: sr.results[0].id });
  await B.waitFor(m => m.t === 'social:state' && m.incoming.some(u => u.username === 'Alice'));
  ok(true, 'Bob receives incoming request from Alice');
  B.send('friend:respond', { userId: A.inbox.length >= 0 && roomMsg.room.hostId, accept: true });
  const aSoc = await A.waitFor(m => m.t === 'social:state' && m.friends.some(f => f.username === 'Bob'));
  ok(aSoc.friends.find(f => f.username === 'Bob').presence === 'online', 'friends: Alice sees Bob online');

  // Eve <-> Alice friends, for invite tests
  Imp.send('friend:request', { username: 'alice' });
  await A.waitFor(m => m.t === 'social:state' && m.incoming.some(u => u.username === 'Eve'));
  const eveId = (await new Promise(r => { Imp.send('user:search', { query: 'Eve' }); Imp.waitFor(m => m.t === 'search:result').then(r); })).results[0].id;
  A.send('friend:respond', { userId: eveId, accept: true });
  await Imp.waitFor(m => m.t === 'social:state' && m.friends.some(f => f.username === 'Alice'));
  ok(true, 'Eve & Alice are friends');

  // ---------------- 4-human match
  for (const c of [A, B, C, D]) c.clear();
  for (const c of [A, B, C, D]) { c.autoplay = true; c.send('room:ready', { ready: true }); }
  await A.waitFor(m => m.t === 'match:state', 3000, 'match start');
  await sleep(50);
  const hands = [A, B, C, D].map(c => c.firstMatch);
  ok(hands.every(m => m.hand.length === 13), 'each player receives 13 cards');
  const allIds = new Set(hands.flatMap(m => m.hand.map(c => c.id)));
  ok(allIds.size === 52, 'hands are disjoint & cover the 52-card deck');
  ok(hands.every(m => m.players.every(p => !('hand' in p))), 'snapshots never include other players\' hands');
  ok(new Set(hands.map(m => m.mySeat)).size === 4, 'each client knows its own seat');

  // presence in_match + unavailable_friend invite
  const eveSoc = await Imp.waitFor(m => m.t === 'social:state' && m.friends.some(f => f.username === 'Alice' && f.presence === 'in_match'));
  ok(Boolean(eveSoc), 'presence: Eve sees Alice in_match');
  Imp.send('invite:send', { userId: roomMsg.room.hostId });
  ok((await Imp.waitFor(m => m.t === 'error')).code === 'unavailable_friend', 'unavailable_friend when inviting a friend who is in a match');

  // illegal play rejected by server
  const turnClient = [A, B, C, D].find(c => c.match.turnSeat === c.match.mySeat && c.match.phase === 'bidding');
  if (turnClient) {
    turnClient.autoplay = false;
    turnClient.send('game:bid', { bid: 11 });
    ok((await turnClient.waitFor(m => m.t === 'error')).code === 'bad_bid', 'server rejects bid of 11');
    const other = [A, B, C, D].find(c => c !== turnClient);
    other.send('game:bid', { bid: 2 });
    ok((await other.waitFor(m => m.t === 'error')).code === 'not_your_turn', 'server rejects out-of-turn bid');
    turnClient.autoplay = true; turnClient.act();
  }

  // chat
  B.send('chat:send', { kind: 'emoji', id: 'em_sunglasses' });
  const chatMsg = await D.waitFor(m => m.t === 'chat');
  ok(chatMsg.id === 'em_sunglasses' && chatMsg.seat === B.match.mySeat, 'emoji broadcast to all seats with sender seat');
  B.send('chat:send', { kind: 'quick_chat', id: 'evil<img>' });
  await sleep(100);
  ok(!D.inbox.some(m => m.t === 'chat' && m.id === 'evil<img>'), 'non-preset chat ids are dropped');

  // play to the end (target 250)
  let over;
  try { over = await A.waitFor(m => m.t === 'match:state' && m.match.phase === 'game_over', 60000, 'game over'); }
  catch (e) { for (const c of [A,B,C,D]) { const m = c.match; console.log(c.name, JSON.stringify({seat:m.mySeat, phase:m.phase, turn:m.turnSeat, round:m.roundNumber, trick:m.trickNumber, hand:m.hand.length, acks:m.nextRoundAcks, ev:m.lastEvent, scores:m.teamScores, auto:c.autoplay, errs:c.inbox.filter(x=>x.t==='error').slice(-3)})); } throw e; }
  const s = over.match.roundSummary;
  ok(s.matchFinished && (over.match.teamScores[0] >= 250 || over.match.teamScores[1] >= 250), `match finished: Blue ${over.match.teamScores[0]} – Red ${over.match.teamScores[1]} after ${over.match.roundNumber} rounds`);
  ok(over.match.teamScores[0] !== over.match.teamScores[1], 'no tie at game over');
  ok(typeof s.matchKey === 'string' && typeof s.roundKey === 'string', 'reward keys provided for +10/+50 coin dedupe');
  const backToLobby = await A.waitFor(m => m.t === 'room:state' && m.room && m.room.status === 'lobby' && m.room.seats.every(x => x.kind !== 'human' || !x.ready), 3000, 'post-match lobby');
  ok(backToLobby.room.seats.every(x => x.kind !== 'human' || !x.ready), 'room returns to lobby with everyone unready');

  // invite flow: Alice back online (not in match) → Eve invites Alice? Eve not in room; creates one.
  for (const c of [A, B, C, D]) c.autoplay = false;
  A.send('room:leave'); await A.waitFor(m => m.t === 'room:state' && m.room === null);
  Imp.send('invite:send', { userId: roomMsg.room.hostId, mode: 2, team: 'red' });
  const inv = await A.waitFor(m => m.t === 'invite:received', 3000, 'invite');
  ok(inv.invite.from.username === 'Eve' && inv.invite.mode === 2, 'Alice receives invite to Eve\'s 2-human room');
  A.send('invite:respond', { inviteId: inv.invite.id, accept: true, team: 'blue' });
  const r2 = await A.waitFor(m => m.t === 'room:state' && m.room && m.room.code === inv.invite.roomCode);
  ok(r2.room.mode === 2 && r2.room.humans === 2, 'Alice joined via invite (2/2 humans)');
  ok(r2.room.seats.filter(x => x.kind === 'bot').length === 2, '2-human mode shows 2 bot seats');

  // 2-human match with disconnect → bot takeover → reconnect
  A.clear(); Imp.clear();
  A.autoplay = true; Imp.autoplay = true;
  A.send('room:ready', { ready: true }); Imp.send('room:ready', { ready: true });
  const m2 = await A.waitFor(m => m.t === 'match:state', 3000, 'match2');
  ok(m2.match.players.filter(p => p.isBot).length === 2, '2 seats are AI bots in 2-human match');
  await sleep(30);
  Imp.close();
  const replaced = await A.waitFor(m => m.t === 'match:state' && m.match.lastEvent.type === 'player_disconnected', 3000, 'replaced');
  ok(replaced.match.players.find(p => p.name === 'Eve').botControlled, 'disconnected human is covered by a bot');
  ok(replaced.match.humanCount === 2 && replaced.match.players.find(p => p.name === 'Eve').wasHuman, 'snapshot reports disconnect event, human count & wasHuman for notices');
  const progressBefore = A.matchStates;
  await sleep(300);
  ok(A.matchStates > progressBefore, 'match keeps progressing while bot covers the seat');
  const Eve2 = new Client('Eve'); Eve2.session = Imp.session; await Eve2.connect(); Eve2.resume();
  const back = await Eve2.waitFor(m => m.t === 'match:state', 3000, 'rejoin');
  ok(back.match.hand.length >= 0 && back.match.players[back.match.mySeat].name === 'Eve' && !back.match.players[back.match.mySeat].botControlled, 'reconnected player regains their seat & hand');
  Eve2.autoplay = true; Eve2.act();
  const over2 = await A.waitFor(m => m.t === 'match:state' && m.match.phase === 'game_over', 60000, 'game over 2');
  ok(Boolean(over2), `2-human match completed (${over2.match.teamScores.join(' – ')})`);

  // ---------------- turn timer, away/pause & resume, logout keeps seat
  A.autoplay = false; Eve2.autoplay = false;
  await A.waitFor(m => m.t === 'room:state' && m.room && m.room.status === 'lobby' && m.room.seats.every(x => x.kind !== 'human' || !x.ready), 3000, 'lobby 2');
  A.clear(); Eve2.clear();
  A.send('room:ready', { ready: true }); Eve2.send('room:ready', { ready: true });
  await A.waitFor(m => m.t === 'match:state', 3000, 'match3');
  const autoMove = await A.waitFor(m => m.t === 'match:state' && m.match.lastEvent && m.match.lastEvent.auto, 6000, 'auto move');
  ok(Boolean(autoMove), 'idle human gets an automatic move when the turn timer runs out');
  ok(A.inbox.length >= 0 && [A.match, Eve2.match].some(m => typeof m.turnMsLeft === 'number'), 'snapshots carry the human turn timer');

  A.send('game:away', { away: true }); Eve2.send('game:away', { away: true });
  const paused = await A.waitFor(m => m.t === 'match:state' && m.match.paused, 4000, 'paused');
  ok(paused.match.players.filter(p => !p.isBot).every(p => p.away), 'both humans marked away');
  const frozenSeq = A.match.seq;
  await sleep(2500);
  ok(A.match.seq === frozenSeq, 'match is frozen while every human is away (no bot moves)');
  A.send('game:away', { away: false });
  const resumed = await A.waitFor(m => m.t === 'match:state' && !m.match.paused && m.match.seq > frozenSeq, 4000, 'resumed');
  ok(!resumed.match.players[resumed.match.mySeat].away, 'resuming un-pauses the match and returns your seat');

  Eve2.send('auth:logout', { session: Eve2.session });
  const loggedOut = await A.waitFor(m => m.t === 'match:state' && m.match.players.some(p => p.name === 'Eve' && p.botControlled && !p.isBot), 4000, 'logout covered');
  ok(Boolean(loggedOut), 'logging out keeps the seat (bot covers it)');
  const Eve3 = new Client('Eve', Imp.password); await Eve3.connect(); Eve3.login('Eve');
  const eveBack = await Eve3.waitFor(m => m.t === 'match:state', 4000, 'eve back');
  ok(eveBack.match.players[eveBack.match.mySeat].name === 'Eve', 'logging back in returns you to your seat');

  // ---------------- 3-player (cutthroat) online room
  for (const c of [B, C, D]) { c.autoplay = false; c.send('room:leave'); }
  await sleep(100);
  B.clear(); C.clear(); D.clear();
  B.send('room:create', { mode: 3, settings: { targetScore: 250, difficulty: 'Medium' } });
  const r3 = await B.waitFor(m => m.t === 'room:state' && m.room && m.room.mode === 3, 3000, '3p room');
  ok(r3.room.seats.length === 3 && r3.room.seats.map(x => x.team).join(',') === 'blue,red,yellow', '3-player room has 3 seats coloured Blue/Red/Yellow');
  C.send('room:join', { code: r3.room.code }); D.send('room:join', { code: r3.room.code });
  await D.waitFor(m => m.t === 'room:state' && m.room && m.room.humans === 3, 3000, '3p full');
  const Late = new Client('Late'); await Late.connect(); Late.register(); await Late.waitFor(m => m.t === 'welcome');
  Late.send('room:join', { code: r3.room.code });
  ok((await Late.waitFor(m => m.t === 'error')).code === 'full_room', '3-player room is full at 3/3');
  Late.close();
  for (const c of [B, C, D]) { c.clear(); c.autoplay = true; c.firstMatch = null; c.send('room:ready', { ready: true }); }
  await B.waitFor(m => m.t === 'match:state', 3000, '3p start');
  await sleep(30);
  const h3 = [B, C, D].map(c => c.firstMatch);
  ok(h3.every(m => m.numSeats === 3 && m.tricksPerRound === 17 && m.hand.length === 17), '3-player: 17 cards each, 17 tricks per round');
  const ids3 = new Set(h3.flatMap(m => m.hand.map(c => c.id)));
  ok(ids3.size === 51 && !ids3.has('2C'), '3-player deal uses 51 cards (2♣ removed)');
  const over3 = await B.waitFor(m => m.t === 'match:state' && m.match.phase === 'game_over', 90000, '3p game over');
  const rs3 = over3.match.roundSummary;
  ok(rs3.solo && rs3.teams.length === 3 && over3.match.teamScores.length === 3, `3-player match finished: ${over3.match.teamScores.join(' / ')} (individual scores)`);
  ok(rs3.matchWinnerTeam !== null && over3.match.teamScores[rs3.matchWinnerTeam] === Math.max(...over3.match.teamScores), 'winner is the single highest scorer');

  // --- Gifts by username (Shop) & friend requests from the table ---
  const Gia = new Client('Gia'); await Gia.connect(); Gia.register(); await Gia.waitFor(m => m.t === 'welcome', 3000, 'Gia welcome');
  const Hal = new Client('Hal'); await Hal.connect(); Hal.register(); await Hal.waitFor(m => m.t === 'welcome', 3000, 'Hal welcome');
  Gia.send('user:lookup', { username: 'hal' });
  const look = await Gia.waitFor(m => m.t === 'user:lookup:result', 3000, 'lookup');
  ok(look.found && look.user.username === 'Hal' && !look.self, 'username lookup finds a real player (case-insensitive)');
  Gia.send('user:lookup', { username: 'nobody_here' });
  ok(!(await Gia.waitFor(m => m.t === 'user:lookup:result', 3000, 'lookup miss')).found, 'username lookup reports unknown players');

  Gia.send('gift:send', { username: 'Hal', lions: 25, diamonds: 2, giftId: 'aa11' });
  const sent = await Gia.waitFor(m => m.t === 'gift:sent', 3000, 'gift sent');
  const got = await Hal.waitFor(m => m.t === 'gift', 3000, 'gift arrives');
  ok(sent.toName === 'Hal' && got.lions === 25 && got.diamonds === 2 && got.fromName === 'Gia', 'gift by username (Lions + Diamonds) reaches an online player, no friendship needed');
  Hal.send('gift:ack', { giftId: 'aa11' });
  Gia.send('gift:send', { username: 'Gia', lions: 5, giftId: 'aa12' });
  ok((await Gia.waitFor(m => m.t === 'error' && m.code === 'gift_failed', 3000, 'self gift')).giftId === 'aa12', 'cannot gift yourself');

  Hal.close(); await sleep(150);
  Gia.send('gift:send', { username: 'hal', diamonds: 3, giftId: 'bb22' });
  ok((await Gia.waitFor(m => m.t === 'gift:sent', 3000, 'queued gift')).queued === true, 'gift to an offline player is kept for them');
  const Hal2 = new Client('Hal'); await Hal2.connect(); Hal2.login();
  const late = await Hal2.waitFor(m => m.t === 'gift', 3000, 'queued gift delivered');
  ok(late.giftId === 'bb22' && late.diamonds === 3 && !Hal2.inbox.some(m => m.t === 'gift' && m.giftId === 'aa11'), 'offline gift delivered on next login (acked gifts not repeated)');
  Hal2.send('gift:ack', { giftId: 'bb22' }); await sleep(100);
  Hal2.close(); await sleep(100);
  const Hal3 = new Client('Hal'); await Hal3.connect(); Hal3.login(); await Hal3.waitFor(m => m.t === 'welcome', 3000, 'Hal3 welcome'); await sleep(250);
  ok(!Hal3.inbox.some(m => m.t === 'gift'), 'acknowledged gifts are removed from the inbox');

  Gia.send('friend:request', { username: 'Hal' });
  const fr = await Hal3.waitFor(m => m.t === 'friend:incoming', 3000, 'friend prompt');
  ok(fr.fromName === 'Gia' && fr.fromId, 'friend request by username shows a live ✓/✗ prompt to the other player');
  Hal3.send('friend:respond', { userId: fr.fromId, accept: true });
  await Gia.waitFor(m => m.t === 'notice' && /accepted/.test(m.message), 3000, 'accepted notice');
  const giaSocial = await Gia.waitFor(m => m.t === 'social:state' && m.friends.some(f => f.username === 'Hal'), 3000, 'friends list');
  ok(Boolean(giaSocial), 'accepting (✓) saves the friendship on the server');

  for (const c of [A, B, C, D, Eve2, Eve3, Gia, Hal3]) c.close();
  await sleep(600);
  const dbFile = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'db.json'), 'utf8'));
  const users = Object.values(dbFile.users);
  ok(users.length === 9, 'directory persisted (9 accounts)');
  ok(users.every(u => u.passwordHash && !('password' in u)) && !JSON.stringify(dbFile).includes('pw_Alice_secret') && !JSON.stringify(dbFile).includes(A.session), 'passwords & sessions stored only as hashes');
}

main()
  .catch(e => { console.log('FAIL  exception:', e.message); failures++; })
  .finally(() => {
    server.kill('SIGTERM');
    if (failures) console.log('\n--- server log ---\n' + serverLog);
    console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL TESTS PASSED'}`);
    process.exit(failures ? 1 : 0);
  });
