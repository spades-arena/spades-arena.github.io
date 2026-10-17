#!/usr/bin/env node
/**
 * Spades Royale (by Hadzz) - Live Multiplayer, Friends & Presence Server
 * ============================================================================
 * Zero dependencies (Node.js 18+). Run:   node server/server.js
 *
 *  - Serves the app (index.html, styles.css, js/*.js, manifest.json) over HTTP
 *  - WebSocket endpoint at /ws for lobbies, friends, presence, invites & chat
 *  - Server-authoritative Spades matches (see server/match.js)
 *  - Player directory persisted to server/data/db.json (override with DATA_DIR)
 *
 * Env: SPADES_ADMIN_USERNAME + SPADES_ADMIN_PASSWORD (owner account with unlimited Lions & Diamonds),
 *      PORT (default 8787), HOST (default 0.0.0.0), DATA_DIR, SPADES_MSG_LIMIT (msgs / 5s / socket),
 *      UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (optional free cloud backup of accounts)
 * ============================================================================
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { attachWebSocketServer } = require('./ws-lite');
const { OnlineMatch, COMPASS, DIFFICULTIES } = require('./match');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, 'db.json');

const USERNAME_RE = /^[A-Za-z0-9_.-]{2,18}$/;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_DISCONNECT_GRACE_MS = 20000;
const INVITE_TTL_MS = 120000;
const ROOM_IDLE_TTL_MS = 3 * 60 * 60 * 1000;
const MSG_LIMIT_PER_5S = Number(process.env.SPADES_MSG_LIMIT) || 120;

const QUICK_CHAT_IDS = new Set(['qc_well_played', 'qc_good_game', 'qc_good_move', 'qc_good_luck', 'qc_playing_well']);
const EMOJI_IDS = new Set(['em_crying', 'em_happy', 'em_laughing', 'em_sad', 'em_sunglasses']);

const log = (...args) => console.log(new Date().toISOString(), ...args);

// ============================================================================
// Persistent player directory
// ============================================================================
const db = { users: {} };
const usernameIndex = new Map(); // lowercase username -> userId
const sessionIndex = new Map(); // sha256(session token) -> userId

// Optional free cloud backup (Upstash Redis REST) so accounts survive restarts on free hosts
// like Render, whose disk is wiped whenever the server sleeps or redeploys.
const CLOUD_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const CLOUD_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const CLOUD_KEY = 'spades_royale_db';
const cloudEnabled = Boolean(CLOUD_URL && CLOUD_TOKEN && typeof fetch === 'function');

async function cloudLoad() {
  const res = await fetch(`${CLOUD_URL}/get/${CLOUD_KEY}`, { headers: { Authorization: `Bearer ${CLOUD_TOKEN}` } });
  if (!res.ok) throw new Error(`cloud load HTTP ${res.status}`);
  const body = await res.json();
  return body && body.result ? JSON.parse(body.result) : null;
}

function cloudSave(json) {
  if (!cloudEnabled) return Promise.resolve();
  return fetch(`${CLOUD_URL}/set/${CLOUD_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLOUD_TOKEN}` },
    body: json
  }).then((res) => { if (!res.ok) log('Cloud save failed: HTTP', res.status); })
    .catch((e) => log('Cloud save failed:', e.message));
}

function loadDb(raw) {
  try {
    if (!raw) raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    db.users = raw.users || {};
  } catch (e) {
    db.users = {};
  }
  usernameIndex.clear();
  sessionIndex.clear();
  for (const u of Object.values(db.users)) {
    u.friends = u.friends || [];
    u.incoming = u.incoming || [];
    u.outgoing = u.outgoing || [];
    usernameIndex.set(u.username.toLowerCase(), u.id);
    u.sessions = u.sessions || [];
    for (const h of u.sessions) sessionIndex.set(h, u.id);
  }
}

let saveTimer = null;
function saveDbSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
      fs.renameSync(tmp, DB_PATH);
    } catch (e) {
      log('DB save failed:', e.message);
    }
    cloudSave(JSON.stringify(db));
  }, 400);
}

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const getUser = (id) => db.users[id] || null;

// ============================================================================
// Live connections & presence
// ============================================================================
const userConns = new Map(); // userId -> Set<conn>
const rooms = new Map(); // code -> room
const userRoom = new Map(); // userId -> code
const invites = new Map(); // inviteId -> invite
const p2pPresence = new Map(); // userId -> { roomCode, inMatch, roundNumber } reported by clients in peer-to-peer rooms

function sendTo(conn, type, payload = {}) {
  if (conn && conn.isOpen) conn.send(JSON.stringify({ t: type, ...payload }));
}

function sendToUser(userId, type, payload = {}) {
  const set = userConns.get(userId);
  if (!set) return;
  for (const conn of set) sendTo(conn, type, payload);
}

function sendError(conn, code, message, scope = 'lobby') {
  sendTo(conn, 'error', { code, message, scope });
}

function isOnline(userId) {
  const set = userConns.get(userId);
  return Boolean(set && set.size > 0);
}

function presenceOf(userId) {
  const user = getUser(userId);
  if (!isOnline(userId)) {
    return { presence: 'offline', lastSeen: user ? user.lastSeen : null };
  }
  const room = rooms.get(userRoom.get(userId));
  if (room && room.status === 'playing' && room.match) {
    return { presence: 'in_match', roundNumber: room.match.roundNumber };
  }
  const p2p = p2pPresence.get(userId);
  if (p2p && p2p.inMatch) return { presence: 'in_match', roundNumber: p2p.roundNumber };
  return { presence: 'online', inLobby: Boolean(room || (p2p && p2p.roomCode)) };
}

function publicUser(userId) {
  const u = getUser(userId);
  if (!u) return null;
  return { id: u.id, username: u.username, avatar: u.avatar, ...presenceOf(userId) };
}

function sendSocial(userId) {
  const u = getUser(userId);
  if (!u || !isOnline(userId)) return;
  sendToUser(userId, 'social:state', {
    friends: u.friends.map(publicUser).filter(Boolean),
    incoming: u.incoming.map(publicUser).filter(Boolean),
    outgoing: u.outgoing.map(publicUser).filter(Boolean),
    invites: [...invites.values()]
      .filter(inv => inv.toId === userId && inv.expiresAt > Date.now())
      .map(publicInvite)
  });
}

/** Push fresh presence to everyone who has this user in their friend graph. */
function broadcastPresence(userId) {
  const u = getUser(userId);
  if (!u) return;
  const audience = new Set([...u.friends, ...u.incoming, ...u.outgoing]);
  for (const id of audience) sendSocial(id);
}

// ============================================================================
// Rooms
// ============================================================================
function generateRoomCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = 'HDZ-';
    for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate room code');
}

function normalizeRoomCode(raw) {
  let code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.startsWith('HDZ')) code = code.slice(3);
  return code.length === 4 ? `HDZ-${code}` : null;
}

// Room modes = number of humans: 2 (+2 bots, teams), 3 (cutthroat, every player solo), 4 (teams)
const parseMode = (m) => ([2, 3, 4].includes(Number(m)) ? Number(m) : 4);
const seatCount = (room) => (room.mode === 3 ? 3 : 4);
const SOLO_COLORS = ['blue', 'red', 'yellow'];
const COMPASS_3 = ['South', 'West', 'East'];
const compassOf = (room, seat) => (room.mode === 3 ? COMPASS_3 : COMPASS)[seat];
const teamSeats = (team) => (team === 'red' ? [1, 3] : [0, 2]);
const seatTeam = (seat, room) => (room && room.mode === 3 ? SOLO_COLORS[seat] : (seat % 2 === 0 ? 'blue' : 'red'));

function seatTakenBy(room, seat) {
  for (const [uid, m] of room.members) if (m.seat === seat) return uid;
  return null;
}

function freeSeatOnTeam(room, team) {
  if (room.mode === 3) return [0, 1, 2].find(s => !seatTakenBy(room, s));
  return teamSeats(team).find(s => !seatTakenBy(room, s));
}

function serializeRoom(room) {
  const humans = room.members.size;
  const seats = Array.from({ length: seatCount(room) }, (_, seat) => seat).map(seat => {
    const uid = seatTakenBy(room, seat);
    const base = { seat, compass: compassOf(room, seat), team: seatTeam(seat, room) };
    if (uid) {
      const u = getUser(uid);
      const m = room.members.get(uid);
      const matchPlayer = room.match ? room.match.players[seat] : null;
      return {
        ...base,
        kind: 'human',
        userId: uid,
        name: u ? u.username : 'Player',
        avatar: u ? u.avatar : 'free_ace',
        ready: m.ready,
        connected: m.connected,
        isHost: uid === room.hostId,
        botControlled: Boolean(matchPlayer && (!matchPlayer.connected || matchPlayer.away)),
        away: Boolean(matchPlayer && matchPlayer.away)
      };
    }
    if (room.match) {
      const p = room.match.players[seat];
      return { ...base, kind: 'bot', name: p.name, avatar: p.avatar, ready: true, connected: true };
    }
    if (room.mode === 2) {
      return { ...base, kind: humans >= 2 ? 'bot' : 'open_or_bot', ready: true };
    }
    return { ...base, kind: 'open', ready: false };
  });

  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    status: room.status,
    settings: room.settings,
    humans,
    capacity: room.mode,
    matchId: room.match ? room.match.matchId : null,
    seats
  };
}

function broadcastRoom(room) {
  const payload = serializeRoom(room);
  for (const uid of room.members.keys()) sendToUser(uid, 'room:state', { room: payload });
}

function broadcastMatch(room) {
  if (!room.match) return;
  for (const [uid] of room.members) {
    const seat = room.match.seatOfUser(uid);
    if (seat >= 0) sendToUser(uid, 'match:state', { match: room.match.snapshotFor(seat) });
  }
}

function sanitizeSettings(raw = {}) {
  return {
    targetScore: Number(raw.targetScore) === 250 ? 250 : 500,
    difficulty: DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : 'Medium',
    speed: ['relaxed', 'normal', 'fast'].includes(raw.speed) ? raw.speed : 'normal'
  };
}

function createRoomFor(userId, { mode, team, settings }) {
  leaveCurrentRoom(userId);
  const room = {
    code: generateRoomCode(),
    hostId: userId,
    mode: parseMode(mode),
    status: 'lobby',
    settings: sanitizeSettings(settings),
    members: new Map(),
    match: null,
    touchedAt: Date.now()
  };
  rooms.set(room.code, room);
  const seat = freeSeatOnTeam(room, team === 'red' ? 'red' : 'blue');
  room.members.set(userId, { seat, ready: false, connected: true, graceTimer: null });
  userRoom.set(userId, room.code);
  log(`room ${room.code} created by ${getUser(userId).username} (${room.mode}-human)`);
  broadcastRoom(room);
  broadcastPresence(userId);
  return room;
}

/** Returns an error code or null. */
function joinRoom(userId, code, preferredTeam) {
  const room = rooms.get(code);
  if (!room) return 'invalid_code';
  if (room.members.has(userId)) {
    broadcastRoom(room);
    if (room.match) broadcastMatch(room);
    return null;
  }
  if (room.status === 'playing') return 'in_progress';
  if (room.members.size >= room.mode) return 'full_room';

  leaveCurrentRoom(userId);
  const want = preferredTeam === 'red' ? 'red' : 'blue';
  let seat = freeSeatOnTeam(room, want);
  if (seat === undefined) seat = freeSeatOnTeam(room, want === 'red' ? 'blue' : 'red');
  if (seat === undefined) return 'full_room';

  room.members.set(userId, { seat, ready: false, connected: true, graceTimer: null });
  userRoom.set(userId, room.code);
  room.touchedAt = Date.now();
  log(`${getUser(userId).username} joined ${room.code} at ${compassOf(room, seat)}`);
  broadcastRoom(room);
  broadcastPresence(userId);
  return null;
}

function leaveCurrentRoom(userId) {
  const code = userRoom.get(userId);
  if (!code) return;
  const room = rooms.get(code);
  userRoom.delete(userId);
  if (!room) return;
  const member = room.members.get(userId);
  if (member) clearTimeout(member.graceTimer);
  room.members.delete(userId);

  if (room.match) {
    const seat = room.match.seatOfUser(userId);
    if (seat >= 0) room.match.convertSeatToBot(seat);
  }

  if (room.members.size === 0) {
    destroyRoom(room);
  } else {
    if (room.hostId === userId) room.hostId = room.members.keys().next().value;
    broadcastRoom(room);
  }
  sendToUser(userId, 'room:state', { room: null });
  broadcastPresence(userId);
}

function destroyRoom(room) {
  if (room.match) room.match.destroy();
  for (const uid of room.members.keys()) userRoom.delete(uid);
  rooms.delete(room.code);
  log(`room ${room.code} closed`);
}

function tryAutoStart(room) {
  if (room.status !== 'lobby') return;
  if (room.members.size !== room.mode) return;
  for (const m of room.members.values()) if (!m.ready || !m.connected) return;
  startMatch(room);
}

function startMatch(room) {
  const seats = Array.from({ length: seatCount(room) }, (_, seat) => seat).map(seat => {
    const uid = seatTakenBy(room, seat);
    const u = uid ? getUser(uid) : null;
    return u ? { userId: uid, name: u.username, avatar: u.avatar } : { userId: null, avatar: ['free_ace', 'free_blaze', 'free_velvet', 'free_frost'][seat] };
  });

  room.status = 'playing';
  room.touchedAt = Date.now();
  room.match = new OnlineMatch({
    seats,
    targetScore: room.settings.targetScore,
    difficulty: room.settings.difficulty,
    speed: room.settings.speed,
    onUpdate: () => {
      room.touchedAt = Date.now();
      broadcastMatch(room);
    },
    onGameOver: () => finishMatch(room)
  });
  log(`room ${room.code} match ${room.match.matchId} started`);
  broadcastRoom(room);
  room.match.start();
  for (const uid of room.members.keys()) broadcastPresence(uid);
}

function finishMatch(room) {
  // Final snapshot was already broadcast; return the room to its lobby.
  const match = room.match;
  if (match) match.destroy();
  room.match = null;
  room.status = 'lobby';
  for (const [uid, m] of [...room.members]) {
    m.ready = false;
    if (!m.connected) {
      room.members.delete(uid);
      userRoom.delete(uid);
    }
  }
  if (room.members.size === 0) {
    destroyRoom(room);
    return;
  }
  if (!room.members.has(room.hostId)) room.hostId = room.members.keys().next().value;
  broadcastRoom(room);
  for (const uid of room.members.keys()) broadcastPresence(uid);
}

// ============================================================================
// Invites
// ============================================================================
function publicInvite(inv) {
  const from = getUser(inv.fromId);
  const room = rooms.get(inv.roomCode);
  return {
    id: inv.id,
    roomCode: inv.roomCode,
    mode: room ? room.mode : null,
    expiresAt: inv.expiresAt,
    from: from ? { id: from.id, username: from.username, avatar: from.avatar } : null
  };
}

function pruneInvites() {
  const now = Date.now();
  for (const [id, inv] of invites) if (inv.expiresAt <= now || (!inv.p2p && !rooms.has(inv.roomCode))) invites.delete(id);
}

// ============================================================================
// Message handlers
// ============================================================================
const SESSION_MAX = 10;
const PASSWORD_MIN = 6;
const LOGIN_MAX_FAILS = 8;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const loginFailures = new Map(); // lowercase username -> { count, lockedUntil }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

function passwordMatches(user, password) {
  const a = Buffer.from(hashPassword(password, user.passwordSalt), 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Creates a new login session; only its SHA-256 hash is stored server-side. */
function issueSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const h = hashToken(token);
  user.sessions = [...(user.sessions || []), h];
  while (user.sessions.length > SESSION_MAX) sessionIndex.delete(user.sessions.shift());
  sessionIndex.set(h, user.id);
  return token;
}

function validateCredentials(conn, username, password) {
  if (!USERNAME_RE.test(username)) {
    sendError(conn, 'invalid_username', 'Usernames must be 2–18 characters using only letters, numbers, _ - or .', 'auth');
    return false;
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > 128) {
    sendError(conn, 'weak_password', `Passwords must be at least ${PASSWORD_MIN} characters.`, 'auth');
    return false;
  }
  return true;
}

function handleRegister(conn, msg) {
  const username = String(msg.username || '').trim();
  const password = msg.password;
  if (!validateCredentials(conn, username, password)) return;
  if (usernameIndex.has(username.toLowerCase())) {
    return sendError(conn, 'taken_username', `The username "${username}" is already taken by another player. Please choose a different one.`, 'auth');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: `u_${crypto.randomBytes(6).toString('hex')}`,
    username,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    sessions: [],
    avatar: String(msg.avatar || 'free_ace').slice(0, 40),
    friends: [],
    incoming: [],
    outgoing: [],
    createdAt: Date.now(),
    lastSeen: Date.now()
  };
  db.users[user.id] = user;
  usernameIndex.set(username.toLowerCase(), user.id);
  log(`registered ${username}`);
  attachUser(conn, user, issueSession(user));
}

function handleLogin(conn, msg) {
  const username = String(msg.username || '').trim();
  const key = username.toLowerCase();
  const fails = loginFailures.get(key);
  if (fails && fails.lockedUntil > Date.now()) {
    const mins = Math.ceil((fails.lockedUntil - Date.now()) / 60000);
    return sendError(conn, 'locked', `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`, 'auth');
  }
  const user = getUser(usernameIndex.get(key));
  if (!user || typeof msg.password !== 'string' || !passwordMatches(user, msg.password)) {
    const f = fails && fails.lockedUntil <= Date.now() && fails.count >= LOGIN_MAX_FAILS ? { count: 0, lockedUntil: 0 } : (fails || { count: 0, lockedUntil: 0 });
    f.count += 1;
    if (f.count >= LOGIN_MAX_FAILS) f.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    loginFailures.set(key, f);
    return sendError(conn, 'bad_credentials', 'Incorrect username or password.', 'auth');
  }
  loginFailures.delete(key);
  if (msg.avatar) user.avatar = String(msg.avatar).slice(0, 40);
  attachUser(conn, user, issueSession(user));
}

/** Resumes a saved login session (app reopen / reconnect). */
function handleHello(conn, msg) {
  const user = getUser(sessionIndex.get(hashToken(String(msg.session || ''))));
  if (!user) return sendError(conn, 'session_expired', 'Your login session has expired. Please log in again.', 'auth');
  if (msg.avatar) user.avatar = String(msg.avatar).slice(0, 40);
  attachUser(conn, user, null);
}

function handleLogout(conn, msg) {
  const user = getUser(conn.userId);
  if (user && msg.session) {
    const h = hashToken(String(msg.session));
    user.sessions = (user.sessions || []).filter(x => x !== h);
    sessionIndex.delete(h);
    saveDbSoon();
  }
  // Seat is kept (a bot covers it) so the player can log back in and resume
  detachConn(conn);
  sendTo(conn, 'auth:logged_out');
}

/** Gifts wait in the receiver's inbox until their app confirms it added them (works while they're offline). */
function deliverGiftInbox(user) {
  for (const g of user.giftInbox || []) {
    sendToUser(user.id, 'gift', { giftId: g.giftId, lions: g.lions, diamonds: g.diamonds, fromName: g.fromName });
  }
}

function attachUser(conn, user, newSession) {
  user.lastSeen = Date.now();
  saveDbSoon();

  if (conn.userId && conn.userId !== user.id) detachConn(conn);
  conn.userId = user.id;
  if (!userConns.has(user.id)) userConns.set(user.id, new Set());
  userConns.get(user.id).add(conn);

  sendTo(conn, 'welcome', {
    user: { id: user.id, username: user.username, avatar: user.avatar, unlimited: Boolean(user.unlimited) },
    session: newSession
  });
  deliverGiftInbox(user);

  // Restore lobby / match seat after a reconnect
  const room = rooms.get(userRoom.get(user.id));
  if (room) {
    const member = room.members.get(user.id);
    if (member) {
      clearTimeout(member.graceTimer);
      member.connected = true;
    }
    if (room.match) {
      const seat = room.match.seatOfUser(user.id);
      if (seat >= 0) {
        room.match.players[seat].avatar = user.avatar;
        room.match.setSeatConnected(seat, true);
        sendTo(conn, 'match:state', { match: room.match.snapshotFor(seat) });
      }
    }
    broadcastRoom(room);
  } else {
    sendTo(conn, 'room:state', { room: null });
  }

  sendSocial(user.id);
  broadcastPresence(user.id);
}

function detachConn(conn) {
  const userId = conn.userId;
  if (!userId) return;
  conn.userId = null;
  const set = userConns.get(userId);
  if (set) {
    set.delete(conn);
    if (set.size > 0) return;
    userConns.delete(userId);
  }

  const user = getUser(userId);
  if (user) {
    user.lastSeen = Date.now();
    saveDbSoon();
  }
  p2pPresence.delete(userId);

  const room = rooms.get(userRoom.get(userId));
  if (room) {
    const member = room.members.get(userId);
    if (member) member.connected = false;
    if (room.match) {
      const seat = room.match.seatOfUser(userId);
      if (seat >= 0) room.match.setSeatConnected(seat, false); // Bot takes over until they return
      const anyoneConnected = [...room.members.values()].some(m => m.connected);
      if (!anyoneConnected) {
        // Nobody left at the table: keep the room briefly for reconnects, then close.
        clearTimeout(room.emptyTimer);
        room.emptyTimer = setTimeout(() => {
          if ([...room.members.values()].every(m => !m.connected)) destroyRoom(room);
        }, 30 * 60 * 1000);
      }
    } else if (member) {
      member.ready = false;
      member.graceTimer = setTimeout(() => {
        if (!isOnline(userId)) leaveCurrentRoom(userId);
      }, LOBBY_DISCONNECT_GRACE_MS);
    }
    broadcastRoom(room);
  }
  broadcastPresence(userId);
}

function requireRoom(conn) {
  const room = rooms.get(userRoom.get(conn.userId));
  if (!room) sendError(conn, 'not_in_room', 'You are not in a room. Create one or join with a room code.');
  return room;
}

const handlers = {
  'account:rename'(conn, msg) {
    const user = getUser(conn.userId);
    const username = String(msg.username || '').trim();
    if (!USERNAME_RE.test(username)) return sendError(conn, 'invalid_username', 'Usernames must be 2–18 characters using only letters, numbers, _ - or .', 'auth');
    const owner = usernameIndex.get(username.toLowerCase());
    if (owner && owner !== user.id) return sendError(conn, 'taken_username', `The username "${username}" is already taken by another player.`, 'auth');
    usernameIndex.delete(user.username.toLowerCase());
    user.username = username;
    usernameIndex.set(username.toLowerCase(), user.id);
    saveDbSoon();
    sendToUser(user.id, 'account:updated', { user: { id: user.id, username: user.username, avatar: user.avatar } });
    const room = rooms.get(userRoom.get(user.id));
    if (room) broadcastRoom(room);
    broadcastPresence(user.id);
  },

  'profile:update'(conn, msg) {
    const user = getUser(conn.userId);
    user.avatar = String(msg.avatar || user.avatar).slice(0, 40);
    saveDbSoon();
    const room = rooms.get(userRoom.get(user.id));
    if (room) broadcastRoom(room);
    broadcastPresence(user.id);
  },

  'room:create'(conn, msg) {
    createRoomFor(conn.userId, msg);
  },

  'room:join'(conn, msg) {
    const code = normalizeRoomCode(msg.code);
    const err = code ? joinRoom(conn.userId, code, msg.team) : 'invalid_code';
    if (err === 'invalid_code') return sendError(conn, err, `No active room matches "${String(msg.code || '').toUpperCase() || '(empty)'}". The code may be wrong or the room has closed.`);
    if (err === 'full_room') {
      const room = rooms.get(code);
      return sendError(conn, err, `Room ${code} already has all ${room ? room.mode : 4} human seats filled (${room ? `${room.members.size}/${room.mode}` : '4/4'}).`);
    }
    if (err === 'in_progress') return sendError(conn, err, `Room ${code} is already playing a match. Wait for it to finish and try again.`);
  },

  'room:leave'(conn) {
    leaveCurrentRoom(conn.userId);
  },

  'room:mode'(conn, msg) {
    const room = requireRoom(conn);
    if (!room) return;
    if (room.hostId !== conn.userId) return sendError(conn, 'not_host', 'Only the room host can change the player mode.');
    if (room.status !== 'lobby') return sendError(conn, 'in_progress', 'The match has already started.');
    const mode = parseMode(msg.mode);
    if (mode < room.members.size) return sendError(conn, 'full_room', `There are already ${room.members.size} humans in the room, so it can't switch to ${mode}-player mode.`);
    room.mode = mode;
    // Re-seat anyone left outside the seats of the new mode (3-player uses seats 0–2)
    for (const m of room.members.values()) {
      if (m.seat >= seatCount(room)) m.seat = undefined;
    }
    for (const m of room.members.values()) {
      if (m.seat === undefined) m.seat = [0, 1, 2, 3].find(x => x < seatCount(room) && !seatTakenBy(room, x));
    }
    for (const m of room.members.values()) m.ready = false;
    broadcastRoom(room);
  },

  'room:settings'(conn, msg) {
    const room = requireRoom(conn);
    if (!room || room.hostId !== conn.userId || room.status !== 'lobby') return;
    room.settings = sanitizeSettings(msg.settings);
    broadcastRoom(room);
  },

  'room:team'(conn, msg) {
    const room = requireRoom(conn);
    if (!room) return;
    if (room.status !== 'lobby') return sendError(conn, 'in_progress', 'Teams are locked once the match starts.');
    if (room.mode === 3) return broadcastRoom(room); // 3-player: no teams, each seat has its own colour
    const team = msg.team === 'red' ? 'red' : 'blue';
    const member = room.members.get(conn.userId);
    if (seatTeam(member.seat, room) === team) return broadcastRoom(room);
    const seat = freeSeatOnTeam(room, team);
    if (seat === undefined) return sendError(conn, 'team_full', `Team ${team === 'blue' ? 'Blue' : 'Red'} already has 2 players.`);
    member.seat = seat;
    member.ready = false;
    broadcastRoom(room);
  },

  'room:ready'(conn, msg) {
    const room = requireRoom(conn);
    if (!room || room.status !== 'lobby') return;
    room.members.get(conn.userId).ready = Boolean(msg.ready);
    broadcastRoom(room);
    tryAutoStart(room);
  },

  'room:start'(conn) {
    const room = requireRoom(conn);
    if (!room) return;
    if (room.hostId !== conn.userId) return sendError(conn, 'not_host', 'Only the room host can start the match.');
    if (room.status !== 'lobby') return sendError(conn, 'in_progress', 'The match has already started.');
    if (room.members.size !== room.mode) {
      return sendError(conn, 'not_ready', `Waiting for players: ${room.members.size}/${room.mode} humans have joined.`);
    }
    const notReady = [...room.members.entries()].filter(([, m]) => !m.ready || !m.connected);
    if (notReady.length) {
      return sendError(conn, 'not_ready', `Waiting for ${notReady.map(([uid]) => getUser(uid).username).join(', ')} to mark Ready.`);
    }
    startMatch(room);
  },

  'game:bid'(conn, msg) {
    const room = requireRoom(conn);
    if (!room || !room.match) return;
    const res = room.match.submitBid(room.match.seatOfUser(conn.userId), msg.bid);
    if (!res.ok) sendError(conn, res.code, res.message, 'game');
  },

  'game:play'(conn, msg) {
    const room = requireRoom(conn);
    if (!room || !room.match) return;
    const res = room.match.playCard(room.match.seatOfUser(conn.userId), String(msg.cardId || ''));
    if (!res.ok) sendError(conn, res.code, res.message, 'game');
  },

  'gift:send'(conn, msg) {
    // 🎁 Lions / Diamonds to any player by username or id (balances live on players' devices;
    // the server keeps the gift in their inbox until their app adds it, even if they're offline)
    const giftId = String(msg.giftId || '').replace(/[^a-f0-9]/g, '').slice(0, 40);
    const lions = Math.floor(Number(msg.lions) || 0);
    const diamonds = Math.floor(Number(msg.diamonds) || 0);
    const fail = (message) => sendTo(conn, 'error', { code: 'gift_failed', giftId, message, scope: 'gift' });
    const me = getUser(conn.userId);
    const to = getUser(msg.userId) || getUser(usernameIndex.get(String(msg.username || '').trim().toLowerCase()));
    if (!giftId || lions < 0 || diamonds < 0 || lions > 100000 || diamonds > 10000 || lions + diamonds === 0) return fail('That gift amount isn’t valid.');
    if (!to) return fail('No Spades Royale player has that username — gift returned.');
    if (to.id === me.id) return fail('You can’t send a gift to yourself.');
    to.giftInbox = to.giftInbox || [];
    if (to.giftInbox.some(g => g.giftId === giftId)) return;
    if (to.giftInbox.length >= 200) return fail(`${to.username}’s gift box is full right now — gift returned.`);
    to.giftInbox.push({ giftId, lions, diamonds, fromName: me.username, at: Date.now() });
    saveDbSoon();
    if (isOnline(to.id)) sendToUser(to.id, 'gift', { giftId, lions, diamonds, fromName: me.username });
    sendTo(conn, 'gift:sent', { giftId, toName: to.username, lions, diamonds, queued: !isOnline(to.id) });
  },

  'gift:ack'(conn, msg) {
    const me = getUser(conn.userId);
    const giftId = String(msg.giftId || '');
    if (!me.giftInbox || !me.giftInbox.length) return;
    const before = me.giftInbox.length;
    me.giftInbox = me.giftInbox.filter(g => g.giftId !== giftId);
    if (me.giftInbox.length !== before) saveDbSoon();
  },

  'user:lookup'(conn, msg) {
    // Exact username check (Shop → Send a gift)
    const query = String(msg.username || '').trim().slice(0, 24);
    const u = getUser(usernameIndex.get(query.toLowerCase()));
    sendTo(conn, 'user:lookup:result', {
      query,
      found: Boolean(u),
      self: Boolean(u && u.id === conn.userId),
      user: u ? { id: u.id, username: u.username, avatar: u.avatar } : null
    });
  },

  'presence:set'(conn, msg) {
    const code = typeof msg.roomCode === 'string' && /^HDZ-[A-Z2-9]{4}$/.test(msg.roomCode) ? msg.roomCode : null;
    const next = { roomCode: code, inMatch: Boolean(msg.inMatch), roundNumber: Number(msg.roundNumber) || null };
    const prev = p2pPresence.get(conn.userId);
    p2pPresence.set(conn.userId, next);
    if (!prev || prev.inMatch !== next.inMatch || prev.roomCode !== next.roomCode) broadcastPresence(conn.userId);
  },

  'game:away'(conn, msg) {
    const room = rooms.get(userRoom.get(conn.userId));
    if (!room || !room.match) return;
    const seat = room.match.seatOfUser(conn.userId);
    if (seat >= 0) room.match.setSeatAway(seat, Boolean(msg.away));
    broadcastRoom(room);
  },

  'game:next_round'(conn) {
    const room = requireRoom(conn);
    if (!room || !room.match) return;
    room.match.ackNextRound(room.match.seatOfUser(conn.userId));
  },

  'game:resync'(conn) {
    const room = rooms.get(userRoom.get(conn.userId));
    if (room && room.match) {
      const seat = room.match.seatOfUser(conn.userId);
      if (seat >= 0) sendTo(conn, 'match:state', { match: room.match.snapshotFor(seat) });
    }
  },

  'chat:send'(conn, msg) {
    const room = rooms.get(userRoom.get(conn.userId));
    if (!room) return;
    const kind = msg.kind === 'emoji' ? 'emoji' : 'quick_chat';
    const id = String(msg.id || '');
    if (!(kind === 'emoji' ? EMOJI_IDS : QUICK_CHAT_IDS).has(id)) return;
    const now = Date.now();
    if (conn.lastChatAt && now - conn.lastChatAt < 1200) return sendError(conn, 'rate_limited', 'Slow down — one reaction per second.', 'game');
    conn.lastChatAt = now;
    const member = room.members.get(conn.userId);
    for (const uid of room.members.keys()) {
      sendToUser(uid, 'chat', { seat: member.seat, kind, id, fromId: conn.userId, at: now });
    }
  },

  'user:search'(conn, msg) {
    const query = String(msg.query || '').trim().slice(0, 24);
    if (query.length < 2) return sendTo(conn, 'search:result', { query, state: 'idle', results: [] });
    const me = getUser(conn.userId);
    const q = query.toLowerCase();
    const exactId = usernameIndex.get(q);
    const ids = [];
    if (exactId) ids.push(exactId);
    for (const [name, id] of usernameIndex) {
      if (ids.length >= 8) break;
      if (id !== exactId && name.startsWith(q)) ids.push(id);
    }
    const results = ids.map(id => {
      const pub = publicUser(id);
      let relation = 'none';
      if (id === me.id) relation = 'self';
      else if (me.friends.includes(id)) relation = 'friend';
      else if (me.outgoing.includes(id)) relation = 'outgoing';
      else if (me.incoming.includes(id)) relation = 'incoming';
      return { ...pub, relation, exact: id === exactId };
    });
    sendTo(conn, 'search:result', { query, state: results.length ? 'found' : 'not_found', results });
  },

  'friend:request'(conn, msg) {
    const me = getUser(conn.userId);
    const target = getUser(msg.userId) || getUser(usernameIndex.get(String(msg.username || '').toLowerCase()));
    if (!target) return sendError(conn, 'not_found', 'That player does not exist.', 'friends');
    if (target.id === me.id) return sendError(conn, 'bad_request', "You can't add yourself as a friend.", 'friends');
    if (me.friends.includes(target.id)) return sendError(conn, 'already_friends', `${target.username} is already your friend.`, 'friends');

    if (me.incoming.includes(target.id)) {
      acceptFriendship(me, target);
      sendToUser(target.id, 'notice', { tone: 'success', message: `🎉 ${me.username} is now your friend.` });
      sendTo(conn, 'notice', { tone: 'success', message: `🎉 You and ${target.username} are now friends.` });
    } else {
      if (!me.outgoing.includes(target.id)) {
        me.outgoing.push(target.id);
        target.incoming.push(me.id);
      }
      // Live prompt with ✓ / ✗ on the other player's screen (even mid-game)
      sendToUser(target.id, 'friend:incoming', { fromId: me.id, fromName: me.username, avatar: me.avatar || 'free_ace' });
      sendTo(conn, 'notice', { tone: 'success', message: `Friend request sent to ${target.username}.` });
    }
    saveDbSoon();
    sendSocial(me.id);
    sendSocial(target.id);
  },

  'friend:respond'(conn, msg) {
    const me = getUser(conn.userId);
    const other = getUser(msg.userId);
    if (!other || !me.incoming.includes(other.id)) return sendError(conn, 'not_found', 'That friend request no longer exists.', 'friends');
    if (msg.accept) {
      acceptFriendship(me, other);
      sendToUser(other.id, 'notice', { tone: 'success', message: `🎉 ${me.username} accepted your friend request.` });
    } else {
      me.incoming = me.incoming.filter(id => id !== other.id);
      other.outgoing = other.outgoing.filter(id => id !== me.id);
      sendToUser(other.id, 'notice', { tone: 'info', message: `${me.username} declined your friend request.` });
    }
    saveDbSoon();
    sendSocial(me.id);
    sendSocial(other.id);
  },

  'friend:remove'(conn, msg) {
    const me = getUser(conn.userId);
    const other = getUser(msg.userId);
    if (!other) return;
    me.friends = me.friends.filter(id => id !== other.id);
    other.friends = other.friends.filter(id => id !== me.id);
    me.outgoing = me.outgoing.filter(id => id !== other.id);
    other.incoming = other.incoming.filter(id => id !== me.id);
    saveDbSoon();
    sendSocial(me.id);
    sendSocial(other.id);
  },

  'invite:send'(conn, msg) {
    const me = getUser(conn.userId);
    const friend = getUser(msg.userId);
    if (!friend || !me.friends.includes(friend.id)) return sendError(conn, 'not_found', 'You can only invite players on your friends list.', 'friends');

    const p = presenceOf(friend.id);
    if (p.presence !== 'online') {
      return sendError(conn, 'unavailable_friend', p.presence === 'in_match'
        ? `${friend.username} is currently busy in another match and cannot join right now.`
        : `${friend.username} is currently offline.`, 'friends');
    }

    // Peer-to-peer room hosted on the inviter's phone: just pass the code along
    const p2pCode = typeof msg.p2pCode === 'string' && /^HDZ-[A-Z2-9]{4}$/.test(msg.p2pCode) ? msg.p2pCode : null;
    if (p2pCode) {
      pruneInvites();
      const inv = { id: `inv_${crypto.randomBytes(5).toString('hex')}`, fromId: me.id, toId: friend.id, roomCode: p2pCode, p2p: true, expiresAt: Date.now() + INVITE_TTL_MS };
      invites.set(inv.id, inv);
      sendToUser(friend.id, 'invite:received', { invite: publicInvite(inv) });
      sendSocial(friend.id);
      return sendTo(conn, 'notice', { tone: 'success', message: `Invite sent to ${friend.username} for room ${p2pCode}.` });
    }

    let room = rooms.get(userRoom.get(me.id));
    if (room && room.members.has(friend.id)) return sendError(conn, 'bad_request', `${friend.username} is already in your room.`, 'friends');
    if (room && room.status === 'playing') return sendError(conn, 'in_progress', 'You can invite friends once your current match ends.', 'friends');
    if (room && room.members.size >= room.mode) return sendError(conn, 'full_room', `Room ${room.code} is already full (${room.members.size}/${room.mode}).`, 'friends');
    if (!room) room = createRoomFor(me.id, { mode: msg.mode, team: msg.team, settings: msg.settings });

    pruneInvites();
    const inv = {
      id: `inv_${crypto.randomBytes(5).toString('hex')}`,
      fromId: me.id,
      toId: friend.id,
      roomCode: room.code,
      expiresAt: Date.now() + INVITE_TTL_MS
    };
    invites.set(inv.id, inv);
    sendToUser(friend.id, 'invite:received', { invite: publicInvite(inv) });
    sendSocial(friend.id);
    sendTo(conn, 'notice', { tone: 'success', message: `Invite sent to ${friend.username} for room ${room.code}.` });
  },

  'invite:respond'(conn, msg) {
    pruneInvites();
    const inv = invites.get(String(msg.inviteId || ''));
    if (!inv || inv.toId !== conn.userId) {
      sendError(conn, 'invalid_code', 'That invite has expired or its room has closed.', 'lobby');
      return sendSocial(conn.userId);
    }
    invites.delete(inv.id);
    const me = getUser(conn.userId);
    if (inv.p2p) {
      // The invited player's app joins the host's phone directly with the code
      sendToUser(inv.fromId, 'notice', { tone: msg.accept ? 'success' : 'info', message: msg.accept ? `${me.username} is joining your room.` : `${me.username} declined your invite.` });
      return sendSocial(conn.userId);
    }
    if (msg.accept) {
      const err = joinRoom(conn.userId, inv.roomCode, msg.team);
      if (err === 'invalid_code') sendError(conn, err, `Room ${inv.roomCode} has closed.`);
      else if (err === 'full_room') sendError(conn, err, `Room ${inv.roomCode} is already full.`);
      else if (err === 'in_progress') sendError(conn, err, `Room ${inv.roomCode} has already started its match.`);
      else sendToUser(inv.fromId, 'notice', { tone: 'success', message: `${me.username} joined your room.` });
    } else {
      sendToUser(inv.fromId, 'notice', { tone: 'info', message: `${me.username} declined your invite.` });
    }
    sendSocial(conn.userId);
  }
};

function acceptFriendship(a, b) {
  a.incoming = a.incoming.filter(id => id !== b.id);
  a.outgoing = a.outgoing.filter(id => id !== b.id);
  b.incoming = b.incoming.filter(id => id !== a.id);
  b.outgoing = b.outgoing.filter(id => id !== a.id);
  if (!a.friends.includes(b.id)) a.friends.push(b.id);
  if (!b.friends.includes(a.id)) b.friends.push(a.id);
}

function onConnection(conn) {
  conn.userId = null;
  conn.msgWindowStart = Date.now();
  conn.msgCount = 0;

  conn.on('message', (raw) => {
    conn.isAlive = true;
    const now = Date.now();
    if (now - conn.msgWindowStart > 5000) {
      conn.msgWindowStart = now;
      conn.msgCount = 0;
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return sendError(conn, 'bad_request', 'Malformed message.');
    }
    if (!msg || typeof msg.t !== 'string') return;
    if (++conn.msgCount > MSG_LIMIT_PER_5S) {
      return sendError(conn, 'rate_limited', 'Too many requests — slow down.', msg.t.startsWith('game:') ? 'game' : 'lobby');
    }
    if (msg.t === 'ping') return sendTo(conn, 'pong', { at: now });
    if (msg.t === 'hello') return handleHello(conn, msg);
    if (msg.t === 'auth:register') return handleRegister(conn, msg);
    if (msg.t === 'auth:login') return handleLogin(conn, msg);
    if (!conn.userId) return sendError(conn, 'not_identified', 'Please log in to play online.', 'auth');
    if (msg.t === 'auth:logout') return handleLogout(conn, msg);

    const handler = handlers[msg.t];
    if (!handler) return;
    try {
      handler(conn, msg);
    } catch (e) {
      log('handler error', msg.t, e);
      sendError(conn, 'server_error', 'Something went wrong on the server.');
    }
  });

  conn.on('close', () => detachConn(conn));
}

// ============================================================================
// HTTP (static app hosting) + boot
// ============================================================================
const ASSET_RE = /^\/assets\/(logo\.jpg|mark\.jpg|icon-192\.png|icon-512\.png)$/;
const ASSET_TYPES = { jpg: 'image/jpeg', png: 'image/png' };
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/manifest.json': ['manifest.json', 'application/manifest+json']
};
const JS_MODULE_RE = /^\/js\/[a-z-]+\.js$/;

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, online: userConns.size }));
    return;
  }

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  let entry = STATIC_FILES[url.pathname];
  if (!entry && JS_MODULE_RE.test(url.pathname)) entry = [url.pathname.slice(1), 'text/javascript; charset=utf-8'];
  if (!entry && ASSET_RE.test(url.pathname)) entry = [url.pathname.slice(1), ASSET_TYPES[url.pathname.split('.').pop()]];
  if (!entry || req.method !== 'GET') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  fs.readFile(path.join(ROOT, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

attachWebSocketServer(httpServer, { path: '/ws', onConnection });

setInterval(() => {
  pruneInvites();
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === 'lobby' && now - room.touchedAt > ROOM_IDLE_TTL_MS) destroyRoom(room);
  }
}, 60000).unref();

/**
 * Owner account with unlimited Lions & Diamonds. Set SPADES_ADMIN_USERNAME (+ SPADES_ADMIN_PASSWORD to create it
 * if it doesn't exist yet). The password lives only in the server's environment, never in the code.
 */
function ensureAdminAccount() {
  const username = String(process.env.SPADES_ADMIN_USERNAME || '').trim();
  if (!username || !USERNAME_RE.test(username)) return;
  let user = getUser(usernameIndex.get(username.toLowerCase()));
  const password = process.env.SPADES_ADMIN_PASSWORD || '';
  if (!user && password.length >= PASSWORD_MIN) {
    const salt = crypto.randomBytes(16).toString('hex');
    user = {
      id: `u_${crypto.randomBytes(6).toString('hex')}`,
      username,
      passwordSalt: salt,
      passwordHash: hashPassword(password, salt),
      sessions: [],
      avatar: 'free_ace',
      friends: [],
      incoming: [],
      outgoing: [],
      createdAt: Date.now(),
      lastSeen: Date.now()
    };
    db.users[user.id] = user;
    usernameIndex.set(username.toLowerCase(), user.id);
    log(`created owner account ${username}`);
  }
  if (user && !user.unlimited) {
    user.unlimited = true;
    saveDbSoon();
  }
}

async function boot() {
  loadDb();
  if (cloudEnabled) {
    try {
      const raw = await cloudLoad();
      if (raw) loadDb(raw);
      log('Cloud backup connected');
    } catch (e) {
      log('Cloud load failed, using local data:', e.message);
    }
  }
  ensureAdminAccount();
  httpServer.listen(PORT, HOST, () => {
    log(`Spades Royale server running → http://localhost:${PORT}  (WebSocket: ws://<host>:${PORT}/ws)`);
    log(`${Object.keys(db.users).length} registered players loaded${cloudEnabled ? ' (cloud backup on)' : ` from ${DB_PATH}`}`);
  });
}
boot();

function shutdown() {
  clearTimeout(saveTimer);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1));
  } catch (e) { /* ignore */ }
  const timeout = new Promise((r) => setTimeout(r, 3000));
  Promise.race([cloudSave(JSON.stringify(db)), timeout]).then(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
