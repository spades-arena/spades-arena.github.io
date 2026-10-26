/**
 * Spades Arena - Free Worldwide Rooms (peer-to-peer, the host's phone is the server)
 * ============================================================================
 * The player who creates a room runs this RoomHost on their own device. Friends
 * anywhere connect straight to it over WebRTC (PeerJS): the free public PeerJS
 * service is only used to find the host by its room code (and as a free relay on
 * networks that block direct links). No server of ours is involved.
 *
 * RoomHost speaks the same messages as server/server.js (room:state, match:state,
 * chat, error, notice), so the lobby & table UI work unchanged. The match itself
 * is the shared authoritative engine (js/match.js): each guest only ever receives
 * their own hand.
 * ============================================================================
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  const PEER_PREFIX = 'spades-royale-v1-';
  const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const COMPASS = ['South', 'West', 'North', 'East'];
  const COMPASS_3 = ['South', 'West', 'East'];
  const SOLO_COLORS = ['blue', 'red', 'yellow'];
  const DIFFICULTIES = ['Beginner', 'Easy', 'Medium', 'Hard', 'Impossible'];
  const QUICK_CHAT_IDS = new Set(['qc_well_played', 'qc_good_game', 'qc_good_move', 'qc_good_luck', 'qc_playing_well']);
  const EMOJI_IDS = new Set(['em_crying', 'em_happy', 'em_laughing', 'em_sad', 'em_sunglasses']);
  const LOBBY_DISCONNECT_GRACE_MS = 20000;

  function randomRoomCode() {
    const buf = new Uint8Array(4);
    root.crypto.getRandomValues(buf);
    return `HDZ-${Array.from(buf, b => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('')}`;
  }

  function normalizeRoomCode(raw) {
    let code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.startsWith('HDZ')) code = code.slice(3);
    return code.length === 4 ? `HDZ-${code}` : null;
  }

  const peerIdForCode = (code) => `${PEER_PREFIX}${code}`;

  function sanitizeName(raw, fallback) {
    const name = String(raw || '').replace(/[<>&"'`]/g, '').trim().slice(0, 18);
    return name.length >= 1 ? name : fallback;
  }

  /** Online account username (for friend requests from the table); null for device-only accounts. */
  function sanitizeAccount(raw) {
    const name = String(raw || '').trim();
    return /^[A-Za-z0-9_.-]{2,24}$/.test(name) ? name : null;
  }

  /** Game / room names: up to 24 visible characters, no markup. */
  function sanitizeGameName(raw) {
    return String(raw || '').replace(/[<>&"'`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  }

  function sanitizeSettings(raw = {}) {
    return {
      targetScore: Number(raw.targetScore) === 250 ? 250 : 500,
      difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'Medium',
      speed: ['relaxed', 'normal', 'fast'].includes(raw.speed) ? raw.speed : 'normal',
      // 2-player rooms: 'team' = both friends are partners vs 2 bots · 'versus' = friend vs friend, each with a bot partner
      pairing: raw.pairing === 'versus' ? 'versus' : 'team'
    };
  }

  /**
   * One room, hosted on this device. `deliver(memberId, msg)` sends a message to a member
   * (the host's own member is delivered locally; guests over their data connection).
   */
  class RoomHost {
    constructor({ code, name, mode, settings, host, deliver, onEmpty, onChange }) {
      this.onChange = onChange || (() => {});
      this.code = code;
      this.name = sanitizeGameName(name);
      this.mode = [2, 3, 4].includes(Number(mode)) ? Number(mode) : 4;
      this.settings = sanitizeSettings(settings);
      this.deliver = deliver;
      this.onEmpty = onEmpty || (() => {});
      this.members = new Map(); // id -> { id, name, avatar, seat, ready, connected, graceTimer }
      this.hostId = host.id;
      this.status = 'lobby';
      this.match = null;
      this.lastChatAt = new Map();
      this.addMember(host, host.team);
      this.arrangeDuo();
    }

    // ---------------------------------------------------------------- seats

    seatCount() { return this.mode === 3 ? 3 : 4; }
    compassOf(seat) { return (this.mode === 3 ? COMPASS_3 : COMPASS)[seat]; }
    seatTeam(seat) { return this.mode === 3 ? SOLO_COLORS[seat] : (seat % 2 === 0 ? 'blue' : 'red'); }

    seatTakenBy(seat) {
      for (const [id, m] of this.members) if (m.seat === seat) return id;
      return null;
    }

    /** 2-player rooms: the host's choice decides the teams — host sits South, the friend North (together) or West (against). */
    arrangeDuo() {
      if (this.mode !== 2) return;
      const host = this.members.get(this.hostId);
      if (host) host.seat = 0;
      const friendSeat = this.settings.pairing === 'versus' ? 1 : 2;
      for (const m of this.members.values()) {
        if (m.id !== this.hostId && m.seat !== friendSeat) { m.seat = friendSeat; m.ready = false; }
      }
    }

    freeSeat(team) {
      if (this.mode === 3) return [0, 1, 2].find(s => !this.seatTakenBy(s));
      const seats = team === 'red' ? [1, 3] : [0, 2];
      return seats.find(s => !this.seatTakenBy(s));
    }

    uniqueName(name, id) {
      const taken = new Set([...this.members.values()].filter(m => m.id !== id).map(m => m.name.toLowerCase()));
      if (!taken.has(name.toLowerCase())) return name;
      for (let i = 2; i < 10; i++) if (!taken.has(`${name}${i}`.toLowerCase())) return `${name}${i}`;
      return `${name}_${id.slice(-3)}`;
    }

    addMember({ id, name, avatar, account }, team) {
      const want = team === 'red' ? 'red' : 'blue';
      let seat = this.freeSeat(want);
      if (seat === undefined) seat = this.freeSeat(want === 'red' ? 'blue' : 'red');
      if (seat === undefined) return null;
      const member = {
        id,
        name: this.uniqueName(sanitizeName(name, 'Player'), id),
        avatar: String(avatar || 'av_panther').slice(0, 40),
        account: sanitizeAccount(account),
        seat,
        ready: false,
        connected: true,
        graceTimer: null
      };
      this.members.set(id, member);
      return member;
    }

    // ---------------------------------------------------------------- messaging

    send(id, t, payload = {}) {
      this.deliver(id, { t, ...payload });
    }

    error(id, code, message, scope = 'lobby') {
      this.send(id, 'error', { code, message, scope });
    }

    serialize() {
      const humans = this.members.size;
      const seats = Array.from({ length: this.seatCount() }, (_, seat) => seat).map(seat => {
        const id = this.seatTakenBy(seat);
        const base = { seat, compass: this.compassOf(seat), team: this.seatTeam(seat) };
        if (id) {
          const m = this.members.get(id);
          const mp = this.match ? this.match.players[seat] : null;
          return {
            ...base,
            kind: 'human',
            userId: id,
            name: m.name,
            avatar: m.avatar,
            account: m.account || null,
            ready: m.ready,
            connected: m.connected,
            isHost: id === this.hostId,
            botControlled: Boolean(mp && (!mp.connected || mp.away)),
            away: Boolean(mp && mp.away)
          };
        }
        if (this.match) {
          const p = this.match.players[seat];
          return { ...base, kind: 'bot', name: p.name, avatar: p.avatar, ready: true, connected: true };
        }
        if (this.mode === 2) return { ...base, kind: humans >= 2 ? 'bot' : 'open_or_bot', ready: true };
        return { ...base, kind: 'open', ready: false };
      });
      return {
        code: this.code,
        name: this.name,
        hostId: this.hostId,
        mode: this.mode,
        status: this.status,
        settings: this.settings,
        humans,
        capacity: this.mode,
        matchId: this.match ? this.match.matchId : null,
        p2p: true,
        seats
      };
    }

    broadcastRoom() {
      const room = this.serialize();
      for (const id of this.members.keys()) this.send(id, 'room:state', { room });
      this.onChange(this);
    }

    broadcastMatch() {
      if (!this.match) return;
      this.onChange(this);
      for (const id of this.members.keys()) {
        const seat = this.match.seatOfUser(id);
        if (seat >= 0) this.send(id, 'match:state', { match: this.match.snapshotFor(seat) });
      }
    }

    // ---------------------------------------------------------------- membership

    /** A guest connected (or reconnected) with their persistent device id. Returns an error code or null. */
    join({ id, name, avatar, account, team }) {
      const existing = this.members.get(id);
      if (existing) {
        clearTimeout(existing.graceTimer);
        existing.connected = true;
        if (this.match) {
          const seat = this.match.seatOfUser(id);
          if (seat >= 0) {
            this.match.setSeatConnected(seat, true);
            this.send(id, 'match:state', { match: this.match.snapshotFor(seat) });
          }
        }
        this.broadcastRoom();
        return null;
      }
      if (this.status === 'playing') return 'in_progress';
      if (this.members.size >= this.mode) return 'full_room';
      if (!this.addMember({ id, name, avatar, account }, team)) return 'full_room';
      this.arrangeDuo();
      this.broadcastRoom();
      this.notifyOthers(id, `${this.members.get(id).name} joined the room.`, 'success');
      return null;
    }

    notifyOthers(exceptId, message, tone = 'info') {
      for (const id of this.members.keys()) if (id !== exceptId) this.send(id, 'notice', { tone, message });
    }

    /** Data connection dropped (closed app, lost signal...). */
    disconnect(id) {
      const m = this.members.get(id);
      if (!m || id === this.hostId) return;
      m.connected = false;
      if (this.match) {
        const seat = this.match.seatOfUser(id);
        if (seat >= 0) this.match.setSeatConnected(seat, false); // bot covers until they return
      } else {
        m.ready = false;
        m.graceTimer = setTimeout(() => {
          if (!m.connected) this.leave(id);
        }, LOBBY_DISCONNECT_GRACE_MS);
      }
      this.broadcastRoom();
    }

    leave(id) {
      const m = this.members.get(id);
      if (!m) return;
      clearTimeout(m.graceTimer);
      this.members.delete(id);
      if (this.match) {
        const seat = this.match.seatOfUser(id);
        if (seat >= 0) this.match.convertSeatToBot(seat);
      }
      this.send(id, 'room:state', { room: null });
      if (id === this.hostId || this.members.size === 0) {
        this.close('The host closed the room.');
        return;
      }
      this.notifyOthers(id, `${m.name} left the room.`);
      this.broadcastRoom();
    }

    close(reason) {
      if (this.match) this.match.destroy();
      this.match = null;
      for (const id of this.members.keys()) {
        if (id !== this.hostId) this.send(id, 'p2p:closed', { reason });
      }
      this.members.clear();
      this.onEmpty();
    }

    // ---------------------------------------------------------------- match lifecycle

    tryAutoStart() {
      if (this.status !== 'lobby' || this.members.size !== this.mode) return;
      for (const m of this.members.values()) if (!m.ready || !m.connected) return;
      this.startMatch();
    }

    startMatch() {
      const avatars = ['av_panther', 'av_champion', 'av_strategist', 'av_veteran'];
      const seats = Array.from({ length: this.seatCount() }, (_, seat) => {
        const id = this.seatTakenBy(seat);
        const m = id ? this.members.get(id) : null;
        return m ? { userId: id, name: m.name, avatar: m.avatar, account: m.account || null } : { userId: null, avatar: avatars[seat] };
      });
      this.status = 'playing';
      this.rematchOpen = false;
      this.match = new SH.OnlineMatch({
        seats,
        targetScore: this.settings.targetScore,
        difficulty: this.settings.difficulty,
        speed: this.settings.speed,
        onUpdate: () => this.broadcastMatch(),
        onGameOver: () => this.finishMatch()
      });
      this.broadcastRoom();
      this.match.start();
    }

    finishMatch() {
      if (this.match) this.match.destroy();
      this.match = null;
      this.status = 'lobby';
      this.rematchOpen = true; // Ready again from the results screen = 🔁 Rematch
      for (const [id, m] of [...this.members]) {
        m.ready = false;
        if (!m.connected && id !== this.hostId) this.members.delete(id);
      }
      this.broadcastRoom();
    }

    // ---------------------------------------------------------------- requests from members

    handle(id, msg) {
      const m = this.members.get(id);
      if (!m || !msg || typeof msg.t !== 'string') return;
      const isHost = id === this.hostId;
      const match = this.match;
      const seat = match ? match.seatOfUser(id) : -1;

      switch (msg.t) {
        case 'room:leave':
          this.leave(id);
          break;

        case 'room:mode': {
          if (!isHost) return this.error(id, 'not_host', 'Only the room host can change the player mode.');
          if (this.status !== 'lobby') return this.error(id, 'in_progress', 'The match has already started.');
          const mode = [2, 3, 4].includes(Number(msg.mode)) ? Number(msg.mode) : 4;
          if (mode < this.members.size) {
            return this.error(id, 'full_room', `There are already ${this.members.size} players in the room, so it can't switch to ${mode}-player mode.`);
          }
          this.mode = mode;
          for (const mem of this.members.values()) {
            mem.ready = false;
            if (mem.seat >= this.seatCount()) mem.seat = undefined;
          }
          for (const mem of this.members.values()) {
            if (mem.seat === undefined) mem.seat = [0, 1, 2, 3].find(x => x < this.seatCount() && !this.seatTakenBy(x));
          }
          this.arrangeDuo();
          this.broadcastRoom();
          break;
        }

        case 'room:name':
          if (!isHost) return this.error(id, 'not_host', 'Only the room host can rename the game.');
          this.name = sanitizeGameName(msg.name);
          this.broadcastRoom();
          break;

        case 'room:settings':
          if (isHost && this.status === 'lobby') {
            const before = this.settings.pairing;
            this.settings = sanitizeSettings(msg.settings);
            if (before !== this.settings.pairing) {
              this.arrangeDuo();
              this.notifyOthers(id, this.settings.pairing === 'versus' ? '⚔️ The host set this game to: Play Against Each Other.' : '🤝 The host set this game to: Play Together (same team).');
            }
            this.broadcastRoom();
          }
          break;

        case 'room:team': {
          if (this.status !== 'lobby') return this.error(id, 'in_progress', 'Teams are locked once the match starts.');
          if (this.mode === 3) return this.broadcastRoom();
          if (this.mode === 2) return this.error(id, 'team_locked', 'In 2-player rooms the host picks “Play Together” or “Play Against Each Other”, and the teams are set automatically.');
          const team = msg.team === 'red' ? 'red' : 'blue';
          if (this.seatTeam(m.seat) === team) return this.broadcastRoom();
          const free = this.freeSeat(team);
          if (free === undefined) return this.error(id, 'team_full', `Team ${team === 'blue' ? 'Red' : 'Blue'} already has 2 players.`);
          m.seat = free;
          m.ready = false;
          this.broadcastRoom();
          break;
        }

        case 'room:ready':
          if (this.status !== 'lobby') return;
          m.ready = Boolean(msg.ready);
          if (m.ready && this.rematchOpen) this.notifyOthers(id, `🔁 ${m.name} wants a rematch! Tap Rematch to play again.`);
          this.broadcastRoom();
          this.tryAutoStart();
          break;

        case 'room:start': {
          if (!isHost) return this.error(id, 'not_host', 'Only the room host can start the match.');
          if (this.status !== 'lobby') return this.error(id, 'in_progress', 'The match has already started.');
          // The host can start any time: everyone who joined plays, bots take the empty seats
          this.startMatch();
          break;
        }

        case 'game:bid':
          if (match && seat >= 0) {
            const res = match.submitBid(seat, msg.bid);
            if (!res.ok) this.error(id, res.code, res.message, 'game');
          }
          break;

        case 'game:play':
          if (match && seat >= 0) {
            const res = match.playCard(seat, String(msg.cardId || ''));
            if (!res.ok) this.error(id, res.code, res.message, 'game');
          }
          break;

        case 'game:next_round':
          if (match && seat >= 0) match.ackNextRound(seat);
          break;

        case 'game:away':
          if (match && seat >= 0) {
            match.setSeatAway(seat, Boolean(msg.away));
            this.broadcastRoom();
          }
          break;

        case 'game:resync':
          if (match && seat >= 0) this.send(id, 'match:state', { match: match.snapshotFor(seat) });
          break;

        case 'chat:send': {
          const kind = msg.kind === 'emoji' ? 'emoji' : 'quick_chat';
          const chatId = String(msg.id || '');
          if (!(kind === 'emoji' ? EMOJI_IDS : QUICK_CHAT_IDS).has(chatId)) return;
          const now = Date.now();
          if (now - (this.lastChatAt.get(id) || 0) < 1200) return this.error(id, 'rate_limited', 'Slow down — one reaction per second.', 'game');
          this.lastChatAt.set(id, now);
          for (const mid of this.members.keys()) this.send(mid, 'chat', { seat: m.seat, kind, id: chatId, fromId: id, at: now });
          break;
        }

        case 'chat:text': {
          // Typed chat: to everyone, or only to your teammate (team games)
          const text = String(msg.text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
          if (!text) return;
          const now = Date.now();
          if (now - (this.lastChatAt.get(`${id}:text`) || 0) < 900) return this.error(id, 'rate_limited', 'Slow down — one message per second.', 'chat');
          this.lastChatAt.set(`${id}:text`, now);
          const toTeam = msg.to === 'team' && this.mode !== 3;
          const recipients = [...this.members.values()].filter(x => !toTeam || x.seat % 2 === m.seat % 2);
          if (toTeam && recipients.length < 2) {
            return this.error(id, 'no_teammate', 'Your teammate is a bot — send your message to Everyone instead.', 'chat');
          }
          for (const r of recipients) {
            this.send(r.id, 'chat', { seat: m.seat, kind: 'text', text, to: toTeam ? 'team' : 'all', fromId: id, fromName: m.name, at: now });
          }
          break;
        }

        case 'gift:send': {
          // 🎁 Coins / Diamonds from one player in the room to another (the sender's app already took them)
          const giftId = String(msg.giftId || '').slice(0, 40);
          const lions = Math.floor(Number(msg.lions) || 0);
          const diamonds = Math.floor(Number(msg.diamonds) || 0);
          const to = this.members.get(String(msg.toId || ''));
          const fail = (message) => this.send(id, 'error', { code: 'gift_failed', giftId, message, scope: 'gift' });
          if (!giftId || lions < 0 || diamonds < 0 || lions > 1e9 || diamonds > 1e9 || lions + diamonds === 0) return fail('That gift amount isn’t valid.');
          if (!to || to.id === id) return fail('That player isn’t in the room.');
          if (!to.connected) return fail(`${to.name} is offline right now — gift returned.`);
          this.send(to.id, 'gift', { giftId, lions, diamonds, fromName: m.name });
          this.send(id, 'gift:sent', { giftId, toName: to.name, lions, diamonds });
          break;
        }

        default:
          break;
      }
    }
  }

  /** Saved form of a hosted room, so the host can reopen the app and carry on. */
  RoomHost.prototype.toJSON = function () {
    return {
      code: this.code,
      name: this.name,
      mode: this.mode,
      settings: this.settings,
      hostId: this.hostId,
      status: this.status,
      members: [...this.members.values()].map(m => ({ id: m.id, name: m.name, avatar: m.avatar, account: m.account || null, seat: m.seat, ready: m.ready })),
      match: this.match ? this.match.serialize() : null,
      savedAt: Date.now()
    };
  };

  RoomHost.restore = function (data, { deliver, onEmpty, onChange }) {
    const hostData = data.members.find(m => m.id === data.hostId);
    const room = new RoomHost({ code: data.code, name: data.name, mode: data.mode, settings: data.settings, host: { id: data.hostId, name: hostData ? hostData.name : 'Host', avatar: hostData ? hostData.avatar : 'av_panther', account: hostData ? hostData.account : null }, deliver, onEmpty });
    room.members.clear();
    for (const m of data.members) {
      // Guests count as disconnected until their apps reconnect (bots cover them meanwhile)
      room.members.set(m.id, { ...m, connected: m.id === data.hostId, graceTimer: null });
    }
    if (data.match && data.status === 'playing') {
      room.status = 'playing';
      room.match = SH.OnlineMatch.restore(data.match, {
        onUpdate: () => room.broadcastMatch(),
        onGameOver: () => room.finishMatch()
      });
      room.match.players.forEach(p => {
        if (!p.isBot && p.userId !== data.hostId) p.connected = false;
        if (p.userId === data.hostId) { p.away = false; p.connected = true; } // the host just reopened the app: they're back
      });
    } else {
      room.status = 'lobby';
      for (const m of room.members.values()) {
        m.ready = false;
        if (m.id !== data.hostId) {
          m.graceTimer = setTimeout(() => { if (!m.connected) room.leave(m.id); }, 60000);
        }
      }
    }
    room.onChange = onChange || (() => {});
    return room;
  };

  SH.p2p = { RoomHost, PEER_PREFIX, peerIdForCode, randomRoomCode, normalizeRoomCode, sanitizeSettings, sanitizeGameName };
})(typeof globalThis !== 'undefined' ? globalThis : window);
