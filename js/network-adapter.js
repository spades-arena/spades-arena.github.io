/**
 * Spades by Hadzz - Live Multiplayer, Friends & Presence Network Adapter
 * ============================================================================
 * Connects to the Spades by Hadzz WebSocket server (`server/server.js`).
 *
 *  - Lobbies: 2-Human (+2 bots) or 4-Human rooms, Team Red (S/N) vs Team Blue (W/E)
 *  - Server-authoritative matches: the server shuffles, deals, validates every bid
 *    and card, runs bots, and only ever sends each player their own hand.
 *  - Friends: username search, requests, presence (online / in_match / offline), invites
 *  - Quick chat & emoji reactions broadcast to every seat in the room
 *
 * Server URL: same host when the app is served over http(s), otherwise
 * ws://localhost:8787/ws. Override in the Lobby screen (saved per device).
 *
 * All UI screens in `js/app.js` call into `SpadesHadzz.networkAdapter`, subscribe
 * to `onStateChange(...)`, and listen for `on('match' | 'chat' | 'notice' | 'game_error')`.
 * ============================================================================
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  const QUICK_CHAT_PRESETS = [
    { id: 'qc_well_played', text: 'Well played!' },
    { id: 'qc_good_game', text: 'Good game!' },
    { id: 'qc_good_move', text: 'Good move!' },
    { id: 'qc_good_luck', text: 'Good luck!' },
    { id: 'qc_playing_well', text: 'You’re playing well!' }
  ];

  const EMOJI_REACTIONS = [
    { id: 'em_crying', label: 'Crying', symbol: '😢' },
    { id: 'em_happy', label: 'Happy', symbol: '😊' },
    { id: 'em_laughing', label: 'Laughing', symbol: '😂' },
    { id: 'em_sad', label: 'Sad', symbol: '😔' },
    { id: 'em_sunglasses', label: 'Sunglasses', symbol: '😎' }
  ];

  const NET_STORAGE_KEY = 'spades_royale_net_v2'; // v2 = fresh start (all old logins cleared)
  const DEFAULT_PORT = 8787;
  // Free cloud server for logins & friends (filled in at build time: SPADES_SERVER_URL=wss://…/ws python3 bundle.py)
  const HOSTED_SERVER_URL = '';
  const COMPASS_LABELS = ['South', 'West', 'North (Opposite South)', 'East (Opposite West)'];

  const ERROR_TITLES = {
    invalid_code: 'Invalid or Expired Room Code',
    full_room: 'Room Is Full',
    unavailable_friend: 'Friend Unavailable',
    taken_username: 'Username Already Taken Online',
    invalid_username: 'Username Not Allowed Online',
    team_full: 'Team Is Full',
    team_locked: 'Teams Are Set Automatically',
    not_host: 'Host Only',
    not_ready: 'Not Everyone Is Ready',
    in_progress: 'Match In Progress',
    not_in_room: 'Not In a Room',
    not_found: 'Player Not Found',
    already_friends: 'Already Friends',
    rate_limited: 'Slow Down',
    not_identified: 'Please Log In',
    bad_credentials: 'Login Failed',
    no_pin: 'No Recovery PIN',
    bad_pin: 'PIN Must Be 4 Numbers',
    update_required: 'Update Spades Arena',
    weak_password: 'Password Too Short',
    locked: 'Account Temporarily Locked',
    session_expired: 'Session Expired',
    offline: 'Not Connected to Server',
    server_error: 'Server Error'
  };

  /** Your gallery photo stays on your phone; other players see a normal avatar instead. */
  function publicAvatar(id) {
    return id === 'photo' ? 'av_panther' : id;
  }

  function loadPrefs() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(NET_STORAGE_KEY) : null;
      return raw ? JSON.parse(raw) || {} : {};
    } catch (e) {
      return {};
    }
  }

  function savePrefs(prefs) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(NET_STORAGE_KEY, JSON.stringify(prefs));
    } catch (e) {
      // Ignore storage errors (private browsing)
    }
  }

  function defaultServerUrl() {
    const local = typeof location !== 'undefined' && location.protocol === 'http:' && location.host;
    if (HOSTED_SERVER_URL && !local) return HOSTED_SERVER_URL;
    if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && location.host) {
      return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    }
    return `ws://localhost:${DEFAULT_PORT}/ws`;
  }

  function normalizeServerUrl(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';
    url = url.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    if (!/^wss?:\/\//i.test(url)) url = `ws://${url}`;
    try {
      const parsed = new URL(url);
      if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/ws';
      return parsed.toString().replace(/\/$/, '');
    } catch (e) {
      return '';
    }
  }

  function describePresence(p) {
    if (p.presence === 'in_match') return `Busy — In Match${p.roundNumber ? ` (Round ${p.roundNumber})` : ''}`;
    if (p.presence === 'online') return p.inLobby ? 'Online — In a Lobby' : 'Online — In Main Menu';
    if (!p.lastSeen) return 'Offline';
    const mins = Math.max(1, Math.round((Date.now() - p.lastSeen) / 60000));
    if (mins < 60) return `Offline — Last seen ${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `Offline — Last seen ${hours}h ago`;
    return `Offline — Last seen ${Math.round(hours / 24)}d ago`;
  }

  class NetworkAdapter {
    constructor() {
      this.listeners = new Set();
      this.eventHandlers = {};
      this.ws = null;
      this.reconnectTimer = null;
      this.reconnectAttempt = 0;
      this.pingTimer = null;
      this.avatarSentFor = null;
      this.initialized = false;
      this.prefs = loadPrefs();
      delete this.prefs.token; // legacy per-device identity (replaced by account logins)
      if (!/^[a-z0-9]{16,40}$/.test(this.prefs.clientId || '')) {
        // Stable id for this device in peer-to-peer rooms (lets you rejoin your seat after a drop)
        const buf = new Uint8Array(10);
        root.crypto.getRandomValues(buf);
        this.prefs.clientId = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
        savePrefs(this.prefs);
      }
      this.p2p = null; // { role: 'host' | 'guest', peer, code, host?, conn?, guests? }

      this.state = {
        connectionStatus: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
        serverUrl: this.prefs.serverUrl || defaultServerUrl(),
        identity: this.prefs.session ? 'unknown' : 'signed_out', // 'unknown' | 'ok' | 'signed_out'
        me: null,
        savedUsername: this.prefs.username || '',
        authBusy: false,
        authAlert: null,
        humanCountMode: 4, // Strictly 2 or 4 (never 3!)
        roomCode: null,
        room: null,
        isHost: false,
        joinCodeInput: '',
        selectedTeam: 'blue',
        isReady: false,
        lobbyAlert: null,
        seats: [],
        p2pStatus: 'idle', // 'idle' | 'connecting' | 'hosting' | 'joined'
        matchActive: false,
        activeMatch: null, // { roomCode, roundNumber, myScore, foeScore, away, paused } while a match is in progress
        searchQuery: '',
        searchState: 'idle',
        searchResults: [],
        friendsAlert: null,
        incomingRequests: [],
        outgoingRequests: [],
        friendsList: [],
        invites: []
      };
      this.syncSeatsForMode(4);
    }

    // ------------------------------------------------------------ subscriptions

    onStateChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    emit() {
      this.listeners.forEach(fn => fn(this.state));
    }

    on(eventName, fn) {
      (this.eventHandlers[eventName] = this.eventHandlers[eventName] || new Set()).add(fn);
      return () => this.eventHandlers[eventName].delete(fn);
    }

    fire(eventName, payload) {
      (this.eventHandlers[eventName] || []).forEach(fn => fn(payload));
    }

    // ------------------------------------------------------------ connection

    init() {
      if (this.initialized) return;
      this.initialized = true;

      if (SH.store) {
        SH.store.subscribe(() => {
          const p = SH.store.getProfile();
          this.scheduleProfileUpload();
          if (this.isOnlineReady() && this.avatarSentFor !== p.selectedAvatar) {
            this.avatarSentFor = p.selectedAvatar;
            this.send('profile:update', { avatar: publicAvatar(p.selectedAvatar) });
          }
          if (this.state.isHost && this.state.room && this.state.room.status === 'lobby') {
            const s = SH.store.getSettings();
            const rs = this.state.room.settings || {};
            if (rs.targetScore !== s.targetScore || rs.difficulty !== s.botDifficulty || rs.speed !== (s.gameSpeed || 'normal') || (rs.pairing || 'team') !== (this.prefs.pairing === 'versus' ? 'versus' : 'team')) {
              this.roomSend('room:settings', { settings: this.localSettings() });
            }
          }
        });
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('offline', () => this.emit());
        window.addEventListener('online', () => {
          this.emit();
          this.reconnectNow();
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && this.state.connectionStatus === 'disconnected') this.reconnectNow();
        });
      }
      this.connect();

      // A host who reopened the app re-opens their room and restores the game
      const hosted = this.prefs.hostedRoom;
      if (hosted && hosted.code && Date.now() - hosted.savedAt < 3 * 60 * 60 * 1000 && this.p2pSupported()) {
        setTimeout(() => { if (!this.p2p) this.p2pRestoreHost(hosted); }, 300);
        return;
      }
      // A guest whose app restarted mid-game rejoins their room (and seat) automatically
      const last = this.prefs.lastRoom;
      if (last && last.code && Date.now() - last.at < 3 * 60 * 60 * 1000 && this.p2pSupported()) {
        setTimeout(() => {
          if (!this.p2p && !this.state.roomCode) {
            this.p2pJoin(last.code);
            this.state.lobbyAlert = { type: 'info', title: `Rejoining room ${last.code}…`, detail: 'Reconnecting you to your game.' };
            this.emit();
          }
        }, 300);
      }
    }

    rememberRoom(code) {
      if (code) this.prefs.lastRoom = { code, at: Date.now() };
      else delete this.prefs.lastRoom;
      savePrefs(this.prefs);
    }

    isOpen() {
      return Boolean(this.ws && this.ws.readyState === 1);
    }

    isOnlineReady() {
      return this.isOpen() && this.state.identity === 'ok';
    }

    connect() {
      clearTimeout(this.reconnectTimer);
      if (typeof WebSocket === 'undefined') {
        this.state.connectionStatus = 'disconnected';
        this.emit();
        return;
      }
      if (this.ws) {
        const old = this.ws;
        this.ws = null;
        try { old.close(); } catch (e) { /* ignore */ }
      }

      this.state.connectionStatus = 'connecting';
      this.emit();

      let ws;
      try {
        ws = new WebSocket(this.state.serverUrl);
      } catch (e) {
        this.state.connectionStatus = 'disconnected';
        this.emit();
        this.scheduleReconnect();
        return;
      }
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.reconnectAttempt = 0;
        this.state.connectionStatus = 'connected';
        this.sendHello();
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send('ping'), 20000);
        this.emit();
      };

      ws.onmessage = (e) => {
        if (this.ws !== ws) return;
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch (err) {
          return;
        }
        this.handleMessage(msg, 'server');
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        clearInterval(this.pingTimer);
        const wasConnected = this.state.connectionStatus === 'connected';
        this.state.connectionStatus = 'disconnected';
        this.state.identity = this.prefs.session ? 'unknown' : 'signed_out';
        this.state.authBusy = false;
        this.emit();
        if (wasConnected && this.state.matchActive) {
          this.fire('notice', { tone: 'error', message: 'Connection lost — reconnecting… (a bot covers your seat meanwhile)' });
        }
        this.scheduleReconnect();
      };

      ws.onerror = () => { /* onclose follows */ };
    }

    scheduleReconnect() {
      clearTimeout(this.reconnectTimer);
      const delay = Math.min(15000, 1000 * Math.pow(2, this.reconnectAttempt));
      this.reconnectAttempt = Math.min(this.reconnectAttempt + 1, 6);
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    reconnectNow() {
      this.reconnectAttempt = 0;
      this.connect();
    }

    setServerUrl(raw) {
      const url = normalizeServerUrl(raw);
      if (!url) {
        this.state.lobbyAlert = {
          type: 'error',
          title: 'Invalid Server Address',
          detail: 'Enter an address like 192.168.1.20:8787 or wss://spades.example.com/ws.'
        };
        this.emit();
        return;
      }
      this.prefs.serverUrl = url;
      savePrefs(this.prefs);
      this.state.serverUrl = url;
      this.state.lobbyAlert = { type: 'info', title: 'Connecting to Server…', detail: url };
      this.reconnectNow();
    }

    resetServerUrl() {
      delete this.prefs.serverUrl;
      savePrefs(this.prefs);
      this.state.serverUrl = defaultServerUrl();
      this.reconnectNow();
    }

    send(type, payload = {}) {
      if (!this.isOpen()) return false;
      this.ws.send(JSON.stringify({ t: type, ...payload }));
      return true;
    }

    /** Sends an action that requires a signed-in connection; surfaces an alert otherwise. */
    sendAction(type, payload, scope = 'lobby') {
      if (this.isOnlineReady()) return this.send(type, payload);
      let detail;
      if (this.state.identity === 'signed_out') {
        this.fire('auth_required');
        detail = 'Log in or create an account to play online.';
      } else {
        detail = `Cannot reach the Spades server at ${this.state.serverUrl}. Start it with "node server/server.js" or set the server address in the Lobby.`;
      }
      this.setAlert(scope, { type: 'error', title: ERROR_TITLES.offline, detail });
      this.emit();
      return false;
    }

    sendHello() {
      if (!this.prefs.session) {
        this.state.identity = 'signed_out';
        return;
      }
      const p = SH.store ? SH.store.getProfile() : null;
      this.avatarSentFor = p ? p.selectedAvatar : null;
      this.send('hello', { session: this.prefs.session, avatar: p ? publicAvatar(p.selectedAvatar) : undefined, appVersion: SH.APP_VERSION || 'dev' });
    }

    // ------------------------------------------------------------ accounts

    login(username, password) {
      this.authenticate('auth:login', username, password);
    }

    register(username, password, pin, useCode = false) {
      this.authenticate('auth:register', username, password, { pin: String(pin || ''), ...(useCode ? { useCode: true } : {}) });
    }

    /** Forgot password: username + 4-digit recovery PIN → new password (and you're logged in). */
    resetPassword(username, pin, newPassword) {
      this.authenticate('auth:reset', username, newPassword, { pin: String(pin || '') });
    }

    /** Logged in: change password (needs the current one). Result arrives as an 'account_result' event. */
    changePassword(oldPassword, newPassword) {
      return this.sendAction('account:change_password', { oldPassword: String(oldPassword || ''), newPassword: String(newPassword || '') }, 'both');
    }

    /** Logged in: set or change the 4-digit recovery PIN (needs your password). */
    setRecoveryPin(password, pin) {
      return this.sendAction('account:set_pin', { password: String(password || ''), pin: String(pin || '') }, 'both');
    }

    authenticate(type, username, password, extra = {}) {
      const name = String(username || '').trim();
      if (!this.isOpen() && HOSTED_SERVER_URL) {
        // Online accounts: wait for the free cloud server (it can take up to a minute to wake up)
        this.waitForServerThenAuth(type, name, password, extra);
        return;
      }
      if (!this.isOpen() && type === 'auth:reset') {
        this.state.authAlert = { type: 'error', title: 'Needs the Internet', detail: 'Resetting a password with your PIN needs a connection to the Spades Arena server.' };
        this.emit();
        return;
      }
      if (!this.isOpen()) {
        // No accounts server set up: use an account kept on this device
        this.authenticateOnDevice(type === 'auth:register' ? 'register' : 'login', name, String(password || ''));
        return;
      }
      const p = SH.store ? SH.store.getProfile() : null;
      this.state.authBusy = true;
      this.state.authAlert = null;
      this.prefs.username = name;
      this.state.savedUsername = name;
      savePrefs(this.prefs);
      this.send(type, { ...extra, username: name, password: String(password || ''), avatar: p ? publicAvatar(p.selectedAvatar) : undefined, appVersion: SH.APP_VERSION || 'dev' });
      this.emit();
    }

    waitForServerThenAuth(type, name, password, extra = {}) {
      const attempt = (this.authWaitId || 0) + 1;
      this.authWaitId = attempt;
      const started = Date.now();
      const LIMIT_MS = 75000;
      const busy = () => {
        this.state.authBusy = true;
        this.state.authAlert = {
          type: 'info',
          title: 'Connecting to Spades Arena…',
          detail: 'Waking up the free login server — this can take up to a minute the first time. Keep this screen open.'
        };
        this.emit();
      };
      busy();
      let lastKick = Date.now();
      if (!this.ws) this.reconnectNow();
      const tick = () => {
        if (this.authWaitId !== attempt) return;
        if (this.isOpen()) {
          this.authenticate(type, name, password, extra);
          return;
        }
        if (Date.now() - started > LIMIT_MS) {
          const local = (this.prefs.localAccounts || {})[name.toLowerCase()];
          if (type === 'auth:login' && local) {
            this.authenticateOnDevice('login', name, String(password || '')); // older account kept on this device
            return;
          }
          this.state.authBusy = false;
          this.state.authAlert = {
            type: 'error',
            title: 'Can’t Reach the Login Server',
            detail: 'Check your Wi-Fi or mobile data and tap the button again.',
            code: 'offline'
          };
          this.emit();
          return;
        }
        if (!this.state.authBusy || !this.state.authAlert) busy(); // a failed connection attempt cleared it
        if (!this.ws && Date.now() - lastKick > 3000) { lastKick = Date.now(); this.reconnectNow(); }
        setTimeout(tick, 500);
      };
      setTimeout(tick, 500);
    }

    /** SHA-256(salt:password) as hex — passwords are never stored in plain text. */
    async hashPassword(salt, password) {
      const data = new TextEncoder().encode(`${salt}:${password}`);
      const digest = await root.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }

    /** Account stored on this device (works with no server / on mobile data). */
    async authenticateOnDevice(mode, name, password) {
      const fail = (title, detail, code) => {
        this.state.authBusy = false;
        this.state.authAlert = { type: 'error', title, detail, code };
        this.emit();
      };
      if (!/^[A-Za-z0-9_.-]{2,18}$/.test(name)) return fail(ERROR_TITLES.invalid_username, 'Usernames must be 2–18 characters using only letters, numbers, _ - or .', 'invalid_username');
      if (password.length < 6) return fail(ERROR_TITLES.weak_password, 'Passwords must be at least 6 characters.', 'weak_password');
      if (!root.crypto || !root.crypto.subtle) return fail('Not Supported', 'This browser can’t store a secure login. Please use Chrome.');
      this.state.authBusy = true;
      this.state.authAlert = null;
      this.emit();
      const accounts = this.prefs.localAccounts || {};
      const key = name.toLowerCase();
      if (mode === 'register') {
        if (accounts[key]) return fail(ERROR_TITLES.taken_username, `"${name}" already has an account on this phone — log in instead.`, 'taken_username');
        const buf = new Uint8Array(12);
        root.crypto.getRandomValues(buf);
        const salt = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
        accounts[key] = { username: name, salt, hash: await this.hashPassword(salt, password), createdAt: Date.now() };
        this.prefs.localAccounts = accounts;
      } else {
        const acct = accounts[key];
        if (!acct) {
          return fail('Account Not Found', `No account called "${name}" on this device, and the login server can’t be reached right now. Create an account, or try again when online.`, 'bad_credentials');
        }
        if (await this.hashPassword(acct.salt, password) !== acct.hash) return fail(ERROR_TITLES.bad_credentials, 'Incorrect username or password.', 'bad_credentials');
      }
      const username = accounts[key].username;
      if (SH.store && SH.store.setUnlimited) SH.store.setUnlimited(false); // only server-verified owner accounts are unlimited
      this.prefs.localSession = username;
      this.prefs.username = username;
      savePrefs(this.prefs);
      this.state.authBusy = false;
      this.state.savedUsername = username;
      this.syncStoreUsername({ username });
      this.emit();
      this.fire('signed_in', { user: { username }, freshLogin: true, local: true });
    }

    logout() {
      this.send('auth:logout', { session: this.prefs.session });
      this.clearSession();
      this.fire('notice', { tone: 'info', message: 'Signed out.' });
    }

    clearSession() {
      if (SH.store && SH.store.setUnlimited) SH.store.setUnlimited(false);
      delete this.prefs.session;
      delete this.prefs.localSession;
      savePrefs(this.prefs);
      this.state.identity = 'signed_out';
      this.state.me = null;
      this.state.authBusy = false;
      this.state.friendsList = [];
      this.state.incomingRequests = [];
      this.state.outgoingRequests = [];
      this.state.invites = [];
      this.state.searchResults = [];
      this.state.searchState = 'idle';
      this.emit();
    }

    renameAccount(username) {
      return this.sendAction('account:rename', { username: String(username || '').trim() }, 'both');
    }

    /** Renames the account kept on this phone (keeps the same password). */
    renameLocalAccount(newName) {
      const accounts = this.prefs.localAccounts || {};
      const oldKey = String(this.prefs.localSession || '').toLowerCase();
      const acct = accounts[oldKey];
      if (!acct || !/^[A-Za-z0-9_.-]{2,18}$/.test(newName) || accounts[newName.toLowerCase()] && newName.toLowerCase() !== oldKey) return false;
      delete accounts[oldKey];
      accounts[newName.toLowerCase()] = { ...acct, username: newName };
      this.prefs.localAccounts = accounts;
      this.prefs.localSession = newName;
      this.prefs.username = newName;
      savePrefs(this.prefs);
      return true;
    }

    /** Logged in with a server account or an account on this phone. */
    isSignedIn() {
      return Boolean(this.prefs.session || this.prefs.localSession);
    }

    /** Signed in with an online (server) account — needed for Friends & invites. */
    isOnlineAccount() {
      return Boolean(this.prefs.session);
    }

    syncStoreUsername(user) {
      if (!SH.store) return;
      const p = SH.store.getProfile();
      if (p.username !== user.username) SH.store.updateUsername(user.username);
    }

    localSettings() {
      const s = SH.store ? SH.store.getSettings() : { targetScore: 500, botDifficulty: 'Medium' };
      return { targetScore: s.targetScore, difficulty: s.botDifficulty, speed: s.gameSpeed || 'normal', pairing: this.prefs.pairing === 'versus' ? 'versus' : 'team' };
    }

    setAlert(scope, alert) {
      if (scope === 'friends' || scope === 'identity' || scope === 'both') this.state.friendsAlert = alert;
      if (scope !== 'friends') this.state.lobbyAlert = alert;
    }

    // ------------------------------------------------------------ inbound messages

    handleMessage(msg, source = 'p2p') {
      // Rooms & matches now run peer-to-peer; the server only handles accounts, friends & invites
      if (source === 'server' && (msg.t === 'room:state' || msg.t === 'match:state' || msg.t === 'chat')) return;
      switch (msg.t) {
        case 'welcome': {
          const freshLogin = Boolean(msg.session);
          if (msg.session) {
            this.prefs.session = msg.session;
            this.prefs.username = msg.user.username;
            savePrefs(this.prefs);
          }
          this.state.me = msg.user;
          if (SH.store && SH.store.setUnlimited) SH.store.setUnlimited(Boolean(msg.user.unlimited));
          this.state.identity = 'ok';
          this.reconcileProfile(msg.profile || null);
          this.state.authBusy = false;
          this.state.authAlert = null;
          this.state.savedUsername = msg.user.username;
          this.syncStoreUsername(msg.user);
          if (this.state.lobbyAlert && this.state.lobbyAlert.title === ERROR_TITLES.offline) this.state.lobbyAlert = null;
          if (this.state.friendsAlert && this.state.friendsAlert.title === ERROR_TITLES.offline) this.state.friendsAlert = null;
          this.emit();
          this.reportStats();
          this.fire('signed_in', { user: msg.user, freshLogin });
          break;
        }

        case 'account:result':
          if (msg.action === 'set_pin' && msg.ok && this.state.me) this.state.me.hasPin = true;
          this.fire('account_result', { ok: Boolean(msg.ok), action: msg.action, message: msg.message || '' });
          this.emit();
          break;

        case 'profile:state':
          this.reconcileProfile(msg); // another device changed something, or our upload was out of date
          break;

        case 'profile:saved': {
          const p = SH.store && SH.store.getProfile();
          if (!p) break;
          p.syncedAt = msg.updatedAt;
          p.syncBase = this.profileSentBalance || SH.store.realBalance(); // what the server now holds
          if ((p.changeSeq || 0) === this.profileSentSeq) p.syncDirty = false;
          SH.store.saveRemote();
          if (p.syncDirty) this.scheduleProfileUpload();
          break;
        }

        case 'account:updated':
          this.state.me = msg.user;
          this.prefs.username = msg.user.username;
          savePrefs(this.prefs);
          this.syncStoreUsername(msg.user);
          this.fire('account_renamed', { username: msg.user.username });
          this.emit();
          break;

        case 'auth:logged_out':
          break;

        case 'error':
          this.handleError(msg);
          break;

        case 'room:state':
          this.applyRoom(msg.room);
          break;

        case 'match:state': {
          const m = msg.match;
          this.state.matchActive = m.phase !== 'game_over';
          const soloMatch = m.numSeats === 3;
          const myTeam = soloMatch ? m.mySeat : m.mySeat % 2;
          const prevSummary = JSON.stringify(this.state.activeMatch);
          this.state.activeMatch = this.state.matchActive ? {
            roomCode: this.state.roomCode,
            roomName: this.state.room && this.state.room.name ? this.state.room.name : '',
            roundNumber: m.roundNumber,
            myScore: m.teamScores[myTeam],
            foeScore: Math.max(...m.teamScores.filter((_, i) => i !== myTeam)),
            away: Boolean(m.players[m.mySeat].away),
            paused: Boolean(m.paused)
          } : null;
          this.fire('match', m);
          // Only re-render menus when the resume summary changes (not on every card played)
          if (JSON.stringify(this.state.activeMatch) !== prevSummary) {
            this.syncPresence();
            this.emit();
          }
          break;
        }

        case 'chat':
          this.fire('chat', msg);
          break;

        case 'social:state':
          this.applySocial(msg);
          break;

        case 'search:result':
          this.applySearch(msg);
          break;

        case 'invite:received': {
          const inv = msg.invite;
          if (inv && inv.from) {
            this.state.invites = [inv, ...this.state.invites.filter(i => i.id !== inv.id)];
            this.fire('notice', { tone: 'info', message: `🎴 ${inv.from.username} invited you to room ${inv.roomCode} — open the Lobby to join.` });
            this.emit();
          }
          break;
        }

        case 'notice':
          this.fire('notice', { tone: msg.tone || 'info', message: msg.message });
          break;

        case 'friend:incoming':
          if (msg.fromId && msg.fromName) this.fire('friend_request', { id: msg.fromId, username: msg.fromName, avatar: msg.avatar || 'av_panther' });
          break;

        case 'gift': {
          // 🎁 Someone sent us Coins / Diamonds
          const lions = Math.max(0, Math.floor(Number(msg.lions) || 0));
          const diamonds = Math.max(0, Math.floor(Number(msg.diamonds) || 0));
          const item = msg.item && msg.item.kind && msg.item.id ? { kind: msg.item.kind, id: msg.item.id } : null;
          if (msg.giftId) this.send('gift:ack', { giftId: msg.giftId }); // added (or already had it) — clear the server inbox
          if (SH.store && SH.store.receiveGift(msg.giftId, { lions, diamonds, item })) {
            this.fire('gift_received', { fromName: msg.fromName, lions, diamonds, item });
            this.fire('notice', { tone: 'success', message: `🎁 ${msg.fromName || 'A friend'} sent you ${this.giftLabel({ lions, diamonds, item })}!${item ? ' It’s unlocked now.' : ''}` });
          }
          break;
        }

        case 'gift:sent': {
          const pending = this.pendingGifts && this.pendingGifts.get(msg.giftId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingGifts.delete(msg.giftId);
            const parts = this.giftLabel(pending);
            this.fire('gift_sent', { giftId: msg.giftId, toName: msg.toName });
            this.fire('notice', {
              tone: 'success',
              message: msg.queued
                ? `🎁 Gift of ${parts} sent to ${msg.toName}! They’ll get it next time they open Spades Arena.`
                : `🎁 Gift of ${parts} sent to ${msg.toName}!`
            });
          }
          break;
        }

        case 'gift:history': {
          const w = this.pendingGiftHistory;
          this.pendingGiftHistory = null;
          if (w) { clearTimeout(w.timer); w.resolve({ ok: true, log: Array.isArray(msg.log) ? msg.log : [] }); }
          break;
        }

        case 'leaderboard': {
          const waiting = this.pendingLeaderboard;
          this.pendingLeaderboard = null;
          if (waiting) {
            clearTimeout(waiting.timer);
            waiting.resolve({ ok: true, top: msg.top || [], friends: msg.friends || [], myRank: msg.myRank || 0, total: msg.total || 0 });
          }
          break;
        }

        case 'user:lookup:result': {
          const waiting = this.pendingLookups && this.pendingLookups.get(String(msg.query || '').toLowerCase());
          if (waiting) {
            this.pendingLookups.delete(String(msg.query || '').toLowerCase());
            clearTimeout(waiting.timer);
            waiting.resolve({ ok: true, found: Boolean(msg.found), self: Boolean(msg.self), user: msg.user || null });
          }
          break;
        }

        case 'p2p:closed':
          if (this.p2p) this.teardownP2P(this.p2p);
          this.applyRoom(null);
          this.fire('notice', { tone: 'info', message: msg.reason || 'The host closed the room.' });
          break;

        default:
          break;
      }
    }

    handleError(msg) {
      const code = msg.code;
      const scope = msg.scope || 'lobby';

      if (code === 'update_required') {
        this.state.authBusy = false;
        this.fire('update_required', { message: msg.message || '' });
        this.emit();
        return;
      }

      if (scope === 'game') {
        this.fire('game_error', msg);
        return;
      }
      if (scope === 'chat') {
        this.fire('notice', { tone: 'error', message: msg.message });
        return;
      }
      if (scope === 'gift') {
        this.refundGift(msg.giftId, msg.message);
        return;
      }

      if (scope === 'auth') {
        this.state.authBusy = false;
        const authAlert = { type: 'error', title: ERROR_TITLES[code] || 'Login Problem', detail: msg.message || 'Please try again.', code };
        if (code === 'session_expired') {
          this.clearSession();
          this.state.authAlert = authAlert;
          this.fire('auth_required');
        } else if (this.state.identity === 'ok') {
          // Signed in already: this was a rename attempt from Profile
          this.setAlert('both', authAlert);
          this.fire('notice', { tone: 'error', message: authAlert.detail });
        } else {
          this.state.authAlert = authAlert;
        }
        this.emit();
        return;
      }

      const alert = {
        type: code === 'already_friends' ? 'info' : 'error',
        title: ERROR_TITLES[code] || 'Request Failed',
        detail: msg.message || 'Please try again.',
        code
      };
      this.setAlert(code === 'unavailable_friend' || scope === 'identity' ? 'both' : scope, alert);
      this.emit();
    }

    applyRoom(room) {
      const prevCode = this.state.roomCode;
      this.state.room = room;
      if (!room) {
        this.state.roomCode = null;
        this.state.isHost = false;
        this.state.isReady = false;
        this.state.matchActive = false;
        this.state.activeMatch = null;
        this.syncSeatsForMode(this.state.humanCountMode);
        if (prevCode) {
          this.fire('room_left', { code: prevCode });
          this.syncPresence();
        }
        this.emit();
        return;
      }

      const myId = this.myRoomId();
      const mySeat = room.seats.find(s => s.userId && s.userId === myId);
      this.state.roomCode = room.code;
      this.state.humanCountMode = room.mode;
      this.state.isHost = room.hostId === myId;
      this.state.isReady = Boolean(mySeat && mySeat.ready);
      if (mySeat && (mySeat.team === 'blue' || mySeat.team === 'red')) this.state.selectedTeam = mySeat.team;
      if (room.status !== 'playing') {
        this.state.matchActive = false;
        this.state.activeMatch = null;
      } else if (this.state.activeMatch) {
        this.state.activeMatch.roomCode = room.code;
      }
      this.state.seats = room.seats.map(s => this.describeRoomSeat(s, myId));

      if (prevCode !== room.code) {
        this.state.lobbyAlert = {
          type: 'success',
          title: this.state.isHost ? `Room ${room.code} is live 🌍` : `Joined Room ${room.code}`,
          detail: this.state.isHost
            ? `Your phone is hosting. Share code ${room.code} with friends anywhere — keep this app open while you play.`
            : `Pick your team and tap Ready. The match starts when all ${room.mode} players are Ready.`
        };
        this.syncPresence();
      }
      this.emit();
    }

    describeRoomSeat(s, myId) {
      const base = { seat: s.seat, compass: this.state.humanCountMode === 3 ? s.compass : COMPASS_LABELS[s.seat], team: s.team };
      if (s.kind === 'human') {
        const self = s.userId === myId;
        let status = s.connected ? 'Connected' : 'Reconnecting…';
        if (s.botControlled) status = s.away ? 'Away — Bot covering' : 'Disconnected — Bot covering';
        return {
          ...base,
          role: self ? 'human_self' : 'human',
          userId: s.userId,
          plainName: s.name,
          name: `${s.name}${self ? ' (You)' : ''}`,
          ready: s.ready,
          avatar: s.avatar,
          status: `${s.isHost ? 'Host · ' : ''}${status}`
        };
      }
      if (s.kind === 'bot') {
        return { ...base, role: 'bot', name: s.name || `Bot ${base.compass.split(' ')[0]}`, ready: true, avatar: s.avatar || 'av_veteran', status: 'AI Bot Seat' };
      }
      if (s.kind === 'open_or_bot') {
        return { ...base, role: 'human_slot', name: 'Open Seat', ready: true, avatar: 'av_phantom', status: 'AI Bot if no 2nd human sits here' };
      }
      const colour = SH.teamDisplayName(s.team);
      return { ...base, role: 'human_slot', name: `Open Seat (${this.state.humanCountMode === 3 ? colour : `Team ${colour}`})`, ready: false, avatar: 'av_phantom', status: 'Waiting for player' };
    }

    applySocial(msg) {
      const map = (u) => ({ ...u, statusText: describePresence(u) });
      this.state.friendsList = (msg.friends || []).map(map).sort((a, b) => {
        const rank = { online: 0, in_match: 1, offline: 2 };
        return rank[a.presence] - rank[b.presence] || a.username.localeCompare(b.username);
      });
      this.state.incomingRequests = (msg.incoming || []).map(u => ({ ...map(u), note: 'Wants to be your friend' }));
      this.state.outgoingRequests = (msg.outgoing || []).map(map);
      this.state.invites = (msg.invites || []).filter(i => i.from);
      this.emit();
    }

    applySearch(msg) {
      if (msg.query !== this.state.searchQuery) return; // stale
      this.state.searchState = msg.state;
      this.state.searchResults = (msg.results || []).map(u => ({ ...u, statusText: describePresence(u) }));
      if (msg.state === 'not_found') {
        this.state.friendsAlert = {
          type: 'warning',
          title: `No Player Found Matching "${msg.query}"`,
          detail: 'Check the spelling. Usernames are not case-sensitive.'
        };
      } else {
        this.state.friendsAlert = null;
      }
      this.emit();
    }

    // ------------------------------------------------------------ lobby API

    setHumanCountMode(count, localUsername, localAvatar) {
      const validCount = [2, 3, 4].includes(Number(count)) ? Number(count) : 4;
      if (this.state.room) {
        if (!this.state.isHost) {
          this.state.lobbyAlert = { type: 'warning', title: ERROR_TITLES.not_host, detail: 'Only the room host can switch between 2-Human and 4-Human mode.' };
          this.emit();
          return;
        }
        this.roomAction('room:mode', { mode: validCount });
        return;
      }
      this.state.humanCountMode = validCount;
      this.syncSeatsForMode(validCount, localUsername, localAvatar);
      this.state.lobbyAlert = {
        type: 'info',
        title: validCount === 2
          ? '2-Human Mode Selected (2 Humans + 2 Bots)'
          : validCount === 3
          ? '3-Player Mode Selected (Red vs Blue vs Yellow)'
          : '4-Human Team Mode Selected (Team Red vs Team Blue)',
        detail: validCount === 3
          ? 'Every player for themselves with 17 cards each. Create a room and share the code with 2 friends.'
          : validCount === 2
          ? 'The two seats not taken by humans are automatically assigned to AI Bots so the game always has 4 seats.'
          : 'All 4 seats are reserved for human players. Teammates sit opposite each other (South & North = Team Red; West & East = Team Blue).'
      };
      this.emit();
    }

    /** Preview seats shown before joining a room (live rooms come from the server). */
    syncSeatsForMode(count, localUsername, localAvatar) {
      if (this.state.room) {
        const myId = this.myRoomId();
        this.state.seats = this.state.room.seats.map(s => this.describeRoomSeat(s, myId));
        return;
      }
      const profile = SH.store ? SH.store.getProfile() : null;
      const name = localUsername || (profile ? profile.username : 'You');
      const avatar = localAvatar || (profile ? profile.selectedAvatar : 'av_panther');
      const solo = count === 3;
      const mySeat = solo ? 0 : this.state.selectedTeam === 'red' ? 1 : 0;
      const defaults = ['av_panther', 'av_champion', 'av_strategist', 'av_veteran'];
      const labels = solo ? ['South', 'West', 'East'] : COMPASS_LABELS;

      this.state.seats = Array.from({ length: solo ? 3 : 4 }, (_, seat) => seat).map(seat => {
        const team = solo ? ['blue', 'red', 'yellow'][seat] : seat % 2 === 0 ? 'blue' : 'red';
        if (seat === mySeat) {
          return { seat, compass: labels[seat], team, role: 'human_self', name: `${name} (You)`, ready: false, avatar, status: 'Create or join a room' };
        }
        if (count === 2) {
          return { seat, compass: labels[seat], team, role: 'human_slot', name: 'Open Seat', ready: true, avatar: defaults[seat], status: '2nd human or AI Bot' };
        }
        return { seat, compass: labels[seat], team, role: 'human_slot', name: solo ? `Open Seat (${SH.teamDisplayName(team)})` : `Open Human Seat (Team ${team === 'blue' ? 'Red' : 'Blue'})`, ready: false, avatar: defaults[seat], status: 'Waiting for player' };
      });
    }

    selectTeam(team, localUsername, localAvatar) {
      const t = team === 'red' ? 'red' : 'blue';
      if (this.state.room) {
        this.roomAction('room:team', { team: t });
        return;
      }
      this.state.selectedTeam = t;
      this.syncSeatsForMode(this.state.humanCountMode, localUsername, localAvatar);
      this.state.lobbyAlert = {
        type: 'info',
        title: `Team ${t === 'blue' ? 'Red (South/North)' : 'Blue (West/East)'} Selected`,
        detail: 'Teammates always sit directly opposite each other. Create or join a room to claim your seat.'
      };
      this.emit();
    }

    /** Host of a 2-player room: 'team' (play together) or 'versus' (play against each other). */
    setPairing(pairing) {
      this.prefs.pairing = pairing === 'versus' ? 'versus' : 'team';
      savePrefs(this.prefs);
      if (this.state.isHost && this.state.room && this.state.room.status === 'lobby') this.roomSend('room:settings', { settings: this.localSettings() });
      this.emit();
    }

    toggleReady() {
      if (!this.state.room) {
        this.state.lobbyAlert = { type: 'warning', title: ERROR_TITLES.not_in_room, detail: 'Create a room or join one with a code before marking Ready.' };
        this.emit();
        return;
      }
      this.roomAction('room:ready', { ready: !this.state.isReady });
    }

    /** Create a room hosted on this phone; `name` is the optional game name (e.g. "Friday Night Spades"). */
    createRoom(name) {
      if (typeof name === 'string') this.state.roomNameDraft = name;
      this.p2pHost();
    }

    renameRoom(name) {
      return this.roomAction('room:name', { name: String(name || '').slice(0, 40) });
    }

    joinRoomByCode(rawCode) {
      const code = String(rawCode || '').trim().toUpperCase();
      this.state.joinCodeInput = code;
      const normalized = SH.p2p && SH.p2p.normalizeRoomCode(code);
      if (!normalized) {
        this.state.lobbyAlert = {
          type: 'error',
          title: ERROR_TITLES.invalid_code,
          detail: `Room code "${code || '(empty)'}" is not valid. Codes look like HDZ-7K2P.`,
          code: 'invalid_code'
        };
        this.emit();
        return;
      }
      if (this.state.roomCode === normalized) return;
      this.p2pJoin(normalized);
    }

    leaveRoom() {
      this.state.matchActive = false;
      this.state.activeMatch = null;
      const p = this.p2p;
      if (!p) return this.applyRoom(null);
      this.roomSend('room:leave');
      if (p.role === 'guest') {
        this.applyRoom(null);
        setTimeout(() => this.teardownP2P(p), 400);
      }
    }

    /** Leaving the table keeps your seat: a bot covers it until you resume. */
    setAway(away) {
      const am = this.state.activeMatch;
      if (!am || am.away === Boolean(away)) return;
      am.away = Boolean(away);
      this.roomSend('game:away', { away: Boolean(away) });
      this.emit();
    }

    startOnlineMatch() {
      this.roomAction('room:start', {});
    }

    respondToInvite(inviteId, accept) {
      const inv = this.state.invites.find(i => i.id === inviteId);
      this.state.invites = this.state.invites.filter(i => i.id !== inviteId);
      this.send('invite:respond', { inviteId, accept: Boolean(accept) });
      if (accept && inv) this.joinRoomByCode(inv.roomCode);
      this.emit();
    }

    // ------------------------------------------------------------ in-match API

    sendBid(bid) {
      return this.roomSend('game:bid', { bid });
    }

    playCard(cardId) {
      return this.roomSend('game:play', { cardId });
    }

    requestNextRound() {
      return this.roomSend('game:next_round');
    }

    requestResync() {
      return this.roomSend('game:resync');
    }

    sendTableReaction(payload) {
      const synced = this.state.room ? this.roomSend('chat:send', { kind: payload.kind, id: payload.id }) : false;
      return { ...payload, timestamp: Date.now(), multiplayerSynced: synced };
    }

    // ------------------------------------------------------------ peer-to-peer rooms

    myRoomId() {
      return this.prefs.clientId;
    }

    myProfile() {
      const p = SH.store ? SH.store.getProfile() : { username: 'Player', selectedAvatar: 'av_panther' };
      const account = this.isOnlineAccount() ? (this.prefs.username || null) : null;
      return { id: this.myRoomId(), name: p.username, avatar: publicAvatar(p.selectedAvatar), account };
    }

    p2pSupported() {
      return typeof root.Peer === 'function' && typeof root.RTCPeerConnection === 'function' && Boolean(SH.p2p);
    }

    /** Sends a room/game request to the room host (this device or the host's device). */
    roomSend(type, payload = {}) {
      const p = this.p2p;
      const msg = { t: type, ...payload };
      if (p && p.role === 'host' && p.host) {
        p.host.handle(this.myRoomId(), msg);
        return true;
      }
      if (p && p.role === 'guest' && p.conn && p.conn.open) {
        p.conn.send(msg);
        return true;
      }
      return false;
    }

    roomAction(type, payload, scope = 'lobby') {
      if (this.roomSend(type, payload)) return true;
      const reconnecting = this.p2p && this.p2p.role === 'guest';
      this.setAlert(scope, {
        type: 'error',
        title: reconnecting ? 'Reconnecting to Host…' : ERROR_TITLES.not_in_room,
        detail: reconnecting ? 'Lost the connection to the host’s phone — trying again.' : 'Create a room or join one with a code first.'
      });
      this.emit();
      return false;
    }

    p2pFail(title, detail, code) {
      this.state.p2pStatus = 'idle';
      this.setAlert('lobby', { type: 'error', title, detail, code });
      this.emit();
    }

    p2pErrorText(err) {
      const type = err && err.type;
      if (type === 'browser-incompatible') return 'This browser does not support peer-to-peer play. Use Chrome on Android, or Chrome/Edge/Safari on a computer.';
      if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        return 'Could not reach the free matchmaking service. Check your internet connection (Wi-Fi or mobile data) and try again.';
      }
      return `Connection problem (${type || 'unknown'}). Please try again.`;
    }

    teardownP2P(p) {
      if (!p) return;
      p.closing = true;
      if (p.role === 'guest') this.rememberRoom(null);
      if (p.role === 'host') this.saveHostedRoom(null);
      if (this.p2p === p) {
        this.p2p = null;
        this.state.p2pStatus = 'idle';
      }
      // Short delay so last messages (e.g. "room closed") reach the other phones first
      setTimeout(() => {
        try { if (p.conn) p.conn.close(); } catch (e) { /* ignore */ }
        if (p.guests) p.guests.forEach(c => { try { c.close(); } catch (e) { /* ignore */ } });
        try { p.peer.destroy(); } catch (e) { /* ignore */ }
      }, 500);
    }

    /** Leave whatever room we're in before creating / joining another. */
    abandonCurrentRoom() {
      if (!this.p2p) return;
      const p = this.p2p;
      if (p.role === 'host' && p.host) p.host.close('The host started a new room.');
      else this.roomSend('room:leave');
      this.teardownP2P(p);
      this.applyRoom(null);
    }

    /** Host: keep a copy of the room so reopening the app carries the game on. */
    saveHostedRoom(room) {
      clearTimeout(this.hostSaveTimer);
      if (!room) {
        delete this.prefs.hostedRoom;
        savePrefs(this.prefs);
        return;
      }
      this.hostSaveTimer = setTimeout(() => {
        if (!this.p2p || this.p2p.host !== room) return;
        this.prefs.hostedRoom = room.toJSON();
        savePrefs(this.prefs);
      }, 300);
    }

    /** Host reopened the app: re-open the same room code and restore the game. */
    p2pRestoreHost(data, tries = 0) {
      if (!this.p2pSupported()) return;
      const peer = new root.Peer(SH.p2p.peerIdForCode(data.code), { debug: 0 });
      const p = { role: 'host', peer, code: data.code, guests: new Map(), host: null, closing: false };
      this.p2p = p;
      this.state.p2pStatus = 'connecting';
      this.emit();
      peer.on('open', () => {
        if (this.p2p !== p) return peer.destroy();
        data.hostId = this.myRoomId();
        p.host = SH.p2p.RoomHost.restore(data, {
          deliver: (id, msg) => this.p2pDeliver(p, id, msg),
          onEmpty: () => this.teardownP2P(p),
          onChange: (room) => this.saveHostedRoom(room)
        });
        this.state.p2pStatus = 'hosting';
        p.host.broadcastRoom();
        if (p.host.match) p.host.match.resume();
        this.fire('notice', { tone: 'success', message: `Room ${data.code} reopened — your friends will reconnect automatically.` });
      });
      peer.on('connection', (conn) => this.p2pAcceptGuest(p, conn));
      peer.on('disconnected', () => {
        if (this.p2p === p && !p.closing) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500);
      });
      peer.on('error', (err) => {
        if (this.p2p !== p || p.closing || p.host) return;
        p.closing = true;
        try { peer.destroy(); } catch (e) { /* ignore */ }
        this.p2p = null;
        // The old connection may still be registered for a few seconds after a restart
        if ((err.type === 'unavailable-id' || err.type === 'network' || err.type === 'server-error') && tries < 12) {
          setTimeout(() => { if (!this.p2p) this.p2pRestoreHost(data, tries + 1); }, 2500);
        } else {
          this.saveHostedRoom(null);
          this.state.p2pStatus = 'idle';
          this.emit();
        }
      });
    }

    /** Host: this device becomes the game server for a new room. */
    p2pHost() {
      if (!this.p2pSupported()) {
        return this.p2pFail('Not Supported', this.p2pErrorText({ type: 'browser-incompatible' }));
      }
      this.abandonCurrentRoom();
      this.state.p2pStatus = 'connecting';
      this.state.lobbyAlert = { type: 'info', title: 'Creating your room…', detail: 'Getting a room code from the free matchmaking service.' };
      this.emit();

      const attempt = (tries) => {
        const code = SH.p2p.randomRoomCode();
        const peer = new root.Peer(SH.p2p.peerIdForCode(code), { debug: 0 });
        const p = { role: 'host', peer, code, guests: new Map(), host: null, closing: false };
        this.p2p = p;

        peer.on('open', () => {
          if (this.p2p !== p) return peer.destroy();
          p.host = new SH.p2p.RoomHost({
            code,
            name: this.state.roomNameDraft || '',
            mode: this.state.humanCountMode,
            settings: this.localSettings(),
            host: { ...this.myProfile(), team: this.state.selectedTeam },
            deliver: (id, msg) => this.p2pDeliver(p, id, msg),
            onEmpty: () => this.teardownP2P(p),
            onChange: (room) => this.saveHostedRoom(room)
          });
          this.state.p2pStatus = 'hosting';
          p.host.broadcastRoom();
          if (this.pendingInviteId) {
            const friendId = this.pendingInviteId;
            this.pendingInviteId = null;
            setTimeout(() => this.sendAction('invite:send', { userId: friendId, p2pCode: code }, 'both'), 50);
          }
        });
        peer.on('connection', (conn) => this.p2pAcceptGuest(p, conn));
        peer.on('disconnected', () => {
          // Lost the matchmaking link only: running games keep going; re-register so new players can still join
          if (this.p2p === p && !p.closing) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500);
        });
        peer.on('error', (err) => {
          if (this.p2p !== p || p.closing) return;
          if (!p.host) {
            if (err.type === 'unavailable-id' && tries < 4) {
              p.closing = true;
              try { peer.destroy(); } catch (e) { /* ignore */ }
              attempt(tries + 1);
              return;
            }
            this.teardownP2P(p);
            this.p2pFail('Could Not Create Room', this.p2pErrorText(err));
          }
        });
      };
      attempt(0);
    }

    p2pDeliver(p, id, msg) {
      if (id === this.myRoomId()) {
        setTimeout(() => { if (this.p2p === p || msg.t === 'room:state') this.handleMessage(msg, 'p2p'); }, 0);
        return;
      }
      const conn = p.guests.get(id);
      if (conn && conn.open) {
        try { conn.send(msg); } catch (e) { /* dropped connection: handled by close */ }
      }
    }

    p2pAcceptGuest(p, conn) {
      let memberId = null;
      let windowStart = Date.now();
      let count = 0;
      conn.on('data', (msg) => {
        if (!p.host || !msg || typeof msg.t !== 'string') return;
        const now = Date.now();
        if (now - windowStart > 5000) { windowStart = now; count = 0; }
        if (++count > 120) return; // flood protection
        if (msg.t === 'p2p:hello') {
          const id = String(msg.id || '');
          if (!/^[a-z0-9]{16,40}$/.test(id) || id === this.myRoomId()) {
            conn.send({ t: 'error', code: 'bad_request', message: 'Invalid player.', scope: 'lobby' });
            return;
          }
          const old = p.guests.get(id);
          if (old && old !== conn) { try { old.close(); } catch (e) { /* ignore */ } }
          memberId = id;
          p.guests.set(id, conn);
          const err = p.host.join({ id, name: msg.name, avatar: msg.avatar, account: msg.account, team: msg.team });
          if (err) {
            const message = err === 'full_room'
              ? `Room ${p.code} is already full (${p.host.members.size}/${p.host.mode} players).`
              : `Room ${p.code} is already playing a match. Wait for it to finish and try again.`;
            conn.send({ t: 'error', code: err, message, scope: 'lobby' });
            p.guests.delete(id);
            memberId = null;
            setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 400);
          }
          return;
        }
        if (memberId) p.host.handle(memberId, msg);
      });
      conn.on('close', () => {
        if (memberId && p.guests.get(memberId) === conn) {
          p.guests.delete(memberId);
          if (p.host) p.host.disconnect(memberId);
        }
      });
      conn.on('error', () => { /* close follows */ });
    }

    /** Guest: find the host's phone by room code and connect straight to it. */
    p2pJoin(code) {
      if (!this.p2pSupported()) {
        return this.p2pFail('Not Supported', this.p2pErrorText({ type: 'browser-incompatible' }));
      }
      this.abandonCurrentRoom();
      this.state.p2pStatus = 'connecting';
      this.state.lobbyAlert = { type: 'info', title: `Connecting to room ${code}…`, detail: 'Finding the host’s phone.' };
      this.emit();

      const peer = new root.Peer({ debug: 0 });
      const p = { role: 'guest', peer, code, conn: null, joined: false, closing: false, retries: 0 };
      this.p2p = p;
      p.timeout = setTimeout(() => {
        if (this.p2p === p && !p.joined) {
          this.teardownP2P(p);
          this.p2pFail('Could Not Reach Room', `Room ${code} didn’t answer. Check the code, and make sure the host still has the game open.`, 'invalid_code');
        }
      }, 20000);

      peer.on('open', () => this.p2pConnectToHost(p));
      peer.on('disconnected', () => {
        if (this.p2p === p && !p.closing) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* ignore */ } }, 1500);
      });
      peer.on('error', (err) => {
        if (this.p2p !== p || p.closing) return;
        if (err.type === 'peer-unavailable') {
          if (p.joined) return this.p2pHostGone(p);
          clearTimeout(p.timeout);
          this.teardownP2P(p);
          this.p2pFail(ERROR_TITLES.invalid_code, `No room found with code ${code}. Check the code — the host must have the game open.`, 'invalid_code');
        } else if (!p.joined) {
          clearTimeout(p.timeout);
          this.teardownP2P(p);
          this.p2pFail('Could Not Connect', this.p2pErrorText(err));
        }
      });
    }

    p2pConnectToHost(p) {
      const conn = p.peer.connect(SH.p2p.peerIdForCode(p.code), { reliable: true, serialization: 'json' });
      p.conn = conn;
      conn.on('open', () => {
        if (this.p2p !== p) return;
        conn.send({ t: 'p2p:hello', ...this.myProfile(), team: this.state.selectedTeam });
      });
      conn.on('data', (msg) => {
        if (this.p2p !== p || !msg || typeof msg.t !== 'string') return;
        if (msg.t === 'room:state' && msg.room) {
          if (!p.joined || p.retries) {
            p.joined = true;
            this.rememberRoom(p.code);
            clearTimeout(p.timeout);
            if (p.retries) this.fire('notice', { tone: 'success', message: 'Reconnected to the host ✅' });
            p.retries = 0;
          }
          this.state.p2pStatus = 'joined';
        }
        if (msg.t === 'error' && !p.joined) {
          clearTimeout(p.timeout);
          this.teardownP2P(p);
        }
        this.handleMessage(msg, 'p2p');
      });
      conn.on('close', () => {
        if (this.p2p !== p || p.closing || p.conn !== conn) return;
        if (p.joined) this.p2pReconnect(p);
      });
      conn.on('error', () => { /* close follows */ });
    }

    /** Host's phone dropped: retry for ~1 minute (bots cover your seat meanwhile). */
    p2pReconnect(p) {
      p.retries += 1;
      if (p.retries === 1) this.fire('notice', { tone: 'error', message: 'Lost connection to the host — reconnecting…' });
      if (p.retries > 8) return this.p2pHostGone(p);
      setTimeout(() => {
        if (this.p2p !== p || p.closing) return;
        if (p.peer.disconnected) { try { p.peer.reconnect(); } catch (e) { /* ignore */ } }
        this.p2pConnectToHost(p);
      }, Math.min(8000, 1500 * p.retries));
    }

    p2pHostGone(p) {
      this.teardownP2P(p);
      this.applyRoom(null);
      this.fire('notice', { tone: 'error', message: 'The host’s phone disconnected — the room has closed.' });
    }

    /** Lets friends see you as "in a match" (friends server only). */
    syncPresence() {
      const am = this.state.activeMatch;
      this.send('presence:set', {
        roomCode: this.state.roomCode || null,
        inMatch: Boolean(am),
        roundNumber: am ? am.roundNumber : null
      });
    }

    /**
     * 🎁 Gift Coins / Diamonds to a player in your room (via: 'room', to = their player id)
     * or to a friend (via: 'friend', to = their account id). The amount is taken now and
     * refunded if the gift can't be delivered.
     */
    /**
     * 🎁 Send Coins / Diamonds / an owned item.
     * - By username (Gift screen & Shop): the server checks your saved balance & items and takes them —
     *   nothing is taken on this device first; your balance updates when the server confirms.
     * - To someone in your room (P2P): taken here first and refunded if it can't be delivered.
     */
    sendGift({ via, to, lions = 0, diamonds = 0, item = null }) {
      lions = Math.max(0, Math.floor(Number(lions) || 0));
      diamonds = Math.max(0, Math.floor(Number(diamonds) || 0));
      if (lions + diamonds === 0 && !item) return { ok: false, message: 'Choose Coins, Diamonds or an item to send.' };
      const p = SH.store.getProfile();
      const buf = new Uint8Array(8);
      root.crypto.getRandomValues(buf);
      const giftId = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
      const serverChecked = via === 'username' || via === 'friend' || Boolean(item);
      if (serverChecked) {
        if (!p.unlimited && (p.coins < lions || p.diamonds < diamonds)) return { ok: false, funds: true, message: 'You don’t have that many Coins / Diamonds.' };
        if (item && !SH.store.owns(item.kind, item.id)) return { ok: false, message: 'You can only gift items you own.' };
        if (!this.isOnlineReady()) return { ok: false, message: 'Gifting needs a connection to the Spades Arena server.' };
        this.pendingGifts = this.pendingGifts || new Map();
        const timer = setTimeout(() => this.refundGift(giftId, 'The gift couldn’t be confirmed — nothing was taken. Try again.'), 20000);
        this.pendingGifts.set(giftId, { lions, diamonds, item, timer, noDebit: true });
        const target = via === 'friend' ? { userId: to } : { username: to };
        const sendNow = () => this.send('gift:send', { ...target, lions, diamonds, item, giftId });
        // Make sure the server has this device's latest balance & items before it checks them
        if (SH.store.getProfile().syncDirty) {
          this.uploadProfileNow();
          const started = Date.now();
          const wait = () => {
            if (!SH.store.getProfile().syncDirty || Date.now() - started > 6000) sendNow();
            else setTimeout(wait, 200);
          };
          setTimeout(wait, 200);
        } else {
          sendNow();
        }
        return { ok: true };
      }
      if (!SH.store.debitForGift({ lions, diamonds })) return { ok: false, funds: true, message: 'You don’t have that many Coins / Diamonds.' };
      const sent = this.roomSend('gift:send', { toId: to, lions, diamonds, giftId });
      if (!sent) {
        SH.store.credit({ lions, diamonds });
        return { ok: false, message: 'Not connected — your gift wasn’t sent.' };
      }
      this.pendingGifts = this.pendingGifts || new Map();
      const timer = setTimeout(() => this.refundGift(giftId, 'The gift couldn’t be delivered — returned to you.'), 15000);
      this.pendingGifts.set(giftId, { lions, diamonds, timer });
      return { ok: true };
    }

    /** Your sent & received gifts (from the server). Resolves { ok, log }. */
    getGiftHistory() {
      if (!this.isOnlineReady()) return Promise.resolve({ ok: false, log: [] });
      if (this.pendingGiftHistory) { clearTimeout(this.pendingGiftHistory.timer); this.pendingGiftHistory.resolve({ ok: false, log: [] }); }
      return new Promise((resolve) => {
        const timer = setTimeout(() => { this.pendingGiftHistory = null; resolve({ ok: false, log: [] }); }, 8000);
        this.pendingGiftHistory = { resolve, timer };
        this.send('gift:history');
      });
    }

    giftLabel({ lions = 0, diamonds = 0, item = null }) {
      const parts = [];
      if (lions) parts.push(`🦁 ${Number(lions).toLocaleString('en-US')} Coins`);
      if (diamonds) parts.push(`💎 ${Number(diamonds).toLocaleString('en-US')} Diamond${diamonds > 1 ? 's' : ''}`);
      if (item) {
        const d = SH.store && SH.store.itemDef(item.kind, item.id);
        parts.push(`${{ table: 'the table', card: 'the card design', avatar: 'the avatar' }[item.kind] || ''} “${d ? d.name : item.id}”`);
      }
      return parts.join(' + ');
    }

    /**
     * Logging in on any device (or another device changed something): bring this device in line with the account.
     * The server keeps the master copy with a version number; each device sends only on top of the version it has.
     */
    reconcileProfile(server) {
      if (!SH.store || !this.state.me) return;
      const id = this.state.me.id;
      const p = SH.store.getProfile();
      const sv = server && server.data ? server : null;
      if (p.syncedAccount !== id) {
        if (!sv) {
          if (p.syncedAccount) SH.store.resetProfileForNewAccount(); // another account's progress stays theirs
        } else if (p.syncedAccount) {
          SH.store.applySyncProfile(sv.data, sv.updatedAt); // device belonged to another account
        } else {
          SH.store.mergeSyncProfile(sv.data, sv.updatedAt); // first sync of this device: keep purchases from both
        }
        const prof = SH.store.getProfile();
        prof.syncedAccount = id;
        if (!sv) { prof.syncedAt = 0; prof.syncDirty = true; }
        SH.store.saveRemote();
      } else if (sv && sv.updatedAt !== p.syncedAt) {
        if (p.syncDirty) SH.store.rebaseSyncProfile(sv.data, sv.updatedAt);
        else SH.store.applySyncProfile(sv.data, sv.updatedAt);
      } else if (!sv) {
        p.syncedAt = 0;
        p.syncDirty = true;
      }
      if (SH.store.getProfile().syncDirty) this.uploadProfileNow();
    }

    scheduleProfileUpload() {
      if (!SH.store || SH.store.applyingRemote || !SH.store.getProfile().syncDirty) return;
      clearTimeout(this.profileUploadTimer);
      this.profileUploadTimer = setTimeout(() => this.uploadProfileNow(), 1200);
    }

    uploadProfileNow() {
      if (!SH.store || !this.isOnlineReady() || !this.state.me) return;
      clearTimeout(this.profileUploadTimer);
      const p = SH.store.getProfile();
      if (p.syncedAccount !== this.state.me.id || !p.syncDirty) return;
      this.profileSentSeq = p.changeSeq || 0;
      this.profileSentBalance = SH.store.realBalance();
      this.send('profile:sync', { profile: SH.store.exportSyncProfile(), base: p.syncedAt || 0 });
    }

    /** Sends your games / wins / best streak to the leaderboard (online accounts only). */
    reportStats() {
      if (!this.isOnlineReady() || !SH.store) return;
      const p = SH.store.getProfile();
      this.send('stats:report', { gamesPlayed: p.stats.gamesPlayed, gamesWon: p.stats.gamesWon, bestStreak: p.bestStreak || 0 });
    }

    /** Resolves { ok, top, friends, myRank, total } or { ok: false, message }. */
    getLeaderboard() {
      if (!this.isOnlineReady()) {
        return Promise.resolve({ ok: false, message: this.isOnlineAccount() ? 'Connecting to the server — try again in a moment.' : 'The leaderboard needs an online account.' });
      }
      if (this.pendingLeaderboard) { clearTimeout(this.pendingLeaderboard.timer); this.pendingLeaderboard.resolve({ ok: false, message: 'Cancelled.' }); }
      this.reportStats();
      return new Promise((resolve) => {
        const timer = setTimeout(() => { this.pendingLeaderboard = null; resolve({ ok: false, message: 'The server didn’t answer — try again.' }); }, 10000);
        this.pendingLeaderboard = { resolve, timer };
        this.send('leaderboard:get');
      });
    }

    /** Checks that a username is a real Spades Arena player. Resolves { ok, found, self, user } or { ok: false, message }. */
    lookupUser(username) {
      const query = String(username || '').trim().slice(0, 24);
      if (query.length < 2) return Promise.resolve({ ok: false, message: 'Type the player’s username (at least 2 letters).' });
      if (!this.isOnlineReady()) {
        return Promise.resolve({ ok: false, message: this.isOnlineAccount() ? 'Can’t reach the Spades Arena server — try again in a moment.' : 'Gifts by username need an online account — log in while connected to the server.' });
      }
      this.pendingLookups = this.pendingLookups || new Map();
      const key = query.toLowerCase();
      const old = this.pendingLookups.get(key);
      if (old) { clearTimeout(old.timer); old.resolve({ ok: false, message: 'Cancelled.' }); }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          this.pendingLookups.delete(key);
          resolve({ ok: false, message: 'The server didn’t answer — try again.' });
        }, 8000);
        this.pendingLookups.set(key, { resolve, timer });
        this.send('user:lookup', { username: query });
      });
    }

    refundGift(giftId, message) {
      const pending = this.pendingGifts && this.pendingGifts.get(giftId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pendingGifts.delete(giftId);
      if (!pending.noDebit) SH.store.credit({ lions: pending.lions, diamonds: pending.diamonds }); // server-checked gifts took nothing here
      this.fire('notice', { tone: 'error', message: message || 'Gift returned to you.' });
      this.fire('gift_failed', { giftId });
    }

    /** Typed chat message to everyone or just your team ('all' | 'team'). */
    sendChatText(text, to = 'all') {
      const clean = String(text || '').trim().slice(0, 80);
      if (!clean) return false;
      return this.roomSend('chat:text', { text: clean, to: to === 'team' ? 'team' : 'all' });
    }

    // ------------------------------------------------------------ friends API

    searchUsername(query) {
      const q = String(query || '').trim();
      this.state.searchQuery = q;
      this.state.searchResults = [];

      if (q.length < 2) {
        this.state.searchState = 'idle';
        this.state.friendsAlert = {
          type: 'error',
          title: 'Enter a Username to Search',
          detail: 'Type at least 2 characters to search the player directory.'
        };
        this.emit();
        return;
      }
      this.state.searchState = 'searching';
      if (this.sendAction('user:search', { query: q }, 'friends')) this.emit();
    }

    sendFriendRequest(userId) {
      this.sendAction('friend:request', { userId }, 'friends');
      this.state.searchResults = this.state.searchResults.map(r => (r.id === userId && r.relation === 'none' ? { ...r, relation: 'outgoing' } : r));
      this.emit();
    }

    /** Friend request by online username, e.g. tapping a player at the table. */
    sendFriendRequestByName(username) {
      const name = String(username || '').trim();
      if (!name) return false;
      return this.sendAction('friend:request', { username: name }, 'friends');
    }

    /** 'self' | 'friend' | 'outgoing' | 'incoming' | 'none' for an online username. */
    friendRelation(username) {
      const key = String(username || '').toLowerCase();
      if (!key) return 'none';
      const me = this.state.me;
      if (me && me.username && me.username.toLowerCase() === key) return 'self';
      const has = (list) => (list || []).some(u => String(u.username || '').toLowerCase() === key);
      if (has(this.state.friendsList)) return 'friend';
      if (has(this.state.outgoingRequests)) return 'outgoing';
      if (has(this.state.incomingRequests)) return 'incoming';
      return 'none';
    }

    respondFriendRequest(userId, accept) {
      this.sendAction('friend:respond', { userId, accept: Boolean(accept) }, 'friends');
    }

    removeFriend(userId) {
      this.sendAction('friend:remove', { userId }, 'friends');
    }

    inviteFriendToLobby(friendId) {
      const friend = this.state.friendsList.find(f => f.id === friendId);
      if (!friend) return;

      if (friend.presence !== 'online') {
        const reason = friend.presence === 'in_match'
          ? `${friend.username} is currently busy in another match and cannot join right now.`
          : `${friend.username} is currently offline.`;
        this.setAlert('both', { type: 'error', title: `${ERROR_TITLES.unavailable_friend}: ${friend.username}`, detail: reason, code: 'unavailable_friend' });
        this.emit();
        return;
      }

      if (!this.state.roomCode) {
        // Create a room on this phone first; the invite goes out once it's live
        this.pendingInviteId = friendId;
        this.createRoom();
        return;
      }
      this.sendAction('invite:send', { userId: friendId, p2pCode: this.state.roomCode }, 'both');
    }

    /** Developer helper retained for UI testing of the required error banners. */
    triggerLobbyEdgeStatePreview(stateType) {
      const samples = {
        invalid_code: 'No active lobby matches code "HDZ-0000". Please check the code with your host and try again.',
        full_room: 'Room "HDZ-FULL" has reached maximum capacity (4/4 seats filled).',
        unavailable_friend: 'Cannot invite this friend because they are currently in an active match or offline.',
        taken_username: 'This username is already registered by another online account. Please pick a unique handle.'
      };
      if (!samples[stateType]) return;
      this.state.lobbyAlert = { type: 'error', title: ERROR_TITLES[stateType], detail: samples[stateType], code: stateType };
      this.emit();
    }
  }

  SH.QUICK_CHAT_PRESETS = QUICK_CHAT_PRESETS;
  SH.EMOJI_REACTIONS = EMOJI_REACTIONS;
  SH.networkAdapter = new NetworkAdapter();
})(typeof globalThis !== 'undefined' ? globalThis : window);
