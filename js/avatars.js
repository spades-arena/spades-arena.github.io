/**
 * Spades Arena - Avatar Definitions & Procedural SVG Builder
 * 5 Free + 10 Classic (30 🦁) + 5 Legendary (60–100 🦁) + 8 Mythic (150–1000 🦁) + 6 Diamond (5–25 💎)
 * plus the player's own gallery photo ('photo').
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  const AVATARS = [
    // 5 Free Avatars (everyone owns these)
    // THE ARENA SHOP — realistic portrait avatars (images in assets/avatars, embedded by the bundler)
    { id: 'av_panther', name: 'Black Panther', tier: 'free', price: 0, image: 'assets/avatars/av_panther.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_champion', name: 'The Champion', tier: 'arena', price: 100, image: 'assets/avatars/av_champion.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_strategist', name: 'The Strategist', tier: 'arena', price: 200, image: 'assets/avatars/av_strategist.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_veteran', name: 'The Veteran', tier: 'arena', price: 300, image: 'assets/avatars/av_veteran.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_ace', name: 'The Ace', tier: 'arena', price: 450, image: 'assets/avatars/av_ace.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_phantom', name: 'The Phantom', tier: 'arena', price: 650, image: 'assets/avatars/av_phantom.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_elite', name: 'The Elite', tier: 'arena', price: 900, image: 'assets/avatars/av_elite.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'av_legend', name: 'The Arena Legend', tier: 'arena', price: 1500, image: 'assets/avatars/av_legend.webp', bg: '#050706', fg: '#2bff88', icon: 'spade_crown', arena: true },
    { id: 'free_ace', name: 'Ace Spade', tier: 'free', price: 0, bg: '#133a27', fg: '#f0c36d', icon: 'spade_crown' },
    { id: 'free_knight', name: 'Royal Knight', tier: 'free', price: 0, bg: '#1e3545', fg: '#82c8f7', icon: 'shield' },
    { id: 'free_velvet', name: 'Emerald Fox', tier: 'free', price: 0, bg: '#1b4d34', fg: '#76e0a8', icon: 'fox' },
    { id: 'free_shadow', name: 'Night Owl', tier: 'free', price: 0, bg: '#262338', fg: '#c3b5ff', icon: 'owl' },
    { id: 'free_wave', name: 'Shark Bite', tier: 'free', price: 0, bg: '#113c4a', fg: '#56cfe1', icon: 'wave' },

    // 10 Classic Avatars (30 🦁 each in the Shop)
    { id: 'free_lucky', name: 'Clover Pip', tier: 'classic', price: 30, bg: '#1d4528', fg: '#a5e876', icon: 'clover' },
    { id: 'free_blaze', name: 'Ruby Heart', tier: 'classic', price: 30, bg: '#4a1c24', fg: '#ff8598', icon: 'heart' },
    { id: 'free_frost', name: 'Diamond Cut', tier: 'classic', price: 30, bg: '#183c4e', fg: '#7ce8ff', icon: 'diamond' },
    { id: 'free_sun', name: 'Sun Burst', tier: 'classic', price: 30, bg: '#4a3514', fg: '#ffd166', icon: 'sun' },
    { id: 'free_bolt', name: 'Quick Trick', tier: 'classic', price: 30, bg: '#3b2d14', fg: '#ffbe0b', icon: 'bolt' },
    { id: 'free_panda', name: 'Pip Panda', tier: 'classic', price: 30, bg: '#1f3b2c', fg: '#f8fafc', icon: 'panda' },
    { id: 'free_penguin', name: 'Tux Trick', tier: 'classic', price: 30, bg: '#123049', fg: '#0f172a', icon: 'penguin' },
    { id: 'free_bunny', name: 'Lucky Bunny', tier: 'classic', price: 30, bg: '#3a1f3d', fg: '#f5d0fe', icon: 'bunny' },
    { id: 'free_frog', name: 'Ribbit Royal', tier: 'classic', price: 30, bg: '#123d22', fg: '#4ade80', icon: 'frog' },
    { id: 'free_bear', name: 'Bid Bear', tier: 'classic', price: 30, bg: '#3a2414', fg: '#c08552', icon: 'bear' },

    // 5 Locked Legendary Avatars (60, 70, 80, 90, 100 coins)
    { id: 'leg_monarch', name: 'Sovereign Spade', tier: 'legendary', price: 60, bg: '#2b1908', fg: '#ffd700', icon: 'monarch' },
    { id: 'leg_oracle', name: 'Nil Seer', tier: 'legendary', price: 70, bg: '#1f1135', fg: '#e0aaff', icon: 'oracle' },
    { id: 'leg_dragon', name: 'Jade Wyrm', tier: 'legendary', price: 80, bg: '#0b3824', fg: '#52f2b8', icon: 'wyrm' },
    { id: 'leg_phoenix', name: 'Solar Phoenix', tier: 'legendary', price: 90, bg: '#421212', fg: '#ff9e00', icon: 'phoenix' },
    { id: 'leg_grandmaster', name: 'Hadzz Immortal', tier: 'legendary', price: 100, bg: '#0f172a', fg: '#f8fafc', icon: 'immortal' },

    // 8 Mythic Avatars (150 – 1000 coins)
    { id: 'myth_astro', name: 'Galaxy Astronaut', tier: 'mythic', price: 150, bg: '#0b1033', fg: '#e2e8f0', icon: 'astronaut' },
    { id: 'myth_ninja', name: 'Shadow Ninja', tier: 'mythic', price: 200, bg: '#14161f', fg: '#ef4444', icon: 'ninja' },
    { id: 'myth_robot', name: 'Cyber Bot', tier: 'mythic', price: 250, bg: '#062a33', fg: '#22d3ee', icon: 'robot' },
    { id: 'myth_tiger', name: 'Neon Tiger', tier: 'mythic', price: 300, bg: '#2a1204', fg: '#fb923c', icon: 'tiger' },
    { id: 'myth_king', name: 'Diamond King', tier: 'mythic', price: 400, bg: '#1a0b2e', fg: '#facc15', icon: 'diamond_king' },
    { id: 'myth_lion', name: 'Golden Coin', tier: 'mythic', price: 500, bg: '#2b1a03', fg: '#fbbf24', icon: 'lion' },
    { id: 'myth_wizard', name: 'Arcane Wizard', tier: 'mythic', price: 750, bg: '#12083a', fg: '#a78bfa', icon: 'wizard' },
    { id: 'myth_cat', name: 'Hadzz Cat in a Hat', tier: 'mythic', price: 1000, bg: '#05301c', fg: '#f4a259', icon: 'cat_hat' },

    // 6 Diamond Avatars — bought with 💎 Diamonds (earned daily & from game-win streaks)
    { id: 'dia_icedragon', name: 'Ice Dragon', tier: 'diamond', currency: 'diamonds', price: 5, bg: '#06243a', fg: '#7dd3fc', icon: 'ice_dragon' },
    { id: 'dia_pharaoh', name: 'Golden Pharaoh', tier: 'diamond', currency: 'diamonds', price: 8, bg: '#1b1405', fg: '#facc15', icon: 'pharaoh' },
    { id: 'dia_samurai', name: 'Crimson Samurai', tier: 'diamond', currency: 'diamonds', price: 12, bg: '#220808', fg: '#ef4444', icon: 'samurai' },
    { id: 'dia_wolf', name: 'Galaxy Wolf', tier: 'diamond', currency: 'diamonds', price: 16, bg: '#0d0b2a', fg: '#a5b4fc', icon: 'galaxy_wolf' },
    { id: 'dia_panther', name: 'Royal Panther', tier: 'diamond', currency: 'diamonds', price: 20, bg: '#070707', fg: '#c084fc', icon: 'panther' },
    { id: 'dia_lionking', name: 'Lion King Royale', tier: 'diamond', currency: 'diamonds', price: 25, bg: '#120c02', fg: '#fbbf24', icon: 'lion_king' }
  ];

  function renderAvatarSVG(avatarId, size = 56) {
    const item = AVATARS.find(a => a.id === avatarId) || AVATARS[0];
    const isLeg = item.tier === 'legendary';
    const isMythic = item.tier === 'mythic';
    const isDiamond = item.tier === 'diamond';
    const ringColor = isDiamond ? '#67e8f9' : isMythic ? '#ff4ecd' : isLeg ? '#ffd700' : item.fg;

    let glyph = '';
    switch (item.icon) {
      case 'spade_crown':
        glyph = `<path d="M22 19 L26 11 L29.5 16 L32 8 L34.5 16 L38 11 L42 19 Z" fill="#f5c84c"/>
          <path d="M32 19 C22 29 15 34 15 41 C15 46 20 49 25 47 C27 46 29 44 30 43 L27 53 L37 53 L34 43 C35 44 37 46 39 47 C44 49 49 46 49 41 C49 34 42 29 32 19 Z" fill="${item.fg}"/>
          <rect x="20.5" y="33" width="9.5" height="5.5" rx="2.4" fill="#111"/><rect x="34" y="33" width="9.5" height="5.5" rx="2.4" fill="#111"/>
          <line x1="30" y1="35" x2="34" y2="35" stroke="#111" stroke-width="1.6"/><path d="M28 42.5 Q32 45.5 36 42.5" stroke="#111" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
        break;
      case 'fox':
        glyph = `<polygon points="13,13 27,25 19,32" fill="${item.fg}"/><polygon points="51,13 37,25 45,32" fill="${item.fg}"/>
          <polygon points="16,17 24,25 19,29" fill="#0f2d1f"/><polygon points="48,17 40,25 45,29" fill="#0f2d1f"/>
          <path d="M13 26 Q32 17 51 26 L45 42 Q32 55 19 42 Z" fill="${item.fg}"/>
          <path d="M19 37 Q26 35 32 46 Q38 35 45 37 L41 44 Q32 53 23 44 Z" fill="#f8fafc"/>
          <ellipse cx="25" cy="33" rx="2.6" ry="3.2" fill="#111"/><ellipse cx="39" cy="33" rx="2.6" ry="3.2" fill="#111"/>
          <ellipse cx="32" cy="45" rx="3" ry="2.2" fill="#111"/>`;
        break;
      case 'shield':
        glyph = `<path d="M32 12 Q39 3 48 7 Q41 9 37 15" fill="#ef4444"/>
          <path d="M18 31 C18 19 25 12 32 12 C39 12 46 19 46 31 L46 46 C46 49 44 51 41 51 L23 51 C20 51 18 49 18 46 Z" fill="${item.fg}"/>
          <rect x="21" y="29" width="22" height="5.5" rx="2.5" fill="#0d1b26"/>
          <path d="M32 37 L32 50 M26 39 L26 47 M38 39 L38 47" stroke="#0d1b26" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M22 22 Q32 16 42 22" stroke="rgba(255,255,255,0.45)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        break;
      case 'clover':
        glyph = `<circle cx="32" cy="21" r="9" fill="${item.fg}"/><circle cx="21" cy="31" r="9" fill="${item.fg}"/><circle cx="43" cy="31" r="9" fill="${item.fg}"/><circle cx="32" cy="40" r="9" fill="${item.fg}"/>
          <path d="M32 47 Q34 53 40 55" stroke="${item.fg}" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="28" cy="30" r="2" fill="#0f2d1a"/><circle cx="36" cy="30" r="2" fill="#0f2d1a"/>
          <path d="M28.5 35 Q32 38 35.5 35" stroke="#0f2d1a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
          <ellipse cx="25" cy="34" rx="2.4" ry="1.4" fill="#f9a8d4" opacity="0.7"/><ellipse cx="39" cy="34" rx="2.4" ry="1.4" fill="#f9a8d4" opacity="0.7"/>`;
        break;
      case 'heart':
        glyph = `<path d="M32 51 L15 34 C9 27 13 16 23 16 C27.5 16 30.5 19 32 22.5 C33.5 19 36.5 16 41 16 C51 16 55 27 49 34 Z" fill="${item.fg}"/>
          <ellipse cx="25" cy="30" rx="3.6" ry="4.4" fill="#fff"/><ellipse cx="39" cy="30" rx="3.6" ry="4.4" fill="#fff"/>
          <circle cx="25.6" cy="31" r="2" fill="#3b0a14"/><circle cx="39.6" cy="31" r="2" fill="#3b0a14"/>
          <path d="M27 38 Q32 43 37 38" stroke="#3b0a14" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M20 22 Q22 19 26 19" stroke="rgba(255,255,255,0.6)" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        break;
      case 'diamond':
        glyph = `<polygon points="20,21 44,21 53,31 32,53 11,31" fill="${item.fg}"/>
          <polygon points="20,21 32,31 44,21" fill="rgba(255,255,255,0.35)"/><path d="M11 31 L53 31" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>
          <circle cx="26" cy="37" r="2.2" fill="#0b2433"/><circle cx="38" cy="37" r="2.2" fill="#0b2433"/>
          <path d="M28.5 42 Q32 44.5 35.5 42" stroke="#0b2433" stroke-width="1.7" fill="none" stroke-linecap="round"/>
          <path d="M50 9 L51.5 13 L55.5 14.5 L51.5 16 L50 20 L48.5 16 L44.5 14.5 L48.5 13 Z" fill="#fff"/>`;
        break;
      case 'owl':
        glyph = `<polygon points="16,14 24,23 18,26" fill="${item.fg}"/><polygon points="48,14 40,23 46,26" fill="${item.fg}"/>
          <ellipse cx="32" cy="36" rx="18" ry="18" fill="${item.fg}"/><ellipse cx="32" cy="43" rx="10" ry="9" fill="#ede9fe"/>
          <circle cx="24.5" cy="31" r="7" fill="#fff"/><circle cx="39.5" cy="31" r="7" fill="#fff"/>
          <circle cx="25.5" cy="32" r="3.6" fill="#1e1b4b"/><circle cx="38.5" cy="32" r="3.6" fill="#1e1b4b"/>
          <circle cx="26.6" cy="30.8" r="1.2" fill="#fff"/><circle cx="39.6" cy="30.8" r="1.2" fill="#fff"/>
          <polygon points="32,35 29,40 35,40" fill="#f59e0b"/>`;
        break;
      case 'sun':
        glyph = `<g fill="${item.fg}"><polygon points="32,6 35,15 29,15"/><polygon points="32,58 35,49 29,49"/><polygon points="6,32 15,29 15,35"/><polygon points="58,32 49,29 49,35"/>
          <polygon points="13.6,13.6 21,18 18,21"/><polygon points="50.4,13.6 46,21 43,18"/><polygon points="13.6,50.4 18,43 21,46"/><polygon points="50.4,50.4 43,46 46,43"/></g>
          <circle cx="32" cy="32" r="14" fill="${item.fg}"/>
          <path d="M20 29 L30 29 L29 34 Q25 36 21 34 Z M34 29 L44 29 L43 34 Q39 36 35 34 Z" fill="#1f1300"/><line x1="30" y1="30" x2="34" y2="30" stroke="#1f1300" stroke-width="1.6"/>
          <path d="M27 39 Q32 43 37 39" stroke="#7c2d12" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        break;
      case 'wave':
        glyph = `<path d="M12 37 Q20 20 36 21 Q50 22 54 34 Q46 44 30 44 Q18 44 12 37 Z" fill="${item.fg}"/>
          <path d="M36 21 L40 11 L45 22 Z" fill="${item.fg}"/><path d="M12 37 L5 30 L7 41 Z" fill="${item.fg}"/>
          <path d="M20 39 Q34 46 50 36 Q44 43 32 43 Q24 43 20 39 Z" fill="#e0f7fa"/>
          <circle cx="42" cy="30" r="2.4" fill="#05232b"/><path d="M45 36 Q48 37 50 35" stroke="#05232b" stroke-width="1.6" fill="none" stroke-linecap="round"/>
          <path d="M10 52 Q16 48 22 52 T34 52 T46 52 T58 52" stroke="#7dd3fc" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        break;
      case 'bolt':
        glyph = `<path d="M36 8 L18 35 L30 35 L25 56 L46 26 L34 26 L40 8 Z" fill="${item.fg}"/>
          <circle cx="29" cy="30" r="2.2" fill="#2a1d03"/><circle cx="37" cy="27" r="2.2" fill="#2a1d03"/>
          <path d="M30 35.5 Q34 37 37 33.5" stroke="#2a1d03" stroke-width="1.7" fill="none" stroke-linecap="round"/>
          <path d="M8 22 L16 22 M6 30 L14 30 M9 38 L15 38" stroke="rgba(255,255,255,0.55)" stroke-width="2" stroke-linecap="round"/>`;
        break;
      case 'monarch':
        glyph = `<polygon points="14,42 18,22 26,31 32,16 38,31 46,22 50,42" fill="${item.fg}"/><rect x="16" y="45" width="32" height="4" rx="2" fill="${item.fg}"/>`;
        break;
      case 'oracle':
        glyph = `<path d="M12 32 Q32 14 52 32 Q32 50 12 32 Z" fill="none" stroke="${item.fg}" stroke-width="3.5"/><circle cx="32" cy="32" r="6" fill="${item.fg}"/>`;
        break;
      case 'wyrm':
        glyph = `<path d="M18 44 C18 24 30 16 44 20 C36 26 38 36 46 42 C34 46 26 38 18 44 Z" fill="${item.fg}"/><circle cx="35" cy="24" r="2" fill="${item.bg}"/>`;
        break;
      case 'phoenix':
        glyph = `<path d="M32 12 L42 28 L52 22 L44 44 L32 50 L20 44 L12 22 L22 28 Z" fill="${item.fg}"/><polygon points="32,22 38,36 32,43 26,36" fill="${item.bg}"/>`;
        break;
      case 'panda':
        glyph = `<circle cx="18" cy="18" r="7" fill="#111"/><circle cx="46" cy="18" r="7" fill="#111"/>
          <circle cx="32" cy="35" r="19" fill="${item.fg}"/>
          <ellipse cx="24" cy="33" rx="5.5" ry="7" fill="#111" transform="rotate(-20 24 33)"/><ellipse cx="40" cy="33" rx="5.5" ry="7" fill="#111" transform="rotate(20 40 33)"/>
          <circle cx="24.6" cy="32" r="2" fill="#fff"/><circle cx="39.4" cy="32" r="2" fill="#fff"/>
          <ellipse cx="32" cy="42" rx="3.4" ry="2.4" fill="#111"/><path d="M29 46 Q32 48.5 35 46" stroke="#111" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
        break;
      case 'penguin':
        glyph = `<ellipse cx="32" cy="36" rx="19" ry="20" fill="${item.fg}"/><path d="M19 38 Q19 22 32 22 Q45 22 45 38 Q45 52 32 53 Q19 52 19 38 Z" fill="#f8fafc"/>
          <circle cx="26.5" cy="32" r="2.6" fill="#0f172a"/><circle cx="37.5" cy="32" r="2.6" fill="#0f172a"/>
          <circle cx="27.3" cy="31.2" r="0.9" fill="#fff"/><circle cx="38.3" cy="31.2" r="0.9" fill="#fff"/>
          <path d="M27 38 L37 38 L32 43 Z" fill="#f59e0b"/><ellipse cx="22" cy="40" rx="2.6" ry="1.6" fill="#fda4af" opacity="0.7"/><ellipse cx="42" cy="40" rx="2.6" ry="1.6" fill="#fda4af" opacity="0.7"/>`;
        break;
      case 'bunny':
        glyph = `<ellipse cx="24" cy="15" rx="5" ry="13" fill="${item.fg}"/><ellipse cx="40" cy="15" rx="5" ry="13" fill="${item.fg}"/>
          <ellipse cx="24" cy="16" rx="2.4" ry="9" fill="#f472b6"/><ellipse cx="40" cy="16" rx="2.4" ry="9" fill="#f472b6"/>
          <circle cx="32" cy="38" r="16" fill="${item.fg}"/><circle cx="26" cy="35" r="2.3" fill="#3b0a3f"/><circle cx="38" cy="35" r="2.3" fill="#3b0a3f"/>
          <ellipse cx="32" cy="41" rx="2.6" ry="2" fill="#ec4899"/><rect x="29.6" y="43.5" width="4.8" height="5" rx="1.2" fill="#fff" stroke="#e9d5ff" stroke-width="0.6"/>`;
        break;
      case 'frog':
        glyph = `<circle cx="22" cy="22" r="8" fill="${item.fg}"/><circle cx="42" cy="22" r="8" fill="${item.fg}"/>
          <ellipse cx="32" cy="38" rx="21" ry="15" fill="${item.fg}"/>
          <circle cx="22" cy="21" r="4.5" fill="#fff"/><circle cx="42" cy="21" r="4.5" fill="#fff"/><circle cx="22.6" cy="22" r="2.3" fill="#052e16"/><circle cx="42.6" cy="22" r="2.3" fill="#052e16"/>
          <path d="M19 40 Q32 50 45 40" stroke="#052e16" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <path d="M26 14 L28 9 L30 13 L32 8 L34 13 L36 9 L38 14 Z" fill="#facc15"/>`;
        break;
      case 'bear':
        glyph = `<circle cx="18" cy="19" r="7.5" fill="${item.fg}"/><circle cx="46" cy="19" r="7.5" fill="${item.fg}"/><circle cx="18" cy="19" r="3.5" fill="#7c4a26"/><circle cx="46" cy="19" r="3.5" fill="#7c4a26"/>
          <circle cx="32" cy="35" r="18" fill="${item.fg}"/><ellipse cx="32" cy="41" rx="9" ry="7" fill="#e8c39e"/>
          <circle cx="25" cy="32" r="2.4" fill="#2b1608"/><circle cx="39" cy="32" r="2.4" fill="#2b1608"/>
          <ellipse cx="32" cy="38.5" rx="3.4" ry="2.4" fill="#2b1608"/><path d="M29 43 Q32 45.5 35 43" stroke="#2b1608" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
        break;
      case 'ice_dragon':
        glyph = `<path d="M14 20 L22 26 L18 14 L28 22 L32 10 L36 22 L46 14 L42 26 L50 20 L44 34 Q32 56 20 34 Z" fill="${item.fg}"/>
          <path d="M22 30 L29 33 M42 30 L35 33" stroke="#06243a" stroke-width="2.4" stroke-linecap="round"/>
          <circle cx="26" cy="34" r="2.2" fill="#e0f2fe"/><circle cx="38" cy="34" r="2.2" fill="#e0f2fe"/>
          <path d="M28 44 L30 41 L32 44 L34 41 L36 44" stroke="#e0f2fe" stroke-width="1.6" fill="none"/>
          <path d="M8 46 L12 42 L14 47 Z M56 46 L52 42 L50 47 Z" fill="#bae6fd"/>`;
        break;
      case 'pharaoh':
        glyph = `<path d="M18 22 Q32 6 46 22 L50 50 L40 46 L32 52 L24 46 L14 50 Z" fill="${item.fg}"/>
          <path d="M18 24 L46 24 M17 30 L47 30 M16 36 L48 36 M15 42 L49 42" stroke="#1e3a8a" stroke-width="2.2"/>
          <ellipse cx="32" cy="34" rx="10" ry="12" fill="#c68642"/>
          <path d="M26 31 L30 31 M34 31 L38 31" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>
          <path d="M29 39 Q32 41 35 39" stroke="#5c2e0e" stroke-width="1.5" fill="none"/><path d="M30 46 L34 46 L33 52 L31 52 Z" fill="${item.fg}"/>
          <circle cx="32" cy="17" r="3" fill="#3b82f6"/>`;
        break;
      case 'samurai':
        glyph = `<path d="M10 26 Q32 4 54 26 L50 28 Q32 14 14 28 Z" fill="#1f2937"/><path d="M26 12 L32 4 L38 12" fill="none" stroke="#facc15" stroke-width="2.4"/>
          <path d="M16 28 L48 28 L46 44 Q32 54 18 44 Z" fill="${item.fg}"/>
          <rect x="20" y="32" width="24" height="6" rx="2" fill="#111"/><circle cx="26" cy="35" r="1.6" fill="#fde047"/><circle cx="38" cy="35" r="1.6" fill="#fde047"/>
          <path d="M22 44 L42 44 M24 48 L40 48" stroke="#7f1d1d" stroke-width="1.8"/>`;
        break;
      case 'galaxy_wolf':
        glyph = `<circle cx="14" cy="14" r="1.2" fill="#fff"/><circle cx="52" cy="18" r="1" fill="#fff"/><circle cx="48" cy="52" r="1.3" fill="#fff"/>
          <polygon points="16,12 26,24 20,30" fill="${item.fg}"/><polygon points="48,12 38,24 44,30" fill="${item.fg}"/>
          <path d="M16 26 Q32 18 48 26 L46 40 L32 54 L18 40 Z" fill="${item.fg}"/>
          <path d="M22 40 L32 54 L42 40 Q32 44 22 40 Z" fill="#e0e7ff"/>
          <path d="M22 31 L28 33 M42 31 L36 33" stroke="#312e81" stroke-width="2.6" stroke-linecap="round"/>
          <circle cx="25" cy="33" r="1.4" fill="#fde047"/><circle cx="39" cy="33" r="1.4" fill="#fde047"/><ellipse cx="32" cy="45" rx="2.6" ry="2" fill="#111"/>`;
        break;
      case 'panther':
        glyph = `<polygon points="17,16 25,24 18,28" fill="#1c1c1c"/><polygon points="47,16 39,24 46,28" fill="#1c1c1c"/>
          <ellipse cx="32" cy="36" rx="18" ry="16" fill="#1c1c1c"/>
          <ellipse cx="25" cy="33" rx="4" ry="2.6" fill="${item.fg}"/><ellipse cx="39" cy="33" rx="4" ry="2.6" fill="${item.fg}"/>
          <ellipse cx="25" cy="33" rx="1" ry="2.4" fill="#111"/><ellipse cx="39" cy="33" rx="1" ry="2.4" fill="#111"/>
          <path d="M29 41 L35 41 L32 44 Z" fill="#6b21a8"/><path d="M14 42 L24 41 M14 46 L24 44 M50 42 L40 41 M50 46 L40 44" stroke="#c4b5fd" stroke-width="1"/>
          <path d="M22 14 L26 18 L32 12 L38 18 L42 14 L40 22 L24 22 Z" fill="#facc15"/>`;
        break;
      case 'lion_king':
        glyph = `<path d="M32 10 L37 16 L44 13 L45 20 L52 20 L49 27 L55 32 L49 37 L52 44 L45 44 L44 51 L37 48 L32 54 L27 48 L20 51 L19 44 L12 44 L15 37 L9 32 L15 27 L12 20 L19 20 L20 13 L27 16 Z" fill="#b45309"/>
          <circle cx="32" cy="34" r="13" fill="${item.fg}"/>
          <path d="M26 31 L30 32 M38 31 L34 32" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>
          <ellipse cx="32" cy="40" rx="5.5" ry="4" fill="#fde68a"/><path d="M29.5 38 L34.5 38 L32 40.5 Z" fill="#111"/>
          <path d="M22 18 L25 10 L29 15 L32 6 L35 15 L39 10 L42 18 Z" fill="#fde047" stroke="#92400e" stroke-width="1"/>
          <circle cx="32" cy="12" r="1.6" fill="#ef4444"/>`;
        break;
      case 'astronaut':
        glyph = `<circle cx="14" cy="16" r="1.4" fill="#fff"/><circle cx="50" cy="13" r="1.1" fill="#fff"/><circle cx="52" cy="46" r="1.3" fill="#fff"/>
          <circle cx="32" cy="32" r="17" fill="${item.fg}"/><rect x="20" y="25" width="24" height="15" rx="7" fill="#1e3a8a"/>
          <path d="M23 29 Q30 26 36 29" stroke="#93c5fd" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="27" y="48" width="10" height="5" rx="2" fill="${item.fg}"/>`;
        break;
      case 'ninja':
        glyph = `<circle cx="32" cy="32" r="18" fill="#1f2937"/><rect x="14" y="27" width="36" height="10" rx="5" fill="${item.fg}"/>
          <path d="M48 30 L58 24 L55 33 Z" fill="${item.fg}"/><ellipse cx="25" cy="32" rx="4" ry="2.4" fill="#fff"/><ellipse cx="39" cy="32" rx="4" ry="2.4" fill="#fff"/>
          <circle cx="25" cy="32" r="1.4" fill="#111"/><circle cx="39" cy="32" r="1.4" fill="#111"/>`;
        break;
      case 'robot':
        glyph = `<line x1="32" y1="9" x2="32" y2="17" stroke="${item.fg}" stroke-width="2.5"/><circle cx="32" cy="9" r="3" fill="#f43f5e"/>
          <rect x="16" y="17" width="32" height="28" rx="7" fill="${item.fg}"/><rect x="20" y="23" width="24" height="10" rx="4" fill="#082f49"/>
          <circle cx="26" cy="28" r="2.8" fill="#a5f3fc"/><circle cx="38" cy="28" r="2.8" fill="#a5f3fc"/><rect x="24" y="37" width="16" height="3" rx="1.5" fill="#082f49"/>
          <rect x="11" y="26" width="5" height="10" rx="2" fill="${item.fg}"/><rect x="48" y="26" width="5" height="10" rx="2" fill="${item.fg}"/>`;
        break;
      case 'tiger':
        glyph = `<polygon points="16,20 22,10 28,20" fill="${item.fg}"/><polygon points="48,20 42,10 36,20" fill="${item.fg}"/>
          <circle cx="32" cy="34" r="17" fill="${item.fg}"/><path d="M32 17 L32 25 M22 22 L26 28 M42 22 L38 28 M15 34 L21 34 M49 34 L43 34" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>
          <ellipse cx="25" cy="33" rx="3" ry="3.6" fill="#22c55e"/><ellipse cx="39" cy="33" rx="3" ry="3.6" fill="#22c55e"/>
          <ellipse cx="32" cy="42" rx="7" ry="5" fill="#fde68a"/><path d="M29 40 L35 40 L32 43 Z" fill="#111"/>`;
        break;
      case 'diamond_king':
        glyph = `<path d="M15 26 L21 14 L27 22 L32 10 L37 22 L43 14 L49 26 Z" fill="${item.fg}"/><rect x="15" y="26" width="34" height="5" fill="#eab308"/>
          <polygon points="32,33 44,42 32,55 20,42" fill="#67e8f9"/><polygon points="32,33 38,42 32,55 26,42" fill="#a5f3fc"/>
          <circle cx="21" cy="28.5" r="1.6" fill="#ef4444"/><circle cx="32" cy="28.5" r="1.6" fill="#22c55e"/><circle cx="43" cy="28.5" r="1.6" fill="#3b82f6"/>`;
        break;
      case 'lion':
        glyph = `<circle cx="32" cy="33" r="21" fill="#b45309"/><path d="M32 12 L36 18 L42 14 L43 21 L50 20 L47 27 L53 31 L47 35 L50 42 L43 42 L42 49 L36 45 L32 51 L28 45 L22 49 L21 42 L14 42 L17 35 L11 31 L17 27 L14 20 L21 21 L22 14 L28 18 Z" fill="#d97706"/>
          <circle cx="32" cy="33" r="13" fill="${item.fg}"/><circle cx="27" cy="31" r="1.8" fill="#111"/><circle cx="37" cy="31" r="1.8" fill="#111"/>
          <ellipse cx="32" cy="39" rx="5.5" ry="4" fill="#fde68a"/><path d="M29.5 37 L34.5 37 L32 39.5 Z" fill="#111"/>`;
        break;
      case 'wizard':
        glyph = `<path d="M32 6 L46 36 L18 36 Z" fill="#4c1d95"/><path d="M14 36 L50 36 L48 40 L16 40 Z" fill="${item.fg}"/>
          <text x="30" y="27" font-size="8" fill="#facc15">★</text><text x="37" y="20" font-size="5" fill="#fde68a">✦</text>
          <circle cx="32" cy="46" r="9" fill="#fcd9b6"/><circle cx="29" cy="45" r="1.3" fill="#111"/><circle cx="35" cy="45" r="1.3" fill="#111"/>
          <path d="M23 49 Q32 64 41 49 Q36 54 32 54 Q28 54 23 49 Z" fill="#e5e7eb"/>`;
        break;
      case 'cat_hat':
        glyph = `<polygon points="15,34 19,18 30,28" fill="${item.fg}"/><polygon points="49,34 45,18 34,28" fill="${item.fg}"/>
          <ellipse cx="32" cy="40" rx="18" ry="15" fill="${item.fg}"/><ellipse cx="32" cy="46" rx="9" ry="6" fill="#fbe3c8"/>
          <ellipse cx="25" cy="39" rx="3" ry="3.6" fill="#1b4332"/><ellipse cx="39" cy="39" rx="3" ry="3.6" fill="#1b4332"/><path d="M30 44 L34 44 L32 46.5 Z" fill="#e5677b"/>
          <ellipse cx="32" cy="27" rx="17" ry="3.5" fill="#0d0d0d"/><rect x="22" y="8" width="20" height="19" rx="3" fill="#161616"/><rect x="22" y="20" width="20" height="4" fill="#d4af37"/>`;
        break;
      case 'immortal':
        glyph = `<polygon points="32,10 50,24 44,48 20,48 14,24" fill="none" stroke="#ffd700" stroke-width="3"/><path d="M32 18 C24 27 20 31 20 36 C20 40 24 42 28 40 L26 46 L38 46 L36 40 C40 42 44 40 44 36 C44 31 40 27 32 18 Z" fill="${item.fg}"/>`;
        break;
    }

    // Professional finish: lit gradient backdrop, metallic rim, glossy highlight (unique ids per render)
    const uid = `av${(renderCount = (renderCount + 1) % 1e9)}`;
    const rim = isDiamond ? ['#e0f2fe', '#67e8f9', '#0e7490'] : isMythic ? ['#fbcfe8', '#ff4ecd', '#7e22ce'] : ['#fff1b8', '#d4af37', '#7a5a0c'];
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="${uid}bg" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stop-color="${item.bg}" stop-opacity="1"/>
          <stop offset="55%" stop-color="${item.bg}"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
        <radialGradient id="${uid}lit" cx="50%" cy="30%" r="55%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="${uid}rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${rim[0]}"/>
          <stop offset="50%" stop-color="${rim[1]}"/>
          <stop offset="100%" stop-color="${rim[2]}"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#${uid}bg)"/>
      <circle cx="32" cy="32" r="30" fill="url(#${uid}lit)"/>
      ${isLeg ? '<circle cx="32" cy="32" r="26" fill="none" stroke="#ffd700" stroke-width="1" stroke-dasharray="3 3" opacity="0.7"/>' : ''}
      ${isMythic ? '<circle cx="32" cy="32" r="27" fill="none" stroke="#22d3ee" stroke-width="1.2" stroke-dasharray="2 4"/>' : ''}
      ${isDiamond ? '<circle cx="32" cy="32" r="27" fill="none" stroke="#e0f2fe" stroke-width="1" stroke-dasharray="1 3"/>' : ''}
      <g style="filter: drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.45))">${glyph}</g>
      <path d="M12 22 A22 22 0 0 1 52 22 A30 18 0 0 0 12 22 Z" fill="#ffffff" opacity="0.12"/>
      <circle cx="32" cy="32" r="30" fill="none" stroke="url(#${uid}rim)" stroke-width="${isLeg || isMythic || isDiamond ? '3.5' : '2.6'}"/>
      ${isDiamond ? '<polygon points="52,6 56,10 52,16 48,10" fill="#67e8f9" stroke="#fff" stroke-width="0.8"/>' : ''}
    </svg>`;
  }

  let renderCount = 0;

  /**
   * Any avatar, including the player's own gallery photo ('photo' → their saved picture,
   * shown only on their own device; other players see their chosen fallback).
   */
  // Realistic portrait avatars: shown as a round photo (falls back to the drawn style if the image is missing)
  const AVATAR_BY_ID = new Map(AVATARS.map(a => [a.id, a]));
  function renderImageAvatar(av, size) {
    if (!av || !av.image || !/^data:image\/webp;base64,/.test(av.image)) return null; // only when the picture is embedded
    return `<img class="avatar-photo avatar-portrait" src="${av.image}" width="${size}" height="${size}" alt="" draggable="false" style="width:${size}px;height:${size}px"/>`;
  }

  function renderAvatar(avatarId, size = 56, photoUrl = null) {
    const portrait = renderImageAvatar(AVATAR_BY_ID.get(avatarId), size);
    if (portrait) return portrait;
    if (avatarId === 'photo') {
      const url = photoUrl || (SH.store && SH.store.getProfile().photo);
      if (url && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(url)) {
        return `<img class="avatar-photo" src="${url}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px"/>`;
      }
      return renderAvatarSVG('free_ace', size);
    }
    return renderAvatarSVG(avatarId, size);
  }

  SH.AVATARS = AVATARS;
  SH.renderAvatarSVG = renderAvatar; // photo-aware (all screens use this)
  SH.renderAvatarArt = (id, size) => renderImageAvatar(AVATAR_BY_ID.get(id), size) || renderAvatarSVG(id, size);
})(typeof globalThis !== 'undefined' ? globalThis : window);
