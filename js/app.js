/**
 * Spades by Hadzz - Main Application & Interactive Offline Spades Controller
 * Coordinates screens, offline 4-seat Spades gameplay, quick chat/emojis,
 * profile/avatar shop, settings, and multiplayer/friends screens.
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  const OFFLINE_GAME_KEY = 'spades_royale_offline_game_v2';
  const REDEAL_COST = 350; // 🦁 to redeal only your own hand (offline, before you bid)
  const LOADING_SCREEN_MS = 5000; // opening screen
  // Release builds get their version stamped in by bundle.py (SPADES_APP_VERSION); 'dev' = local copy
  const APP_VERSION = 'dev';
  const UPDATE_SITE = 'https://spades-royale.github.io';
  const GAME_INTRO_MS = 5000; // cat-in-a-hat intro when a game starts
  const SCREEN_SESSION_KEY = 'spades_royale_screen'; // where you were, for page reloads

  // Shown by the cat in the hat while each new game is shuffled & dealt (one at random)
  const INTRO_FACTS = [
    'Spades Royale is the first ever game made by Hadzz — and one of the best Spades games out there! ♠',
    'This is the first Spades game made with 3 players! 🔵🔴🟡',
    'Spades is known as one of the 10 hardest card games. 🧠',
    'Spades is known for intelligent minds — so if you’re playing, you’re very intelligent! 😎',
    'The strongest card is the Ace — in Urdu it’s called “Ikka” (یکّا), known for 1. ♠️',
    'Play this game every day and your brain’s IQ will grow by +10 every week! 📈',
    'Spades was invented in the USA in the late 1930s and spread around the world with soldiers during World War II. 🌍',
    'The Ace of Spades is the fanciest card in the deck because England once printed its playing-card tax stamp on it. 🎩',
    'Bidding zero is called “Nil” — win no tricks at all and your team scores a bonus 100 points! 🎯'
  ];

  const CAT_IN_HAT_SVG = `
    <svg viewBox="0 0 200 210" width="168" height="176" aria-hidden="true">
      <ellipse cx="100" cy="196" rx="58" ry="9" fill="rgba(0,0,0,0.35)"/>
      <path d="M58 200 C58 168 74 156 100 156 C126 156 142 168 142 200 Z" fill="#e8913f"/>
      <ellipse cx="78" cy="198" rx="13" ry="8" fill="#f6c28b"/>
      <ellipse cx="122" cy="198" rx="13" ry="8" fill="#f6c28b"/>
      <polygon points="50,104 60,52 94,86" fill="#f4a259"/>
      <polygon points="150,104 140,52 106,86" fill="#f4a259"/>
      <polygon points="58,96 63,66 84,86" fill="#f9b8c4"/>
      <polygon points="142,96 137,66 116,86" fill="#f9b8c4"/>
      <ellipse cx="100" cy="124" rx="60" ry="50" fill="#f4a259"/>
      <path d="M70 92 Q78 102 70 112 M130 92 Q122 102 130 112 M100 82 L100 98" stroke="#d9823a" stroke-width="5" stroke-linecap="round" fill="none"/>
      <ellipse cx="100" cy="146" rx="30" ry="20" fill="#fbe3c8"/>
      <ellipse cx="78" cy="122" rx="10" ry="12" fill="#fff"/>
      <ellipse cx="122" cy="122" rx="10" ry="12" fill="#fff"/>
      <ellipse class="cat-eye" cx="80" cy="124" rx="5.5" ry="8" fill="#1b4332"/>
      <ellipse class="cat-eye" cx="124" cy="124" rx="5.5" ry="8" fill="#1b4332"/>
      <circle cx="82" cy="120" r="2" fill="#fff"/>
      <circle cx="126" cy="120" r="2" fill="#fff"/>
      <path d="M94 138 L106 138 L100 145 Z" fill="#e5677b"/>
      <path d="M100 145 Q100 152 92 153 M100 145 Q100 152 108 153" stroke="#7a3b1e" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M90 151 Q100 162 110 151" fill="#c2414f"/>
      <ellipse cx="66" cy="140" rx="8" ry="5" fill="#f28c8c" opacity="0.55"/>
      <ellipse cx="134" cy="140" rx="8" ry="5" fill="#f28c8c" opacity="0.55"/>
      <path d="M58 138 L30 132 M58 145 L28 148 M142 138 L170 132 M142 145 L172 148" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
      <g class="cat-hat">
        <ellipse cx="100" cy="80" rx="56" ry="11" fill="#0d0d0d"/>
        <rect x="68" y="14" width="64" height="66" rx="7" fill="#161616"/>
        <rect x="68" y="56" width="64" height="13" fill="#d4af37"/>
        <path d="M100 52 C95 58 91 60 91 63.5 C91 66 93.5 67.4 96 66.6 L94.8 70 L105.2 70 L104 66.6 C106.5 67.4 109 66 109 63.5 C109 60 105 58 100 52 Z" fill="#0d0d0d"/>
        <rect x="74" y="18" width="8" height="34" rx="4" fill="rgba(255,255,255,0.12)"/>
      </g>
    </svg>`;
  const PASSPLAY_GAME_KEY = 'spades_royale_passplay_v2';

  // Escapes remote (other players') strings before they are placed into innerHTML.
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  class SpadesApp {
    constructor() {
      this.currentScreen = 'loading';
      this.toastTimer = null;
      this.illegalTimer = null;
      this.botTimer = null;
      this.seatBubbles = { 0: null, 1: null, 2: null, 3: null };
      this.chatDrawerOpen = false;
      this.game = null;
      this.onlineSnapshot = null;
      this.onlineLastSeq = null;
      this.onlineRewardLedger = {};
      this.onlineView = null;
      this.serverFormOpen = false;
      this.lastDealAnimKey = null;
      this.dismissedNotices = new Set();
      this.chatLog = []; // typed chat in online games: { name, text, to, mine }
      this.chatUnread = 0;
      this.chatTarget = 'all';
    }

    /** Network (server) match on screen. */
    isOnlineGame() {
      return Boolean(this.game && this.game.online && !this.game.local);
    }

    /** Pass & Play (several humans sharing this device) on screen. */
    isLocalGame() {
      return Boolean(this.game && this.game.local);
    }

    /** Table pace from Settings → Game Speed. */
    getPace() {
      return SH.getGameSpeed(SH.store.getSettings().gameSpeed);
    }

    init() {
      const settings = SH.store.getSettings();
      SH.audio.applySettings(settings);
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
      }

      SH.store.subscribe((state) => {
        SH.audio.applySettings(state.settings);
        if (typeof document !== 'undefined') {
          document.body.classList.toggle('reduced-motion', Boolean(state.settings.reducedMotion));
        }
        this.syncHeaderHud();
        if (this.currentScreen === 'profile') this.renderProfileScreen();
        if (this.currentScreen === 'shop') this.renderShopScreen();
        if (this.currentScreen === 'settings') this.renderSettingsScreen();
      });

      const net = SH.networkAdapter;
      net.onStateChange(() => {
        if (this.currentScreen === 'multiplayer') this.renderMultiplayerScreen();
        if (this.currentScreen === 'friends') this.renderFriendsScreen();
        if (this.currentScreen === 'login') this.renderLoginScreen();
        if (this.currentScreen === 'menu') this.renderMenuResume();
      });
      net.on('signed_in', ({ user, freshLogin }) => {
        if (freshLogin) this.showToast(`Welcome, ${user.username}! You're logged in.`, 'success');
        if (this.currentScreen === 'login') this.navigateTo(this.afterLoginScreen || 'menu');
        this.afterLoginScreen = null;
        setTimeout(() => this.maybeShowLoginStreak(), 700);
        if (this.currentScreen === 'profile') this.renderProfileScreen();
      });
      net.on('auth_required', () => {
        if (this.currentScreen === 'multiplayer' || this.currentScreen === 'friends') {
          this.afterLoginScreen = this.currentScreen;
          this.navigateTo('login');
        }
      });
      net.on('match', (snap) => this.applyOnlineSnapshot(snap));
      net.on('chat', (msg) => this.handleOnlineChat(msg));
      net.on('notice', (n) => this.showToast(n.message, n.tone));
      net.on('friend_request', (req) => this.showFriendRequestPopup(req));
      net.on('account_result', ({ ok, message }) => {
        if (!ok) SH.audio.notEnoughFunds();
        this.showToast(message, ok ? 'success' : 'error');
        if (this.currentScreen === 'profile') this.renderProfileScreen();
      });
      net.on('account_renamed', ({ username }) => {
        let paid = 0;
        if (this.pendingRename) {
          this.pendingRename = false;
          paid = SH.store.recordNameChange();
        }
        this.showToast(`Your name is now ${username}.${paid ? ` (−💎 ${paid})` : ''}`, 'success');
        if (this.currentScreen === 'profile') this.renderProfileScreen();
      });
      net.on('gift_received', () => SH.audio.coinReward());
      net.on('game_error', (err) => {
        if (this.currentScreen === 'game' && this.isOnlineGame()) {
          SH.audio.illegalMove();
          this.showIllegalBanner(err.message);
          net.requestResync();
        } else {
          this.showToast(err.message, 'error');
        }
      });
      net.on('room_left', () => {
        if (this.isOnlineGame() && this.game.phase !== 'game_over') {
          this.game = null;
          this.onlineSnapshot = null;
          this.onlineView = null;
          if (this.currentScreen === 'game') this.navigateTo('multiplayer');
        }
        if (!this.isOnlineGame()) {
          this.onlineView = null;
          this.onlineSnapshot = null;
        }
        if (this.currentScreen === 'menu') this.renderMenuResume();
      });
      net.init();

      // Bring back an unfinished offline game saved on this device
      this.game = this.loadOfflineGame();
      setInterval(() => this.tickTurnTimer(), 500);

      // Layout follows the real screen: phone layout on narrow screens, full layout on tablets & computers
      this.applyAutoLayout();
      window.addEventListener('resize', () => this.applyAutoLayout());
      this.bindGlobalNavigation();
      this.syncHeaderHud();

      // 💎 +1 Diamond the first time you open the game each day
      if (SH.store.claimDailyDiamond()) {
        setTimeout(() => {
          SH.audio.coinReward();
          this.showToast('💎 Daily bonus: +1 Diamond for playing today! Come back tomorrow for another.', 'success');
        }, 1600);
      }

      // Opening the app: 5-second Spades Royale screen (the "no ads" note can't be skipped).
      // Reloading the page in the same session goes straight back to where you were.
      let lastScreen = null;
      try { lastScreen = sessionStorage.getItem(SCREEN_SESSION_KEY); } catch (e) { /* ignore */ }
      const signedIn = SH.networkAdapter.isSignedIn();
      if (lastScreen && signedIn) {
        this.navigateTo(lastScreen);
      } else {
        setTimeout(() => {
          if (this.currentScreen === 'loading') this.navigateTo(SH.networkAdapter.isSignedIn() ? 'menu' : 'login');
        }, LOADING_SCREEN_MS);
      }
      setTimeout(() => this.checkForUpdate(), LOADING_SCREEN_MS + 1500);
      setTimeout(() => this.maybeShowLoginStreak(), LOADING_SCREEN_MS + 600);
    }

    /** Which installed app this is: 'android' | 'windows' | 'mac' | null (website — always up to date). */
    installedPlatform() {
      if (typeof navigator === 'undefined' || typeof location === 'undefined') return null;
      const ua = navigator.userAgent || '';
      if (location.hostname === 'appassets.androidplatform.net' || /; wv\)/.test(ua)) return 'android';
      if (/Electron\//.test(ua)) return /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : null;
      return null;
    }

    /** Installed apps check the website for a newer version and offer the right download. */
    checkForUpdate() {
      const platform = this.installedPlatform();
      if (!platform || APP_VERSION === 'dev' || typeof fetch !== 'function') return;
      const newer = (a, b) => {
        const pa = String(a).split('.').map(Number);
        const pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
        }
        return false;
      };
      fetch(`${UPDATE_SITE}/version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then((info) => {
          if (!info || !info.version || !newer(info.version, APP_VERSION) || !info.downloads || !info.downloads[platform]) return;
          if (this.currentScreen === 'game') return; // don't interrupt a game — ask next time
          this.showChoiceDialog({
            title: `✨ Update available — v${info.version}`,
            message: platform === 'android'
              ? `You have v${APP_VERSION}. Download the new version, then open it and tap Install — your account, Lions and Diamonds stay.`
              : `You have v${APP_VERSION}. Download and install the new version — your account, Lions and Diamonds stay.`,
            actions: [
              { label: 'Download update', tone: 'yes', onClick: () => { location.href = info.downloads[platform]; } },
              { label: 'Later', tone: 'no' }
            ]
          });
        })
        .catch(() => { /* offline — check again next time */ });
    }

    bindGlobalNavigation() {
      if (typeof document === 'undefined') return;
      document.addEventListener('click', (e) => {
        const el = e.target && typeof e.target.closest === 'function'
          ? e.target
          : (e.target && e.target.parentElement);
        if (!el || typeof el.closest !== 'function') return;

        if (el.closest('[data-leaderboard]')) {
          SH.audio.uiClick();
          this.showLeaderboard();
          return;
        }

        const seatEl = el.closest('.table-edge-seat[data-seat]');
        if (seatEl && this.game && this.game.online) {
          this.showSeatPlayerCard(Number(seatEl.getAttribute('data-seat')));
          return;
        }

        const navBtn = el.closest('[data-nav]');
        if (navBtn) {
          SH.audio.uiClick();
          const target = navBtn.getAttribute('data-nav');
          const forceFresh = navBtn.hasAttribute('data-fresh-match');
          if (navBtn.hasAttribute('data-offline-seats')) this.pendingOfflineSeats = Number(navBtn.getAttribute('data-offline-seats'));
          if (forceFresh && target === 'game' && this.offerResumeChoices()) return;
          if (target !== 'game' && this.isLeavingActiveGame()) {
            this.confirmLeaveTable(target);
            return;
          }
          this.navigateTo(target, forceFresh);
        }
      });
    }

    /** On the table with a game still going (not the final summary)? */
    isLeavingActiveGame() {
      return this.currentScreen === 'game' && Boolean(this.game) && this.game.phase !== 'game_over';
    }

    /** "Are you sure you want to leave the game?" — Yes (green) / No (red). */
    confirmLeaveTable(target = 'menu') {
      const g = this.game;
      if (!g || g.phase === 'game_over') {
        if (this.isOnlineGame()) return this.leaveOnlineMatch();
        return this.navigateTo(target);
      }
      const online = this.isOnlineGame();
      const message = online
        ? 'A bot will play your seat until you come back — tap ▶ Resume on Home to return.'
        : g.local
          ? 'Your Pass & Play game will be paused and saved — resume it any time from Home.'
          : 'Your game is saved — resume it any time from Home.';
      const actions = [
        {
          label: 'Yes, leave',
          tone: 'yes',
          onClick: () => {
            if (online) {
              this.navigateTo(target);
              this.showToast('You left the table — a bot covers your seat. Tap ▶ Resume to return.', 'info');
            } else {
              this.navigateTo(target);
              if (g.local) this.showToast('Pass & Play paused — tap ▶ Resume on Home to continue.', 'info');
            }
          }
        },
        { label: 'No, stay', tone: 'no' }
      ];
      if (online) actions.push({ label: '🏳 Quit this match for good', subtle: true, onClick: () => this.quitOnlineMatch(true) });
      this.showChoiceDialog({ title: 'Are you sure you want to leave the game?', message, actions });
    }

    /** The app fills the whole window; narrow screens (phones) get the phone layout. */
    applyAutoLayout() {
      if (typeof document === 'undefined') return;
      const mode = window.innerWidth < 760 ? 'phone' : 'full';
      if (document.body.getAttribute('data-device-frame') !== mode) document.body.setAttribute('data-device-frame', mode);
    }

    syncHeaderHud() {
      if (typeof document === 'undefined') return;
      const profile = SH.store.getProfile();
      const settings = SH.store.getSettings();
      document.querySelectorAll('[data-hud-coins]').forEach(el => { el.textContent = profile.unlimited ? '1B' : String(profile.coins); });
      document.querySelectorAll('[data-hud-diamonds]').forEach(el => { el.textContent = profile.unlimited ? '1B' : String(profile.diamonds || 0); });
      document.body.setAttribute('data-card-skin', profile.selectedCardSkin || 'classic');
      document.body.setAttribute('data-table-theme', profile.selectedTableTheme || 'emerald');
      document.querySelectorAll('[data-hud-username]').forEach(el => { el.textContent = profile.username; });
      document.querySelectorAll('[data-hud-avatar]').forEach(el => { el.innerHTML = SH.renderAvatarSVG(profile.selectedAvatar, 36); });
      document.querySelectorAll('[data-hud-difficulty]').forEach(el => { el.textContent = settings.botDifficulty; });
      document.querySelectorAll('[data-hud-target]').forEach(el => { el.textContent = `${settings.targetScore} pts`; });
    }

    showToast(message, tone = 'info') {
      if (typeof document === 'undefined') return;
      const toast = document.getElementById('app-toast');
      if (!toast) return;
      toast.className = `app-toast visible toast-${tone}`;
      toast.textContent = message;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.classList.remove('visible');
      }, 3600);
    }

    navigateTo(screen, forceFreshMatch = false) {
      // Logging in is required for everything
      if (screen !== 'loading' && screen !== 'login' && !SH.networkAdapter.isSignedIn()) {
        this.afterLoginScreen = screen === 'game' ? 'menu' : screen;
        screen = 'login';
      }
      if (screen === 'friends' && !SH.networkAdapter.isOnlineAccount()) {
        this.showToast('Friends need the online server — it isn’t reachable right now. Room codes still work!', 'info');
        screen = 'multiplayer';
      }
      if (!['loading', 'login'].includes(screen)) {
        try { sessionStorage.setItem(SCREEN_SESSION_KEY, screen); } catch (e) { /* ignore */ }
      }

      if (screen !== 'game' && this.botTimer) {
        clearTimeout(this.botTimer);
        this.botTimer = null;
      }

      this.currentScreen = screen;
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.screen-view').forEach(section => {
          section.classList.toggle('active', section.id === `screen-${screen}`);
        });

        const topBar = document.getElementById('app-topbar');
        if (topBar) {
          topBar.classList.toggle('hidden', screen === 'loading' || screen === 'login');
        }

        const bottomNav = document.getElementById('android-bottom-nav');
        if (bottomNav) {
          // No bottom bar on the table (full space for the game) or before you've logged in / chosen guest
          bottomNav.classList.toggle('hidden', screen === 'loading' || screen === 'login' || screen === 'game');
          bottomNav.querySelectorAll('.bnav-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-nav') === screen);
          });
        }
      }

      this.syncHeaderHud();

      if (screen === 'game') {
        if (forceFreshMatch) {
          // New offline game: online / Pass & Play matches stay saved (resume them from Home)
          if (this.game && this.game.online) this.game = null;
        } else if (!this.game && this.onlineView && SH.networkAdapter.state.activeMatch) {
          this.game = this.onlineView;
        }
      }

      if (screen === 'game' && this.isLocalGame()) {
        this.renderGameScreen();
        this.syncAwayState();
        return;
      }

      if (screen === 'game' && this.isOnlineGame()) {
        if (this.game.phase !== 'game_over') {
          this.renderGameScreen();
          this.syncAwayState();
          return;
        }
        // Finished online match: fall back to the offline table
        this.game = null;
        this.onlineSnapshot = null;
        this.onlineView = null;
      }

      if (screen === 'game') {
        if (!this.game) this.game = this.loadOfflineGame();
        const unstartedRound1 = this.game &&
          this.game.roundNumber === 1 &&
          this.game.phase === 'bidding' &&
          this.game.players[0].bid === null;
        if (!this.game || this.game.phase === 'game_over' || forceFreshMatch || unstartedRound1) {
          // A brand-new game costs 🦁 2 (an unplayed first deal being re-dealt doesn't pay again)
          const isNewGame = !this.game || this.game.phase === 'game_over' || forceFreshMatch;
          const carriedFee = !isNewGame && this.game && this.game.feePaid;
          if (isNewGame && !this.chargeEntryFee()) {
            this.game = this.loadOfflineGame();
            this.navigateTo('menu');
            return;
          }
          this.startNewMatch(forceFreshMatch ? (this.pendingOfflineSeats || 4) : (this.game && this.game.numSeats));
          this.game.feePaid = isNewGame || carriedFee;
          this.saveOfflineGame();
        } else {
          this.renderGameScreen();
          this.scheduleNextActionIfNeeded();
        }
      } else if (screen === 'multiplayer') {
        const p = SH.store.getProfile();
        SH.networkAdapter.syncSeatsForMode(SH.networkAdapter.state.humanCountMode, p.username, p.selectedAvatar);
        this.renderMultiplayerScreen();
      } else if (screen === 'friends') {
        this.renderFriendsScreen();
      } else if (screen === 'profile') {
        this.renderProfileScreen();
      } else if (screen === 'shop') {
        this.renderShopScreen();
      } else if (screen === 'settings') {
        this.renderSettingsScreen();
      } else if (screen === 'rules') {
        this.renderRulesScreen();
      } else if (screen === 'login') {
        this.renderLoginScreen();
      } else if (screen === 'menu') {
        this.renderMenuResume();
      } else if (screen === 'passplay') {
        this.renderPassPlaySetup();
      }
      this.syncAwayState();
    }

    /** Your online seat is "away" (bot covers it) whenever the online table isn't on screen. */
    syncAwayState() {
      // Pass & Play freezes whenever its table isn't on screen
      if (this.localMatch) this.localMatch.setPaused(Boolean(this.introActive) || !(this.currentScreen === 'game' && this.isLocalGame()));
      if (!SH.networkAdapter.state.activeMatch) return;
      SH.networkAdapter.setAway(!(this.currentScreen === 'game' && this.isOnlineGame()));
    }

    // ------------------------------------------------------------------
    // Pass & Play: 2 or 4 humans sharing one device (fully offline).
    // Runs the same authoritative match engine as the online server (js/match.js);
    // the table is shown from the seat of whoever must act, and their hand stays
    // hidden until they tap "Show my cards".
    // ------------------------------------------------------------------

    startPassPlay(setup) {
      if (!this.chargeEntryFee()) return;
      const profile = SH.store.getProfile();
      const settings = SH.store.getSettings();
      const mode = [2, 3, 4].includes(setup.mode) ? setup.mode : 2;
      const numSeats = mode === 3 ? 3 : 4;
      const humanSeats = mode === 4 ? [0, 1, 2, 3] : mode === 3 ? [0, 1, 2] : setup.arrangement === 'rivals' ? [0, 1] : [0, 2];
      const avatars = numSeats === 3 ? ['free_ace', 'free_blaze', 'free_frost'] : ['free_ace', 'free_blaze', 'free_velvet', 'free_frost'];
      const seats = Array.from({ length: numSeats }, (_, seat) => seat).map(seat => {
        const idx = humanSeats.indexOf(seat);
        if (idx < 0) return { userId: null, avatar: avatars[seat] };
        const fallback = idx === 0 ? profile.username : `Player ${idx + 1}`;
        const name = String((setup.names || [])[idx] || '').trim().slice(0, 14) || fallback;
        return { userId: `local_${seat}`, name, avatar: idx === 0 ? profile.selectedAvatar : avatars[seat] };
      });

      if (this.localMatch) this.localMatch.destroy();
      this.localCfg = { humanSeats, ownerSeat: humanSeats[0], setup };
      this.localFeePaid = true;
      this.localViewSeat = null;
      this.localRevealed = false;
      this.localLastSeq = null;
      this.localMatch = new SH.OnlineMatch({
        seats,
        targetScore: settings.targetScore,
        difficulty: settings.botDifficulty,
        speed: settings.gameSpeed,
        turnMs: null,
        onUpdate: () => this.onLocalUpdate(),
        onGameOver: () => this.saveLocalGame()
      });
      this.localMatch.manualPause = true;
      this.localMatch.start();
      this.game = this.computeLocalView();
      this.showGameIntro();
      this.navigateTo('game');
    }

    /** Works out who should be holding the device and builds their (rotated) view. */
    computeLocalView() {
      const m = this.localMatch;
      const humans = this.localCfg.humanSeats;
      const ev = m.lastEvent;
      const fresh = Boolean(ev) && ev.seq !== this.localLastSeq;
      this.localLastSeq = ev ? ev.seq : null;

      let viewer = this.localViewSeat;
      if (fresh && ev.type === 'round_dealt') {
        const n = m.numSeats || 4;
        const first = (m.dealerSeat + 1) % n;
        viewer = Array.from({ length: n }, (_, i) => (first + i) % n).find(seat => humans.includes(seat));
        this.localRevealed = false;
      }
      if (viewer === null || viewer === undefined) viewer = humans[0];
      const acting = (m.phase === 'bidding' || m.phase === 'playing') && humans.includes(m.turnSeat) ? m.turnSeat : null;
      if (acting !== null && acting !== viewer) {
        viewer = acting;
        this.localRevealed = false; // hand the device over
      }
      this.localViewSeat = viewer;

      const snap = m.snapshotFor(viewer);
      if (snap.roundSummary) this.processOnlineRewards(snap, this.localCfg.ownerSeat);
      const view = this.buildOnlineView(snap, { meLabel: m.players[viewer].name });
      view.local = true;
      view.viewSeat = viewer;
      view.viewerName = m.players[viewer].name;
      view.revealed = this.localRevealed;
      if (view.roundSummary) {
        const rs = view.roundSummary;
        rs.local = true;
        if (rs.solo && rs.matchFinished) {
          rs.customTitle = `🏆 ${rs.foeName} Wins the Game!`;
          rs.wonMatch = snap.roundSummary.matchWinnerTeam === this.localCfg.ownerSeat;
        } else if (rs.solo) {
          rs.customTitle = `Round ${rs.roundNumber} Summary`;
        } else if (rs.matchFinished) {
          const winTeam = snap.roundSummary.matchWinnerTeam;
          const names = m.players.filter(p => p.team === winTeam).map(p => p.name).join(' & ');
          rs.customTitle = `🏆 Team ${winTeam === 0 ? 'Blue' : 'Red'} Wins! (${names})`;
          rs.wonMatch = winTeam === this.localCfg.ownerSeat % 2;
        } else {
          rs.customTitle = `Round ${rs.roundNumber} Summary`;
        }
      }
      if (fresh && this.isLocalGame()) this.playOnlineEventFeedback(ev);
      return view;
    }

    onLocalUpdate() {
      if (!this.localMatch) return;
      this.saveLocalGame();
      if (!this.isLocalGame()) return;
      this.game = this.computeLocalView();
      if (this.currentScreen === 'game') this.renderGameScreen();
    }

    saveLocalGame() {
      try {
        if (!this.localMatch || this.localMatch.phase === 'game_over') {
          localStorage.removeItem(PASSPLAY_GAME_KEY);
          return;
        }
        localStorage.setItem(PASSPLAY_GAME_KEY, JSON.stringify({
          match: this.localMatch.serialize(),
          cfg: { humanSeats: this.localCfg.humanSeats, ownerSeat: this.localCfg.ownerSeat, setup: this.localCfg.setup },
          viewSeat: this.localViewSeat
        }));
      } catch (e) {
        // Storage unavailable: Pass & Play still works until the app closes
      }
    }

    loadSavedLocalGame() {
      try {
        const raw = localStorage.getItem(PASSPLAY_GAME_KEY);
        const data = raw ? JSON.parse(raw) : null;
        return data && data.match && Array.isArray(data.match.players) && data.match.phase !== 'game_over' ? data : null;
      } catch (e) {
        return null;
      }
    }

    /** Summary of an unfinished Pass & Play game (in memory or saved), for the Home card. */
    getResumableLocalGame() {
      const m = this.localMatch && this.localMatch.phase !== 'game_over' ? this.localMatch : null;
      const src = m ? m : (this.loadSavedLocalGame() || {}).match;
      if (!src) return null;
      const setup = m ? (this.localCfg && this.localCfg.setup) : ((this.loadSavedLocalGame() || {}).cfg || {}).setup;
      return {
        roundNumber: src.roundNumber,
        teamScores: src.teamScores,
        names: src.players.filter(p => !p.isBot).map(p => p.name),
        gameName: (setup && setup.gameName) || ''
      };
    }

    resumeLocalGame() {
      if (!this.localMatch || this.localMatch.phase === 'game_over') {
        const data = this.loadSavedLocalGame();
        if (!data) return this.navigateTo('passplay');
        if (this.localMatch) this.localMatch.destroy();
        this.localCfg = data.cfg;
        this.localViewSeat = data.viewSeat;
        this.localMatch = SH.OnlineMatch.restore(data.match, {
          onUpdate: () => this.onLocalUpdate(),
          onGameOver: () => this.saveLocalGame(),
          speed: SH.store.getSettings().gameSpeed
        });
        this.localMatch.manualPause = true;
        this.localLastSeq = this.localMatch.lastEvent ? this.localMatch.lastEvent.seq : null;
      }
      this.localRevealed = false; // whoever picks the device up must confirm who they are
      this.game = this.computeLocalView();
      this.navigateTo('game');
    }

    deleteLocalGame() {
      if (this.localMatch) this.localMatch.destroy();
      this.localMatch = null;
      this.localCfg = null;
      if (this.isLocalGame()) this.game = null;
      try { localStorage.removeItem(PASSPLAY_GAME_KEY); } catch (e) { /* ignore */ }
    }

    deleteOfflineGame() {
      if (this.game && !this.game.online) this.game = null;
      clearTimeout(this.botTimer);
      try { localStorage.removeItem(OFFLINE_GAME_KEY); } catch (e) { /* ignore */ }
    }

    confirmDelete(message) {
      return typeof window === 'undefined' || typeof window.confirm !== 'function' || window.confirm(message);
    }

    renderPassPlaySetup() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('passplay-mount');
      if (!mount) return;
      const profile = SH.store.getProfile();
      const settings = SH.store.getSettings();
      const cfg = this.passPlayDraft || (this.passPlayDraft = { mode: 2, arrangement: 'partners', names: [profile.username, 'Player 2', 'Player 3', 'Player 4'] });
      const humanSeats = cfg.mode === 4 ? [0, 1, 2, 3] : cfg.mode === 3 ? [0, 1, 2] : cfg.arrangement === 'rivals' ? [0, 1] : [0, 2];
      const seatLabel = cfg.mode === 3
        ? ['South · 🔵 Blue', 'West · 🔴 Red', 'East · 🟡 Yellow']
        : ['South · Team Blue', 'West · Team Red', 'North · Team Blue', 'East · Team Red'];
      const seatColorClass = (seat) => (cfg.mode === 3 ? SH.SOLO_COLORS[seat] : (seat % 2 === 0 ? 'blue' : 'red'));
      const saved = this.getResumableLocalGame();

      mount.innerHTML = `
        ${saved ? `
          <div class="resume-card resume-local">
            <div class="resume-info">
              <strong>👥 Unfinished Pass &amp; Play</strong>
              <span>${saved.names.map(esc).join(', ')} · Round ${saved.roundNumber} · Blue ${saved.teamScores[0]} – Red ${saved.teamScores[1]}</span>
            </div>
            <div class="resume-actions">
              <button type="button" class="btn-primary btn-sm" data-pp-resume>▶ Resume</button>
              <button type="button" class="btn-secondary btn-sm" data-pp-delete title="Delete this saved game">🗑</button>
            </div>
          </div>
        ` : ''}
        <div class="mp-card passplay-card">
          <h3>👥 Pass &amp; Play — No Internet Needed</h3>
          <p class="field-help">Share one phone or tablet. When it’s someone’s turn, pass them the device — their cards stay hidden until they tap <strong>Show my cards</strong>.</p>

          <h4>Players</h4>
          <div class="segmented-control" role="group" aria-label="Number of human players">
            <button type="button" class="seg-btn ${cfg.mode === 2 ? 'active' : ''}" data-pp-mode="2">2 Players (+2 Bots)</button>
            <button type="button" class="seg-btn ${cfg.mode === 3 ? 'active' : ''}" data-pp-mode="3">3 Players (Solo)</button>
            <button type="button" class="seg-btn ${cfg.mode === 4 ? 'active' : ''}" data-pp-mode="4">4 Players (Teams)</button>
          </div>

          ${cfg.mode === 2 ? `
            <h4>Teams</h4>
            <div class="segmented-control" role="group" aria-label="Team arrangement">
              <button type="button" class="seg-btn ${cfg.arrangement === 'partners' ? 'active' : ''}" data-pp-arr="partners">Partners vs 2 Bots</button>
              <button type="button" class="seg-btn ${cfg.arrangement === 'rivals' ? 'active' : ''}" data-pp-arr="rivals">Rivals (each + Bot partner)</button>
            </div>
          ` : cfg.mode === 3
            ? '<p class="field-help pp-note">Every player for themselves — 🔵 Blue vs 🔴 Red vs 🟡 Yellow. The 2♣ is removed so everyone gets 17 cards.</p>'
            : '<p class="field-help pp-note">Team Blue = South &amp; North · Team Red = West &amp; East (partners sit opposite).</p>'}

          <h4>Game name</h4>
          <input type="text" class="pp-game-name" id="pp-game-name" maxlength="24" autocomplete="off" placeholder="Name your game (optional) — e.g. Family Night" value="${esc(cfg.gameName || '')}" />

          <h4>Players</h4>
          <div class="pp-names">
            ${humanSeats.map((seat, i) => `
              <label class="pp-name-row seat-team-${seatColorClass(seat)}">
                <span>${seatLabel[seat]}</span>
                <input type="text" maxlength="14" id="pp-name-${i}" data-pp-name="${i}" value="${esc(cfg.names[i] || '')}" placeholder="Player ${i + 1}" />
              </label>
            `).join('')}
          </div>

          <p class="field-help pp-note">Target ${settings.targetScore} pts · Bots: ${esc(settings.botDifficulty)} · Speed: ${esc(this.getPace().label)} (change in Settings). 🦁 Lions go to ${esc(cfg.names[0] || profile.username)} (this device’s profile).</p>
          <button type="button" class="btn-primary pp-start-btn" id="pp-start-btn">♠ Start Pass &amp; Play</button>
        </div>
      `;

      const readNames = () => {
        mount.querySelectorAll('[data-pp-name]').forEach(input => {
          cfg.names[Number(input.getAttribute('data-pp-name'))] = input.value;
        });
        const gameNameInput = mount.querySelector('#pp-game-name');
        if (gameNameInput) cfg.gameName = gameNameInput.value;
      };
      mount.querySelectorAll('[data-pp-mode]').forEach(btn => btn.addEventListener('click', () => {
        SH.audio.uiClick();
        readNames();
        cfg.mode = Number(btn.getAttribute('data-pp-mode'));
        this.renderPassPlaySetup();
      }));
      mount.querySelectorAll('[data-pp-arr]').forEach(btn => btn.addEventListener('click', () => {
        SH.audio.uiClick();
        readNames();
        cfg.arrangement = btn.getAttribute('data-pp-arr');
        this.renderPassPlaySetup();
      }));
      mount.querySelectorAll('[data-pp-name]').forEach(input => input.addEventListener('input', readNames));
      const start = mount.querySelector('#pp-start-btn');
      if (start) start.addEventListener('click', () => {
        readNames();
        if (saved && !this.confirmDelete('Start a new Pass & Play game? Your unfinished one will be deleted.')) return;
        SH.audio.cardDeal();
        this.startPassPlay({ mode: cfg.mode, arrangement: cfg.arrangement, names: humanSeats.map((_, i) => cfg.names[i]), gameName: this.cleanGameName(cfg.gameName) });
      });
      const resume = mount.querySelector('[data-pp-resume]');
      if (resume) resume.addEventListener('click', () => { SH.audio.uiClick(); this.resumeLocalGame(); });
      const del = mount.querySelector('[data-pp-delete]');
      if (del) del.addEventListener('click', () => {
        if (!this.confirmDelete('Delete this saved Pass & Play game?')) return;
        SH.audio.uiClick();
        this.deleteLocalGame();
        this.renderPassPlaySetup();
        this.showToast('Saved Pass & Play game deleted.', 'info');
      });
    }

    // ------------------------------------------------------------------
    // Game-start intro: the cat in the hat shares a fact while cards are dealt
    // ------------------------------------------------------------------

    showGameIntro(durationMs = GAME_INTRO_MS) {
      if (typeof document === 'undefined') return;
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll('.game-intro').forEach(el => el.remove());

      let idx = Math.floor(Math.random() * INTRO_FACTS.length);
      if (idx === this.lastIntroFact) idx = (idx + 1) % INTRO_FACTS.length; // never the same fact twice in a row
      this.lastIntroFact = idx;
      this.introActive = true;

      const overlay = document.createElement('div');
      overlay.className = 'game-intro';
      overlay.style.setProperty('--intro-ms', `${durationMs}ms`);
      overlay.innerHTML = `
        <div class="royale-logo intro-logo" role="img" aria-label="Spades Royale"></div>
        <div class="intro-cat">${CAT_IN_HAT_SVG}</div>
        <div class="intro-speech" role="status" aria-live="polite"><p>${esc(INTRO_FACTS[idx])}</p></div>
        <div class="intro-progress" aria-hidden="true"><div></div></div>
        <div class="intro-hint">Shuffling &amp; dealing…</div>
        <div class="signature-block intro-signature">
          <span class="hadzz-signature" role="img" aria-label="Hadzz signature"></span>
          <span class="signature-caption">Made by Hadzz</span>
        </div>
      `;
      host.appendChild(overlay);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        overlay.classList.add('leaving');
        setTimeout(() => overlay.remove(), 260);
        this.introActive = false;
        this.syncAwayState();
        this.scheduleNextActionIfNeeded();
      };
      const timer = setTimeout(finish, durationMs);
      setTimeout(() => overlay.addEventListener('click', finish), 3000); // can't skip the first 3 seconds
    }

    /** 🚪 Leave on an online table: Yes (step away, resume later) / No — or quit for good. */
    offerLeaveChoices() {
      if (this.game && this.game.phase === 'game_over') return this.leaveOnlineMatch();
      this.confirmLeaveTable('menu');
    }

    // ------------------------------------------------------------------
    // Resume / New Game
    // ------------------------------------------------------------------

    loadOfflineGame() {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OFFLINE_GAME_KEY) : null;
        if (!raw) return null;
        const g = JSON.parse(raw);
        const valid = g && !g.online && Array.isArray(g.players) && (g.players.length === 4 || g.players.length === 3) &&
          g.players.every(p => Array.isArray(p.hand)) && Array.isArray(g.currentTrick) && g.phase !== 'game_over';
        return valid ? g : null;
      } catch (e) {
        return null;
      }
    }

    saveOfflineGame() {
      const g = this.game;
      if (!g || g.online) return;
      try {
        if (g.phase === 'game_over') localStorage.removeItem(OFFLINE_GAME_KEY);
        else localStorage.setItem(OFFLINE_GAME_KEY, JSON.stringify(g));
      } catch (e) {
        // Storage unavailable (private mode): resume only works while the app stays open
      }
    }

    getResumableOfflineGame() {
      const g = this.game && !this.game.online ? this.game : this.loadOfflineGame();
      if (!g || g.phase === 'game_over') return null;
      const started = g.roundNumber > 1 || g.players.some(p => p.bid !== null) || g.teamScores.some(x => x !== 0);
      return started ? g : null;
    }

    resumeOfflineGame() {
      const g = this.getResumableOfflineGame();
      if (!g) return this.startFreshOfflineGame();
      this.game = g;
      this.navigateTo('game');
    }

    startFreshOfflineGame(numSeats) {
      if (this.game && this.game.online) this.game = null;
      if (numSeats) this.pendingOfflineSeats = numSeats;
      else this.pendingOfflineSeats = (this.getResumableOfflineGame() || {}).numSeats || this.pendingOfflineSeats || 4;
      this.navigateTo('game', true);
      this.showToast('🔀 Fresh shuffle — new cards dealt to all 4 seats!', 'info');
    }

    resumeOnlineMatch() {
      if (!this.onlineView) {
        SH.networkAdapter.requestResync();
        this.navigateTo('multiplayer');
        return;
      }
      this.game = this.onlineView;
      this.navigateTo('game');
    }

    quitOnlineMatch(skipConfirm = false) {
      const ok = skipConfirm || typeof window === 'undefined' || typeof window.confirm !== 'function' ||
        window.confirm('Quit this online match? An AI bot will take over your seat for the rest of the game and you can’t come back.');
      if (!ok) return;
      SH.networkAdapter.leaveRoom();
      if (this.isOnlineGame()) this.game = null;
      this.onlineView = null;
      this.onlineSnapshot = null;
      if (this.currentScreen === 'game') this.navigateTo('menu');
      else if (this.currentScreen === 'menu') this.renderMenuResume();
      this.showToast('You quit the online match.', 'info');
    }

    /** "Play Offline" with something unfinished: ask Resume vs New Game. */
    offerResumeChoices() {
      const offline = this.getResumableOfflineGame();
      const online = SH.networkAdapter.state.activeMatch;
      if (!offline && !online) return false;
      const actions = [];
      if (offline) actions.push({ label: '▶ Resume Offline Game', primary: true, onClick: () => this.resumeOfflineGame() });
      if (online) actions.push({ label: '🌐 Resume Online Match', primary: !offline, onClick: () => this.resumeOnlineMatch() });
      const newSeats = this.pendingOfflineSeats || 4;
      actions.push({ label: `🔀 New ${newSeats === 3 ? '3-Player' : '4-Player'} Offline Game`, onClick: () => this.startFreshOfflineGame(newSeats) });
      actions.push({ label: 'Cancel', subtle: true });
      this.showChoiceDialog({
        title: offline ? 'Continue your game?' : 'Online match in progress',
        message: offline
          ? `You have an unfinished ${(offline.numSeats || 4) === 3 ? '3-player' : '4-player'} offline game — Round ${offline.roundNumber}, scores ${offline.teamScores.join(' – ')}.`
          : `Your online match is still running (Round ${online.roundNumber}). A bot covers your seat while you’re away.`,
        actions
      });
      return true;
    }

    showChoiceDialog({ title, message, actions }) {
      if (typeof document === 'undefined') return;
      const host = document.querySelector('.android-device-shell') || document.body;
      const old = host.querySelector('.choice-overlay');
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.className = 'choice-overlay';
      overlay.innerHTML = `
        <div class="choice-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          <div class="choice-actions">
            ${actions.map((a, i) => `
              <button type="button" class="${a.tone === 'yes' ? 'btn-yes' : a.tone === 'no' ? 'btn-no' : a.primary ? 'btn-primary' : 'btn-secondary'} ${a.subtle ? 'choice-subtle' : ''}" data-choice="${i}"${a.tone ? ` data-choice-tone="${a.tone}"` : ''}>${esc(a.label)}</button>
            `).join('')}
          </div>
        </div>
      `;
      const close = () => overlay.remove();
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) return close();
        const btn = e.target.closest('[data-choice]');
        if (!btn) return;
        e.stopPropagation();
        SH.audio.uiClick();
        close();
        const action = actions[Number(btn.getAttribute('data-choice'))];
        if (action && action.onClick) action.onClick();
      });
      host.appendChild(overlay);
    }

    renderMenuResume() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('menu-resume-mount');
      if (!mount) return;
      const off = this.getResumableOfflineGame();
      const am = SH.networkAdapter.state.activeMatch;
      const cards = [];
      if (am) {
        cards.push(`
          <div class="resume-card resume-online">
            <div class="resume-info">
              <strong>🌐 ${am.roomName ? esc(am.roomName) : 'Online Match'}${am.roomCode ? ` · ${esc(am.roomCode)}` : ''}</strong>
              <span>Round ${am.roundNumber} · You ${am.myScore} – ${am.foeScore}${am.paused ? ' · ⏸ Paused' : am.away ? ' · 🤖 Bot covering your seat' : ''}</span>
            </div>
            <div class="resume-actions">
              <button type="button" class="btn-primary btn-sm" data-resume="online">▶ Resume</button>
              <button type="button" class="btn-secondary btn-sm" data-resume="quit">Quit</button>
            </div>
          </div>
        `);
      }
      const local = this.getResumableLocalGame();
      if (local) {
        cards.push(`
          <div class="resume-card resume-local">
            <div class="resume-info">
              <strong>👥 ${local.gameName ? esc(local.gameName) : 'Pass &amp; Play'}</strong>
              <span>${local.names.map(esc).join(', ')} · Round ${local.roundNumber} · Scores ${local.teamScores.join(' – ')}</span>
            </div>
            <div class="resume-actions">
              <button type="button" class="btn-primary btn-sm" data-resume="local">▶ Resume</button>
              <button type="button" class="btn-secondary btn-sm" data-resume="rename-local" title="Name this game" aria-label="Name this game">✏️</button>
              <button type="button" class="btn-secondary btn-sm" data-resume="delete-local" title="Delete this saved game" aria-label="Delete saved Pass and Play game">🗑</button>
            </div>
          </div>
        `);
      }
      if (off) {
        cards.push(`
          <div class="resume-card resume-offline">
            <div class="resume-info">
              <strong>♠ ${off.name ? esc(off.name) : 'Offline Game'}${(off.numSeats || 4) === 3 ? ' · 3 Players' : ''}</strong>
              <span>Round ${off.roundNumber} · Scores ${off.teamScores.join(' – ')}</span>
            </div>
            <div class="resume-actions">
              <button type="button" class="btn-primary btn-sm" data-resume="offline">▶ Resume</button>
              <button type="button" class="btn-secondary btn-sm" data-resume="rename-offline" title="Name this game" aria-label="Name this game">✏️</button>
              <button type="button" class="btn-secondary btn-sm" data-resume="new">🔀 New Game</button>
              <button type="button" class="btn-secondary btn-sm" data-resume="delete-offline" title="Delete this saved game" aria-label="Delete saved offline game">🗑</button>
            </div>
          </div>
        `);
      }
      const html = cards.length ? `<h3 class="resume-heading">Continue where you left off</h3>${cards.join('')}` : '';
      if (mount._lastHtml === html) return;
      mount._lastHtml = html;
      mount.innerHTML = html;
      mount.querySelectorAll('[data-resume]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          const kind = btn.getAttribute('data-resume');
          if (kind === 'online') this.resumeOnlineMatch();
          else if (kind === 'quit') this.quitOnlineMatch();
          else if (kind === 'offline') this.resumeOfflineGame();
          else if (kind === 'local') this.resumeLocalGame();
          else if (kind === 'rename-offline') {
            const g = this.getResumableOfflineGame();
            this.showNameDialog({ title: '🏷 Name this game', value: (g && g.name) || '', onSave: (name) => this.renameOfflineGame(name) });
          } else if (kind === 'rename-local') {
            const lg = this.getResumableLocalGame();
            this.showNameDialog({ title: '🏷 Name this game', value: (lg && lg.gameName) || '', onSave: (name) => this.renameLocalGame(name) });
          } else if (kind === 'delete-offline') {
            if (!this.confirmDelete('Delete your saved offline game? This can’t be undone.')) return;
            this.deleteOfflineGame();
            this.renderMenuResume();
            this.showToast('Saved offline game deleted.', 'info');
          } else if (kind === 'delete-local') {
            if (!this.confirmDelete('Delete your saved Pass & Play game? This can’t be undone.')) return;
            this.deleteLocalGame();
            this.renderMenuResume();
            this.showToast('Saved Pass & Play game deleted.', 'info');
          } else this.startFreshOfflineGame();
        });
      });
    }

    // ------------------------------------------------------------------
    // Game names
    // ------------------------------------------------------------------

    cleanGameName(raw) {
      return SH.p2p ? SH.p2p.sanitizeGameName(raw) : String(raw || '').trim().slice(0, 24);
    }

    renameOfflineGame(raw) {
      const name = this.cleanGameName(raw);
      const g = this.game && !this.game.online ? this.game : this.loadOfflineGame();
      if (!g) return;
      g.name = name;
      if (this.game && !this.game.online) this.saveOfflineGame();
      else {
        try { localStorage.setItem(OFFLINE_GAME_KEY, JSON.stringify(g)); } catch (e) { /* ignore */ }
      }
      this.renderMenuResume();
      this.showToast(name ? `Game named “${name}”.` : 'Game name cleared.', 'success');
    }

    renameLocalGame(raw) {
      const name = this.cleanGameName(raw);
      if (this.localCfg) {
        this.localCfg.setup = { ...(this.localCfg.setup || {}), gameName: name };
        this.saveLocalGame();
      } else {
        const data = this.loadSavedLocalGame();
        if (!data) return;
        data.cfg.setup = { ...(data.cfg.setup || {}), gameName: name };
        try { localStorage.setItem(PASSPLAY_GAME_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      }
      this.renderMenuResume();
      this.showToast(name ? `Game named “${name}”.` : 'Game name cleared.', 'success');
    }

    /** Small popup with one text box: "🏷 Name this game". */
    showNameDialog({ title, value, onSave }) {
      if (typeof document === 'undefined') return;
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll('.choice-overlay').forEach(el => el.remove());
      const overlay = document.createElement('div');
      overlay.className = 'choice-overlay';
      overlay.innerHTML = `
        <div class="choice-card name-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <h3>${esc(title)}</h3>
          <p>Give it a name so you can find it later (up to 24 characters).</p>
          <form class="name-form">
            <input type="text" id="game-name-input" maxlength="24" autocomplete="off" placeholder="e.g. Friday Night Spades" value="${esc(value || '')}" />
            <div class="choice-actions">
              <button type="submit" class="btn-yes">💾 Save name</button>
              <button type="button" class="btn-no" data-name-cancel>Cancel</button>
            </div>
          </form>
        </div>
      `;
      const input = overlay.querySelector('#game-name-input');
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-name-cancel]')) overlay.remove();
      });
      overlay.querySelector('.name-form').addEventListener('submit', (e) => {
        e.preventDefault();
        SH.audio.uiClick();
        overlay.remove();
        onSave(input.value);
      });
      host.appendChild(overlay);
      setTimeout(() => { input.focus(); input.select(); }, 50);
    }

    tickTurnTimer() {
      if (typeof document === 'undefined' || this.currentScreen !== 'game' || !this.isOnlineGame()) return;
      const el = document.getElementById('turn-timer');
      if (!el || !this.game.turnDeadline) return;
      const secs = Math.max(0, Math.ceil((this.game.turnDeadline - Date.now()) / 1000));
      el.textContent = `⏱ ${secs}s`;
      el.classList.toggle('urgent', secs <= 10);
    }

    /**
     * New offline game. numSeats 4 = classic partnerships (you + North vs West & East);
     * numSeats 3 = cutthroat, every player for themselves (Blue / Red / Yellow).
     */
    startNewMatch(numSeats) {
      clearTimeout(this.botTimer);
      const n = numSeats === 3 || numSeats === 4 ? numSeats : ((this.game && !this.game.online && this.game.numSeats) || 4);
      const profile = SH.store.getProfile();
      const settings = SH.store.getSettings();
      const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const botNames = SH.pickBotNames(3, [profile.username]); // fresh bot names every game
      const you = { seat: 0, compass: 'South', name: profile.username, isHuman: true, team: 0, avatar: profile.selectedAvatar, hand: [], bid: null, tricks: 0 };

      this.game = {
        matchId,
        numSeats: n,
        tricksPerRound: n === 3 ? 17 : 13,
        seatColors: n === 3 ? [...SH.SOLO_COLORS] : null,
        targetScore: settings.targetScore,
        difficulty: settings.botDifficulty,
        roundNumber: 0,
        dealerSeat: n - 2, // Advances once in Round 1 so Seat 0 (Human South) bids and leads first
        teamScores: n === 3 ? [0, 0, 0] : [0, 0], // 4p: [Blue (0 & 2), Red (1 & 3)] · 3p: one per player
        teamBags: n === 3 ? [0, 0, 0] : [0, 0],
        players: n === 3 ? [
          you,
          { seat: 1, compass: 'West', name: botNames[0], isHuman: false, team: 1, avatar: 'free_blaze', hand: [], bid: null, tricks: 0 },
          { seat: 2, compass: 'East', name: botNames[1], isHuman: false, team: 2, avatar: 'free_frost', hand: [], bid: null, tricks: 0 }
        ] : [
          you,
          { seat: 1, compass: 'West', name: botNames[0], isHuman: false, team: 1, avatar: 'free_blaze', hand: [], bid: null, tricks: 0 },
          { seat: 2, compass: 'North (Partner)', name: botNames[1], isHuman: false, team: 0, avatar: 'free_velvet', hand: [], bid: null, tricks: 0 },
          { seat: 3, compass: 'East', name: botNames[2], isHuman: false, team: 1, avatar: 'free_frost', hand: [], bid: null, tricks: 0 }
        ],
        phase: 'bidding',
        turnSeat: 0,
        leadSeat: 0,
        spadesBroken: false,
        trickNumber: 1,
        currentTrick: [],
        lastCompletedTrick: [],
        playedHistory: [],
        roundSummary: null
      };

      this.showGameIntro();
      this.startNextRound();
    }

    startNextRound() {
      if (!this.game) return;
      clearTimeout(this.botTimer);
      const profile = SH.store.getProfile();
      const settings = SH.store.getSettings();

      this.game.targetScore = settings.targetScore;
      this.game.difficulty = settings.botDifficulty;
      this.game.players[0].name = profile.username;
      this.game.players[0].avatar = profile.selectedAvatar;

      this.game.roundNumber += 1;
      this.game.roundId = `${this.game.matchId}_r${this.game.roundNumber}`;
      const n = this.game.numSeats || 4;
      this.game.dealerSeat = (this.game.dealerSeat + 1) % n;
      const firstActor = (this.game.dealerSeat + 1) % n;

      const dealtHands = SH.dealHands(n, this.game.dealerSeat);
      for (let s = 0; s < n; s++) {
        this.game.players[s].hand = dealtHands[s];
        this.game.players[s].bid = null;
        this.game.players[s].tricks = 0;
      }

      this.game.phase = 'bidding';
      this.game.turnSeat = firstActor;
      this.game.leadSeat = firstActor;
      this.game.spadesBroken = false;
      this.game.trickNumber = 1;
      this.game.currentTrick = [];
      this.game.lastCompletedTrick = [];
      this.game.playedHistory = [];
      this.game.roundSummary = null;

      this.hideIllegalBanner();
      SH.audio.cardDeal();
      this.renderGameScreen();
      this.scheduleNextActionIfNeeded();
    }

    getBotDelay(baseMs = 520) {
      return SH.store.getSettings().reducedMotion ? 140 : baseMs;
    }

    scheduleNextActionIfNeeded() {
      clearTimeout(this.botTimer);
      if (!this.game || this.currentScreen !== 'game') return;
      if (this.game.online) return; // Server / Pass & Play engine runs bot seats
      if (this.introActive) return; // Bots wait for the game-start intro

      if (this.game.phase === 'bidding') {
        const currentPlayer = this.game.players[this.game.turnSeat];
        if (!currentPlayer.isHuman) {
          this.botTimer = setTimeout(() => this.runBotBid(currentPlayer.seat), this.getPace().botBidMs);
        }
      } else if (this.game.phase === 'playing') {
        const currentPlayer = this.game.players[this.game.turnSeat];
        if (!currentPlayer.isHuman) {
          this.botTimer = setTimeout(() => this.runBotPlay(currentPlayer.seat), this.getPace().botPlayMs);
        }
      } else if (this.game.phase === 'trick_pause') {
        // Resuming a saved game that was paused between tricks
        const winner = this.game.lastTrickWinner;
        this.botTimer = setTimeout(() => this.completeTrick(winner), this.getPace().trickPauseMs);
      }
    }

    runBotBid(seat) {
      if (!this.game || this.game.phase !== 'bidding' || this.game.turnSeat !== seat) return;
      const player = this.game.players[seat];

      const bid = SH.chooseBotBid({
        ownHand: [...player.hand],
        seat,
        bids: this.game.players.map(p => p.bid),
        difficulty: this.game.difficulty,
        numPlayers: this.game.numSeats || 4
      });

      this.submitBid(seat, bid);
    }

    submitBid(seat, bidValue) {
      if (!this.game || this.game.phase !== 'bidding' || this.game.turnSeat !== seat) return;
      if (this.isLocalGame()) {
        if (!this.game.revealed) return;
        SH.audio.uiClick();
        const res = this.localMatch.submitBid(this.localViewSeat, Number(bidValue));
        if (!res.ok) this.showIllegalBanner(res.message);
        return;
      }
      if (this.isOnlineGame()) {
        SH.audio.uiClick();
        if (!SH.networkAdapter.sendBid(Number(bidValue))) {
          this.showToast('Not connected — your bid was not sent. Reconnecting…', 'error');
        }
        return;
      }
      const numericBid = Math.max(0, Math.min(10, Number(bidValue)));
      this.game.players[seat].bid = numericBid;
      SH.audio.uiClick();

      const allBid = this.game.players.every(p => p.bid !== null);
      if (allBid) {
        this.game.phase = 'playing';
        this.game.turnSeat = this.game.leadSeat;
      } else {
        this.game.turnSeat = (this.game.turnSeat + 1) % (this.game.numSeats || 4);
      }

      this.renderGameScreen();
      this.scheduleNextActionIfNeeded();
    }

    handleHumanCardClick(cardId) {
      if (!this.game) return;
      if (this.game.phase !== 'playing' || this.game.turnSeat !== 0) {
        this.showIllegalBanner('Please wait for your turn to play a card.');
        return;
      }

      const human = this.game.players[0];
      const card = human.hand.find(c => c.id === cardId);
      if (!card) return;

      const validation = SH.validateCardPlay(card, human.hand, this.game.currentTrick, this.game.spadesBroken);
      if (!validation.valid) {
        SH.audio.illegalMove();
        this.showIllegalBanner(validation.reason, cardId);
        return;
      }

      this.hideIllegalBanner();
      if (this.isLocalGame()) {
        if (!this.game.revealed) return;
        const res = this.localMatch.playCard(this.localViewSeat, card.id);
        if (!res.ok) this.showIllegalBanner(res.message, cardId);
        return;
      }
      if (this.isOnlineGame()) {
        if (this.game.pendingCardId) return;
        if (!SH.networkAdapter.playCard(card.id)) {
          this.showToast('Not connected — your card was not sent. Reconnecting…', 'error');
          return;
        }
        this.game.pendingCardId = card.id; // Cleared by the next server snapshot
        return;
      }
      this.executeCardPlay(0, card);
    }

    runBotPlay(seat) {
      if (!this.game || this.game.phase !== 'playing' || this.game.turnSeat !== seat) return;
      const bot = this.game.players[seat];

      const chosenCard = SH.chooseBotCard({
        ownHand: [...bot.hand],
        seat,
        bids: this.game.players.map(p => p.bid),
        tricksWon: this.game.players.map(p => p.tricks),
        currentTrick: [...this.game.currentTrick],
        playedHistory: [...this.game.playedHistory],
        spadesBroken: this.game.spadesBroken,
        teamBags: [...this.game.teamBags],
        difficulty: this.game.difficulty,
        numPlayers: this.game.numSeats || 4
      });

      this.executeCardPlay(seat, chosenCard);
    }

    executeCardPlay(seat, card) {
      const player = this.game.players[seat];
      player.hand = player.hand.filter(c => c.id !== card.id);
      this.game.currentTrick.push({ seat, card });

      if (card.suit === 'S' && !this.game.spadesBroken) {
        this.game.spadesBroken = true;
        SH.audio.spadeBroken();
        this.showToast('Spades have been broken! ♠', 'info');
      } else {
        SH.audio.cardPlay();
      }

      const n = this.game.numSeats || 4;
      if (this.game.currentTrick.length < n) {
        this.game.turnSeat = (this.game.turnSeat + 1) % n;
        this.renderGameScreen();
        this.scheduleNextActionIfNeeded();
      } else {
        this.game.phase = 'trick_pause';
        const winnerSeat = SH.resolveTrickWinner(this.game.currentTrick);
        this.game.lastTrickWinner = winnerSeat;
        this.renderGameScreen();

        const pauseMs = this.getPace().trickPauseMs;
        this.botTimer = setTimeout(() => {
          this.completeTrick(winnerSeat);
        }, pauseMs);
      }
    }

    completeTrick(winnerSeat) {
      if (!this.game || this.game.online || this.game.phase !== 'trick_pause') return;
      const ledSuit = this.game.currentTrick[0].card.suit;
      for (const play of this.game.currentTrick) {
        this.game.playedHistory.push({
          seat: play.seat,
          card: play.card,
          ledSuit,
          trickNumber: this.game.trickNumber
        });
      }

      this.game.players[winnerSeat].tricks += 1;
      this.game.lastCompletedTrick = [...this.game.currentTrick];
      this.game.currentTrick = [];
      SH.audio.trickWin();

      if (this.game.trickNumber >= (this.game.tricksPerRound || 13)) {
        this.evaluateRoundEnd();
      } else {
        this.game.trickNumber += 1;
        this.game.leadSeat = winnerSeat;
        this.game.turnSeat = winnerSeat;
        this.game.phase = 'playing';
        this.renderGameScreen();
        this.scheduleNextActionIfNeeded();
      }
    }

    /** 3-player cutthroat round end: every player scores individually. */
    evaluateSoloRoundEnd() {
      const g = this.game;
      const results = g.players.map((p, i) => SH.computeSoloRoundScore(p, g.teamScores[i], g.teamBags[i]));
      g.teamScores = results.map(r => r.newScore);
      g.teamBags = results.map(r => r.newBags);

      const bestDelta = Math.max(...results.map(r => r.netDelta));
      const topRound = results.map((r, i) => i).filter(i => results[i].netDelta === bestDelta);
      const roundWinner = bestDelta > 0 && topRound.length === 1 ? topRound[0] : null;
      const wonRound = roundWinner === 0;

      const bestScore = Math.max(...g.teamScores);
      const leaders = g.teamScores.map((sc, i) => i).filter(i => g.teamScores[i] === bestScore);
      const someoneReached = g.teamScores.some(sc => sc >= g.targetScore);
      const matchFinished = someoneReached && leaders.length === 1;
      const wonMatch = matchFinished && leaders[0] === 0;
      const reward = this.planRewards({
        roundKey: `round_${g.roundId}`, wonRound, matchKey: `match_${g.matchId}`,
        matchFinished, wonMatch, target: g.targetScore, feeRefund: g.feePaid ? SH.store.entryFee : 0,
        myBid: g.players[0].bid, myTricks: g.players[0].tricks
      });
      const roundCoinsAwarded = reward.roundCoins;
      const matchCoinsAwarded = reward.matchCoins;
      const matchDiamonds = 0;

      const nameOf = (i) => (i === 0 ? 'You' : g.players[i].name);
      g.phase = matchFinished ? 'game_over' : 'round_over';
      g.roundSummary = {
        solo: true,
        roundNumber: g.roundNumber,
        entries: results.map((r, i) => ({ name: nameOf(i), color: g.seatColors[i], breakdown: r, isMe: i === 0 })),
        wonRound,
        roundCoinsAwarded,
        matchFinished,
        wonMatch,
        matchCoinsAwarded,
        matchDiamonds,
        reward,
        foeName: matchFinished ? nameOf(leaders[0]) : null,
        tieBreaker: someoneReached && leaders.length > 1,
        targetScore: g.targetScore
      };
      this.syncHeaderHud();
      this.renderGameScreen();
    }

    evaluateRoundEnd() {
      if ((this.game.numSeats || 4) === 3) return this.evaluateSoloRoundEnd();
      const g = this.game;
      const blueBreakdown = SH.computeTeamRoundScore(
        g.players[0],
        g.players[2],
        g.teamScores[0],
        g.teamBags[0]
      );
      const redBreakdown = SH.computeTeamRoundScore(
        g.players[1],
        g.players[3],
        g.teamScores[1],
        g.teamBags[1]
      );

      g.teamScores[0] = blueBreakdown.newScore;
      g.teamBags[0] = blueBreakdown.newBags;
      g.teamScores[1] = redBreakdown.newScore;
      g.teamBags[1] = redBreakdown.newBags;

      const wonRound = blueBreakdown.netDelta > redBreakdown.netDelta && blueBreakdown.netDelta > 0;

      const target = g.targetScore;
      const blueReached = g.teamScores[0] >= target;
      const redReached = g.teamScores[1] >= target;
      const someoneReached = blueReached || redReached;
      const isTied = g.teamScores[0] === g.teamScores[1];

      let matchFinished = false;
      let wonMatch = false;
      if (someoneReached && !isTied) {
        matchFinished = true;
        wonMatch = g.teamScores[0] > g.teamScores[1];
      }
      const reward = this.planRewards({
        roundKey: `round_${g.roundId}`, wonRound, matchKey: `match_${g.matchId}`,
        matchFinished, wonMatch, target, feeRefund: g.feePaid ? SH.store.entryFee : 0,
        myBid: g.players[0].bid, myTricks: g.players[0].tricks
      });
      const roundCoinsAwarded = reward.roundCoins;
      const matchCoinsAwarded = reward.matchCoins;
      const matchDiamonds = 0;

      g.phase = matchFinished ? 'game_over' : 'round_over';
      g.roundSummary = {
        roundNumber: g.roundNumber,
        blue: blueBreakdown,
        red: redBreakdown,
        wonRound,
        roundCoinsAwarded,
        matchFinished,
        wonMatch,
        matchCoinsAwarded,
        matchDiamonds,
        reward,
        targetScore: target
      };

      this.syncHeaderHud();
      this.renderGameScreen();
    }

    showIllegalBanner(reason, offendingCardId = null) {
      if (typeof document === 'undefined') return;
      const banner = document.getElementById('illegal-play-banner');
      if (banner) {
        banner.textContent = reason;
        banner.classList.add('visible');
      }
      if (offendingCardId) {
        const cardBtn = document.querySelector(`[data-card-id="${offendingCardId}"]`);
        if (cardBtn) {
          cardBtn.classList.remove('illegal-shake');
          void cardBtn.offsetWidth;
          cardBtn.classList.add('illegal-shake');
        }
      }
      clearTimeout(this.illegalTimer);
      this.illegalTimer = setTimeout(() => this.hideIllegalBanner(), 4000);
    }

    hideIllegalBanner() {
      if (typeof document === 'undefined') return;
      const banner = document.getElementById('illegal-play-banner');
      if (banner) banner.classList.remove('visible');
    }

    triggerQuickChat(kind, itemId, seat = 0) {
      let content = '';
      if (kind === 'quick_chat') {
        const preset = SH.QUICK_CHAT_PRESETS.find(q => q.id === itemId);
        if (!preset) return;
        content = preset.text;
      } else {
        const emoji = SH.EMOJI_REACTIONS.find(e => e.id === itemId);
        if (!emoji) return;
        content = `${emoji.symbol} ${emoji.label}`;
      }

      SH.audio.uiClick();
      const sent = SH.networkAdapter.sendTableReaction({ kind, id: itemId, content, seat });
      if (this.isOnlineGame() && !sent.multiplayerSynced) {
        this.showToast('Not connected — reaction not sent.', 'error');
      }

      this.chatDrawerOpen = false;
      this.showSeatBubble(seat, content, kind, 3400);

    }

    /**
     * Takes the 🦁 2 entry fee for a new game. If the player can't afford it, explains that they can
     * sell an avatar or card design for half price, and returns false.
     */
    chargeEntryFee() {
      if (SH.store.payEntryFee()) {
        this.syncHeaderHud();
        this.showToast(`🦁 −${SH.store.entryFee} entry fee — win to get it back plus your prize!`, 'info');
        return true;
      }
      this.offerSellForLions();
      return false;
    }

    offerSellForLions() {
      SH.audio.notEnoughFunds();
      const p = SH.store.getProfile();
      const sellable = p.ownedAvatars.filter(id => {
        const av = SH.AVATARS.find(a => a.id === id);
        return av && av.tier !== 'free' && av.currency !== 'diamonds';
      }).length + p.ownedCardSkins.filter(id => id !== 'classic').length;
      this.showChoiceDialog({
        title: 'Not enough Lions',
        message: sellable
          ? `A game costs 🦁 ${SH.store.entryFee} and you have ${p.coins}. Sell an avatar or card design for half its price to get more Lions.`
          : `A game costs 🦁 ${SH.store.entryFee} and you have ${p.coins}. You don’t own anything you can sell yet — open the game tomorrow for your daily 💎, or ask a friend to 🎁 gift you Lions.`,
        actions: sellable
          ? [{ label: '💰 Sell something (half price)', tone: 'yes', onClick: () => this.openSellSection() }, { label: 'Not now', tone: 'no' }]
          : [{ label: 'OK', tone: 'no' }]
      });
    }

    openSellSection() {
      this.navigateTo('profile');
      setTimeout(() => {
        const sec = document.querySelector('.sell-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }

    /** Offline only: reshuffle & redeal the current round for 1,000 coins. */
    offerPaidRedeal() {
      const g = this.game;
      if (!g || g.online || g.phase !== 'bidding') return;
      const coins = SH.store.getProfile().coins;
      if (coins < REDEAL_COST) {
        SH.audio.notEnoughFunds();
        this.showToast(`A redeal costs 🦁 ${REDEAL_COST.toLocaleString('en-US')} Lions — you have ${coins}. Win rounds (+10) and games (+50 / +80) to earn more.`, 'error');
        return;
      }
      this.showChoiceDialog({
        title: 'Redeal this round?',
        message: `Swap your hand for a fresh one for 🦁 ${REDEAL_COST} Lions. Only your cards change — scores stay the same.`,
        actions: [
          { label: `🔀 Redeal for ${REDEAL_COST.toLocaleString('en-US')} Lions`, primary: true, onClick: () => this.redealCurrentRound() },
          { label: 'Keep my cards', subtle: true }
        ]
      });
    }

    /**
     * Redeal only YOUR hand: your cards are shuffled together with the bots' hidden cards and you draw
     * a fresh hand of the same size (bots keep the same number of cards). Scores & round stay the same.
     */
    redealCurrentRound() {
      const g = this.game;
      if (!g || g.online || g.phase !== 'bidding' || g.players[0].bid !== null) return;
      if (!SH.store.spendCoins(REDEAL_COST)) return;
      const me = g.players[0];
      // Prefer bots that haven't bid yet, so no one's bid was based on cards that change
      const notBid = g.players.filter(p => p.seat !== 0 && p.bid === null);
      const donors = notBid.length ? notBid : g.players.filter(p => p.seat !== 0);
      const pool = SH.shuffleDeck([...me.hand, ...donors.flatMap(p => p.hand)]);
      const sizes = donors.map(p => p.hand.length);
      me.hand = SH.sortHand(pool.splice(0, me.hand.length));
      donors.forEach((p, i) => { p.hand = SH.sortHand(pool.splice(0, sizes[i])); });
      this.lastDealAnimKey = null; // play the deal-in animation for the new hand
      SH.audio.cardDeal();
      this.syncHeaderHud();
      this.renderGameScreen();
      this.showToast(`🔀 You got a fresh hand (−${REDEAL_COST} 🦁)`, 'info');
    }

    /** 🎉 Gold confetti + suit shower when you win a game. */
    celebrate() {
      if (typeof document === 'undefined' || SH.store.getSettings().reducedMotion) return;
      const host = document.querySelector('.android-device-shell') || document.body;
      const layer = document.createElement('div');
      layer.className = 'confetti-layer';
      const pieces = ['♠', '♥', '♦', '♣', '🦁', '✦', '✦', '✦'];
      layer.innerHTML = Array.from({ length: 46 }, (_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.9;
        const dur = 2.2 + Math.random() * 1.6;
        const size = 0.8 + Math.random() * 1.1;
        const colors = ['#f5d36b', '#fff1b8', '#d4af37', '#e3242b', '#1877f2', '#ffffff'];
        return `<span style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s;font-size:${size}rem;color:${colors[i % colors.length]}">${pieces[i % pieces.length]}</span>`;
      }).join('');
      host.appendChild(layer);
      SH.audio.coinReward();
      SH.audio.vibrate([30, 50, 30, 50, 60]);
      setTimeout(() => layer.remove(), 4200);
    }

    showSeatBubble(seat, content, kind, ttlMs = 3400) {
      this.seatBubbles[seat] = { content, kind, team: kind === 'text' && content.startsWith('👥'), expires: Date.now() + ttlMs };
      this.renderGameScreen();
      setTimeout(() => {
        if (this.seatBubbles[seat] && Date.now() >= this.seatBubbles[seat].expires) {
          this.seatBubbles[seat] = null;
          if (this.currentScreen === 'game') this.renderGameScreen();
        }
      }, ttlMs + 50);
    }

    // ------------------------------------------------------------------
    // Online (server-authoritative) match bridge
    // The server snapshot is rotated so the local player is always view seat 0
    // (bottom/South on screen) and their team is always the left score pill.
    // ------------------------------------------------------------------

    handleOnlineChat(msg) {
      if (!this.isOnlineGame()) return;
      if (msg.kind === 'text') {
        const mine = msg.fromId === SH.networkAdapter.myRoomId();
        this.chatLog = [...this.chatLog, { name: mine ? 'You' : msg.fromName, text: msg.text, to: msg.to, mine }].slice(-40);
        if (!this.chatDrawerOpen && !mine) this.chatUnread += 1;
        if (!mine) SH.audio.uiClick();
        const n = this.game.numSeats || 4;
        const content = msg.text.length > 42 ? `${msg.text.slice(0, 40)}…` : msg.text;
        this.seatBubbles[(msg.seat - this.game.mySeat + n) % n] = null;
        this.showSeatBubble((msg.seat - this.game.mySeat + n) % n, `${msg.to === 'team' ? '👥 ' : ''}${content}`, 'text', 4500);
        return;
      }
      if (msg.fromId === SH.networkAdapter.myRoomId()) return; // Already shown locally when sent
      let content = '';
      if (msg.kind === 'quick_chat') {
        const preset = SH.QUICK_CHAT_PRESETS.find(q => q.id === msg.id);
        content = preset ? preset.text : '';
      } else {
        const emoji = SH.EMOJI_REACTIONS.find(e => e.id === msg.id);
        content = emoji ? `${emoji.symbol} ${emoji.label}` : '';
      }
      if (!content) return;
      this.showSeatBubble((msg.seat - this.game.mySeat + (this.game.numSeats || 4)) % (this.game.numSeats || 4), content, msg.kind, 3400);
    }

    applyOnlineSnapshot(snap) {
      const prev = this.onlineSnapshot;
      const isNewMatch = !prev || prev.matchId !== snap.matchId;
      if (!isNewMatch && snap.seq < prev.seq) return; // Stale / out-of-order
      const ev = snap.lastEvent;
      const isFreshEvent = Boolean(ev) && !isNewMatch && ev.seq !== this.onlineLastSeq;
      const meAway = Boolean(snap.players[snap.mySeat].away);

      this.onlineSnapshot = snap;
      this.onlineLastSeq = ev ? ev.seq : null;
      if (snap.roundSummary) this.processOnlineRewards(snap);
      this.onlineView = this.buildOnlineView(snap);

      if (isNewMatch && !meAway && snap.phase !== 'game_over') {
        // Match just started (or we reconnected while seated): go to the table
        clearTimeout(this.botTimer);
        this.seatBubbles = { 0: null, 1: null, 2: null, 3: null };
        this.chatDrawerOpen = false;
        this.chatLog = [];
        this.chatUnread = 0;
        SH.audio.cardDeal();
        this.game = this.onlineView;
        if (snap.roundNumber === 1 && snap.phase === 'bidding' && snap.players.every(p => p.bid === null || p.isBot)) {
          this.showGameIntro();
          // 🦁 2 entry fee for an online game (checked before you could press Ready)
          this.paidMatchFees = this.paidMatchFees || new Set();
          if (!this.paidMatchFees.has(snap.matchId) && SH.store.payEntryFee()) {
            this.paidMatchFees.add(snap.matchId);
            this.syncHeaderHud();
          }
        }
        if (this.currentScreen !== 'game') {
          this.navigateTo('game');
        } else {
          this.renderGameScreen();
          this.syncAwayState();
        }
        return;
      }
      if (isNewMatch && meAway) {
        this.showToast('Your online match is still running — tap ▶ Resume on the Home screen.', 'info');
      }

      if (this.isOnlineGame()) {
        this.game = this.onlineView;
        if (isFreshEvent) this.playOnlineEventFeedback(ev);
        if (this.currentScreen === 'game') this.renderGameScreen();
      } else if (isFreshEvent && ev.type === 'game_over' && snap.roundSummary) {
        const won = snap.roundSummary.matchWinnerTeam === snap.mySeat % 2;
        this.showToast(won ? '🏆 Your online match finished — your team won!' : 'Your online match has finished.', won ? 'success' : 'info');
      }
      if (this.currentScreen === 'menu') this.renderMenuResume();
    }

    buildOnlineView(snap, { meLabel = 'You' } = {}) {
      const n = snap.numSeats || 4;
      const solo = n === 3; // 3-player cutthroat: every seat is its own team
      const me = snap.mySeat;
      const myTeam = solo ? me : me % 2;
      const foeTeam = solo ? null : 1 - myTeam;
      const toView = (s) => (s - me + n) % n;
      const fromView = (v) => (v + me) % n;
      const teamName = (t) => (t === 0 ? 'Blue' : 'Red');

      const players = Array.from({ length: n }, (_, v) => {
        const p = snap.players[fromView(v)];
        return {
          seat: v,
          serverSeat: p.seat,
          compass: p.compass,
          compassLetter: p.compassLetter,
          name: p.name,
          isHuman: v === 0,
          team: solo ? v : (p.team === myTeam ? 0 : 1),
          avatar: p.avatar,
          hand: v === 0 ? snap.hand : [],
          handCount: p.handCount,
          bid: p.bid,
          tricks: p.tricks,
          isBot: p.isBot,
          wasHuman: Boolean(p.wasHuman),
          account: p.account || null,
          botControlled: p.botControlled
        };
      });

      let roundSummary = null;
      if (snap.roundSummary) {
        const s = snap.roundSummary;
        const ledger = this.onlineRewardLedger[s.roundKey] || { roundCoins: 0, matchCoins: 0 };
        const needed = snap.nextRoundNeeded || [];
        const common = {
          online: true,
          roundNumber: s.roundNumber,
          wonRound: s.roundWinnerTeam === myTeam,
          roundCoinsAwarded: ledger.roundCoins,
          matchFinished: s.matchFinished,
          wonMatch: s.matchWinnerTeam === myTeam,
          matchCoinsAwarded: ledger.matchCoins,
          matchDiamonds: ledger.matchDiamonds || 0,
          reward: ledger.reward || null,
          targetScore: s.targetScore,
          tieBreaker: s.tieBreaker,
          acked: (snap.nextRoundAcks || []).includes(me),
          ackCount: (snap.nextRoundAcks || []).filter(seat => needed.includes(seat)).length,
          ackNeeded: needed.length
        };
        if (solo) {
          const nameOf = (serverSeat) => (serverSeat === me ? meLabel : snap.players[serverSeat].name);
          roundSummary = {
            ...common,
            solo: true,
            entries: players.map(p => ({
              name: p.seat === 0 ? meLabel : p.name,
              color: SH.SOLO_COLORS[p.serverSeat],
              breakdown: s.teams[p.serverSeat],
              isMe: p.seat === 0
            })),
            foeName: s.matchWinnerTeam === null || s.matchWinnerTeam === undefined ? null : nameOf(s.matchWinnerTeam)
          };
        } else {
          roundSummary = {
            ...common,
            blue: s.teams[myTeam],
            red: s.teams[foeTeam],
            mineHeading: `Team ${teamName(myTeam)} (${meLabel} & ${players[2].name})`,
            foeHeading: `Team ${teamName(foeTeam)} (${players[1].name} & ${players[3].name})`,
            foeName: `Team ${teamName(foeTeam)}`,
            mineClass: myTeam === 0 ? 'sum-blue' : 'sum-red',
            foeClass: myTeam === 0 ? 'sum-red' : 'sum-blue'
          };
        }
      }

      // Leave / disconnect notices: teammates always see them; in 3- and 4-human games everyone does
      const notices = [];
      for (const p of snap.players) {
        if (p.seat === me || !p.wasHuman) continue;
        const teammate = !solo && p.team === myTeam;
        if (!(teammate || snap.humanCount >= 3)) continue;
        const name = String(p.name).replace(/ \(Bot\)$/, '');
        const who = `${teammate ? 'Your teammate ' : ''}${name}`;
        if (p.isBot) {
          notices.push({ key: `${p.seat}:quit`, tone: 'warn', text: `${who} left the match — a bot has taken their seat for the rest of the game.` });
        } else if (!p.connected) {
          notices.push({ key: `${p.seat}:disc`, tone: 'error', text: `⚠️ ${who} left due to technical problems — a bot is playing for them until they reconnect.` });
        } else if (p.away) {
          notices.push({ key: `${p.seat}:away`, tone: 'info', text: `${who} stepped away — a bot is covering their seat until they return.` });
        }
      }

      const byView = (arr) => (solo ? players.map(p => arr[p.serverSeat]) : [arr[myTeam], arr[foeTeam]]);
      return {
        online: true,
        numSeats: n,
        tricksPerRound: snap.tricksPerRound || 13,
        seatColors: solo ? players.map(p => SH.SOLO_COLORS[p.serverSeat]) : null,
        notices,
        matchId: snap.matchId,
        roundId: snap.roundId,
        mySeat: me,
        myTeam,
        targetScore: snap.targetScore,
        difficulty: snap.difficulty,
        roundNumber: snap.roundNumber,
        dealerSeat: toView(snap.dealerSeat),
        teamScores: byView(snap.teamScores),
        teamBags: byView(snap.teamBags),
        players,
        phase: snap.phase,
        turnSeat: toView(snap.turnSeat),
        leadSeat: toView(snap.leadSeat),
        spadesBroken: snap.spadesBroken,
        trickNumber: snap.trickNumber,
        currentTrick: snap.currentTrick.map(t => ({ seat: toView(t.seat), card: t.card })),
        lastCompletedTrick: [],
        playedHistory: [],
        lastTrickWinner: snap.lastTrickWinner === null || snap.lastTrickWinner === undefined ? null : toView(snap.lastTrickWinner),
        turnDeadline: typeof snap.turnMsLeft === 'number' && toView(snap.turnSeat) === 0 ? Date.now() + snap.turnMsLeft : null,
        roundSummary,
        sideLabels: solo ? null : {
          mine: myTeam === 0 ? 'BLUE' : 'RED',
          foe: myTeam === 0 ? 'RED' : 'BLUE',
          mineClass: myTeam === 0 ? 'blue-pill' : 'red-pill',
          foeClass: myTeam === 0 ? 'red-pill' : 'blue-pill'
        }
      };
    }

    playOnlineEventFeedback(ev) {
      if (this.currentScreen !== 'game') return; // No table sounds/toasts while you're away from it
      const mine = this.onlineView && ev.seat === this.onlineView.mySeat;
      if (mine && (ev.type === 'player_away' || ev.type === 'player_returned')) return;
      if (ev.auto && this.onlineView && ev.seat === this.onlineView.mySeat) {
        this.showToast('⏱ Time’s up — a move was made for you.', 'info');
      }
      const who = () => {
        const p = this.game.players.find(pl => pl.serverSeat === ev.seat);
        return p ? p.name.replace(/ \(Bot\)$/, '') : 'A player';
      };
      switch (ev.type) {
        case 'round_dealt':
          this.hideIllegalBanner();
          SH.audio.cardDeal();
          break;
        case 'bid':
          SH.audio.uiClick();
          break;
        case 'card_played':
          SH.audio.cardPlay();
          break;
        case 'spades_broken':
          SH.audio.spadeBroken();
          this.showToast('Spades have been broken! ♠', 'info');
          break;
        case 'trick_won':
        case 'round_over':
        case 'game_over':
          SH.audio.trickWin();
          break;
        case 'player_disconnected':
        case 'player_quit':
        case 'player_away':
        case 'player_reconnected':
        case 'player_returned': {
          const p = this.onlineSnapshot && this.onlineSnapshot.players[ev.seat];
          const snap = this.onlineSnapshot;
          const soloGame = (snap && snap.numSeats) === 3;
          const isMate = snap && !soloGame && p && p.team === snap.mySeat % 2;
          if (!p || !snap || (!isMate && snap.humanCount < 3)) break; // teammates, or everyone in 3/4-human games
          const teammate = isMate ? 'Your teammate ' : '';
          const msg = {
            player_disconnected: [`⚠️ ${teammate}${who()} left due to technical problems — a bot is covering.`, 'error'],
            player_quit: [`${teammate}${who()} left the match — a bot took their seat.`, 'info'],
            player_away: [`${teammate}${who()} stepped away — a bot is covering.`, 'info'],
            player_reconnected: [`✅ ${teammate}${who()} reconnected and is back at the table.`, 'success'],
            player_returned: [`✅ ${teammate}${who()} is back at the table.`, 'success']
          }[ev.type];
          SH.audio.vibrate(ev.type === 'player_disconnected' ? [40, 60, 40] : 12);
          this.showToast(msg[0], msg[1]);
          break;
        }
        default:
          break;
      }
    }

    processOnlineRewards(snap, ownerSeat = snap.mySeat) {
      const s = snap.roundSummary;
      if (this.onlineRewardLedger[s.roundKey]) return;
      const myTeam = (snap.numSeats || 4) === 3 ? ownerSeat : ownerSeat % 2;
      const feePaid = (this.paidMatchFees && this.paidMatchFees.has(snap.matchId)) || (this.localMatch && this.localMatch.matchId === snap.matchId && this.localFeePaid);
      const reward = this.planRewards({
        roundKey: s.roundKey, wonRound: s.roundWinnerTeam === myTeam, matchKey: s.matchKey,
        matchFinished: s.matchFinished, wonMatch: s.matchWinnerTeam === myTeam,
        target: s.targetScore, feeRefund: feePaid ? SH.store.entryFee : 0,
        myBid: snap.players[ownerSeat] ? snap.players[ownerSeat].bid : null,
        myTricks: snap.players[ownerSeat] ? snap.players[ownerSeat].tricks : 0
      });
      this.onlineRewardLedger[s.roundKey] = { roundCoins: reward.roundCoins, matchCoins: reward.matchCoins, matchDiamonds: 0, reward };
      this.lastRewardRef = reward;
    }

    /**
     * Works out a round's rewards (stats & win streak update now). The Lions are paid when the
     * player taps "Collect" (or automatically when they move on), exactly once.
     */
    planRewards({ roundKey, wonRound, matchKey, matchFinished, wonMatch, target, feeRefund = 0, myBid = null, myTricks = 0 }) {
      SH.store.claimReward(null, 0, { roundsPlayed: 1, roundsWon: wonRound ? 1 : 0 });
      SH.store.recordRoundStats({ bid: myBid, tricks: myTricks });
      if (matchFinished) {
        SH.store.claimReward(null, 0, { gamesPlayed: 1, gamesWon: wonMatch ? 1 : 0 });
        SH.store.recordGameResult(wonMatch);
        SH.networkAdapter.reportStats();
      }
      const roundCoins = wonRound ? 10 : 0;
      const matchCoins = matchFinished && wonMatch ? SH.store.gameWinLions(target) + feeRefund : 0;
      const pending = [];
      if (roundCoins) pending.push({ key: roundKey, lions: roundCoins });
      if (matchCoins) pending.push({ key: matchKey, lions: matchCoins, bonusTarget: target });
      if (matchFinished && wonMatch) setTimeout(() => this.celebrate(), 300);
      return { pending, roundCoins, matchCoins, feeRefund: matchCoins ? feeRefund : 0, collected: pending.length === 0, collectedLions: 0, matchDiamonds: 0 };
    }

    collectRewards(reward) {
      if (!reward || reward.collected) return;
      let lions = 0;
      let diamonds = 0;
      for (const item of reward.pending) {
        const res = SH.store.claimReward(item.key, item.lions);
        lions += res.awarded;
        if (item.bonusTarget && res.awarded > 0) diamonds += SH.store.recordGameWinBonus(item.bonusTarget);
      }
      reward.collected = true;
      reward.collectedLions = lions;
      reward.matchDiamonds = diamonds;
      if (lions || diamonds) SH.audio.coinReward();
      this.syncHeaderHud();
    }

    /** Pays any reward still showing so it's never lost when moving on. */
    autoCollect() {
      if (this.game && this.game.roundSummary && this.game.roundSummary.reward) this.collectRewards(this.game.roundSummary.reward);
      if (this.lastRewardRef) this.collectRewards(this.lastRewardRef);
    }

    /** 🚪 Leave on the table: keep the seat (bot covers it) so you can resume later. */
    leaveOnlineMatch() {
      if (this.game && this.game.phase === 'game_over') {
        this.game = null;
        this.onlineSnapshot = null;
        this.onlineView = null;
        this.navigateTo('multiplayer');
        return;
      }
      this.navigateTo('menu');
      this.showToast('You left the table — a bot covers your seat. Tap ▶ Resume to return.', 'info');
    }

    renderGameScreen() {
      if (typeof document === 'undefined') return;
      const container = document.getElementById('game-table-mount');
      if (!container || !this.game) return;
      const g = this.game;
      if (!g.online) this.saveOfflineGame();
      const human = g.players[0];
      const handHidden = g.local && !g.revealed;
      const hasHumanTeammate = g.online && !g.local && (g.numSeats || 4) === 4 && g.players[2] && !g.players[2].isBot;
      if (!hasHumanTeammate) this.chatTarget = 'all';
      const restoreInputs = this.captureInputs(container);
      const legalIds = new Set(
        !handHidden && g.phase === 'playing' && g.turnSeat === 0
          ? SH.getLegalCards(human.hand, g.currentTrick, g.spadesBroken).map(c => c.id)
          : []
      );

      // Only animate the deal-in when a brand-new hand appears (not on every re-render)
      const dealKey = `${g.online ? g.roundId : `${g.matchId}_r${g.roundNumber}`}_${g.local ? `${g.viewSeat}${g.revealed}` : ''}`;
      const dealing = dealKey !== this.lastDealAnimKey && human.hand.length === 13;
      if (dealing) this.lastDealAnimKey = dealKey;

      const solo = (g.numSeats || 4) === 3;
      const teamBidText = (a, b) => (a.bid === null && b.bid === null ? '–' : (a.bid ?? 0) + (b.bid ?? 0));
      const blueTricks = solo ? 0 : g.players[0].tricks + g.players[2].tricks;
      const redTricks = solo ? 0 : g.players[1].tricks + g.players[3].tricks;

      const renderTableEdgeMarker = (seatIdx, posClass) => {
        const p = g.players[seatIdx];
        const isTurn = (g.phase === 'bidding' || g.phase === 'playing') && g.turnSeat === seatIdx;
        const bubble = this.seatBubbles[seatIdx];
        const compass = p.compassLetter || (solo ? ['S', 'W', 'E'][seatIdx] : (seatIdx === 0 ? 'S' : seatIdx === 2 ? 'N' : seatIdx === 1 ? 'W' : 'E'));
        const colorDot = solo ? `<span class="edge-dot dot-${g.seatColors[seatIdx]}"></span>` : '';
        const rawName = seatIdx === 0 && !g.local ? 'You' : String(p.name || compass).replace(/ \(Bot\)$/, '');
        const shortName = rawName.length > 9 ? `${rawName.slice(0, 8)}…` : rawName;
        const bidStr = p.bid === null ? '–' : p.bid === 0 ? 'Nil' : p.bid;
        const botTag = g.online && seatIdx !== 0 && p.botControlled ? '🤖' : '';
        // Avatar next to each name (not in Pass & Play); your own seat shows your photo/avatar
        const seatAvatar = g.local ? '' : `<span class="edge-avatar">${seatIdx === 0
          ? SH.renderAvatarSVG(SH.store.getProfile().selectedAvatar, 22)
          : SH.renderAvatarArt(p.avatar === 'photo' ? 'free_ace' : (p.avatar || 'free_ace'), 22)}</span>`;
        return `
          <div class="table-edge-seat ${posClass} ${isTurn ? 'active-turn' : ''}" data-seat="${seatIdx}"${g.online ? ` title="${esc(p.name)}"` : ''}>
            ${bubble ? `<div class="chat-bubble ${bubble.kind === 'text' ? 'text-bubble' : ''} ${bubble.team ? 'team-bubble' : ''}" role="status">${esc(bubble.content)}</div>` : ''}
            ${seatAvatar}${colorDot}<span class="edge-compass" data-compass="${compass}">${esc(shortName)}${botTag}</span>
            <span class="edge-stat">${p.tricks}/${bidStr}</span>
          </div>
        `;
      };

      const renderTrickCard = (seatIdx, slotClass) => {
        const play = g.currentTrick.find(t => t.seat === seatIdx);
        if (!play) {
          return `<div class="trick-slot ${slotClass} empty-slot"></div>`;
        }
        const c = play.card;
        const isRedSuit = c.suit === 'H' || c.suit === 'D';
        const isWinning = g.phase === 'trick_pause' && g.lastTrickWinner === seatIdx;
        return `
          <div class="trick-slot ${slotClass}">
            <div class="playing-card modern-card table-card suit-${c.suit} ${isRedSuit ? 'suit-red' : 'suit-black'} ${isWinning ? 'winning-card' : ''}">
              ${SH.renderModernCardInnerHTML(c)}
            </div>
          </div>
        `;
      };

      container.innerHTML = `
        <!-- SLIM TOP POINTS BAR ONLY (Maximum space for Table & Cards) -->
        <div class="top-scoreboard-panel">
          ${solo ? `
          <div class="score-strip-row solo-strip">
            ${g.players.map((p, i) => `
              <div class="team-score-col">
                <div class="team-score-pill ${g.seatColors[i]}-pill" title="${esc(i === 0 && !g.local ? 'You' : p.name)}">
                  <strong class="tsp-pts">${g.teamScores[i]}/${g.targetScore}</strong>
                </div>
                <span class="tsp-bid" title="Tricks won / bid">${p.tricks}/${p.bid === null ? '–' : p.bid}</span>
              </div>
            `).join('')}
            <div class="round-center-badge">
              <span class="rcb-top">Round ${g.roundNumber}</span>
              <span class="rcb-spade ${g.spadesBroken ? 'broken' : 'locked'}">
                ♠ ${g.spadesBroken ? 'Open' : 'Lock'}
              </span>
            </div>
          </div>
          ` : `
          <div class="score-strip-row">
            <div class="team-score-col">
              <div class="team-score-pill ${g.sideLabels ? g.sideLabels.mineClass : 'blue-pill'}" title="Team ${g.sideLabels ? g.sideLabels.mine : 'BLUE'} score">
                <strong class="tsp-pts">${g.teamScores[0]}/${g.targetScore}</strong>
              </div>
              <span class="tsp-bid" title="Tricks won / team bid">${blueTricks}/${teamBidText(g.players[0], g.players[2])}</span>
            </div>

            <div class="round-center-badge">
              <span class="rcb-top">Round ${g.roundNumber}</span>
              <span class="rcb-spade ${g.spadesBroken ? 'broken' : 'locked'}">
                ♠ ${g.spadesBroken ? 'Open' : 'Lock'}
              </span>
            </div>

            <div class="team-score-col">
              <div class="team-score-pill ${g.sideLabels ? g.sideLabels.foeClass : 'red-pill'}" title="Team ${g.sideLabels ? g.sideLabels.foe : 'RED'} score">
                <strong class="tsp-pts">${g.teamScores[1]}/${g.targetScore}</strong>
              </div>
              <span class="tsp-bid" title="Tricks won / team bid">${redTricks}/${teamBidText(g.players[1], g.players[3])}</span>
            </div>
          </div>
          `}

        </div>

        <div id="illegal-play-banner" class="illegal-banner" role="alert" aria-live="assertive"></div>

        <!-- UNOBSTRUCTED EMERALD FELT TABLE -->
        <div class="felt-arena">
          ${g.phase === 'bidding' && g.turnSeat === 0 && !handHidden ? `
            <div class="bid-fullscreen top-bid-selector" role="dialog" aria-label="Choose your bid from Nil to 10">
              <div class="bid-fs-title">Choose your bid</div>
              <div class="bid-fs-sub">How many tricks will you win this round? Your cards are below 👇</div>
              <div class="bid-fs-others">
                ${g.players.slice(1).map(p => `
                  <span class="bid-fs-chip ${solo ? `chip-${g.seatColors[p.seat]}` : p.team === 0 ? 'chip-partner' : 'chip-foe'}">
                    ${esc(String(p.name).replace(/ \(Bot\)$/, ''))}${!solo && p.team === 0 ? ' (partner)' : ''}: <strong>${p.bid === null ? '…' : p.bid === 0 ? 'Nil' : p.bid}</strong>
                  </span>
                `).join('')}
              </div>
              <div class="tbs-buttons bid-fs-grid">
                ${Array.from({ length: 11 }, (_, b) => `
                  <button type="button" class="tbs-btn ${b === 0 ? 'tbs-nil' : ''}" data-bid-val="${b}">
                    ${b === 0 ? 'Nil' : b}
                  </button>
                `).join('')}
              </div>
              ${g.online ? '' : `<button type="button" class="chip-btn bid-fs-shuffle" id="redeal-bid-btn" title="Get a fresh hand (only your cards change)">🔀 Redeal my hand · 🦁 ${REDEAL_COST}</button>`}
            </div>
          ` : ''}
          ${(g.notices || []).filter(n => !this.dismissedNotices.has(n.key)).length ? `
            <div class="table-notices" role="status" aria-live="polite">
              ${g.notices.filter(n => !this.dismissedNotices.has(n.key)).map(n => `
                <div class="table-notice notice-${n.tone}">
                  <span>${esc(n.text)}</span>
                  <button type="button" class="notice-close" data-dismiss-notice="${esc(n.key)}" aria-label="Dismiss">✕</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${solo ? '' : renderTableEdgeMarker(2, 'seat-north')}
          ${renderTableEdgeMarker(1, 'seat-west')}
          ${renderTableEdgeMarker(solo ? 2 : 3, 'seat-east')}

          <div class="trick-mat" aria-label="Current Trick Area">
            <div class="trick-mat-watermark">♠ SPADES ROYALE ♠</div>
            ${solo ? '' : renderTrickCard(2, 'slot-north')}
            ${renderTrickCard(1, 'slot-west')}
            ${renderTrickCard(solo ? 2 : 3, 'slot-east')}
            ${renderTrickCard(0, 'slot-south')}
          </div>

          ${renderTableEdgeMarker(0, 'seat-south')}

          ${(g.phase === 'round_over' || g.phase === 'game_over') && g.roundSummary ? this.renderRoundSummaryModal(g.roundSummary) : ''}
        </div>

        <!-- BOTTOM PLAYER HAND & CONTROLS -->
        <div class="player-dock">
          <div class="hand-toolbar">
            <div class="hand-caption">
              ${g.local ? `${esc(g.viewerName)}’s Hand` : 'Your Hand'} (${human.hand.length})
              ${g.phase === 'playing' && g.turnSeat === 0 && !handHidden ? '<span class="legal-hint-badge">Tap glowing card</span>' : ''}
              ${g.online && g.turnDeadline && g.turnSeat === 0 && (g.phase === 'bidding' || g.phase === 'playing')
                ? `<span class="turn-timer" id="turn-timer">⏱ ${Math.max(0, Math.ceil((g.turnDeadline - Date.now()) / 1000))}s</span>` : ''}
            </div>
            <div class="table-action-buttons">
              ${g.local ? '' : `
                <button type="button" class="btn-secondary btn-sm" id="toggle-chat-btn">
                  💬 Chat${this.chatUnread ? ` <span class="chat-unread">${this.chatUnread}</span>` : ''}
                </button>
              `}
              ${g.local ? `
                <button type="button" class="btn-secondary btn-sm" id="leave-local-btn">
                  🚪 Leave
                </button>
              ` : g.online ? `
                <button type="button" class="btn-secondary btn-sm" id="leave-online-btn">
                  🚪 Leave
                </button>
              ` : `
                <button type="button" class="btn-secondary btn-sm" id="leave-offline-btn">
                  🚪 Leave
                </button>
              `}
            </div>
          </div>

          ${this.chatDrawerOpen ? `
            <div class="quick-chat-drawer" role="region" aria-label="Chat, Quick Chat and Emoji Reactions">
              ${!g.local ? `
                <div class="qc-section chat-text-section">
                  <div class="chat-log" id="chat-log" aria-live="polite">
                    ${this.chatLog.length ? this.chatLog.map(m => `
                      <div class="chat-line ${m.mine ? 'mine' : ''} ${m.to === 'team' ? 'team' : ''}">
                        <strong>${esc(m.name)}${m.to === 'team' ? ' <span class="chat-tag">TEAM</span>' : ''}:</strong> ${esc(m.text)}
                      </div>
                    `).join('') : '<div class="chat-empty">No messages yet — say hi! 👋</div>'}
                  </div>
                  ${hasHumanTeammate ? `
                    <div class="chat-to" role="group" aria-label="Send to">
                      <button type="button" class="seg-btn ${this.chatTarget !== 'team' ? 'active' : ''}" data-chat-to="all">🌍 Everyone</button>
                      <button type="button" class="seg-btn ${this.chatTarget === 'team' ? 'active' : ''}" data-chat-to="team">👥 Team only</button>
                    </div>
                  ` : ''}
                  <form id="chat-text-form" class="chat-text-form" autocomplete="off">
                    <input id="chat-text-input" type="text" maxlength="80" enterkeyhint="send"
                      placeholder="${hasHumanTeammate && this.chatTarget === 'team' ? 'Message your teammate…' : 'Message everyone…'}" />
                    <button type="submit" class="btn-primary btn-sm">Send</button>
                  </form>
                </div>
              ` : ''}
              <div class="qc-section">
                <span class="qc-label">Quick Chat:</span>
                <div class="qc-buttons">
                  ${SH.QUICK_CHAT_PRESETS.map(q => `
                    <button type="button" class="qc-chip" data-qc-type="quick_chat" data-qc-id="${q.id}">${q.text}</button>
                  `).join('')}
                </div>
              </div>
              <div class="qc-section">
                <span class="qc-label">Emojis:</span>
                <div class="qc-buttons">
                  ${SH.EMOJI_REACTIONS.map(em => `
                    <button type="button" class="qc-emoji-btn" data-qc-type="emoji" data-qc-id="${em.id}" title="${em.label}">
                      <span class="em-icon">${em.symbol}</span>
                      <span class="em-name">${em.label}</span>
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          ` : ''}

          ${handHidden ? `
            <div class="handoff-cover" role="region" aria-label="Hidden hand">
              <div class="handoff-text">🙈 Pass the device to <strong>${esc(g.viewerName)}</strong></div>
              <button type="button" class="btn-primary" id="reveal-hand-btn">I’m ${esc(g.viewerName)} — Show my cards</button>
            </div>
          ` : ''}
          <div class="player-hand-row ${dealing ? 'dealing' : ''} ${handHidden ? 'hand-hidden' : ''}" role="group" aria-label="Your cards" style="--hand-count: ${human.hand.length}">
            ${human.hand.map((c, idx) => {
              const isRed = c.suit === 'H' || c.suit === 'D';
              const isLegal = legalIds.has(c.id);
              const dimClass = g.phase === 'playing' && g.turnSeat === 0 && !isLegal ? 'card-illegal-dim' : '';
              const legalClass = g.phase === 'playing' && g.turnSeat === 0 && isLegal ? 'card-legal-ready' : '';
              return `
                <button
                  type="button"
                  style="--card-idx: ${idx}"
                  class="playing-card modern-card hand-card suit-${c.suit} ${isRed ? 'suit-red' : 'suit-black'} ${legalClass} ${dimClass}"
                  data-card-id="${c.id}"
                  aria-label="${c.label} of ${SH.SUIT_NAMES[c.suit]}${isLegal ? ' (Legal play)' : ''}"
                >
                  ${SH.renderModernCardInnerHTML(c)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;

      container.querySelectorAll('[data-bid-val]').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = Number(btn.getAttribute('data-bid-val'));
          this.submitBid(0, val);
        });
      });

      const redealBidBtn = container.querySelector('#redeal-bid-btn');
      if (redealBidBtn) {
        redealBidBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.offerPaidRedeal();
        });
      }

      container.querySelectorAll('[data-chat-to]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.chatTarget = btn.getAttribute('data-chat-to') === 'team' ? 'team' : 'all';
          this.renderGameScreen();
        });
      });
      const chatForm = container.querySelector('#chat-text-form');
      if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const input = container.querySelector('#chat-text-input');
          const text = input ? input.value.trim() : '';
          if (!text) return;
          if (Date.now() - (this.lastChatSentAt || 0) < 1000) {
            this.showToast('Slow down — one message per second.', 'info');
            return; // keep the typed text
          }
          if (!g.online) {
            // Game against bots: show your message (bots don't chat back)
            this.lastChatSentAt = Date.now();
            input.value = '';
            const clean = text.replace(/\s+/g, ' ').slice(0, 80);
            this.chatLog = [...this.chatLog, { name: 'You', text: clean, to: 'all', mine: true }].slice(-40);
            this.showSeatBubble(0, clean.length > 42 ? `${clean.slice(0, 40)}…` : clean, 'text', 4500);
            return;
          }
          if (SH.networkAdapter.sendChatText(text, this.chatTarget)) {
            this.lastChatSentAt = Date.now();
            input.value = '';
          } else {
            this.showToast('Not connected — message not sent.', 'error');
          }
        });
      }
      const chatLogEl = container.querySelector('#chat-log');
      if (chatLogEl) chatLogEl.scrollTop = chatLogEl.scrollHeight;
      restoreInputs();

      container.querySelectorAll('[data-card-id]').forEach(cardBtn => {
        cardBtn.addEventListener('click', () => {
          const id = cardBtn.getAttribute('data-card-id');
          this.handleHumanCardClick(id);
        });
      });

      const chatBtn = container.querySelector('#toggle-chat-btn');
      if (chatBtn) {
        chatBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.chatDrawerOpen = !this.chatDrawerOpen;
          if (this.chatDrawerOpen) this.chatUnread = 0;
          this.renderGameScreen();
        });
      }

      container.querySelectorAll('[data-qc-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const kind = btn.getAttribute('data-qc-type');
          const id = btn.getAttribute('data-qc-id');
          this.triggerQuickChat(kind, id, 0);
        });
      });


      container.querySelectorAll('[data-dismiss-notice]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.dismissedNotices.add(btn.getAttribute('data-dismiss-notice'));
          this.renderGameScreen();
        });
      });
      // Forget dismissals once a notice clears, so a repeat disconnect shows again
      const activeKeys = new Set((g.notices || []).map(n => n.key));
      this.dismissedNotices.forEach(k => { if (!activeKeys.has(k)) this.dismissedNotices.delete(k); });

      const revealBtn = container.querySelector('#reveal-hand-btn');
      if (revealBtn) {
        revealBtn.addEventListener('click', () => {
          SH.audio.cardDeal();
          this.localRevealed = true;
          this.game = this.computeLocalView();
          this.renderGameScreen();
        });
      }

      container.querySelectorAll('#leave-local-btn, #leave-offline-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.confirmLeaveTable('menu');
        });
      });

      const leaveOnlineBtn = container.querySelector('#leave-online-btn');
      if (leaveOnlineBtn) {
        leaveOnlineBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.offerLeaveChoices();
        });
      }

      const collectBtn = container.querySelector('#collect-reward-btn');
      if (collectBtn) {
        collectBtn.addEventListener('click', () => {
          const rs = this.game && this.game.roundSummary;
          this.collectRewards(rs && rs.reward);
          this.renderGameScreen();
        });
      }

      const nextRoundBtn = container.querySelector('#next-round-btn');
      if (nextRoundBtn) {
        nextRoundBtn.addEventListener('click', () => {
          SH.audio.cardDeal();
          this.autoCollect();
          if (this.isOnlineGame()) {
            SH.networkAdapter.requestNextRound();
            return;
          }
          if (this.isLocalGame()) {
            this.localCfg.humanSeats.forEach(seat => this.localMatch.ackNextRound(seat));
            return;
          }
          this.startNextRound();
        });
      }
      const rematchBtn = container.querySelector('#rematch-btn');
      if (rematchBtn) {
        rematchBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.autoCollect();
          const net = SH.networkAdapter;
          if (!net.state.isReady) net.roomAction('room:ready', { ready: true });
          this.showToast('🔁 Rematch requested — it starts as soon as everyone taps Rematch.', 'info');
        });
      }
      const playAgainBtn = container.querySelector('#play-again-match-btn');
      if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
          SH.audio.cardDeal();
          this.autoCollect();
          if (this.isOnlineGame()) {
            this.leaveOnlineMatch();
            return;
          }
          if (this.isLocalGame()) {
            this.startPassPlay(this.localCfg.setup);
            return;
          }
          if (!this.chargeEntryFee()) return;
          this.startNewMatch();
          this.game.feePaid = true;
        });
      }
    }

    renderRoundSummaryModal(s) {
      const foeName = s.foeName || 'Team Red';
      const title = s.customTitle || (s.matchFinished
        ? (s.wonMatch ? '🏆 Victory! You Won the Game!' : `Match Complete — ${foeName} Wins`)
        : (s.wonRound ? `Round ${s.roundNumber} Won!` : `Round ${s.roundNumber} Summary`));

      const totalCoinsEarned = (s.roundCoinsAwarded || 0) + (s.matchCoinsAwarded || 0);

      return `
        <div class="table-overlay-card summary-modal" role="dialog" aria-label="Round and Scoring Summary">
          <h3>${title}</h3>
          ${totalCoinsEarned > 0 ? (s.reward && s.reward.collected ? `
            <div class="coin-reward-banner reward-collected" id="reward-collected">
              ✓ Collected 🦁 +${s.reward.collectedLions || totalCoinsEarned} Lions${s.reward.matchDiamonds ? ` &amp; 💎 +${s.reward.matchDiamonds}` : ''}
            </div>
          ` : `
            <button type="button" class="collect-btn" id="collect-reward-btn">
              🎁 Collect 🦁 +${totalCoinsEarned} Lions
              <span>(${s.roundCoinsAwarded ? '+10 Round Win' : ''}${s.roundCoinsAwarded && s.matchCoinsAwarded ? ' & ' : ''}${s.matchCoinsAwarded ? `+${s.matchCoinsAwarded - ((s.reward && s.reward.feeRefund) || 0)} Game Win${s.reward && s.reward.feeRefund ? ` + ${s.reward.feeRefund} entry back` : ''}` : ''})</span>
            </button>
          `) : `
            <p class="summary-subnote">
              ${s.matchFinished
                ? `Target score of ${s.targetScore} reached.`
                : `Win a round with a positive score higher than ${foeName} to earn +10 🦁 Lions (winning the game: +${SH.store.gameWinLions(s.targetScore)} 🦁).`}
            </p>
          `}
          ${s.reward && s.reward.matchDiamonds > 0 ? `<div class="coin-reward-banner diamond-reward-banner">💎 +${s.reward.matchDiamonds} Diamonds — ${s.targetScore === 250 ? 'every 2 wins at 250' : 'every 2 wins at 500'}!</div>` : ''}
          ${s.matchFinished && s.wonMatch && SH.store.getProfile().winStreak > 1 ? `<div class="streak-banner">🔥 ${SH.store.getProfile().winStreak} wins in a row!</div>` : ''}
          ${s.tieBreaker ? '<p class="summary-subnote">Scores are tied at the target — a tie-breaker round will be played.</p>' : ''}

          ${s.solo ? `
          <div class="summary-columns solo-columns">
            ${s.entries.map(e => `
              <div class="sum-col sum-${e.color} ${e.isMe ? 'sum-me' : ''}">
                <h4><span class="edge-dot dot-${e.color}"></span>${esc(e.name)}</h4>
                <p class="sum-line">${e.breakdown.contractNote}</p>
                ${e.breakdown.nilNotes.map(n => `<p class="sum-line">${esc(n)}</p>`).join('')}
                ${e.breakdown.bagPenalty < 0 ? `<p class="sum-line penalty-text">10-Bag Penalty: ${e.breakdown.bagPenalty} pts</p>` : ''}
                <div class="sum-delta">Round: <strong>${e.breakdown.netDelta >= 0 ? `+${e.breakdown.netDelta}` : e.breakdown.netDelta}</strong></div>
                <div class="sum-total">Total: <strong>${e.breakdown.newScore}</strong> <small>(Bags: ${e.breakdown.newBags})</small></div>
              </div>
            `).join('')}
          </div>
          ` : `
          <div class="summary-columns">
            <div class="sum-col ${s.mineClass || 'sum-blue'}">
              <h4>${s.mineHeading ? esc(s.mineHeading) : 'Team Blue (You &amp; North)'}</h4>
              <p class="sum-line">${s.blue.contractNote}</p>
              ${s.blue.nilNotes.map(n => `<p class="sum-line">${esc(n)}</p>`).join('')}
              ${s.blue.bagPenalty < 0 ? `<p class="sum-line penalty-text">10-Bag Penalty: ${s.blue.bagPenalty} pts</p>` : ''}
              <div class="sum-delta">Round Net: <strong>${s.blue.netDelta >= 0 ? `+${s.blue.netDelta}` : s.blue.netDelta}</strong></div>
              <div class="sum-total">Total Score: <strong>${s.blue.newScore}</strong> <small>(Bags: ${s.blue.newBags})</small></div>
            </div>

            <div class="sum-col ${s.foeClass || 'sum-red'}">
              <h4>${s.foeHeading ? esc(s.foeHeading) : 'Team Red (West &amp; East)'}</h4>
              <p class="sum-line">${s.red.contractNote}</p>
              ${s.red.nilNotes.map(n => `<p class="sum-line">${esc(n)}</p>`).join('')}
              ${s.red.bagPenalty < 0 ? `<p class="sum-line penalty-text">10-Bag Penalty: ${s.red.bagPenalty} pts</p>` : ''}
              <div class="sum-delta">Round Net: <strong>${s.red.netDelta >= 0 ? `+${s.red.netDelta}` : s.red.netDelta}</strong></div>
              <div class="sum-total">Total Score: <strong>${s.red.newScore}</strong> <small>(Bags: ${s.red.newBags})</small></div>
            </div>
          </div>
          `}

          <div class="summary-actions">
            ${s.online && !s.local ? (s.matchFinished ? `
              ${SH.networkAdapter.state.room ? (SH.networkAdapter.state.isReady ? `
                <button type="button" class="btn-secondary" disabled>🔁 Waiting for rematch… (${this.rematchReadyCount()})</button>
              ` : `
                <button type="button" class="btn-yes" id="rematch-btn">🔁 Rematch <small>(${this.rematchReadyCount()})</small></button>
              `) : ''}
              <button type="button" class="btn-primary" id="play-again-match-btn">Back to Lobby</button>
              <button type="button" class="btn-secondary" data-nav="menu">Main Menu</button>
            ` : s.acked ? `
              <button type="button" class="btn-secondary" disabled>Waiting for players… (${s.ackCount}/${s.ackNeeded} ready)</button>
            ` : `
              <button type="button" class="btn-primary" id="next-round-btn">Deal Round ${s.roundNumber + 1} → <small>(${s.ackCount}/${s.ackNeeded})</small></button>
            `) : s.matchFinished ? `
              <button type="button" class="btn-primary" id="play-again-match-btn">Play New Match</button>
              <button type="button" class="btn-secondary" data-nav="menu">Main Menu</button>
            ` : `
              <button type="button" class="btn-primary" id="next-round-btn">Deal Round ${s.roundNumber + 1} →</button>
            `}
          </div>
        </div>
      `;
    }

    renderLoginScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('login-mount');
      if (!mount) return;
      const adapter = SH.networkAdapter;
      const net = adapter.state;
      const mode = this.loginMode || 'login';
      const restoreInputs = this.captureInputs(mount);
      const signedIn = false; // signed-in players are taken straight to Home

      const html = `
        <div class="auth-hero">
          <div class="royale-logo auth-logo" role="img" aria-label="Spades Royale"></div>
        </div>
        ${this.renderAlert(net.authAlert)}

        <div class="auth-card mp-card">
          ${signedIn ? '' : `
            <div class="segmented-control auth-tabs" role="tablist">
              <button type="button" class="seg-btn ${mode === 'login' ? 'active' : ''}" data-auth-mode="login" role="tab">Log In</button>
              <button type="button" class="seg-btn ${mode === 'register' ? 'active' : ''}" data-auth-mode="register" role="tab">Create Account</button>
            </div>
            <p class="field-help auth-help">
              ${mode === 'login'
                ? 'Welcome back! Log in to play.'
                : mode === 'reset'
                ? '🔑 Forgot your password? Enter your username, your 4-digit recovery PIN and a new password.'
                : 'New here? Pick a username (2–18 letters, numbers, _ - .), a password (6+ characters) and a 4-digit recovery PIN. You start with 🦁 50 Lions and 💎 5 Diamonds.'}
            </p>
            <form id="auth-form" class="auth-form" autocomplete="on">
              <label for="auth-username">Username</label>
              <input id="auth-username" type="text" name="username" maxlength="18" autocomplete="username"
                autocapitalize="none" spellcheck="false" required value="${esc(net.savedUsername || (mode === 'register' ? SH.store.getProfile().username : ''))}" />
              ${mode === 'reset' ? `
                <label for="auth-pin">Recovery PIN</label>
                <input id="auth-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="4 numbers" required />
              ` : ''}
              <label for="auth-password">${mode === 'reset' ? 'New Password' : 'Password'}</label>
              <input id="auth-password" type="password" name="password" maxlength="128"
                autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required />
              ${mode !== 'login' ? `
                <label for="auth-password2">Confirm ${mode === 'reset' ? 'New ' : ''}Password</label>
                <input id="auth-password2" type="password" maxlength="128" autocomplete="new-password" required />
              ` : ''}
              ${mode === 'register' ? `
                <label for="auth-pin">Recovery PIN <small>(any 4 numbers — not an app lock)</small></label>
                <input id="auth-pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="e.g. 4821" required />
                <p class="field-help">Remember it! If you ever forget your password, this PIN lets you make a new one.</p>
              ` : ''}
              <button type="submit" class="btn-primary auth-submit" ${net.authBusy ? 'disabled' : ''}>
                ${net.authBusy ? 'Please wait…' : mode === 'login' ? 'Log In' : mode === 'reset' ? 'Set New Password & Log In' : 'Create Account'}
              </button>
              ${mode === 'login' ? '<button type="button" class="auth-link" data-auth-mode="reset">Forgot password?</button>' : ''}
              ${mode === 'reset' ? '<button type="button" class="auth-link" data-auth-mode="login">← Back to Log In</button>' : ''}
            </form>
          `}
        </div>
      `;
      if (mount._lastHtml === html) return; // nothing changed: keep DOM, focus & listeners
      mount._lastHtml = html;
      mount.innerHTML = html;

      this.bindConnectionBanner(mount, () => this.renderLoginScreen());
      restoreInputs();
      // Never keep typed passwords around between renders of a different tab
      mount.querySelectorAll('input[type="password"]').forEach(el => { if (net.authBusy) el.value = ''; });

      mount.querySelectorAll('[data-auth-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.loginMode = btn.getAttribute('data-auth-mode');
          net.authAlert = null;
          this.renderLoginScreen();
        });
      });

      const form = mount.querySelector('#auth-form');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const username = mount.querySelector('#auth-username').value;
          const password = mount.querySelector('#auth-password').value;
          const pinEl = mount.querySelector('#auth-pin');
          const pin = pinEl ? pinEl.value.trim() : '';
          if (mode === 'register' || mode === 'reset') {
            const confirm = mount.querySelector('#auth-password2').value;
            if (password !== confirm) {
              net.authAlert = { type: 'error', title: 'Passwords Don’t Match', detail: 'Please type the same password in both fields.' };
              this.renderLoginScreen();
              return;
            }
            if (!/^\d{4}$/.test(pin)) {
              net.authAlert = { type: 'error', title: 'PIN Must Be 4 Numbers', detail: 'Type exactly 4 numbers, like 4821.' };
              this.renderLoginScreen();
              return;
            }
            if (mode === 'reset') adapter.resetPassword(username, pin, password);
            else adapter.register(username, password, pin);
          } else {
            adapter.login(username, password);
          }
        });
      }

      const logoutBtn = mount.querySelector('#auth-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.logout();
        });
      }
    }

    /** Keeps typed text & focus in inputs when live socket updates re-render a screen. */
    captureInputs(mount) {
      const values = {};
      mount.querySelectorAll('input[id]').forEach(el => { values[el.id] = el.value; });
      const active = document.activeElement && mount.contains(document.activeElement) ? document.activeElement : null;
      const activeId = active && active.id ? active.id : null;
      const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
      return () => {
        Object.keys(values).forEach(id => {
          const el = mount.querySelector(`#${id}`);
          if (el && el.value !== values[id] && (el.type === 'text' || el.type === 'password')) el.value = values[id];
        });
        if (activeId) {
          const el = mount.querySelector(`#${activeId}`);
          if (el) {
            el.focus();
            if (caret !== null && typeof el.setSelectionRange === 'function') el.setSelectionRange(caret, caret);
          }
        }
      };
    }

    renderConnectionBanner() {
      const net = SH.networkAdapter.state;
      const status = net.connectionStatus;
      let title;
      let detail;
      if (status === 'connected' && net.identity === 'ok' && net.me) {
        title = 'Online';
        detail = `Signed in as <strong>${esc(net.me.username)}</strong>`;
      } else if (status === 'connected' && net.identity === 'signed_out') {
        title = 'Connected — Not Logged In';
        detail = 'Log in or create an account to play online.';
      } else if (status === 'connecting' || status === 'connected') {
        title = 'Connecting…';
        detail = esc(net.serverUrl);
      } else {
        title = 'Offline';
        detail = `Can’t reach the Spades server at <code>${esc(net.serverUrl)}</code>. Retrying automatically.`;
      }
      const dotClass = status === 'connected' && net.identity === 'ok' ? 'connected' : status === 'disconnected' ? 'disconnected' : 'connecting';

      return `
        <div class="backend-notice-banner conn-${dotClass}" role="status">
          <span class="status-dot ${dotClass}"></span>
          <div class="conn-text">
            <strong>${title}:</strong>
            <span>${detail}</span>
          </div>
          <button type="button" class="chip-btn" data-net-server-toggle>⚙ Server</button>
        </div>
        ${this.serverFormOpen ? `
          <form class="join-code-form server-form" data-net-server-form>
            <label for="net-server-input">Server address (saved on this device):</label>
            <div class="input-row">
              <input id="net-server-input" type="text" inputmode="url" autocomplete="off" spellcheck="false"
                placeholder="192.168.1.20:8787 or wss://example.com/ws" value="${esc(net.serverUrl)}" />
              <button type="submit" class="btn-primary btn-sm">Connect</button>
            </div>
            <div class="edge-btns server-form-actions">
              <button type="button" class="chip-btn" data-net-server-reset>Use Default</button>
              <button type="button" class="chip-btn" data-net-reconnect>Retry Now</button>
            </div>
          </form>
        ` : ''}
      `;
    }

    bindConnectionBanner(mount, rerender) {
      const toggle = mount.querySelector('[data-net-server-toggle]');
      if (toggle) {
        toggle.addEventListener('click', () => {
          SH.audio.uiClick();
          this.serverFormOpen = !this.serverFormOpen;
          rerender();
        });
      }
      const form = mount.querySelector('[data-net-server-form]');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const input = mount.querySelector('#net-server-input');
          this.serverFormOpen = false;
          SH.networkAdapter.setServerUrl(input ? input.value : '');
        });
      }
      const reset = mount.querySelector('[data-net-server-reset]');
      if (reset) {
        reset.addEventListener('click', () => {
          SH.audio.uiClick();
          this.serverFormOpen = false;
          SH.networkAdapter.resetServerUrl();
        });
      }
      const retry = mount.querySelector('[data-net-reconnect]');
      if (retry) {
        retry.addEventListener('click', () => {
          SH.audio.uiClick();
          SH.networkAdapter.reconnectNow();
        });
      }
    }

    /** Lobby status: rooms are hosted on players' own phones (free, worldwide). */
    renderP2PBanner() {
      const net = SH.networkAdapter.state;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      let dot = 'connected';
      let title = '🌍 Worldwide Rooms';
      let detail = 'Free — the host’s phone runs the game. Friends anywhere join with your room code (Wi-Fi or mobile data).';
      if (offline) {
        dot = 'disconnected';
        title = 'No Internet';
        detail = 'Connect to Wi-Fi or mobile data to play with friends. Pass & Play works without internet.';
      } else if (net.p2pStatus === 'connecting') {
        dot = 'connecting';
        title = 'Connecting…';
        detail = 'Talking to the free matchmaking service.';
      } else if (net.p2pStatus === 'hosting') {
        title = `Hosting ${esc(net.roomCode || '')} on this phone`;
        detail = 'Keep the app open while you play — if the host leaves, the room closes.';
      } else if (net.p2pStatus === 'joined') {
        title = `Connected to ${esc(net.roomCode || '')}`;
        detail = 'You’re linked directly to the host’s phone.';
      }
      return `
        <div class="backend-notice-banner conn-${dot}" role="status">
          <span class="status-dot ${dot}"></span>
          <div class="conn-text"><strong>${title}:</strong> <span>${detail}</span></div>
        </div>
      `;
    }

    renderAlert(alert) {
      if (!alert) return '';
      return `
        <div class="state-alert alert-${alert.type}" role="alert"${alert.code ? ` data-alert-code="${esc(alert.code)}"` : ''}>
          <strong>${esc(alert.title)}</strong>
          <p>${esc(alert.detail)}</p>
        </div>
      `;
    }

    renderMultiplayerScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('multiplayer-mount');
      if (!mount) return;
      const adapter = SH.networkAdapter;
      const net = adapter.state;
      const profile = SH.store.getProfile();
      const room = net.room;
      const inRoom = Boolean(room);
      const canEditMode = !inRoom || (net.isHost && room.status === 'lobby');
      const playing = inRoom && room.status === 'playing';
      const restoreInputs = this.captureInputs(mount);

      const html = `
        ${this.renderP2PBanner()}
        ${this.renderAlert(net.lobbyAlert)}

        ${net.invites.length ? `
          <div class="mp-card invite-inbox">
            <h3>🎴 Game Invites</h3>
            <div class="mp-invite-list">
              ${net.invites.map(inv => `
                <div class="invite-row">
                  <div class="inv-left">
                    ${SH.renderAvatarSVG(inv.from.avatar, 34)}
                    <div>
                      <div class="inv-name">${esc(inv.from.username)}</div>
                      <div class="inv-status">Room ${esc(inv.roomCode)}${inv.mode ? ` · ${inv.mode}-Human` : ''}</div>
                    </div>
                  </div>
                  <div class="req-btns">
                    <button type="button" class="btn-primary btn-sm" data-mp-invite-accept="${esc(inv.id)}">Join</button>
                    <button type="button" class="btn-secondary btn-sm" data-mp-invite-decline="${esc(inv.id)}">Decline</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="mp-grid">
          <div class="mp-card">
            <h3>1. Lobby Configuration</h3>
            <p class="field-help">Pick <strong>2 Humans</strong> (+2 AI bots, teams), <strong>3 Players</strong> (every player for themselves) or <strong>4 Humans</strong> (Team Blue vs Team Red).</p>

            <div class="segmented-control" role="group" aria-label="Human player count">
              <button type="button" class="seg-btn ${net.humanCountMode === 2 ? 'active' : ''}" data-mp-mode="2" ${canEditMode ? '' : 'disabled'}>
                2 Human Players (+2 Bots)
              </button>
              <button type="button" class="seg-btn ${net.humanCountMode === 3 ? 'active' : ''}" data-mp-mode="3" ${canEditMode ? '' : 'disabled'}>
                3 Players (Solo)
              </button>
              <button type="button" class="seg-btn ${net.humanCountMode === 4 ? 'active' : ''}" data-mp-mode="4" ${canEditMode ? '' : 'disabled'}>
                4 Human Players (Teams)
              </button>
            </div>

            <div class="mode-explainer-box">
              ${net.humanCountMode === 3
                ? '<strong>3-Player Mode:</strong> Cutthroat Spades — no teams. 🔵 Blue (South), 🔴 Red (West) and 🟡 Yellow (East) each bid and score on their own. The 2♣ is removed so everyone gets 17 cards.'
                : net.humanCountMode === 2
                ? '<strong>2-Human Mode:</strong> The remaining 2 seats are automatically filled by AI Bots so the game has all 4 seats. Pick the same team to play as partners, or opposite teams to play head-to-head.'
                : '<strong>4-Human Mode:</strong> Choose <strong>Team Blue</strong> (South/North) or <strong>Team Red</strong> (West/East). Teammates always sit opposite each other.'}
              ${inRoom && !net.isHost && room.status === 'lobby' ? '<br/><em>Only the host can change the mode.</em>' : ''}
            </div>

            ${net.humanCountMode === 3 ? '' : `
            <h4>Choose Your Team &amp; Seat</h4>
            ${(() => {
              // Who's already on each team, so you can join your friend's team (or play against them)
              const seats = inRoom ? (net.seats || []) : [];
              const onTeam = (team) => seats.filter(x => x.team === team && (x.role === 'human' || x.role === 'human_self'));
              const capacity = 2;
              const people = (team) => {
                const list = onTeam(team);
                const others = list.filter(x => x.role === 'human');
                const me = list.some(x => x.role === 'human_self');
                const names = [...(me ? ['You'] : []), ...others.map(x => esc(x.plainName || x.name))];
                const free = Math.max(0, capacity - list.length);
                return `
                  <span class="team-people">${names.length ? `👤 ${names.join(' & ')}` : 'Nobody yet'}</span>
                  <span class="team-spots ${free ? '' : 'full'}">${free ? `${free} spot${free > 1 ? 's' : ''} free` : 'Full'}</span>`;
              };
              const friendsTeams = ['blue', 'red'].filter(t => onTeam(t).some(x => x.role === 'human'));
              return `
            ${inRoom && friendsTeams.length ? `<p class="team-hint">${friendsTeams.map(t => `${onTeam(t).filter(x => x.role === 'human').map(x => `<strong>${esc(x.plainName || x.name)}</strong>`).join(' & ')} ${onTeam(t).filter(x => x.role === 'human').length > 1 ? 'are' : 'is'} on <strong class="hint-${t}">Team ${t === 'blue' ? 'Blue' : 'Red'}</strong>`).join(' · ')} — join them to play as partners, or pick the other team to play against them.</p>` : ''}
            <div class="team-pick-row">
              <button type="button" class="team-select-btn team-blue ${net.selectedTeam === 'blue' ? 'selected' : ''}" data-mp-team="blue" ${playing ? 'disabled' : ''}>
                <span class="team-badge">TEAM BLUE</span>
                <small>Seats: South &amp; North (Opposite)</small>
                ${inRoom ? people('blue') : ''}
              </button>
              <button type="button" class="team-select-btn team-red ${net.selectedTeam === 'red' ? 'selected' : ''}" data-mp-team="red" ${playing ? 'disabled' : ''}>
                <span class="team-badge">TEAM RED</span>
                <small>Seats: West &amp; East (Opposite)</small>
                ${inRoom ? people('red') : ''}
              </button>
            </div>`;
            })()}
            `}

            <hr class="divider"/>

            ${inRoom ? `
              <div class="game-name-row">
                <h4 class="game-name-title">🏷 ${room.name ? esc(room.name) : 'Untitled game'}</h4>
                ${net.isHost ? '<button type="button" class="chip-btn" id="mp-rename-room-btn">✏️ Name game</button>' : ''}
              </div>
              <div class="room-code-display">
                <div>
                  <span class="room-code-label">Room Code</span>
                  <strong class="room-code-value">${esc(room.code)}</strong>
                </div>
                <div class="room-code-actions">
                  <button type="button" class="chip-btn" id="mp-copy-code-btn">📋 Copy</button>
                  <button type="button" class="chip-btn" id="mp-share-code-btn">📤 Share</button>
                </div>
              </div>
              <p class="field-help">
                ${room.humans}/${room.capacity} humans · Target ${room.settings.targetScore} pts · Bots: ${esc(room.settings.difficulty)} · Speed: ${esc(SH.getGameSpeed(room.settings.speed).label)}
                ${net.isHost ? ' · You are the host (uses your Settings)' : ''}
              </p>
              ${playing ? `
                <div class="room-actions-row">
                  <button type="button" class="btn-primary" id="mp-resume-match-btn">▶ Resume Match</button>
                </div>
              ` : `
                <div class="room-actions-row">
                  <button type="button" class="btn-primary ${net.isReady ? 'ready-active' : ''}" id="mp-toggle-ready-btn">
                    ${net.isReady ? '✓ Ready (Tap to Unready)' : 'Mark Ready'}
                  </button>
                  ${net.isHost ? `
                    <button type="button" class="btn-secondary" id="mp-start-match-btn">▶ Start Match</button>
                  ` : ''}
                </div>
                <p class="field-help">Send the code to your friends (WhatsApp, SMS…) — they open Spades Royale, tap Lobby and enter it. The match starts once all ${room.capacity} players are Ready.</p>
              `}
              <button type="button" class="btn-secondary btn-sm" id="mp-leave-room-btn">${playing ? '🏳 Quit Match' : '🚪 Leave Room'}</button>
            ` : `
              <h4>Create or Join Room</h4>
              <label class="game-name-label" for="mp-room-name">Name your game (optional)</label>
              <div class="input-row game-name-input">
                <input id="mp-room-name" type="text" maxlength="24" autocomplete="off" placeholder="e.g. Friday Night Spades" value="${esc(net.roomNameDraft || '')}" />
              </div>
              <div class="room-actions-row">
                <button type="button" class="btn-primary" id="mp-create-room-btn">
                  + Create ${net.humanCountMode === 3 ? '3-Player' : `${net.humanCountMode}-Human`} Room
                </button>
              </div>

              <form class="join-code-form" id="mp-join-form">
                <label for="mp-code-input">Join by Room Code:</label>
                <div class="input-row">
                  <input
                    id="mp-code-input"
                    type="text"
                    maxlength="10"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    placeholder="e.g. HDZ-7K2P"
                    value="${esc(net.joinCodeInput)}"
                  />
                  <button type="submit" class="btn-secondary">Join Room</button>
                </div>
              </form>
            `}
          </div>

          <div class="mp-card">
            <div class="lobby-header-row">
              <h3>2. Table Seats (Opposite Partners)</h3>
              <span class="conn-pill ${inRoom ? 'live' : ''}">
                ${inRoom ? `${esc(room.code)} · ${playing ? 'In Match' : `${room.humans}/${room.capacity} Humans`}` : 'Preview — No Room Yet'}
              </span>
            </div>

            <div class="lobby-compass-grid">
              ${net.seats.map(s => `
                <div class="lobby-seat-slot seat-team-${s.team} ${s.role === 'human_self' ? 'seat-self' : ''}">
                  <div class="slot-avatar">${SH.renderAvatarSVG(s.avatar, 40)}</div>
                  <div class="slot-info">
                    <div class="slot-top">
                      <span class="slot-compass">${s.compass}</span>
                      <span class="slot-team-badge ${s.team}">${net.humanCountMode === 3 ? '' : 'Team '}${s.team.charAt(0).toUpperCase()}${s.team.slice(1)}</span>
                    </div>
                    <div class="slot-name">${s.role === 'bot' ? '🤖 ' : ''}${esc(s.name)}</div>
                    <div class="slot-meta">
                      <span>${esc(s.status)}</span>
                      <span class="ready-tag ${s.ready ? 'is-ready' : 'not-ready'}">${s.role === 'bot' ? 'BOT' : s.ready ? 'READY' : 'NOT READY'}</span>
                    </div>
                  </div>
                  ${s.role === 'human' && s.userId ? `
                    <button type="button" class="chip-btn gift-btn" data-gift-room="${esc(s.userId)}" data-gift-name="${esc(s.plainName || s.name)}" title="Send a gift">🎁</button>
                  ` : ''}
                </div>
              `).join('')}
            </div>

            <hr class="divider"/>

            <h4>Invite Friends${inRoom ? ` to ${esc(room.code)}` : ' (creates a room)'}</h4>
            <div class="mp-invite-list">
              ${net.friendsList.length ? net.friendsList.map(fr => `
                <div class="invite-row">
                  <div class="inv-left">
                    ${SH.renderAvatarSVG(fr.avatar, 34)}
                    <div>
                      <div class="inv-name">${esc(fr.username)}</div>
                      <div class="inv-status presence-${fr.presence}">${esc(fr.statusText)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    data-mp-invite="${esc(fr.id)}"
                  >
                    ${fr.presence === 'online' ? 'Invite to Room' : 'Unavailable'}
                  </button>
                </div>
              `).join('') : `<p class="field-help">${SH.networkAdapter.isSignedIn() ? 'No friends yet — add players from the <strong>Friends</strong> tab, or just share your room code.' : 'Share your room code with friends anywhere. (Log in to use the Friends list &amp; invites.)'}</p>`}
            </div>
          </div>
        </div>
      `;
      if (mount._lastHtml === html) return; // nothing changed: keep DOM, focus & listeners
      mount._lastHtml = html;
      mount.innerHTML = html;

      this.bindConnectionBanner(mount, () => this.renderMultiplayerScreen());
      const shareBtn = mount.querySelector('#mp-share-code-btn');
      if (shareBtn && room) {
        shareBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          const text = `Join my Spades Royale game! 🦁♠ Open the app, tap Lobby and enter code: ${room.code}`;
          if (navigator.share) {
            navigator.share({ title: 'Spades Royale', text }).catch(() => {});
          } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
          }
        });
      }
      restoreInputs();

      mount.querySelectorAll('[data-mp-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.setHumanCountMode(Number(btn.getAttribute('data-mp-mode')), profile.username, profile.selectedAvatar);
        });
      });

      mount.querySelectorAll('[data-mp-team]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.selectTeam(btn.getAttribute('data-mp-team'), profile.username, profile.selectedAvatar);
        });
      });

      const createBtn = mount.querySelector('#mp-create-room-btn');
      if (createBtn) {
        createBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          const nameInput = mount.querySelector('#mp-room-name');
          adapter.createRoom(nameInput ? nameInput.value.trim() : '');
        });
      }

      const renameRoomBtn = mount.querySelector('#mp-rename-room-btn');
      if (renameRoomBtn && room) {
        renameRoomBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.showNameDialog({
            title: '🏷 Name this game',
            value: room.name || '',
            onSave: (name) => adapter.renameRoom(name)
          });
        });
      }

      const readyBtn = mount.querySelector('#mp-toggle-ready-btn');
      if (readyBtn) {
        readyBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          if (!net.isReady && SH.store.getProfile().coins < SH.store.entryFee) {
            this.offerSellForLions(); // the game will cost 🦁 2
            return;
          }
          adapter.toggleReady(profile.username, profile.selectedAvatar);
        });
      }

      const startBtn = mount.querySelector('#mp-start-match-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.startOnlineMatch();
        });
      }

      const leaveBtn = mount.querySelector('#mp-leave-room-btn');
      if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          if (playing) {
            this.quitOnlineMatch();
          } else {
            adapter.leaveRoom();
          }
        });
      }

      const resumeBtn = mount.querySelector('#mp-resume-match-btn');
      if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.resumeOnlineMatch();
        });
      }

      const copyBtn = mount.querySelector('#mp-copy-code-btn');
      if (copyBtn && room) {
        copyBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          const done = () => this.showToast(`Room code ${room.code} copied!`, 'success');
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(room.code).then(done, () => this.showToast(`Room code: ${room.code}`, 'info'));
          } else {
            this.showToast(`Room code: ${room.code}`, 'info');
          }
        });
      }

      const joinForm = mount.querySelector('#mp-join-form');
      if (joinForm) {
        joinForm.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const input = mount.querySelector('#mp-code-input');
          adapter.joinRoomByCode(input ? input.value : '');
        });
      }

      mount.querySelectorAll('[data-mp-invite]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.inviteFriendToLobby(btn.getAttribute('data-mp-invite'));
        });
      });
      this.bindGiftButtons(mount);

      mount.querySelectorAll('[data-mp-invite-accept], [data-mp-invite-decline]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          const accept = btn.hasAttribute('data-mp-invite-accept');
          adapter.respondToInvite(btn.getAttribute(accept ? 'data-mp-invite-accept' : 'data-mp-invite-decline'), accept);
        });
      });
    }

    renderFriendsScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('friends-mount');
      if (!mount) return;
      const adapter = SH.networkAdapter;
      const net = adapter.state;

      const relationAction = (u) => {
        if (u.relation === 'self') return '<span class="inv-status">That’s you</span>';
        if (u.relation === 'friend') return '<span class="inv-status presence-online">Friends ✓</span>';
        if (u.relation === 'outgoing') return '<button type="button" class="btn-secondary btn-sm" disabled>Request Sent</button>';
        if (u.relation === 'incoming') return `<button type="button" class="btn-primary btn-sm" data-fr-respond="accept" data-fr-user="${esc(u.id)}">Accept</button>`;
        return `<button type="button" class="btn-primary btn-sm" data-fr-add="${esc(u.id)}">+ Add Friend</button>`;
      };
      const restoreInputs = this.captureInputs(mount);

      const html = `
        ${this.renderConnectionBanner()}
        ${this.renderAlert(net.friendsAlert)}

        <div class="mp-grid">
          <div class="mp-card">
            <h3>Find Players by Username</h3>
            <p class="field-help">Search the online player directory and send a friend request.</p>
            <form id="friend-search-form" class="join-code-form">
              <div class="input-row">
                <input
                  id="friend-search-input"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Enter a username"
                  value="${esc(net.searchQuery)}"
                />
                <button type="submit" class="btn-primary">Search</button>
              </div>
            </form>

            ${net.searchState === 'searching' ? '<p class="field-help search-status">Searching…</p>' : ''}
            ${net.searchState === 'found' ? `
              <div class="mp-invite-list search-results">
                ${net.searchResults.map(u => `
                  <div class="invite-row">
                    <div class="inv-left">
                      ${SH.renderAvatarSVG(u.avatar, 38)}
                      <div>
                        <div class="inv-name">${esc(u.username)}</div>
                        <div class="inv-status presence-${u.presence}">${esc(u.statusText)}</div>
                      </div>
                    </div>
                    ${relationAction(u)}
                  </div>
                `).join('')}
              </div>
            ` : ''}

            <hr class="divider"/>

            <h3>Pending Friend Requests (${net.incomingRequests.length})</h3>
            ${net.incomingRequests.length ? net.incomingRequests.map(req => `
              <div class="invite-row">
                <div class="inv-left">
                  ${SH.renderAvatarSVG(req.avatar, 38)}
                  <div>
                    <div class="inv-name">${esc(req.username)}</div>
                    <div class="inv-status">${esc(req.note)}</div>
                  </div>
                </div>
                <div class="req-btns">
                  <button type="button" class="btn-primary btn-sm" data-fr-respond="accept" data-fr-user="${esc(req.id)}">Accept</button>
                  <button type="button" class="btn-secondary btn-sm" data-fr-respond="decline" data-fr-user="${esc(req.id)}">Decline</button>
                </div>
              </div>
            `).join('') : '<p class="field-help">No pending requests.</p>'}

            ${net.outgoingRequests.length ? `
              <h4>Sent Requests (${net.outgoingRequests.length})</h4>
              ${net.outgoingRequests.map(u => `
                <div class="invite-row">
                  <div class="inv-left">
                    ${SH.renderAvatarSVG(u.avatar, 32)}
                    <div>
                      <div class="inv-name">${esc(u.username)}</div>
                      <div class="inv-status">Waiting for them to accept</div>
                    </div>
                  </div>
                  <button type="button" class="chip-btn" data-fr-remove="${esc(u.id)}">Cancel</button>
                </div>
              `).join('')}
            ` : ''}
          </div>

          <div class="mp-card">
            <h3>Friends List &amp; Direct Game Invites</h3>
            <p class="field-help">Online friends can be invited to your lobby with one tap; busy or offline friends show as unavailable.</p>
            <div class="mp-invite-list">
              ${net.friendsList.length ? net.friendsList.map(fr => `
                <div class="invite-row">
                  <div class="inv-left">
                    ${SH.renderAvatarSVG(fr.avatar, 42)}
                    <div>
                      <div class="inv-name"><span class="presence-dot presence-${fr.presence}"></span>${esc(fr.username)}</div>
                      <div class="inv-status presence-${fr.presence}">${esc(fr.statusText)}</div>
                    </div>
                  </div>
                  <div class="req-btns">
                    <button type="button" class="btn-secondary btn-sm" data-fr-invite="${esc(fr.id)}">
                      ${fr.presence === 'online' ? 'Invite to Lobby' : 'Unavailable'}
                    </button>
                    <button type="button" class="chip-btn gift-btn" data-gift-friend="${esc(fr.id)}" data-gift-name="${esc(fr.username)}" title="Send a gift" aria-label="Send ${esc(fr.username)} a gift">🎁</button>
                    <button type="button" class="chip-btn" data-fr-remove="${esc(fr.id)}" title="Remove friend" aria-label="Remove ${esc(fr.username)}">✕</button>
                  </div>
                </div>
              `).join('') : '<p class="field-help">No friends yet — search for a username to add one.</p>'}
            </div>
          </div>
        </div>
      `;
      if (mount._lastHtml === html) return; // nothing changed: keep DOM, focus & listeners
      mount._lastHtml = html;
      mount.innerHTML = html;

      this.bindConnectionBanner(mount, () => this.renderFriendsScreen());
      restoreInputs();

      const searchForm = mount.querySelector('#friend-search-form');
      if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const input = mount.querySelector('#friend-search-input');
          adapter.searchUsername(input ? input.value : '');
        });
      }

      mount.querySelectorAll('[data-fr-add]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.sendFriendRequest(btn.getAttribute('data-fr-add'));
        });
      });

      mount.querySelectorAll('[data-fr-respond]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.respondFriendRequest(btn.getAttribute('data-fr-user'), btn.getAttribute('data-fr-respond') === 'accept');
        });
      });

      mount.querySelectorAll('[data-fr-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.removeFriend(btn.getAttribute('data-fr-remove'));
        });
      });

      mount.querySelectorAll('[data-fr-invite]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          adapter.inviteFriendToLobby(btn.getAttribute('data-fr-invite'));
        });
      });
      this.bindGiftButtons(mount);
    }

    /** 🎁 buttons (Lobby seats & Friends list) open the gift popup. */
    bindGiftButtons(mount) {
      mount.querySelectorAll('[data-gift-room], [data-gift-friend]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          const viaFriend = btn.hasAttribute('data-gift-friend');
          this.showGiftDialog({
            via: viaFriend ? 'friend' : 'room',
            to: btn.getAttribute(viaFriend ? 'data-gift-friend' : 'data-gift-room'),
            name: btn.getAttribute('data-gift-name') || 'player'
          });
        });
      });
    }

    /** Tap a player's name at an online table → their card with Add Friend. */
    showSeatPlayerCard(seatIdx) {
      const g = this.game;
      const p = g && g.players && g.players[seatIdx];
      if (!p || seatIdx === 0) return;
      SH.audio.uiClick();
      const net = SH.networkAdapter;
      const name = String(p.name || '').replace(/ \(Bot\)$/, '');
      if (!p.wasHuman && p.isBot) {
        this.showToast(`🤖 ${name} is a bot — bots can’t be friends.`, 'info');
        return;
      }
      const account = p.account || null;
      const relation = account ? net.friendRelation(account) : 'none';
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll('.choice-overlay').forEach(el => el.remove());
      const overlay = document.createElement('div');
      overlay.className = 'choice-overlay';
      let action;
      if (!account) action = `<p class="player-card-note">${esc(name)} is playing without an online account, so friend requests can’t reach them.</p>`;
      else if (!net.isOnlineAccount()) action = `<p class="player-card-note">Log in with an online account to add friends.</p>`;
      else if (relation === 'friend') action = `<button type="button" class="btn-secondary" disabled>✓ Already friends</button>`;
      else if (relation === 'outgoing') action = `<button type="button" class="btn-secondary" disabled>⏳ Request sent</button>`;
      else if (relation === 'incoming') action = `<button type="button" class="btn-yes" data-pc-add>✓ Accept friend request</button>`;
      else action = `<button type="button" class="btn-yes" data-pc-add>👥 Add Friend</button>`;
      overlay.innerHTML = `
        <div class="choice-card player-card" role="dialog" aria-modal="true" aria-label="${esc(name)}">
          <div class="player-card-avatar">${SH.renderAvatarArt(p.avatar === 'photo' ? 'free_ace' : (p.avatar || 'free_ace'), 72)}</div>
          <h3>${esc(name)}</h3>
          ${account && account.toLowerCase() !== name.toLowerCase() ? `<p>@${esc(account)}</p>` : ''}
          <div class="choice-actions">
            ${action}
            <button type="button" class="btn-no" data-pc-close>Close</button>
          </div>
        </div>
      `;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-pc-close]')) {
          overlay.remove();
          return;
        }
        if (!e.target.closest('[data-pc-add]')) return;
        SH.audio.uiClick();
        overlay.remove();
        if (!net.sendFriendRequestByName(account)) this.showToast('Not connected to the server — friend request not sent.', 'error');
      });
      host.appendChild(overlay);
    }

    /** "X wants to be your friend" with ✓ / ✗ — shows for 8 seconds on any screen, even mid-game. */
    showFriendRequestPopup({ id, username, avatar }) {
      if (typeof document === 'undefined' || !id) return;
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll(`.friend-req-pop[data-from="${CSS.escape(id)}"]`).forEach(el => el.remove());
      const pop = document.createElement('div');
      pop.className = 'friend-req-pop';
      pop.setAttribute('data-from', id);
      pop.setAttribute('role', 'alertdialog');
      pop.innerHTML = `
        <span class="frp-avatar">${SH.renderAvatarArt(avatar === 'photo' ? 'free_ace' : (avatar || 'free_ace'), 36)}</span>
        <span class="frp-text"><strong>${esc(username)}</strong> wants to be your friend</span>
        <button type="button" class="frp-btn frp-yes" data-frp="yes" aria-label="Accept">✓</button>
        <button type="button" class="frp-btn frp-no" data-frp="no" aria-label="Decline">✗</button>
        <span class="frp-timer"></span>
      `;
      const done = () => {
        clearTimeout(pop._timer);
        pop.classList.remove('visible');
        setTimeout(() => pop.remove(), 300);
      };
      pop.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-frp]');
        if (!btn) return;
        e.stopPropagation();
        const accept = btn.getAttribute('data-frp') === 'yes';
        SH.audio.uiClick();
        SH.networkAdapter.respondFriendRequest(id, accept);
        this.showToast(accept ? `🎉 You and ${username} are now friends!` : `Friend request from ${username} declined.`, accept ? 'success' : 'info');
        done();
      });
      host.appendChild(pop);
      SH.audio.coinReward();
      requestAnimationFrame(() => pop.classList.add('visible'));
      // Not answered in 8s → it stays in Friends → Requests
      pop._timer = setTimeout(done, 8000);
    }

    rematchReadyCount() {
      const humans = (SH.networkAdapter.state.seats || []).filter(s => s.role === 'human' || s.role === 'human_self');
      return `${humans.filter(s => s.ready).length}/${humans.length} ready`;
    }

    /** 🔥 Daily login streak popup (once a day, after logging in). */
    maybeShowLoginStreak() {
      if (typeof document === 'undefined' || !SH.networkAdapter.isSignedIn()) return;
      if (this.currentScreen === 'loading' || this.currentScreen === 'login' || this.currentScreen === 'game') return;
      const reward = SH.store.claimLoginStreak();
      if (!reward) return;
      const rewards = SH.store.loginStreakRewards;
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll('.streak-overlay').forEach(el => el.remove());
      const overlay = document.createElement('div');
      overlay.className = 'choice-overlay streak-overlay';
      overlay.innerHTML = `
        <div class="choice-card streak-card" role="dialog" aria-modal="true" aria-label="Daily login streak">
          <h3>🔥 Day ${reward.day} login streak!</h3>
          <p>Come back every day for bigger rewards. Miss a day and it starts again.</p>
          <div class="streak-days">
            ${rewards.map((r, i) => `
              <div class="streak-day ${i + 1 < reward.day ? 'done' : i + 1 === reward.day ? 'today' : ''}">
                <span class="sd-label">Day ${i + 1}</span>
                <span class="sd-prize">🦁 ${r.lions}${r.diamonds ? `<br>💎 ${r.diamonds}` : ''}</span>
                ${i + 1 < reward.day ? '<span class="sd-tick">✓</span>' : ''}
              </div>
            `).join('')}
          </div>
          <p class="streak-won">You got <strong>🦁 ${reward.lions} Lions${reward.diamonds ? ` + 💎 ${reward.diamonds} Diamond` : ''}</strong> today!</p>
          <div class="choice-actions"><button type="button" class="btn-yes" data-streak-close>Collect</button></div>
        </div>
      `;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-streak-close]')) {
          SH.audio.coinReward();
          overlay.remove();
        }
      });
      host.appendChild(overlay);
    }

    /** 📊 Stats card on the Profile screen. */
    renderStatsCard(profile) {
      const s = profile.stats || {};
      const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
      const tile = (icon, label, value, sub) => `
        <div class="stat-tile"><span class="st-icon">${icon}</span><span class="st-value">${value}</span><span class="st-label">${label}</span>${sub ? `<span class="st-sub">${sub}</span>` : ''}</div>`;
      return `
        <div class="mp-card stats-card">
          <div class="section-head"><h3>📊 Your Stats</h3><span>${s.gamesPlayed || 0} games played</span></div>
          <div class="stats-grid">
            ${tile('🏆', 'Win rate', pct(s.gamesWon || 0, s.gamesPlayed || 0), `${s.gamesWon || 0} of ${s.gamesPlayed || 0} games`)}
            ${tile('🎯', 'Bids made', pct(s.bidsMade || 0, s.bidsPlayed || 0), `${s.bidsMade || 0} of ${s.bidsPlayed || 0} bids`)}
            ${tile('🚫', 'Nil success', pct(s.nilsMade || 0, s.nilsTried || 0), `${s.nilsMade || 0} of ${s.nilsTried || 0} Nils`)}
            ${tile('🃏', 'Tricks won', (s.tricksWon || 0).toLocaleString('en-US'), `${s.roundsPlayed || 0} rounds`)}
            ${tile('🔥', 'Best streak', profile.bestStreak || 0, `Now: ${profile.winStreak || 0} in a row`)}
            ${tile('📅', 'Login streak', `Day ${profile.loginStreak || 0}`, 'Come back tomorrow')}
          </div>
        </div>
      `;
    }

    /** 🏆 Leaderboard: top players worldwide & among your friends. */
    showLeaderboard(tab = 'all') {
      if (typeof document === 'undefined') return;
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll('.leaderboard-overlay').forEach(el => el.remove());
      const overlay = document.createElement('div');
      overlay.className = 'choice-overlay leaderboard-overlay';
      overlay.innerHTML = `
        <div class="choice-card leaderboard-card" role="dialog" aria-modal="true" aria-label="Leaderboard">
          <h3>🏆 Leaderboard</h3>
          <div class="lb-tabs">
            <button type="button" class="lb-tab ${tab === 'all' ? 'active' : ''}" data-lb-tab="all">🌍 Everyone</button>
            <button type="button" class="lb-tab ${tab === 'friends' ? 'active' : ''}" data-lb-tab="friends">👥 Friends</button>
          </div>
          <div class="lb-body"><p class="lb-note">Loading…</p></div>
          <div class="choice-actions"><button type="button" class="btn-no" data-lb-close>Close</button></div>
        </div>
      `;
      const body = overlay.querySelector('.lb-body');
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-lb-close]')) { overlay.remove(); return; }
        const t = e.target.closest('[data-lb-tab]');
        if (t) { SH.audio.uiClick(); overlay.remove(); this.showLeaderboard(t.getAttribute('data-lb-tab')); }
      });
      host.appendChild(overlay);
      SH.networkAdapter.getLeaderboard().then((res) => {
        if (!overlay.isConnected) return;
        if (!res.ok) { body.innerHTML = `<p class="lb-note">${esc(res.message)}</p>`; return; }
        const rows = tab === 'friends' ? res.friends : res.top;
        const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
        body.innerHTML = rows.length ? `
          <ol class="lb-list">
            ${rows.map((r, i) => `
              <li class="lb-row ${r.me ? 'me' : ''}">
                <span class="lb-rank">${medal(i)}</span>
                <span class="lb-avatar">${SH.renderAvatarArt(r.avatar === 'photo' ? 'free_ace' : (r.avatar || 'free_ace'), 30)}</span>
                <span class="lb-name">${esc(r.username)}${r.me ? ' <small>(you)</small>' : ''}</span>
                <span class="lb-wins"><strong>${r.gamesWon}</strong> win${r.gamesWon === 1 ? '' : 's'}<small>${r.gamesPlayed ? ` · ${Math.round((r.gamesWon / r.gamesPlayed) * 100)}%` : ''}</small></span>
              </li>`).join('')}
          </ol>
          ${tab === 'all' && res.myRank ? `<p class="lb-note">You are <strong>#${res.myRank}</strong> of ${res.total} players.</p>` : ''}
          ${tab === 'friends' && rows.length < 2 ? '<p class="lb-note">Add friends to compare scores!</p>' : ''}
        ` : '<p class="lb-note">No games played yet — win a game to get on the board!</p>';
      });
    }

    showGiftDialog({ via, to, name }) {
      if (typeof document === 'undefined') return;
      const host = document.querySelector('.android-device-shell') || document.body;
      host.querySelectorAll('.choice-overlay').forEach(el => el.remove());
      const profile = SH.store.getProfile();
      const overlay = document.createElement('div');
      overlay.className = 'choice-overlay';
      overlay.innerHTML = `
        <div class="choice-card gift-card" role="dialog" aria-modal="true" aria-label="Send a gift">
          <h3>🎁 Send a gift to ${esc(name)}</h3>
          <p>You have 🦁 <strong>${profile.coins.toLocaleString('en-US')}</strong> Lions · 💎 <strong>${(profile.diamonds || 0).toLocaleString('en-US')}</strong> Diamonds · no sending limit</p>
          <label class="gift-row">🦁 Lions
            <input type="number" id="gift-lions" inputmode="numeric" min="0" value="0" />
          </label>
          <div class="gift-quick">${[10, 100, 500, 1000, 10000].map(v => `<button type="button" class="chip-btn" data-gift-quick-lions="${v}">+${v.toLocaleString('en-US')}</button>`).join('')}${profile.unlimited ? '' : '<button type="button" class="chip-btn" data-gift-all-lions>All</button>'}</div>
          <label class="gift-row">💎 Diamonds
            <input type="number" id="gift-diamonds" inputmode="numeric" min="0" value="0" />
          </label>
          <div class="gift-quick">${[1, 5, 10, 50, 100].map(v => `<button type="button" class="chip-btn" data-gift-quick-diamonds="${v}">+${v}</button>`).join('')}${profile.unlimited ? '' : '<button type="button" class="chip-btn" data-gift-all-diamonds>All</button>'}</div>
          <div class="choice-actions">
            <button type="button" class="btn-yes" data-gift-send>🎁 Send gift</button>
            <button type="button" class="btn-no" data-gift-cancel>Cancel</button>
          </div>
        </div>
      `;
      const lionsInput = overlay.querySelector('#gift-lions');
      const diamondsInput = overlay.querySelector('#gift-diamonds');
      overlay.querySelectorAll('[data-gift-quick-lions]').forEach(b => b.addEventListener('click', () => {
        lionsInput.value = String(Math.min(profile.coins, (Number(lionsInput.value) || 0) + Number(b.getAttribute('data-gift-quick-lions'))));
      }));
      overlay.querySelectorAll('[data-gift-quick-diamonds]').forEach(b => b.addEventListener('click', () => {
        diamondsInput.value = String(Math.min(profile.diamonds || 0, (Number(diamondsInput.value) || 0) + Number(b.getAttribute('data-gift-quick-diamonds'))));
      }));
      const allLions = overlay.querySelector('[data-gift-all-lions]');
      if (allLions) allLions.addEventListener('click', () => { lionsInput.value = String(profile.coins); });
      const allDiamonds = overlay.querySelector('[data-gift-all-diamonds]');
      if (allDiamonds) allDiamonds.addEventListener('click', () => { diamondsInput.value = String(profile.diamonds || 0); });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-gift-cancel]')) {
          SH.audio.uiClick();
          overlay.remove();
          return;
        }
        if (!e.target.closest('[data-gift-send]')) return;
        const res = SH.networkAdapter.sendGift({ via, to, lions: lionsInput.value, diamonds: diamondsInput.value });
        if (!res.ok) {
          SH.audio.notEnoughFunds();
          this.showToast(res.message, 'error');
          return;
        }
        SH.audio.coinReward();
        overlay.remove();
        this.showToast(`🎁 Sending your gift to ${name}…`, 'info');
      });
      host.appendChild(overlay);
    }

// ------------------------------------------------------------------
    // Profile: photo, name, your avatars & card designs, sell for half price
    // ------------------------------------------------------------------
    renderProfileScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('profile-mount');
      if (!mount) return;
      const profile = SH.store.getProfile();
      const restoreInputs = this.captureInputs(mount);
      const ownedAvatars = SH.AVATARS.filter(a => profile.ownedAvatars.includes(a.id));
      const ownedSkins = SH.CARD_SKINS.filter(s => profile.ownedCardSkins.includes(s.id));
      const sellAvatars = ownedAvatars.filter(a => a.tier !== 'free');
      const sellSkins = ownedSkins.filter(s => s.price > 0);
      const sample = { id: 'AS', suit: 'S', rank: 14, label: 'A', symbol: '♠' };
      const online = SH.networkAdapter.isOnlineAccount();

      mount.innerHTML = `
        <div class="profile-hero">
          <div class="profile-photo-wrap">
            <div class="profile-photo">${SH.renderAvatarSVG(profile.selectedAvatar, 104)}</div>
            <label class="photo-upload-btn" for="photo-input" title="Choose a photo from your gallery">📷</label>
            <input type="file" id="photo-input" accept="image/*" hidden />
          </div>
          <div class="profile-identity">
            <h3>${esc(profile.username)}</h3>
            <span class="account-pill signed-in">🔐 ${online ? 'Online account' : 'Account on this phone'}</span>
            <div class="profile-badges">
              <span class="coin-pill">🦁 <strong>${profile.coins}</strong> Lions</span>
              <span class="coin-pill diamond-pill">💎 <strong>${profile.diamonds || 0}</strong> Diamonds</span>
            </div>
            <div class="profile-badges">
              <span class="stat-pill">🏆 Games won <strong>${profile.stats.gamesWon}/${profile.stats.gamesPlayed}</strong></span>
              <span class="stat-pill">🎯 Rounds won <strong>${profile.stats.roundsWon}/${profile.stats.roundsPlayed}</strong></span>
              <span class="stat-pill">🔥 Best streak <strong>${profile.bestStreak || 0}</strong></span>
            </div>
            ${profile.photo ? '<button type="button" class="chip-btn" id="photo-remove-btn">Remove photo</button>' : '<p class="field-help">Tap 📷 to use a photo from your gallery.</p>'}
          </div>
        </div>

        ${this.renderStatsCard(profile)}

        ${online ? `
        <div class="mp-card security-card">
          <div class="section-head"><h3>🔐 Password &amp; Recovery PIN</h3><span>${SH.networkAdapter.state.me && SH.networkAdapter.state.me.hasPin ? '✅ PIN set' : '⚠️ No PIN yet'}</span></div>
          ${SH.networkAdapter.state.me && !SH.networkAdapter.state.me.hasPin ? '<p class="field-help pin-warning">Set a 4-digit recovery PIN so you can reset your password if you ever forget it.</p>' : ''}
          <form id="pin-form" class="security-form" autocomplete="off">
            <strong>${SH.networkAdapter.state.me && SH.networkAdapter.state.me.hasPin ? 'Change' : 'Set'} recovery PIN</strong>
            <input id="pin-new" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="New 4-digit PIN" required />
            <input id="pin-password" type="password" maxlength="128" placeholder="Your password" autocomplete="current-password" required />
            <button type="submit" class="btn-primary btn-sm">Save PIN</button>
          </form>
          <form id="password-form" class="security-form" autocomplete="off">
            <strong>Change password</strong>
            <input id="pw-old" type="password" maxlength="128" placeholder="Current password" autocomplete="current-password" required />
            <input id="pw-new" type="password" maxlength="128" placeholder="New password (6+ characters)" autocomplete="new-password" required />
            <button type="submit" class="btn-primary btn-sm">Change password</button>
          </form>
        </div>` : ''}

        <div class="mp-card">
          <form id="username-form" class="username-form">
            <label for="username-input"><strong>Your name</strong></label>
            <div class="input-row">
              <input id="username-input" type="text" maxlength="18" value="${esc(profile.username)}" required />
              <button type="submit" class="btn-primary btn-sm">Save</button>
            </div>
            <p class="field-help name-cost">${SH.store.nameChangeCost ? `✏️ Changing your name costs <strong>💎 ${SH.store.nameChangeCost}</strong>` : '✏️ Your first name change is <strong>free</strong> — after that it costs 💎 50'}</p>
            <div id="profile-feedback" class="profile-feedback" role="status" aria-live="polite"></div>
          </form>
        </div>

        <div class="avatar-section">
          <div class="section-head">
            <h3>🙂 My Avatars</h3>
            <button type="button" class="btn-secondary btn-sm" data-nav="shop">🛍 Get more</button>
          </div>
          <div class="avatar-grid">
            ${profile.photo ? `
              <button type="button" class="avatar-card ${profile.selectedAvatar === 'photo' ? 'equipped' : ''}" data-avatar-id="photo">
                <div class="av-art">${SH.renderAvatarSVG('photo', 60)}</div>
                <div class="av-name">My Photo</div>
                <div class="av-status ${profile.selectedAvatar === 'photo' ? 'status-equipped' : 'status-owned'}">${profile.selectedAvatar === 'photo' ? '✓ Using' : 'Use'}</div>
              </button>
            ` : ''}
            ${ownedAvatars.map(av => `
              <button type="button" class="avatar-card ${profile.selectedAvatar === av.id ? 'equipped' : ''}" data-avatar-id="${av.id}">
                <div class="av-art">${SH.renderAvatarSVG(av.id, 60)}</div>
                <div class="av-name">${esc(av.name)}</div>
                <div class="av-status ${profile.selectedAvatar === av.id ? 'status-equipped' : 'status-owned'}">${profile.selectedAvatar === av.id ? '✓ Using' : 'Use'}</div>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="avatar-section card-skin-section">
          <div class="section-head">
            <h3>🃏 My Card Designs</h3>
            <button type="button" class="btn-secondary btn-sm" data-nav="shop">🛍 Get more</button>
          </div>
          <div class="skin-grid">
            ${ownedSkins.map(skin => {
              const inUse = (profile.selectedCardSkin || 'classic') === skin.id;
              return `
                <button type="button" class="skin-card ${inUse ? 'equipped' : ''}" data-skin-id="${skin.id}">
                  <div class="skin-preview" data-card-skin="${skin.id}"><div class="playing-card modern-card suit-S">${SH.renderModernCardInnerHTML(sample)}</div></div>
                  <span class="skin-name">${esc(skin.name)}</span>
                  <span class="skin-price ${inUse ? 'equipped' : 'owned'}">${inUse ? '✓ In use' : 'Use'}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="avatar-section sell-section">
          <div class="section-head">
            <h3>💰 Sell for half price</h3>
            <span>Short on Lions? Sell something you own — you get half of what it cost.</span>
          </div>
          ${sellAvatars.length + sellSkins.length ? `
            <div class="sell-list">
              ${sellAvatars.map(av => `
                <div class="sell-row">
                  <span class="sell-art">${SH.renderAvatarSVG(av.id, 36)}</span>
                  <span class="sell-name">${esc(av.name)}</span>
                  <button type="button" class="btn-secondary btn-sm" data-sell-avatar="${av.id}">Sell · +${Math.floor(av.price / 2)} ${av.currency === 'diamonds' ? '💎' : '🦁'}</button>
                </div>
              `).join('')}
              ${sellSkins.map(skin => `
                <div class="sell-row">
                  <span class="sell-art skin-mini" data-card-skin="${skin.id}"><span class="playing-card modern-card suit-S">${SH.renderModernCardInnerHTML(sample)}</span></span>
                  <span class="sell-name">${esc(skin.name)} cards</span>
                  <button type="button" class="btn-secondary btn-sm" data-sell-skin="${skin.id}">Sell · +${Math.floor(skin.price / 2)} 🦁</button>
                </div>
              `).join('')}
            </div>
          ` : '<p class="field-help">Nothing to sell yet — items you buy in the 🛍 Shop can be sold here for half price.</p>'}
        </div>

        <div class="mp-card profile-logout-card">
          <button type="button" class="btn-no" id="profile-logout-btn">⎋ Sign Out</button>
        </div>
      `;
      restoreInputs();

      // Profile photo from the gallery → resized square JPEG kept on this phone
      const photoInput = mount.querySelector('#photo-input');
      if (photoInput) {
        photoInput.addEventListener('change', () => {
          const file = photoInput.files && photoInput.files[0];
          if (!file) return;
          if (!/^image\//.test(file.type)) return this.showToast('Please choose a photo.', 'error');
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              const size = 256;
              const canvas = document.createElement('canvas');
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d');
              const side = Math.min(img.width, img.height);
              ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
              SH.store.setPhoto(canvas.toDataURL('image/jpeg', 0.85));
              SH.audio.uiClick();
              this.showToast('📷 Profile photo updated!', 'success');
            };
            img.onerror = () => this.showToast('That photo couldn’t be opened — try another.', 'error');
            img.src = reader.result;
          };
          reader.readAsDataURL(file);
        });
      }
      const removePhoto = mount.querySelector('#photo-remove-btn');
      if (removePhoto) removePhoto.addEventListener('click', () => { SH.audio.uiClick(); SH.store.setPhoto(null); });

      const pinForm = mount.querySelector('#pin-form');
      if (pinForm) {
        pinForm.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const pin = mount.querySelector('#pin-new').value.trim();
          if (!/^\d{4}$/.test(pin)) { this.showToast('The PIN must be exactly 4 numbers.', 'error'); return; }
          if (SH.networkAdapter.setRecoveryPin(mount.querySelector('#pin-password').value, pin)) {
            mount.querySelector('#pin-new').value = '';
            mount.querySelector('#pin-password').value = '';
          }
        });
      }
      const pwForm = mount.querySelector('#password-form');
      if (pwForm) {
        pwForm.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const next = mount.querySelector('#pw-new').value;
          if (next.length < 6) { this.showToast('New passwords must be at least 6 characters.', 'error'); return; }
          if (SH.networkAdapter.changePassword(mount.querySelector('#pw-old').value, next)) {
            mount.querySelector('#pw-old').value = '';
            mount.querySelector('#pw-new').value = '';
          }
        });
      }

      const nameForm = mount.querySelector('#username-form');
      if (nameForm) {
        nameForm.addEventListener('submit', (e) => {
          e.preventDefault();
          SH.audio.uiClick();
          const input = mount.querySelector('#username-input');
          const value = (input ? input.value : '').trim();
          if (!value || value.toLowerCase() === String(SH.store.getProfile().username).toLowerCase()) {
            this.showToast('That’s already your name.', 'info');
            return;
          }
          const cost = SH.store.nameChangeCost;
          const diamonds = SH.store.getProfile().diamonds || 0;
          if (cost > diamonds) {
            SH.audio.notEnoughFunds();
            this.showToast(`Changing your name costs 💎 ${cost} — you have ${diamonds}. Earn Diamonds daily and from win streaks.`, 'error');
            return;
          }
          const doRename = () => {
            if (SH.networkAdapter.isOnlineAccount()) {
              // Online accounts own their username; the server checks it isn't taken (💎 only taken once it's accepted)
              if (SH.networkAdapter.renameAccount(value)) {
                this.pendingRename = true;
                const fb = mount.querySelector('#profile-feedback');
                if (fb) fb.textContent = 'Checking username with the server…';
              }
              return;
            }
            const res = SH.store.updateUsername(value);
            if (res.ok) {
              SH.networkAdapter.renameLocalAccount(SH.store.getProfile().username);
              const paid = SH.store.recordNameChange();
              this.showToast(`${res.message}${paid ? ` (−💎 ${paid})` : ' (free change used)'}`, 'success');
            } else {
              this.showToast(res.message, 'error');
            }
          };
          if (!cost) return doRename();
          this.showChoiceDialog({
            title: `Change name to “${value}”?`,
            message: `Name changes cost 💎 ${cost}. You have 💎 ${diamonds}.`,
            actions: [
              { label: `Yes, pay 💎 ${cost}`, tone: 'yes', onClick: doRename },
              { label: 'No', tone: 'no' }
            ]
          });
        });
      }

      const logoutBtn = mount.querySelector('#profile-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.showChoiceDialog({
            title: 'Sign out?',
            message: 'Your 🦁 Lions, 💎 Diamonds, avatars and saved games stay on this phone.',
            actions: [
              { label: 'Yes, sign out', tone: 'yes', onClick: () => { this.signOut(); } },
              { label: 'No, stay', tone: 'no' }
            ]
          });
        });
      }

      mount.querySelectorAll('[data-avatar-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = SH.store.selectOrBuyAvatar(btn.getAttribute('data-avatar-id'));
          SH.audio.uiClick();
          this.showToast(res.message, res.ok ? 'success' : 'error');
        });
      });
      mount.querySelectorAll('[data-skin-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const res = SH.store.selectOrBuyCardSkin(btn.getAttribute('data-skin-id'));
          SH.audio.cardPlay();
          this.showToast(res.message, res.ok ? 'success' : 'error');
        });
      });
      mount.querySelectorAll('[data-sell-avatar], [data-sell-skin]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.uiClick();
          const isAvatar = btn.hasAttribute('data-sell-avatar');
          const id = btn.getAttribute(isAvatar ? 'data-sell-avatar' : 'data-sell-skin');
          const item = isAvatar ? SH.AVATARS.find(a => a.id === id) : SH.CARD_SKINS.find(s => s.id === id);
          const unit = isAvatar && item.currency === 'diamonds' ? '💎' : '🦁';
          this.showChoiceDialog({
            title: `Sell ${item.name}?`,
            message: `You’ll get ${Math.floor(item.price / 2)} ${unit} back (half of ${item.price}). You can buy it again later in the Shop.`,
            actions: [
              {
                label: `Yes, sell for ${Math.floor(item.price / 2)} ${unit}`,
                tone: 'yes',
                onClick: () => {
                  const res = isAvatar ? SH.store.sellAvatar(id) : SH.store.sellCardSkin(id);
                  if (res.ok) SH.audio.coinReward();
                  this.showToast(res.message, res.ok ? 'success' : 'error');
                }
              },
              { label: 'No, keep it', tone: 'no' }
            ]
          });
        });
      });
    }

    signOut() {
      if (this.isOnlineGame()) this.game = null;
      this.onlineSnapshot = null;
      this.onlineView = null;
      SH.networkAdapter.logout();
      try { sessionStorage.removeItem(SCREEN_SESSION_KEY); } catch (e) { /* ignore */ }
      this.navigateTo('login');
    }

    // ------------------------------------------------------------------
    // Shop: avatars & card designs
    // ------------------------------------------------------------------
    renderShopScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('shop-mount');
      if (!mount) return;
      const profile = SH.store.getProfile();
      const sample = [{ id: 'AS', suit: 'S', rank: 14, label: 'A', symbol: '♠' }, { id: 'KH', suit: 'H', rank: 13, label: 'K', symbol: '♥' }];
      const tierInfo = [
        { tier: 'classic', title: '🙂 Classic Avatars', note: 'Fun characters — 30 🦁 each', ribbon: 'CLASSIC', cls: 'classic-card' },
        { tier: 'legendary', title: '👑 Legendary Avatars', note: '60 – 100 🦁', ribbon: 'LEGENDARY', cls: 'legendary-card' },
        { tier: 'mythic', title: '✨ Mythic Avatars', note: '150 – 1,000 🦁 — the rarest looks', ribbon: 'MYTHIC', cls: 'legendary-card mythic-card' },
        { tier: 'diamond', title: '💎 Diamond Avatars', note: 'Bought with 💎 — earn them daily and from win streaks', ribbon: 'DIAMOND', cls: 'legendary-card diamond-card' }
      ];
      const avatarCard = (av, ribbon, cls) => {
        const owned = profile.ownedAvatars.includes(av.id);
        const balance = av.currency === 'diamonds' ? (profile.diamonds || 0) : profile.coins;
        const unit = av.currency === 'diamonds' ? '💎' : '🦁';
        return `
          <button type="button" class="avatar-card ${cls} ${owned ? 'owned-item' : balance < av.price ? 'unaffordable' : ''}" data-shop-avatar="${av.id}">
            <span class="leg-ribbon">${ribbon}</span>
            <div class="av-art">${SH.renderAvatarSVG(av.id, 64)}</div>
            <div class="av-name">${esc(av.name)}</div>
            <div class="av-status ${owned ? 'status-owned' : balance >= av.price ? 'status-buy' : 'status-locked'}">${owned ? '✓ Owned' : `${av.price} ${unit}`}</div>
          </button>
        `;
      };

      mount.innerHTML = `
        <div class="shop-balance-bar">
          <span class="coin-pill">🦁 <strong>${profile.coins}</strong> Lions</span>
          <span class="coin-pill diamond-pill">💎 <strong>${profile.diamonds || 0}</strong> Diamonds</span>
          <button type="button" class="btn-secondary btn-sm" data-nav="profile">👑 My Profile</button>
        </div>

        ${[
          { title: '🎨 Table Colours', note: 'Change the felt on every table you play', list: SH.TABLE_THEMES.filter(t => !t.vip) },
          { title: '💎 VIP Tables', note: 'Luxury tables bought with Diamonds', list: SH.TABLE_THEMES.filter(t => t.vip), vip: true }
        ].map(sec => `
        <div class="avatar-section table-theme-section ${sec.vip ? 'vip-theme-section' : ''}">
          <div class="section-head">
            <h3>${sec.title}</h3>
            <span>${sec.note}</span>
          </div>
          <div class="theme-grid">
            ${sec.list.map(t => {
              const owned = profile.ownedTableThemes.includes(t.id);
              const inUse = (profile.selectedTableTheme || 'emerald') === t.id;
              const dia = t.currency === 'diamonds';
              const balance = dia ? (profile.diamonds || 0) : profile.coins;
              return `
                <button type="button" class="theme-card ${t.vip ? 'vip-theme' : ''} ${inUse ? 'in-use' : ''} ${owned ? 'owned-item' : balance < t.price ? 'unaffordable' : ''}" data-shop-theme="${t.id}">
                  ${t.vip ? '<span class="leg-ribbon vip-ribbon">VIP</span>' : ''}
                  <span class="theme-swatch" data-table-swatch="${t.id}" style="--sw1:${t.swatch[0]};--sw2:${t.swatch[1]}"><span>♠</span></span>
                  <span class="skin-name">${esc(t.name)}</span>
                  <span class="skin-desc">${esc(t.desc)}</span>
                  <span class="skin-price ${owned ? 'owned' : ''}">${inUse ? '✓ In use' : owned ? 'Owned — tap to use' : `${t.price.toLocaleString('en-US')} ${dia ? '💎' : '🦁'}`}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
        `).join('')}

        <div class="avatar-section card-skin-section">
          <div class="section-head">
            <h3>🃏 Card Designs</h3>
            <span>Premium decks for every table</span>
          </div>
          <div class="skin-grid">
            ${SH.CARD_SKINS.filter(s => s.price > 0).map(skin => {
              const owned = profile.ownedCardSkins.includes(skin.id);
              return `
                <button type="button" class="skin-card ${owned ? 'owned-item' : profile.coins < skin.price ? 'unaffordable' : ''}" data-shop-skin="${skin.id}">
                  <div class="skin-preview" data-card-skin="${skin.id}">
                    ${sample.map(c => `<div class="playing-card modern-card suit-${c.suit}">${SH.renderModernCardInnerHTML(c)}</div>`).join('')}
                  </div>
                  <span class="skin-name">${esc(skin.name)}</span>
                  <span class="skin-desc">${esc(skin.desc)}</span>
                  <span class="skin-price ${owned ? 'owned' : ''}">${owned ? '✓ Owned' : `${skin.price.toLocaleString('en-US')} 🦁`}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        ${tierInfo.map(t => `
          <div class="avatar-section ${t.tier}-section">
            <div class="section-head"><h3>${t.title}</h3><span>${t.note}</span></div>
            <div class="avatar-grid">
              ${SH.AVATARS.filter(a => a.tier === t.tier).map(av => avatarCard(av, t.ribbon, t.cls)).join('')}
            </div>
          </div>
        `).join('')}

        <div class="avatar-section gift-user-section">
          <div class="section-head"><h3>🎁 Send a Gift</h3><span>Send Lions, Diamonds or both to any Spades Royale player</span></div>
          <form class="gift-user-form" id="gift-user-form" autocomplete="off">
            <input type="text" id="gift-user-name" maxlength="24" placeholder="Enter their username" aria-label="Username" spellcheck="false" autocapitalize="off" />
            <button type="submit" class="btn-primary" id="gift-user-check">Check player</button>
          </form>
          <p class="gift-user-status" id="gift-user-status" aria-live="polite"></p>
        </div>
      `;

      const giftForm = mount.querySelector('#gift-user-form');
      if (giftForm) {
        giftForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const input = mount.querySelector('#gift-user-name');
          const status = mount.querySelector('#gift-user-status');
          const checkBtn = mount.querySelector('#gift-user-check');
          const name = input.value.trim();
          SH.audio.uiClick();
          status.className = 'gift-user-status';
          status.textContent = 'Checking…';
          checkBtn.disabled = true;
          SH.networkAdapter.lookupUser(name).then((res) => {
            checkBtn.disabled = false;
            if (!res.ok) {
              status.className = 'gift-user-status bad';
              status.textContent = res.message;
              return;
            }
            if (!res.found) {
              SH.audio.notEnoughFunds();
              status.className = 'gift-user-status bad';
              status.textContent = `✗ No Spades Royale player called “${name}”. Check the spelling.`;
              return;
            }
            if (res.self) {
              status.className = 'gift-user-status bad';
              status.textContent = 'That’s you! Enter someone else’s username.';
              return;
            }
            status.className = 'gift-user-status good';
            status.textContent = `✓ ${res.user.username} is a Spades Royale player.`;
            this.showGiftDialog({ via: 'username', to: res.user.username, name: res.user.username });
          });
        });
      }

      const pick = (kind, id) => (kind === 'avatar' ? SH.store.selectOrBuyAvatar(id) : kind === 'theme' ? SH.store.selectOrBuyTableTheme(id) : SH.store.selectOrBuyCardSkin(id));
      const buy = (kind, id) => {
        const item = kind === 'avatar' ? SH.AVATARS.find(a => a.id === id) : kind === 'theme' ? SH.TABLE_THEMES.find(t => t.id === id) : SH.CARD_SKINS.find(s => s.id === id);
        const owned = kind === 'avatar' ? profile.ownedAvatars.includes(id) : kind === 'theme' ? profile.ownedTableThemes.includes(id) : profile.ownedCardSkins.includes(id);
        if (owned) {
          const res = pick(kind, id);
          SH.audio.uiClick();
          this.showToast(res.message, 'success');
          return;
        }
        const unit = item.currency === 'diamonds' ? '💎' : '🦁';
        const balance = unit === '💎' ? (profile.diamonds || 0) : profile.coins;
        if (balance < item.price) {
          SH.audio.notEnoughFunds();
          this.showToast(`You need ${item.price - balance} more ${unit} for “${item.name}”.`, 'error');
          return;
        }
        this.showChoiceDialog({
          title: `Buy ${item.name}?`,
          message: `Costs ${item.price} ${unit}. You have ${balance} ${unit}.`,
          actions: [
            {
              label: `Yes, buy for ${item.price} ${unit}`,
              tone: 'yes',
              onClick: () => {
                const res = pick(kind, id);
                if (res.ok) SH.audio.coinReward(); else SH.audio.notEnoughFunds();
                this.showToast(res.message, res.ok ? 'success' : 'error');
              }
            },
            { label: 'No', tone: 'no' }
          ]
        });
      };
      mount.querySelectorAll('[data-shop-avatar]').forEach(btn => btn.addEventListener('click', () => buy('avatar', btn.getAttribute('data-shop-avatar'))));
      mount.querySelectorAll('[data-shop-skin]').forEach(btn => btn.addEventListener('click', () => buy('skin', btn.getAttribute('data-shop-skin'))));
      mount.querySelectorAll('[data-shop-theme]').forEach(btn => btn.addEventListener('click', () => buy('theme', btn.getAttribute('data-shop-theme'))));
    }

    renderSettingsScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('settings-mount');
      if (!mount) return;
      const s = SH.store.getSettings();
      const levels = [
        { id: 'Beginner', desc: 'Beginner — Relaxed bidding & basic card play' },
        { id: 'Easy', desc: 'Easy — ~8% stronger; tracks high cards & partner tricks' },
        { id: 'Medium', desc: 'Medium — ~8% stronger; bids Nil & cashes boss winners' },
        { id: 'Hard', desc: 'Hard — ~8% stronger; full card memory, Nil defense & bag control' },
        { id: 'Impossible', desc: 'Impossible — Maximum fair strategy (suit-void inference, zero cheating)' }
      ];

      const savedCount = (this.getResumableOfflineGame() ? 1 : 0) + (this.getResumableLocalGame() ? 1 : 0);

      const profile = SH.store.getProfile();
      const signedIn = SH.networkAdapter.isSignedIn();
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const dailyDone = profile.lastDailyDiamond === todayKey;

      mount.innerHTML = `
        <div class="settings-account-card">
          <div class="sa-avatar">${SH.renderAvatarSVG(profile.selectedAvatar, 64)}</div>
          <div class="sa-info">
            <strong>${esc(profile.username)}</strong>
            <span>${signedIn ? '🔐 Signed in' : '👤 Guest on this device'}</span>
            <div class="sa-balances">
              <span class="coin-pill">🦁 <strong>${profile.coins}</strong> Lions</span>
              <span class="coin-pill diamond-pill">💎 <strong>${profile.diamonds || 0}</strong> Diamonds</span>
            </div>
            <span class="sa-daily">${dailyDone ? '✅ Daily 💎 collected — come back tomorrow for another' : '💎 Open the game each day for +1 Diamond'}</span>
          </div>
          <div class="sa-actions">
            ${signedIn
              ? '<button type="button" class="btn-no btn-sm" id="settings-signout-btn">⎋ Sign Out</button>'
              : '<button type="button" class="btn-primary btn-sm" data-nav="login">Log In</button>'}
            <button type="button" class="btn-secondary btn-sm" data-nav="shop">🛍 Shop</button>
          </div>
        </div>

        <div class="settings-card settings-section">
          <h3>🎮 Game</h3>
          <p class="field-help">Saved automatically. Used for offline games, Pass &amp; Play and rooms you host.</p>

          <div class="setting-row">
            <div>
              <h4>Winning Target Score</h4>
              <p>Rounds keep going until a team (or player) reaches this score. Win prize: +50 🦁 at 250, +80 🦁 at 500.</p>
            </div>
            <div class="segmented-control" role="group" aria-label="Target Score">
              <button type="button" class="seg-btn ${s.targetScore === 250 ? 'active' : ''}" data-set-target="250">250 Points</button>
              <button type="button" class="seg-btn ${s.targetScore === 500 ? 'active' : ''}" data-set-target="500">500 Points</button>
            </div>
          </div>

          <div class="setting-row setting-col">
            <div>
              <h4>Bot Difficulty</h4>
              <p>Bots only use fair, public information (their own hand, bids and played cards) — they never peek at your cards.</p>
            </div>
            <div class="difficulty-selector">
              ${levels.map(lvl => `
                <button
                  type="button"
                  class="diff-option ${s.botDifficulty === lvl.id ? 'selected' : ''}"
                  data-set-diff="${lvl.id}"
                >
                  <span class="diff-name">${lvl.id}</span>
                  <span class="diff-desc">${lvl.desc}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="setting-row setting-col">
            <div>
              <h4>Game Speed</h4>
              <p>How long bots take to bid and play, and how long a finished trick stays on the table.</p>
            </div>
            <div class="segmented-control" role="group" aria-label="Game Speed">
              ${['relaxed', 'normal', 'fast'].map(id => `
                <button type="button" class="seg-btn ${(s.gameSpeed || 'normal') === id ? 'active' : ''}" data-set-speed="${id}">${SH.GAME_SPEEDS[id].label}</button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="settings-card settings-section">
          <h3>🃏 Card Design</h3>
          <p class="field-help">Tap a design you own to use it. Buy more in <strong>Profile &amp; Shop</strong>.</p>
          <div class="settings-skin-row">
            ${SH.CARD_SKINS.map(skin => {
              const owned = profile.ownedCardSkins.includes(skin.id);
              const inUse = (profile.selectedCardSkin || 'classic') === skin.id;
              return `
                <button type="button" class="settings-skin ${inUse ? 'in-use' : ''} ${owned ? '' : 'locked'}" data-settings-skin="${skin.id}" title="${esc(skin.name)}">
                  <span class="settings-skin-card" data-card-skin="${skin.id}">
                    <span class="playing-card modern-card suit-S">${SH.renderModernCardInnerHTML({ id: 'AS', suit: 'S', rank: 14, label: 'A', symbol: '♠' })}</span>
                  </span>
                  <span class="settings-skin-name">${owned ? (inUse ? '✓ ' : '') : '🔒 '}${esc(skin.name)}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="settings-card settings-section">
          <h3>🔊 Sound &amp; Feel</h3>

          <div class="setting-row">
            <div>
              <h4>Sound Effects</h4>
              <p>Soft paper card swoosh, trick wins, Lions &amp; Diamond chimes.</p>
            </div>
            <button type="button" class="toggle-switch ${s.sound ? 'on' : 'off'}" id="toggle-sound-btn" aria-pressed="${s.sound}">
              ${s.sound ? 'ON' : 'OFF'}
            </button>
          </div>

          <div class="setting-row">
            <div>
              <h4>Calming Background Sounds</h4>
              <p>Relaxing sound while you play.</p>
            </div>
            <button type="button" class="toggle-switch ${s.music ? 'on' : 'off'}" id="toggle-music-btn" aria-pressed="${s.music}">
              ${s.music ? 'ON' : 'OFF'}
            </button>
          </div>
          <div class="setting-row setting-col">
            <div class="segmented-control ambience-picker" role="group" aria-label="Background sound">
              ${[['lounge', '🎷 Lounge'], ['rain', '🌧 Soft Rain'], ['ocean', '🌊 Ocean'], ['piano', '🎹 Piano']].map(([id, label]) => `
                <button type="button" class="seg-btn ${(s.ambience || 'lounge') === id ? 'active' : ''}" data-set-ambience="${id}">${label}</button>
              `).join('')}
            </div>
            <label class="volume-row">🔉 <input type="range" id="music-volume" min="0" max="100" value="${Math.round((s.musicVolume === undefined ? 0.6 : s.musicVolume) * 100)}" aria-label="Background sound volume" /> 🔊</label>
          </div>

          <div class="setting-row">
            <div>
              <h4>Vibration</h4>
              <p>Gentle buzzes when cards are played, tricks are won and gifts arrive.</p>
            </div>
            <button type="button" class="toggle-switch ${s.haptics !== false ? 'on' : 'off'}" id="toggle-haptics-btn" aria-pressed="${s.haptics !== false}">
              ${s.haptics !== false ? 'ON' : 'OFF'}
            </button>
          </div>

          <div class="setting-row">
            <div>
              <h4>Reduced Motion</h4>
              <p>Minimizes card animations and speeds up transitions.</p>
            </div>
            <button type="button" class="toggle-switch ${s.reducedMotion ? 'on' : 'off'}" id="toggle-motion-btn" aria-pressed="${s.reducedMotion}">
              ${s.reducedMotion ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div class="settings-card settings-section">
          <h3>💾 Saved Games</h3>
          <div class="setting-row">
            <div>
              <h4>Unfinished games on this phone</h4>
              <p>${savedCount ? `${savedCount} saved game${savedCount > 1 ? 's' : ''} — resume or rename ${savedCount > 1 ? 'them' : 'it'} from Home.` : 'Nothing saved right now.'}</p>
            </div>
            <button type="button" class="btn-secondary btn-sm" id="delete-saved-games-btn" ${savedCount ? '' : 'disabled'}>🗑 Delete All</button>
          </div>
        </div>

        <div class="settings-card settings-section settings-about">
          <div class="royale-logo about-logo" role="img" aria-label="Spades Royale"></div>
          <div>
            <h3>Spades Royale</h3>
            <p class="field-help">Offline Multiplayer · Play. Win. Rule.<br/>Made by Hadzz · Version 1.0</p>
            <button type="button" class="btn-secondary btn-sm" data-nav="rules">📖 How to play &amp; scoring</button>
          </div>
        </div>
      `;

      mount.querySelectorAll('[data-set-target]').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = Number(btn.getAttribute('data-set-target'));
          SH.store.updateSettings({ targetScore: val });
          if (this.game) this.game.targetScore = val;
          SH.audio.uiClick();
          this.showToast(`Winning target score set to ${val} points.`, 'success');
        });
      });

      mount.querySelectorAll('[data-set-speed]').forEach(btn => {
        btn.addEventListener('click', () => {
          const speed = btn.getAttribute('data-set-speed');
          SH.store.updateSettings({ gameSpeed: speed });
          if (this.localMatch) this.localMatch.setSpeed(speed);
          SH.audio.uiClick();
          this.showToast(`Game speed set to ${SH.getGameSpeed(speed).label}.`, 'success');
        });
      });

      const signOutBtn = mount.querySelector('#settings-signout-btn');
      if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
          SH.audio.uiClick();
          this.showChoiceDialog({
            title: 'Sign out?',
            message: 'You can log back in any time. Your 🦁 Lions, 💎 Diamonds, avatars and saved games stay on this device.',
            actions: [
              {
                label: 'Yes, sign out',
                tone: 'yes',
                onClick: () => this.signOut()
              },
              { label: 'No, stay signed in', tone: 'no' }
            ]
          });
        });
      }

      const deleteSavedBtn = mount.querySelector('#delete-saved-games-btn');
      if (deleteSavedBtn) {
        deleteSavedBtn.addEventListener('click', () => {
          if (!this.confirmDelete('Delete all unfinished games saved on this device? This can’t be undone.')) return;
          SH.audio.uiClick();
          this.deleteOfflineGame();
          this.deleteLocalGame();
          this.renderSettingsScreen();
          this.showToast('All saved games deleted.', 'info');
        });
      }

      mount.querySelectorAll('[data-set-diff]').forEach(btn => {
        btn.addEventListener('click', () => {
          const diff = btn.getAttribute('data-set-diff');
          SH.store.updateSettings({ botDifficulty: diff });
          if (this.game) this.game.difficulty = diff;
          SH.audio.uiClick();
          this.showToast(`Bot difficulty set to ${diff}.`, 'success');
        });
      });

      const soundBtn = mount.querySelector('#toggle-sound-btn');
      if (soundBtn) {
        soundBtn.addEventListener('click', () => {
          const next = !SH.store.getSettings().sound;
          SH.store.updateSettings({ sound: next });
          if (next) SH.audio.uiClick();
          this.showToast(`Sound effects turned ${next ? 'ON' : 'OFF'}.`, 'info');
        });
      }

      const musicBtn = mount.querySelector('#toggle-music-btn');
      if (musicBtn) {
        musicBtn.addEventListener('click', () => {
          SH.audio.ensureContext();
          const next = !SH.store.getSettings().music;
          SH.store.updateSettings({ music: next });
          SH.audio.uiClick();
          this.showToast(`Background music turned ${next ? 'ON' : 'OFF'}.`, 'info');
        });
      }

      mount.querySelectorAll('[data-set-ambience]').forEach(btn => {
        btn.addEventListener('click', () => {
          SH.audio.ensureContext();
          const ambience = btn.getAttribute('data-set-ambience');
          SH.store.updateSettings({ ambience, music: true });
          SH.audio.uiClick();
          this.showToast(`Background sound: ${btn.textContent.trim()}`, 'success');
        });
      });
      const volume = mount.querySelector('#music-volume');
      if (volume) {
        volume.addEventListener('change', () => SH.store.updateSettings({ musicVolume: Number(volume.value) / 100 }));
        volume.addEventListener('input', () => SH.audio.applySettings({ ...SH.store.getSettings(), musicVolume: Number(volume.value) / 100 }));
      }

      const hapticsBtn = mount.querySelector('#toggle-haptics-btn');
      if (hapticsBtn) {
        hapticsBtn.addEventListener('click', () => {
          const next = SH.store.getSettings().haptics === false;
          SH.store.updateSettings({ haptics: next });
          if (next) SH.audio.vibrate(30);
          SH.audio.uiClick();
          this.showToast(`Vibration turned ${next ? 'ON' : 'OFF'}.`, 'info');
        });
      }

      mount.querySelectorAll('[data-settings-skin]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-settings-skin');
          if (!SH.store.getProfile().ownedCardSkins.includes(id)) {
            SH.audio.uiClick();
            this.navigateTo('profile');
            setTimeout(() => {
              const sec = document.querySelector('.card-skin-section');
              if (sec) sec.scrollIntoView({ behavior: 'smooth' });
            }, 50);
            return;
          }
          const res = SH.store.selectOrBuyCardSkin(id);
          SH.audio.cardPlay();
          this.showToast(res.message, 'success');
        });
      });

      const motionBtn = mount.querySelector('#toggle-motion-btn');
      if (motionBtn) {
        motionBtn.addEventListener('click', () => {
          const next = !SH.store.getSettings().reducedMotion;
          SH.store.updateSettings({ reducedMotion: next });
          SH.audio.uiClick();
          this.showToast(`Reduced motion turned ${next ? 'ON' : 'OFF'}.`, 'info');
        });
      }
    }

    renderRulesScreen() {
      if (typeof document === 'undefined') return;
      const mount = document.getElementById('rules-mount');
      if (!mount) return;

      mount.innerHTML = `
        <div class="rules-grid">
          <div class="mp-card">
            <h3>♠ Seating, Deal &amp; Legal Play</h3>
            <ul class="rules-list">
              <li><strong>Four Seats &amp; Partnerships:</strong> You sit South paired with North (<strong>Team Blue</strong>). Your opponents sit West and East (<strong>Team Red</strong>). Partners always sit opposite each other.</li>
              <li><strong>The Deal:</strong> All 52 cards are dealt evenly—<strong>13 cards</strong> to each player.</li>
              <li><strong>Following Suit:</strong> Players must follow the led suit if they hold a card of that suit. If void in the led suit, a player may play any card, including a trump Spade.</li>
              <li><strong>Spades Are Trump:</strong> Spades outrank all other suits. However, <strong>Spades cannot be led until broken</strong> (played on a previous trick), unless a player holds <em>only</em> Spades in their hand.</li>
              <li><strong>Winning a Trick:</strong> The highest card of the led suit wins the trick, unless one or more Spades are played—then the highest Spade wins. The trick winner leads the next trick.</li>
            </ul>
          </div>

          <div class="mp-card">
            <h3>📊 Bidding (0–10), Nil &amp; Bags Scoring</h3>
            <ul class="rules-list">
              <li><strong>Bids (0 to 10):</strong> Each player bids from 0 to 10 tricks at the start of a round. Partner bids are combined to form the team's contract.</li>
              <li><strong>Making Contract:</strong> Winning at least your team's combined non-nil bid scores <strong>10 points per bid trick</strong>, plus <strong>+1 point</strong> for each overtrick (called a <strong>Bag</strong>).</li>
              <li><strong>Being Set (Undertricks):</strong> If a team wins fewer tricks than its combined non-nil contract, the team loses <strong>-10 points per bid trick</strong> (and collects 0 bags).</li>
              <li><strong>Nil Bid (0 Tricks):</strong> A bid of 0 is scored individually. If the Nil bidder takes <strong>0 tricks</strong>, their team earns <strong>+100 bonus points</strong>. If they win even 1 trick, the team is penalized <strong>-100 points</strong> and any tricks won by the Nil bidder count as bags.</li>
              <li><strong>10-Bag Penalty:</strong> Bags carry over across rounds. Accumulating <strong>10 cumulative bags</strong> triggers an immediate <strong>-100 point penalty</strong> (and resets 10 bags).</li>
              <li><strong>Winning the Game:</strong> Play continues by round until at least one team reaches the target score (<strong>250 or 500 points</strong>, configurable in Settings). If both teams pass the target tied, an overtime round breaks the tie.</li>
            </ul>
          </div>

          <div class="mp-card">
            <h3>🦁 Lions, 💎 Diamonds &amp; Fair Bot AI</h3>
            <ul class="rules-list">
              <li><strong>Starting Balance:</strong> Every player starts with <strong>60 🦁 Lions</strong> (the game’s coins).</li>
              <li><strong>What is a Round?</strong> A <em>Round</em> is one complete 13-trick hand. If Team Blue scores more net points than Team Red (with a positive round score), you earn <strong>+10 🦁 Lions</strong>.</li>
              <li><strong>Full Game Victory:</strong> Reaching the target score ahead of Team Red awards <strong>+50 🦁</strong> in a 250-point game or <strong>+80 🦁</strong> in a 500-point game.</li><li><strong>💎 Diamonds:</strong> +1 every day you open the game, +2 for every 2 wins at 250 points and +5 for every 2 wins at 500 points. Spend them on Diamond avatars. Each round and match has a unique ID so duplicate rewards are prevented.</li>
              <li><strong>Fair Bot Difficulty:</strong> Choose <em>Beginner, Easy, Medium, Hard,</em> or <em>Impossible</em>. Bots only know their own hand, bids, and cards already played—they never peek at hidden hands.</li>
            </ul>
          </div>
        </div>
      `;
    }
  }

  SH.SpadesApp = SpadesApp;

  function bootSpadesApp() {
    if (window.spadesApp) return;
    const app = new SpadesApp();
    window.spadesApp = app;
    app.init();
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', bootSpadesApp);
    } else {
      bootSpadesApp();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
