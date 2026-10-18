/**
 * Spades by Hadzz - Core Four-Seat Spades Rules, Cryptographic Dealer & Modern Card SVG Renderer
 * Enforces deal, 0-10 bidding, suit-following, trump breaking, trick winner,
 * Nil bonuses/penalties, overtrick bags, 10-bag penalty, and 250/500 target score.
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  const SUITS = ['C', 'D', 'H', 'S'];
  const SUIT_NAMES = {
    C: 'Clubs',
    D: 'Diamonds',
    H: 'Hearts',
    S: 'Spades'
  };
  const SUIT_SYMBOLS = {
    C: '♣',
    D: '♦',
    H: '♥',
    S: '♠'
  };
  const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const RANK_LABELS = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `${RANK_LABELS[rank]}${suit}`,
          suit,
          rank,
          label: RANK_LABELS[rank],
          symbol: SUIT_SYMBOLS[suit]
        });
      }
    }
    return deck;
  }

  /**
   * Unbiased cryptographic random integer in [0, maxExclusive)
   */
  function randomInt(maxExclusive) {
    if (maxExclusive <= 1) return 0;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      let val;
      do {
        crypto.getRandomValues(buf);
        val = buf[0];
      } while (val >= limit);
      return val % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  /**
   * Multi-stage shuffle:
   * 1. Pass 1 Cryptographic Fisher-Yates
   * 2. Random deck cut + interleaved casino riffle pass
   * 3. Pass 2 & 3 Cryptographic Fisher-Yates
   */
  function shuffleDeck(deck) {
    let cards = [...deck];

    // Pass 1: Fisher-Yates
    for (let i = cards.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    // Random cut
    const cutPoint = 12 + randomInt(28);
    cards = [...cards.slice(cutPoint), ...cards.slice(0, cutPoint)];

    // Interleaved riffle shuffle with slight random packet sizes (1-2 cards)
    const half = Math.floor(cards.length / 2);
    const left = cards.slice(0, half);
    const right = cards.slice(half);
    const riffled = [];
    while (left.length > 0 || right.length > 0) {
      if (left.length > 0 && (right.length === 0 || randomInt(2) === 0)) {
        riffled.push(left.shift());
      } else if (right.length > 0) {
        riffled.push(right.shift());
      }
    }
    cards = riffled;

    // Passes 2 & 3: Fisher-Yates
    for (let pass = 0; pass < 2; pass++) {
      for (let i = cards.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
    }

    return cards;
  }

  /**
   * Deals 52 freshly shuffled cards clockwise one card at a time to all 4 seats
   * starting with `(dealerSeat + 1) % 4`, then sorts each seat's 13-card hand.
   */
  function dealFourHands(dealerSeat = 3) {
    const freshDeck = shuffleDeck(createDeck());
    const hands = [[], [], [], []];
    for (let i = 0; i < 52; i++) {
      const targetSeat = (dealerSeat + 1 + i) % 4;
      hands[targetSeat].push(freshDeck[i]);
    }
    return hands.map(h => sortHand(h));
  }

  /**
   * Deals for 4 players (13 cards each) or 3-player cutthroat: the 2♣ is removed
   * and the remaining 51 cards give each player 17. Fresh crypto shuffle every call.
   */
  function dealHands(numPlayers = 4, dealerSeat = numPlayers - 1) {
    if (numPlayers !== 3) return dealFourHands(dealerSeat);
    const freshDeck = shuffleDeck(createDeck().filter(c => c.id !== '2C'));
    const hands = [[], [], []];
    for (let i = 0; i < freshDeck.length; i++) {
      hands[(dealerSeat + 1 + i) % 3].push(freshDeck[i]);
    }
    return hands.map(h => sortHand(h));
  }

  function sortHand(hand) {
    const suitOrder = { C: 0, D: 1, H: 2, S: 3 };
    return [...hand].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return a.rank - b.rank;
    });
  }

  /**
   * Spades Royale premium deck — professional suit shapes (100×100 artboard), drawn as SVG
   * so they look identical on every phone (no emoji / font glyph differences).
   */
  const SUIT_SVG_BODY = {
    S: '<path d="M50 4C50 4 8 37 8 61C8 77 21 87 35 83C41 81 45.5 77 48 72.5C47 83 42.5 91 32 96H68C57.5 91 53 83 52 72.5C54.5 77 59 81 65 83C79 87 92 77 92 61C92 37 50 4 50 4Z"/>',
    H: '<path d="M50 93C44 87.5 5 60 5 33C5 17 17 6.5 31 6.5C40 6.5 46.5 12 50 19.5C53.5 12 60 6.5 69 6.5C83 6.5 95 17 95 33C95 60 56 87.5 50 93Z"/>',
    D: '<path d="M50 3C61 21 74 37 89 50C74 63 61 79 50 97C39 79 26 63 11 50C26 37 39 21 50 3Z"/>',
    C: '<circle cx="50" cy="28" r="20.5"/><circle cx="27" cy="58" r="20.5"/><circle cx="73" cy="58" r="20.5"/><path d="M44.5 50C44.5 72 40 85 30 96H70C60 85 55.5 72 55.5 50Z"/>'
  };

  function suitSVG(suit, cls = '') {
    return `<svg class="pc-suit ${cls}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${SUIT_SVG_BODY[suit]}</svg>`;
  }

  // Back-compat helper (older callers)
  function renderSuitVector(suit, size = 28) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${SUIT_SVG_BODY[suit]}</svg>`;
  }

  const COURT_CROWN = {
    13: '<path d="M8 34 L14 10 L30 26 L50 4 L70 26 L86 10 L92 34 Z"/><rect x="8" y="36" width="84" height="8" rx="2"/>',
    12: '<path d="M14 34 Q20 14 32 24 Q40 6 50 18 Q60 6 68 24 Q80 14 86 34 Z"/><rect x="14" y="36" width="72" height="7" rx="2"/>',
    11: '<path d="M50 4 L58 22 L78 24 L62 36 L68 44 L50 36 L32 44 L38 36 L22 24 L42 22 Z"/>'
  };

  /**
   * Card face: modern corner indices (rank + suit), a big clean centre pip,
   * framed monogram court cards with a crown, and the lion crest on the Ace of Spades.
   * Colours come from CSS variables, so purchasable card designs restyle every card.
   */
  function renderModernCardInnerHTML(card) {
    const isCourt = card.rank >= 11 && card.rank <= 13;
    const isAce = card.rank === 14;
    let center;
    if (isAce && card.suit === 'S') {
      center = '<div class="pc-ace-crest" aria-hidden="true"></div>';
    } else if (isAce) {
      center = `<div class="pc-ace">${suitSVG(card.suit, 'pc-pip-xl')}</div>`;
    } else if (isCourt) {
      center = `
        <div class="pc-court">
          <svg class="pc-crown" viewBox="0 0 100 48" fill="currentColor" aria-hidden="true">${COURT_CROWN[card.rank]}</svg>
          <span class="pc-court-letter">${card.label}</span>
          ${suitSVG(card.suit, 'pc-pip-sm')}
        </div>`;
    } else {
      center = `<div class="pc-pip">${suitSVG(card.suit, 'pc-pip-lg')}</div>`;
    }
    return `
      <div class="pc-face ${card.suit === 'S' ? 'pc-trump' : ''}">
        <div class="pc-index pc-tl"><span class="pc-rank">${card.label}</span>${suitSVG(card.suit, 'pc-index-suit')}</div>
        <div class="pc-center">${center}</div>
        <div class="pc-index pc-br"><span class="pc-rank">${card.label}</span>${suitSVG(card.suit, 'pc-index-suit')}</div>
      </div>
    `;
  }

  /** Card designs: one free, five sold in the Profile shop for 🦁 Lions. */
  const CARD_SKINS = [
    { id: 'classic', name: 'Royale Classic', price: 0, desc: 'Clean premium ivory with deep ink & ruby' },
    { id: 'frost', name: 'Frost Pearl', price: 200, desc: 'Pearl white with icy sapphire & violet' },
    { id: 'nebula', name: 'Neon Nebula', price: 400, desc: 'Deep-space purple with neon cyan & pink' },
    { id: 'obsidian', name: 'Obsidian Emerald', price: 600, desc: 'Black card with glowing emerald & coral' },
    { id: 'imperial', name: 'Imperial Gold', price: 800, desc: 'Dark shiny gold with sapphire & royal red' },
    { id: 'vip', name: 'VIP Black Gold', price: 1000, desc: 'Pure black, gold symbols & letters — VIP only' }
  ];

  /** Table colours: the classic green felt is free, the rest are sold in the Shop for 🦁 Lions. */
  const TABLE_THEMES = [
    { id: 'emerald', name: 'Emerald Felt', price: 0, desc: 'The classic dark green casino table', swatch: ['#11603a', '#062c19'] },
    { id: 'royal', name: 'Royal Blue', price: 150, desc: 'Deep sapphire felt fit for a king', swatch: ['#1d4ed8', '#0b1a4a'] },
    { id: 'velvet', name: 'Red Velvet', price: 250, desc: 'Rich crimson velvet, high-roller style', swatch: ['#9f1239', '#3b0614'] },
    { id: 'marble', name: 'Black Marble', price: 400, desc: 'Polished black stone with silver veins', swatch: ['#3a3a40', '#0b0b0d'] },
    { id: 'goldleaf', name: 'Gold Leaf', price: 600, desc: 'Black table edged in shimmering gold leaf', swatch: ['#a16207', '#1c1405'] },
    // 💎 VIP tables — bought with Diamonds
    { id: 'galaxy', name: 'Galaxy Night', price: 5, currency: 'diamonds', vip: true, desc: 'Deep-space purple with twinkling stars', swatch: ['#6d28d9', '#0b0420'] },
    { id: 'icediamond', name: 'Diamond Ice', price: 8, currency: 'diamonds', vip: true, desc: 'Frozen cyan crystal with a diamond sparkle', swatch: ['#22d3ee', '#062a3a'] },
    { id: 'ruby', name: 'Ruby Royale', price: 10, currency: 'diamonds', vip: true, desc: 'Blood-red ruby felt with a gold crown rail', swatch: ['#e11d48', '#2a0410'] },
    { id: 'aurora', name: 'Northern Aurora', price: 12, currency: 'diamonds', vip: true, desc: 'Glowing green, teal & violet sky lights', swatch: ['#10b981', '#4c1d95'] },
    { id: 'platinum', name: 'Platinum VIP', price: 15, currency: 'diamonds', vip: true, desc: 'Brushed platinum with a silver glow', swatch: ['#94a3b8', '#1e293b'] },
    { id: 'blackgold', name: 'Black Gold Throne', price: 25, currency: 'diamonds', vip: true, desc: 'The ultimate: black velvet, glowing gold rail', swatch: ['#facc15', '#000000'] }
  ];

  function validateCardPlay(card, hand, currentTrick, spadesBroken) {
    if (!card) {
      return { valid: false, reason: 'No card selected.' };
    }
    const ownsCard = hand.some(c => c.id === card.id);
    if (!ownsCard) {
      return { valid: false, reason: 'Card is not in this hand.' };
    }

    if (currentTrick.length === 0) {
      if (card.suit === 'S' && !spadesBroken) {
        const hasNonSpade = hand.some(c => c.suit !== 'S');
        if (hasNonSpade) {
          return {
            valid: false,
            reason: 'Illegal Lead: Spades cannot be led until broken (unless you hold only Spades).'
          };
        }
      }
      return { valid: true, reason: '' };
    }

    const ledSuit = currentTrick[0].card.suit;
    if (card.suit !== ledSuit) {
      const hasLedSuit = hand.some(c => c.suit === ledSuit);
      if (hasLedSuit) {
        return {
          valid: false,
          reason: `Illegal Play: You must follow suit (${SUIT_NAMES[ledSuit]} ${SUIT_SYMBOLS[ledSuit]}) while you hold ${SUIT_NAMES[ledSuit]}.`
        };
      }
    }

    return { valid: true, reason: '' };
  }

  function getLegalCards(hand, currentTrick, spadesBroken) {
    return hand.filter(c => validateCardPlay(c, hand, currentTrick, spadesBroken).valid);
  }

  function resolveTrickWinner(trickPlays) {
    const ledSuit = trickPlays[0].card.suit;
    let bestPlay = trickPlays[0];

    for (let i = 1; i < trickPlays.length; i++) {
      const candidate = trickPlays[i];
      const bestIsSpade = bestPlay.card.suit === 'S';
      const candIsSpade = candidate.card.suit === 'S';

      if (candIsSpade && !bestIsSpade) {
        bestPlay = candidate;
      } else if (candIsSpade && bestIsSpade) {
        if (candidate.card.rank > bestPlay.card.rank) {
          bestPlay = candidate;
        }
      } else if (!bestIsSpade && candidate.card.suit === ledSuit) {
        if (candidate.card.rank > bestPlay.card.rank) {
          bestPlay = candidate;
        }
      }
    }

    return bestPlay.seat;
  }

  function computeTeamRoundScore(seatA, seatB, prevScore, prevBags) {
    const players = [seatA, seatB];
    let nilDelta = 0;
    const nilNotes = [];
    let nonNilBidSum = 0;
    let nonNilTricks = 0;
    let failedNilBags = 0;

    for (const p of players) {
      if (p.bid === 0) {
        if (p.tricks === 0) {
          nilDelta += 100;
          nilNotes.push(`${p.name}: Nil succeeded (+100)`);
        } else {
          nilDelta -= 100;
          failedNilBags += p.tricks;
          nilNotes.push(`${p.name}: Nil failed with ${p.tricks} trick${p.tricks > 1 ? 's' : ''} (-100, +${p.tricks} bag${p.tricks > 1 ? 's' : ''})`);
        }
      } else {
        nonNilBidSum += p.bid;
        nonNilTricks += p.tricks;
      }
    }

    let contractPoints = 0;
    let roundBags = failedNilBags;
    let contractNote = '';

    if (nonNilBidSum > 0) {
      if (nonNilTricks >= nonNilBidSum) {
        const overtricks = nonNilTricks - nonNilBidSum;
        contractPoints = nonNilBidSum * 10 + overtricks;
        roundBags += overtricks;
        contractNote = `Made ${nonNilTricks}/${nonNilBidSum} (+${nonNilBidSum * 10} pts${overtricks > 0 ? `, +${overtricks} bag${overtricks > 1 ? 's' : ''}` : ''})`;
      } else {
        contractPoints = -nonNilBidSum * 10;
        contractNote = `Set ${nonNilTricks}/${nonNilBidSum} (${contractPoints} pts)`;
      }
    } else {
      contractNote = 'Double Nil contract';
    }

    let totalBags = prevBags + roundBags;
    let bagPenalty = 0;
    while (totalBags >= 10) {
      bagPenalty -= 100;
      totalBags -= 10;
    }

    const netDelta = contractPoints + nilDelta + bagPenalty;
    const newScore = prevScore + netDelta;

    return {
      teamBid: seatA.bid + seatB.bid,
      teamTricks: seatA.tricks + seatB.tricks,
      contractPoints,
      nilDelta,
      nilNotes,
      roundBags,
      bagPenalty,
      netDelta,
      newScore,
      newBags: totalBags,
      contractNote
    };
  }

  /**
   * Table pace (ms). Shared by the offline game, Pass & Play and the online server.
   * botBidMs / botPlayMs: how long a bot "thinks"; trickPauseMs: how long a finished trick stays on the mat.
   */
  const GAME_SPEEDS = {
    relaxed: { label: 'Relaxed', botBidMs: 1000, botPlayMs: 1150, trickPauseMs: 1900 },
    normal: { label: 'Normal', botBidMs: 550, botPlayMs: 600, trickPauseMs: 1400 }, // long enough to see who won the trick
    fast: { label: 'Super Fast', botBidMs: 220, botPlayMs: 250, trickPauseMs: 900 } // super fast
  };

  function getGameSpeed(id) {
    return GAME_SPEEDS[id] || GAME_SPEEDS.normal;
  }

  const BOT_NAME_POOL = [
    'Ava', 'Leo', 'Maya', 'Omar', 'Zara', 'Kai', 'Nina', 'Jay', 'Rosa', 'Eli', 'Sana', 'Theo',
    'Lina', 'Max', 'Iris', 'Rio', 'Noor', 'Finn', 'Luca', 'Mila', 'Ezra', 'Yara', 'Jude', 'Aria',
    'Remy', 'Tess', 'Sami', 'Nico', 'Lola', 'Ravi', 'June', 'Ola', 'Hugo', 'Ines', 'Zayn', 'Cleo'
  ];

  /** Picks `count` different random bot names (fresh every game), avoiding names already at the table. */
  function pickBotNames(count, exclude = []) {
    const taken = new Set(exclude.map(n => String(n).toLowerCase()));
    const pool = BOT_NAME_POOL.filter(n => !taken.has(n.toLowerCase()));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  /** Individual (3-player cutthroat) round score — same contract, Nil and bag rules as teams. */
  function computeSoloRoundScore(p, prevScore, prevBags) {
    let contractPoints = 0;
    let nilDelta = 0;
    let roundBags = 0;
    const nilNotes = [];
    let contractNote;

    if (p.bid === 0) {
      if (p.tricks === 0) {
        nilDelta = 100;
        nilNotes.push(`${p.name}: Nil succeeded (+100)`);
      } else {
        nilDelta = -100;
        roundBags = p.tricks;
        nilNotes.push(`${p.name}: Nil failed with ${p.tricks} trick${p.tricks > 1 ? 's' : ''} (-100, +${p.tricks} bag${p.tricks > 1 ? 's' : ''})`);
      }
      contractNote = 'Nil bid';
    } else if (p.tricks >= p.bid) {
      const over = p.tricks - p.bid;
      contractPoints = p.bid * 10 + over;
      roundBags = over;
      contractNote = `Made ${p.tricks}/${p.bid} (+${p.bid * 10} pts${over > 0 ? `, +${over} bag${over > 1 ? 's' : ''}` : ''})`;
    } else {
      contractPoints = -p.bid * 10;
      contractNote = `Set ${p.tricks}/${p.bid} (${contractPoints} pts)`;
    }

    let totalBags = prevBags + roundBags;
    let bagPenalty = 0;
    while (totalBags >= 10) {
      bagPenalty -= 100;
      totalBags -= 10;
    }
    const netDelta = contractPoints + nilDelta + bagPenalty;
    return {
      teamBid: p.bid,
      teamTricks: p.tricks,
      contractPoints,
      nilDelta,
      nilNotes,
      roundBags,
      bagPenalty,
      netDelta,
      newScore: prevScore + netDelta,
      newBags: totalBags,
      contractNote
    };
  }

  /** 3-player seat colours (individual play). */
  const SOLO_COLORS = ['blue', 'red', 'yellow'];
  /** Team ids stay 'blue'/'red' inside the game; on screen your side (South/North, seat 0) is shown as RED. */
  const TEAM_DISPLAY = { blue: 'Red', red: 'Blue', yellow: 'Yellow' };
  function teamDisplayName(id) { return TEAM_DISPLAY[id] || String(id || ''); }

  Object.assign(SH, {
    dealHands,
    computeSoloRoundScore,
    SOLO_COLORS,
    teamDisplayName,
    pickBotNames,
    GAME_SPEEDS,
    getGameSpeed,
    SUITS,
    SUIT_NAMES,
    SUIT_SYMBOLS,
    RANKS,
    RANK_LABELS,
    createDeck,
    shuffleDeck,
    dealFourHands,
    sortHand,
    renderModernCardInnerHTML,
    renderSuitVector,
    CARD_SKINS,
    TABLE_THEMES,
    validateCardPlay,
    getLegalCards,
    resolveTrickWinner,
    computeTeamRoundScore
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
