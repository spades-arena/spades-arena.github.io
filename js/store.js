/**
 * Spades Royale - Persistent Local Storage Store
 * Manages profile, 🦁 Lions (the coin currency, starting at 50), 💎 Diamonds (starting at 5), avatar &
 * card-design ownership, profile photo, entry fees, daily / win bonuses, gifts, the anti-duplicate
 * reward ledger, and settings. (Internally the Lions balance is stored as `coins`.)
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});
  // v2 = fresh start for everyone (new balances: 50 🦁 + 5 💎)
  const STORAGE_KEY = 'spades_royale_state_v2';
  const UNLIMITED_BALANCE = 999999999;
  const NAME_CHANGE_DIAMONDS = 50;
  // Saved on the server for online accounts so purchases & progress follow you to every device
  const SYNC_FIELDS = [
    'coins', 'diamonds', 'selectedAvatar', 'ownedAvatars', 'ownedCardSkins', 'selectedCardSkin',
    'ownedTableThemes', 'selectedTableTheme', 'winStreak', 'bestStreak', 'winsAt250', 'winsAt500',
    'stats', 'loginStreak', 'lastLoginDay', 'lastDailyDiamond', 'nameChanges'
  ];
  const LOGIN_STREAK_REWARDS = [
    { lions: 10, diamonds: 0 }, { lions: 20, diamonds: 0 }, { lions: 30, diamonds: 0 }, { lions: 40, diamonds: 0 },
    { lions: 60, diamonds: 0 }, { lions: 80, diamonds: 0 }, { lions: 100, diamonds: 1 }
  ];
  const ENTRY_FEE = 2; // 🦁 to play a game; returned when you win

  function todayKey(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function getDefaultFreeIds() {
    return (SH.AVATARS || []).filter(a => a.tier === 'free').map(a => a.id);
  }

  function createDefaultState() {
    return {
      profile: {
        username: 'HadzzPlayer',
        selectedAvatar: 'free_ace',
        coins: 50, // 🦁 Lions
        diamonds: 5, // 💎 Diamonds
        photo: null, // profile picture (small JPEG data URL) chosen from the gallery
        winStreak: 0,
        bestStreak: 0,
        ownedAvatars: getDefaultFreeIds(),
        ownedCardSkins: ['classic'],
        selectedCardSkin: 'classic',
        ownedTableThemes: ['emerald'],
        selectedTableTheme: 'emerald',
        nameChanges: 0, // first name change is free, then 💎 NAME_CHANGE_DIAMONDS each
        loginStreak: 0, // consecutive days opened (1–7, then starts a new week)
        lastLoginDay: todayKey(), // new players start with exactly 50 🦁; the streak begins tomorrow
        lastDailyDiamond: todayKey(), // 'YYYY-MM-DD' of the last daily +1 💎 (new players start at exactly 5 💎)
        winsAt250: 0, // full-game wins at each target (every 2 → diamond bonus)
        winsAt500: 0,
        stats: {
          roundsPlayed: 0,
          roundsWon: 0,
          gamesPlayed: 0,
          gamesWon: 0,
          bidsPlayed: 0, // rounds you bid a number (not Nil)
          bidsMade: 0,
          nilsTried: 0,
          nilsMade: 0,
          tricksWon: 0
        },
        rewardedIds: [] // Prevents duplicate coin awards for the same roundId or gameId
      },
      settings: {
        targetScore: 500, // 250 or 500
        botDifficulty: 'Medium', // Beginner, Easy, Medium, Hard, Impossible
        gameSpeed: 'normal', // relaxed, normal, fast
        sound: true,
        haptics: true, // vibration feedback
        music: false,
        ambience: 'lounge', // calming background: lounge | rain | ocean | piano
        musicVolume: 0.6,
        reducedMotion: false
      }
    };
  }

  class AppStore {
    constructor() {
      this.state = this.load();
      this.listeners = new Set();
    }

    load() {
      try {
        if (typeof localStorage === 'undefined') return createDefaultState();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultState();
        const parsed = JSON.parse(raw);
        const def = createDefaultState();
        const owned = Array.from(new Set([...getDefaultFreeIds(), ...(parsed.profile?.ownedAvatars || [])]));
        return {
          profile: {
            ...def.profile,
            ...(parsed.profile || {}),
            ownedAvatars: owned,
            ownedCardSkins: Array.from(new Set(['classic', ...(parsed.profile?.ownedCardSkins || [])])),
            ownedTableThemes: Array.from(new Set(['emerald', ...(parsed.profile?.ownedTableThemes || [])])),
            stats: { ...def.profile.stats, ...(parsed.profile?.stats || {}) },
            rewardedIds: Array.isArray(parsed.profile?.rewardedIds) ? parsed.profile.rewardedIds.slice(-200) : []
          },
          settings: {
            ...def.settings,
            ...(parsed.settings || {})
          }
        };
      } catch (e) {
        return createDefaultState();
      }
    }

    save() {
      const p = this.state.profile;
      if (p.unlimited) { p.coins = UNLIMITED_BALANCE; p.diamonds = UNLIMITED_BALANCE; } // owner account never runs out
      if (!this.applyingRemote) { p.syncDirty = true; p.changeSeq = (p.changeSeq || 0) + 1; } // needs uploading (online accounts)
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        }
      } catch (e) {
        // Ignore quota errors in restricted browsing modes
      }
      this.listeners.forEach(fn => fn(this.state));
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    getProfile() {
      return this.state.profile;
    }

    getSettings() {
      return this.state.settings;
    }

    // ------------------------------------------------------------ sync between devices (online accounts)

    /** The parts of the profile that follow your account to every device. */
    exportSyncProfile() {
      const p = this.state.profile;
      const out = {};
      for (const k of SYNC_FIELDS) if (p[k] !== undefined) out[k] = p[k];
      if (p.unlimited) {
        const real = p.balanceBeforeUnlimited || { coins: 50, diamonds: 5 };
        out.coins = real.coins;
        out.diamonds = real.diamonds;
      }
      out.selectedAvatar = p.selectedAvatar === 'photo' ? (p.lastNonPhotoAvatar || 'free_ace') : p.selectedAvatar;
      out.rewardedIds = (p.rewardedIds || []).slice(-60);
      return out;
    }

    realBalance() {
      const p = this.state.profile;
      const r = p.unlimited ? (p.balanceBeforeUnlimited || { coins: 50, diamonds: 5 }) : p;
      return { coins: Number(r.coins) || 0, diamonds: Number(r.diamonds) || 0 };
    }

    setRealBalance(coins, diamonds) {
      const p = this.state.profile;
      coins = Math.max(0, Math.floor(coins));
      diamonds = Math.max(0, Math.floor(diamonds));
      if (p.unlimited) p.balanceBeforeUnlimited = { coins, diamonds };
      else { p.coins = coins; p.diamonds = diamonds; }
    }

    saveRemote() {
      this.applyingRemote = true;
      try { this.save(); } finally { this.applyingRemote = false; }
    }

    /** Copies the account's saved fields onto this device (no upload needed afterwards). */
    copyFields(data) {
      const p = this.state.profile;
      const keepPhoto = p.selectedAvatar === 'photo' && p.photo;
      for (const k of SYNC_FIELDS) {
        if (data[k] === undefined || k === 'coins' || k === 'diamonds') continue;
        if (Array.isArray(p[k]) !== Array.isArray(data[k])) continue;
        p[k] = k === 'stats' ? { ...p.stats, ...data.stats } : data[k];
      }
      p.ownedAvatars = Array.from(new Set([...getDefaultFreeIds(), ...(p.ownedAvatars || [])]));
      p.ownedCardSkins = Array.from(new Set(['classic', ...(p.ownedCardSkins || [])]));
      p.ownedTableThemes = Array.from(new Set(['emerald', ...(p.ownedTableThemes || [])]));
      if (Array.isArray(data.rewardedIds)) p.rewardedIds = Array.from(new Set([...(p.rewardedIds || []), ...data.rewardedIds])).slice(-200);
      if (keepPhoto) p.selectedAvatar = 'photo'; // your gallery photo stays on this device
    }

    /** Server copy changed and this device has nothing new: take it as-is. */
    applySyncProfile(data, version) {
      if (!data || typeof data !== 'object') return;
      const p = this.state.profile;
      this.copyFields(data);
      this.setRealBalance(data.coins, data.diamonds);
      p.syncBase = this.realBalance();
      p.syncedAt = version;
      p.syncDirty = false;
      this.saveRemote();
    }

    /**
     * Server copy changed AND this device changed too: start from the server copy and replay this
     * device's Lions/Diamonds changes on top; owned items & best stats from both are kept.
     */
    rebaseSyncProfile(data, version) {
      if (!data || typeof data !== 'object') return;
      const p = this.state.profile;
      const mine = this.realBalance();
      const base = p.syncBase || mine;
      const deltaCoins = mine.coins - base.coins;
      const deltaDiamonds = mine.diamonds - base.diamonds;
      const local = { ...p, stats: { ...p.stats } };
      this.copyFields(data);
      this.combineProgress(local);
      p.selectedAvatar = local.selectedAvatar;
      p.selectedCardSkin = local.selectedCardSkin;
      p.selectedTableTheme = local.selectedTableTheme;
      this.setRealBalance((Number(data.coins) || 0) + deltaCoins, (Number(data.diamonds) || 0) + deltaDiamonds);
      p.syncBase = { coins: Number(data.coins) || 0, diamonds: Number(data.diamonds) || 0 };
      p.syncedAt = version;
      this.save(); // still has this device's changes → uploads
    }

    /** First sync of a device that played before accounts synced: keep the best of both (nothing bought is lost). */
    mergeSyncProfile(data, version) {
      if (!data || typeof data !== 'object') return;
      const p = this.state.profile;
      const mine = this.realBalance();
      const local = { ...p, stats: { ...p.stats } };
      this.copyFields(data);
      this.combineProgress(local);
      p.selectedAvatar = local.selectedAvatar;
      p.selectedCardSkin = local.selectedCardSkin;
      p.selectedTableTheme = local.selectedTableTheme;
      this.setRealBalance(Math.max(mine.coins, Number(data.coins) || 0), Math.max(mine.diamonds, Number(data.diamonds) || 0));
      p.syncBase = { coins: Number(data.coins) || 0, diamonds: Number(data.diamonds) || 0 };
      p.syncedAt = version;
      this.save();
    }

    /** Owned items: everything from both. Stats & streaks: the higher number. */
    combineProgress(local) {
      const p = this.state.profile;
      const union = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));
      const max = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
      const later = (a, b) => (String(a || '') > String(b || '') ? a : b);
      p.ownedAvatars = union(p.ownedAvatars, local.ownedAvatars);
      p.ownedCardSkins = union(p.ownedCardSkins, local.ownedCardSkins);
      p.ownedTableThemes = union(p.ownedTableThemes, local.ownedTableThemes);
      for (const k of ['winStreak', 'bestStreak', 'winsAt250', 'winsAt500', 'nameChanges', 'loginStreak']) p[k] = max(p[k], local[k]);
      p.lastLoginDay = later(p.lastLoginDay, local.lastLoginDay);
      p.lastDailyDiamond = later(p.lastDailyDiamond, local.lastDailyDiamond);
      const stats = { ...p.stats };
      for (const [k, v] of Object.entries(local.stats || {})) stats[k] = max(stats[k], v);
      p.stats = stats;
      p.rewardedIds = union(p.rewardedIds, local.rewardedIds).slice(-200);
    }

    /** A different account logged in on this device and has nothing saved yet: start it fresh (🦁 50, 💎 5). */
    resetProfileForNewAccount() {
      const keep = { username: this.state.profile.username, unlimited: this.state.profile.unlimited };
      this.state.profile = { ...createDefaultState().profile, ...keep };
      if (keep.unlimited) this.state.profile.balanceBeforeUnlimited = { coins: 50, diamonds: 5 };
      this.save();
    }

    /** Owner account (flagged by the server): unlimited Lions & Diamonds while signed in; normal balance comes back after. */
    setUnlimited(on) {
      const p = this.state.profile;
      if (on && !p.unlimited) {
        p.balanceBeforeUnlimited = { coins: p.coins, diamonds: p.diamonds };
        p.unlimited = true;
      } else if (!on && p.unlimited) {
        const back = p.balanceBeforeUnlimited || { coins: 50, diamonds: 5 };
        p.unlimited = false;
        p.coins = back.coins;
        p.diamonds = back.diamonds;
        delete p.balanceBeforeUnlimited;
      } else {
        return;
      }
      this.save();
    }

    get isUnlimited() {
      return Boolean(this.state.profile.unlimited);
    }

    /** 💎 cost of your next name change (0 for the first one). */
    get nameChangeCost() {
      return (this.state.profile.nameChanges || 0) > 0 ? NAME_CHANGE_DIAMONDS : 0;
    }

    /** Call after a name change went through: counts it and takes the 💎 if it wasn't the free one. */
    recordNameChange() {
      const p = this.state.profile;
      const cost = this.nameChangeCost;
      if (cost > 0) p.diamonds = Math.max(0, (p.diamonds || 0) - cost);
      p.nameChanges = (p.nameChanges || 0) + 1;
      this.save();
      return cost;
    }

    updateUsername(rawName) {
      const cleaned = String(rawName || '').trim().replace(/\s+/g, '_').slice(0, 18);
      if (cleaned.length < 2) {
        return { ok: false, message: 'Username must be between 2 and 18 characters.' };
      }
      this.state.profile.username = cleaned;
      this.save();
      return { ok: true, message: `Username updated to ${cleaned}.` };
    }

    selectOrBuyAvatar(avatarId) {
      if (avatarId === 'photo' && this.state.profile.photo) {
        this.state.profile.selectedAvatar = 'photo';
        this.save();
        return { ok: true, action: 'equipped', message: 'Using your profile photo.' };
      }
      const avatar = (SH.AVATARS || []).find(a => a.id === avatarId);
      if (!avatar) {
        return { ok: false, message: 'Avatar not found.' };
      }
      const owned = this.state.profile.ownedAvatars.includes(avatarId);
      if (owned) {
        this.state.profile.selectedAvatar = avatarId;
        this.save();
        return { ok: true, action: 'equipped', message: `Equipped "${avatar.name}".` };
      }

      // Diamond avatars are bought with 💎, everything else with 🦁 Lions
      const useDiamonds = avatar.currency === 'diamonds';
      const balance = useDiamonds ? this.state.profile.diamonds : this.state.profile.coins;
      const unit = useDiamonds ? '💎 Diamonds' : '🦁 Lions';
      if (balance < avatar.price) {
        const needed = avatar.price - balance;
        return {
          ok: false,
          action: 'insufficient_funds',
          message: `Not enough ${unit} for "${avatar.name}" — you need ${needed} more (${avatar.price} total).`
        };
      }

      if (useDiamonds) this.state.profile.diamonds -= avatar.price;
      else this.state.profile.coins -= avatar.price;
      this.state.profile.ownedAvatars.push(avatarId);
      this.state.profile.selectedAvatar = avatarId;
      this.save();
      const tierName = { mythic: 'Mythic', diamond: 'Diamond' }[avatar.tier] || 'Legendary';
      return {
        ok: true,
        action: 'purchased',
        message: `Unlocked & equipped ${tierName} "${avatar.name}" for ${avatar.price} ${unit}!`
      };
    }

    /** Card designs (Profile shop): equip owned ones, buy others with 🦁 Lions. */
    selectOrBuyCardSkin(skinId) {
      const skin = (SH.CARD_SKINS || []).find(s => s.id === skinId);
      if (!skin) return { ok: false, message: 'Card design not found.' };
      const p = this.state.profile;
      if (p.ownedCardSkins.includes(skinId)) {
        p.selectedCardSkin = skinId;
        this.save();
        return { ok: true, action: 'equipped', message: `Now playing with "${skin.name}" cards.` };
      }
      if (p.coins < skin.price) {
        return {
          ok: false,
          action: 'insufficient_funds',
          message: `Not enough 🦁 Lions for "${skin.name}" — you need ${skin.price - p.coins} more (${skin.price} total).`
        };
      }
      p.coins -= skin.price;
      p.ownedCardSkins.push(skinId);
      p.selectedCardSkin = skinId;
      this.save();
      return { ok: true, action: 'purchased', message: `Unlocked "${skin.name}" cards for ${skin.price} 🦁 Lions!` };
    }

    /** Table colours (Shop): equip owned ones, buy others with 🦁 Lions. */
    selectOrBuyTableTheme(themeId) {
      const theme = (SH.TABLE_THEMES || []).find(t => t.id === themeId);
      if (!theme) return { ok: false, message: 'Table colour not found.' };
      const p = this.state.profile;
      if (p.ownedTableThemes.includes(themeId)) {
        p.selectedTableTheme = themeId;
        this.save();
        return { ok: true, action: 'equipped', message: `Now playing on the ${theme.name} table.` };
      }
      const diamonds = theme.currency === 'diamonds';
      const balance = diamonds ? (p.diamonds || 0) : p.coins;
      if (balance < theme.price) {
        return { ok: false, action: 'insufficient_funds', message: `Not enough ${diamonds ? '💎 Diamonds' : '🦁 Lions'} for "${theme.name}" — you need ${theme.price - balance} more (${theme.price} total).` };
      }
      if (diamonds) p.diamonds -= theme.price;
      else p.coins -= theme.price;
      p.ownedTableThemes.push(themeId);
      p.selectedTableTheme = themeId;
      this.save();
      return { ok: true, action: 'purchased', message: `Unlocked the ${theme.name} table for ${theme.price} ${diamonds ? '💎 Diamonds' : '🦁 Lions'}!` };
    }

    /**
     * Daily login streak: day 1 +10 🦁, 2 +20, 3 +30, 4 +40, 5 +60, 6 +80, day 7 +100 🦁 & +1 💎, then a new week.
     * Missing a day starts again at day 1. Returns today's reward, or null if already claimed today.
     */
    claimLoginStreak(now = new Date()) {
      const p = this.state.profile;
      const today = todayKey(now);
      if (p.lastLoginDay === today) return null;
      const yesterday = todayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      const day = p.lastLoginDay === yesterday ? ((p.loginStreak || 0) % 7) + 1 : 1;
      const reward = LOGIN_STREAK_REWARDS[day - 1];
      p.loginStreak = day;
      p.lastLoginDay = today;
      p.coins += reward.lions;
      p.diamonds += reward.diamonds;
      this.save();
      return { day, ...reward };
    }

    get loginStreakRewards() {
      return LOGIN_STREAK_REWARDS;
    }

    /** Your bid & tricks at the end of a round (for the Stats screen). */
    recordRoundStats({ bid, tricks }) {
      if (bid === null || bid === undefined) return;
      const s = this.state.profile.stats;
      const t = Math.max(0, Number(tricks) || 0);
      s.tricksWon += t;
      if (Number(bid) === 0) {
        s.nilsTried += 1;
        if (t === 0) s.nilsMade += 1;
      } else {
        s.bidsPlayed += 1;
        if (t >= Number(bid)) s.bidsMade += 1;
      }
      this.save();
    }

    /** +1 💎 the first time you open the game each day. Returns true if awarded today. */
    claimDailyDiamond(now = new Date()) {
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (this.state.profile.lastDailyDiamond === today) return false;
      this.state.profile.lastDailyDiamond = today;
      this.state.profile.diamonds += 1;
      this.save();
      return true;
    }

    /**
     * Counts a full-game win; every 2 wins at 500 points → +5 💎, every 2 wins at 250 points → +2 💎.
     * Returns the diamonds awarded (0 most of the time).
     */
    recordGameWinBonus(targetScore) {
      const p = this.state.profile;
      let diamonds = 0;
      if (Number(targetScore) === 250) {
        p.winsAt250 += 1;
        if (p.winsAt250 % 2 === 0) diamonds = 2;
      } else {
        p.winsAt500 += 1;
        if (p.winsAt500 % 2 === 0) diamonds = 5;
      }
      p.diamonds += diamonds;
      this.save();
      return diamonds;
    }

    /** Lions for winning a full game: 250-point game +50, 500-point game +80. */
    gameWinLions(targetScore) {
      return Number(targetScore) === 250 ? 50 : 80;
    }

    spendDiamonds(amount) {
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      if (this.state.profile.diamonds < cost) return false;
      this.state.profile.diamonds -= cost;
      this.save();
      return true;
    }

    /** Adds Lions / Diamonds (gift refunds). */
    credit({ lions = 0, diamonds = 0 } = {}) {
      this.state.profile.coins += Math.max(0, Math.floor(lions));
      this.state.profile.diamonds += Math.max(0, Math.floor(diamonds));
      this.save();
    }

    /** Takes Lions / Diamonds for a gift. Returns false (and takes nothing) if the balance is too low. */
    debitForGift({ lions = 0, diamonds = 0 }) {
      const p = this.state.profile;
      const l = Math.max(0, Math.floor(lions));
      const d = Math.max(0, Math.floor(diamonds));
      if (p.coins < l || p.diamonds < d) return false;
      p.coins -= l;
      p.diamonds -= d;
      this.save();
      return true;
    }

    /** A gift arrived from another player (counted once per gift id). */
    receiveGift(giftId, { lions = 0, diamonds = 0 }) {
      const key = `gift_${giftId}`;
      if (!giftId || this.state.profile.rewardedIds.includes(key)) return false;
      this.state.profile.rewardedIds.push(key);
      this.state.profile.coins += Math.max(0, Math.min(1e9, Math.floor(lions)));
      this.state.profile.diamonds += Math.max(0, Math.min(1e9, Math.floor(diamonds)));
      this.save();
      return true;
    }

    /**
     * Awards 🦁 Lions for winning a round (+10) or full game (+50 at 250 pts / +80 at 500 pts).
     * Uses a unique key per match/round to prevent duplicate claims.
     */
    claimReward(rewardKey, amount, statsUpdate = {}) {
      if (statsUpdate.roundsPlayed) this.state.profile.stats.roundsPlayed += statsUpdate.roundsPlayed;
      if (statsUpdate.roundsWon) this.state.profile.stats.roundsWon += statsUpdate.roundsWon;
      if (statsUpdate.gamesPlayed) this.state.profile.stats.gamesPlayed += statsUpdate.gamesPlayed;
      if (statsUpdate.gamesWon) this.state.profile.stats.gamesWon += statsUpdate.gamesWon;

      if (!rewardKey || amount <= 0) {
        this.save();
        return { awarded: 0, duplicate: false };
      }

      if (this.state.profile.rewardedIds.includes(rewardKey)) {
        this.save();
        return { awarded: 0, duplicate: true };
      }

      this.state.profile.rewardedIds.push(rewardKey);
      this.state.profile.coins += amount;
      this.save();
      return { awarded: amount, duplicate: false };
    }

    /** Sell an owned avatar back for half its price (in the currency it was bought with). */
    sellAvatar(avatarId) {
      const p = this.state.profile;
      const av = (SH.AVATARS || []).find(a => a.id === avatarId);
      if (!av || av.tier === 'free' || !p.ownedAvatars.includes(avatarId)) return { ok: false, message: 'That avatar can’t be sold.' };
      const refund = Math.floor(av.price / 2);
      p.ownedAvatars = p.ownedAvatars.filter(id => id !== avatarId);
      if (av.currency === 'diamonds') p.diamonds += refund;
      else p.coins += refund;
      if (p.selectedAvatar === avatarId) p.selectedAvatar = 'free_ace';
      this.save();
      return { ok: true, message: `Sold "${av.name}" for ${refund} ${av.currency === 'diamonds' ? '💎' : '🦁'}.` };
    }

    /** Sell an owned card design back for half price (the free Royale Classic can't be sold). */
    sellCardSkin(skinId) {
      const p = this.state.profile;
      const skin = (SH.CARD_SKINS || []).find(s => s.id === skinId);
      if (!skin || skin.price === 0 || !p.ownedCardSkins.includes(skinId)) return { ok: false, message: 'That card design can’t be sold.' };
      const refund = Math.floor(skin.price / 2);
      p.ownedCardSkins = p.ownedCardSkins.filter(id => id !== skinId);
      p.coins += refund;
      if (p.selectedCardSkin === skinId) p.selectedCardSkin = 'classic';
      this.save();
      return { ok: true, message: `Sold "${skin.name}" cards for ${refund} 🦁.` };
    }

    /** 🦁 2 to start a game. Returns false (nothing taken) if the player can't afford it. */
    payEntryFee() {
      return this.spendCoins(ENTRY_FEE);
    }

    get entryFee() {
      return ENTRY_FEE;
    }

    /** Win streak (consecutive full-game wins). */
    recordGameResult(won) {
      const p = this.state.profile;
      p.winStreak = won ? (p.winStreak || 0) + 1 : 0;
      p.bestStreak = Math.max(p.bestStreak || 0, p.winStreak);
      this.save();
      return p.winStreak;
    }

    /** Profile picture from the gallery (already resized), or null to remove it. */
    setPhoto(dataUrl) {
      this.state.profile.photo = dataUrl || null;
      if (dataUrl) this.state.profile.selectedAvatar = 'photo';
      else if (this.state.profile.selectedAvatar === 'photo') this.state.profile.selectedAvatar = 'free_ace';
      this.save();
    }

    /** Spends coins (e.g. 1,000 for a redeal). Returns false if the player can't afford it. */
    spendCoins(amount) {
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      if (this.state.profile.coins < cost) return false;
      this.state.profile.coins -= cost;
      this.save();
      return true;
    }

    updateSettings(patch) {
      if (patch.targetScore !== undefined) {
        this.state.settings.targetScore = Number(patch.targetScore) === 250 ? 250 : 500;
      }
      if (patch.botDifficulty !== undefined) {
        const valid = ['Beginner', 'Easy', 'Medium', 'Hard', 'Impossible'];
        if (valid.includes(patch.botDifficulty)) {
          this.state.settings.botDifficulty = patch.botDifficulty;
        }
      }
      if (patch.gameSpeed !== undefined && ['relaxed', 'normal', 'fast'].includes(patch.gameSpeed)) {
        this.state.settings.gameSpeed = patch.gameSpeed;
      }
      if (patch.sound !== undefined) this.state.settings.sound = Boolean(patch.sound);
      if (patch.haptics !== undefined) this.state.settings.haptics = Boolean(patch.haptics);
      if (patch.music !== undefined) this.state.settings.music = Boolean(patch.music);
      if (patch.reducedMotion !== undefined) this.state.settings.reducedMotion = Boolean(patch.reducedMotion);
      if (patch.ambience !== undefined && ['lounge', 'rain', 'ocean', 'piano'].includes(patch.ambience)) this.state.settings.ambience = patch.ambience;
      if (patch.musicVolume !== undefined) this.state.settings.musicVolume = Math.max(0, Math.min(1, Number(patch.musicVolume) || 0));
      this.save();
    }
  }

  SH.store = new AppStore();
})(typeof globalThis !== 'undefined' ? globalThis : window);
