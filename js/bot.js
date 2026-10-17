/**
 * Spades by Hadzz - Fair Multi-Tier Bot AI Engine
 * Levels: Beginner, Easy, Medium, Hard, Impossible
 *
 * FAIRNESS GUARANTEE:
 * Functions in this module accept ONLY public game state (`ownHand`, `bids`,
 * `tricksWon`, `currentTrick`, `playedHistory`, `spadesBroken`, `teamBags`).
 * Hidden hands of other seats and undealt cards are never passed or inspected.
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  const BOT_LEVELS = {
    Beginner: { tier: 1, precision: 0.65, label: 'Beginner' },
    Easy: { tier: 2, precision: 0.74, label: 'Easy' },
    Medium: { tier: 3, precision: 0.82, label: 'Medium' },
    Hard: { tier: 4, precision: 0.91, label: 'Hard' },
    Impossible: { tier: 5, precision: 1.0, label: 'Impossible' }
  };

  function chooseBotBid(publicState) {
    const { ownHand, seat, bids, difficulty = 'Medium', numPlayers = 4 } = publicState;
    const cfg = BOT_LEVELS[difficulty] || BOT_LEVELS.Medium;
    // 3-player (cutthroat) has no partner
    const partnerSeat = numPlayers === 4 ? (seat + 2) % 4 : null;
    const partnerBid = partnerSeat === null ? undefined : bids[partnerSeat];

    const bySuit = { C: [], D: [], H: [], S: [] };
    for (const c of ownHand) {
      bySuit[c.suit].push(c);
    }
    const spades = bySuit.S;

    // Check Nil (0) viability for Medium, Hard, Impossible
    if (cfg.tier >= 3) {
      const highCards = ownHand.filter(c => c.rank >= 12).length;
      const highSpades = spades.filter(c => c.rank >= 10).length;
      const partnerAlreadyNil = partnerBid === 0;
      if (!partnerAlreadyNil && highCards === 0 && highSpades === 0 && spades.length <= 3) {
        if (cfg.tier >= 4 || Math.random() < 0.75) {
          return 0;
        }
      }
    }

    let estimatedTricks = 0;

    for (const s of ['C', 'D', 'H']) {
      const cards = bySuit[s];
      const len = cards.length;
      const hasAce = cards.some(c => c.rank === 14);
      const hasKing = cards.some(c => c.rank === 13);
      const hasQueen = cards.some(c => c.rank === 12);

      if (hasAce && len <= 6) {
        estimatedTricks += len >= 5 ? 0.8 : 0.95;
      }
      if (hasKing && len >= 2 && len <= 5) {
        estimatedTricks += len === 5 ? 0.45 : 0.72;
      }
      if (cfg.tier >= 3 && hasQueen && len >= 3 && len <= 4 && (hasAce || hasKing)) {
        estimatedTricks += 0.35;
      }
    }

    for (const sp of spades) {
      if (sp.rank === 14) estimatedTricks += 1.0;
      else if (sp.rank === 13) estimatedTricks += spades.length >= 2 ? 0.9 : 0.5;
      else if (sp.rank === 12) estimatedTricks += spades.length >= 3 ? 0.75 : 0.3;
      else if (sp.rank === 11 && spades.length >= 4) estimatedTricks += 0.55;
    }

    if (cfg.tier >= 2 && spades.length > 3) {
      estimatedTricks += (spades.length - 3) * 0.65;
    }
    if (cfg.tier >= 4 && spades.length >= 3) {
      for (const s of ['C', 'D', 'H']) {
        if (bySuit[s].length === 0) estimatedTricks += 0.75;
        else if (bySuit[s].length === 1) estimatedTricks += 0.4;
      }
    }

    if (cfg.tier >= 4 && typeof partnerBid === 'number') {
      if (partnerBid >= 6) {
        estimatedTricks -= 0.35;
      } else if (partnerBid === 0) {
        estimatedTricks -= 0.25;
      }
    }

    if (cfg.tier === 1) {
      estimatedTricks += (Math.random() - 0.45) * 1.4;
    } else if (cfg.tier === 2) {
      estimatedTricks += (Math.random() - 0.5) * 0.8;
    }

    return Math.max(1, Math.min(10, Math.round(estimatedTricks)));
  }

  function analyzePublicHistory(ownHand, currentTrick, playedHistory) {
    const seenIds = new Set();
    const voidSuits = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };

    for (const c of ownHand) seenIds.add(c.id);
    for (const entry of playedHistory) {
      seenIds.add(entry.card.id);
      if (entry.ledSuit && entry.card.suit !== entry.ledSuit) {
        voidSuits[entry.seat].add(entry.ledSuit);
      }
    }
    if (currentTrick.length > 0) {
      const ledSuit = currentTrick[0].card.suit;
      for (const play of currentTrick) {
        seenIds.add(play.card.id);
        if (play.card.suit !== ledSuit) {
          voidSuits[play.seat].add(ledSuit);
        }
      }
    }

    function isBossCard(card) {
      for (let r = card.rank + 1; r <= 14; r++) {
        const rankLabel = r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r);
        const higherId = `${rankLabel}${card.suit}`;
        if (!seenIds.has(higherId)) return false;
      }
      return true;
    }

    return { seenIds, voidSuits, isBossCard };
  }

  function wouldBeatCurrentTrick(candidateCard, seat, currentTrick) {
    if (currentTrick.length === 0) return true;
    const simulated = [...currentTrick, { seat, card: candidateCard }];
    return SH.resolveTrickWinner(simulated) === seat;
  }

  function chooseBotCard(publicState) {
    const {
      ownHand,
      seat,
      bids,
      tricksWon,
      currentTrick,
      playedHistory = [],
      spadesBroken,
      teamBags = [0, 0], // 4-player: per team; 3-player: per seat
      difficulty = 'Medium',
      numPlayers = 4
    } = publicState;

    const cfg = BOT_LEVELS[difficulty] || BOT_LEVELS.Medium;
    const legal = SH.getLegalCards(ownHand, currentTrick, spadesBroken);
    if (legal.length === 1) return legal[0];

    const solo = numPlayers === 3;
    const partnerSeat = solo ? null : (seat + 2) % 4;
    const opp1 = (seat + 1) % numPlayers;
    const opp2 = solo ? (seat + 2) % 3 : (seat + 3) % 4;
    const lastPosition = numPlayers - 1;

    const ownBid = bids[seat] ?? 3;
    const partnerBid = solo ? -1 : (bids[partnerSeat] ?? 3);
    const oppNilSeat = bids[opp1] === 0 && tricksWon[opp1] === 0
      ? opp1
      : (bids[opp2] === 0 && tricksWon[opp2] === 0 ? opp2 : null);

    const isPlayingNil = ownBid === 0 && tricksWon[seat] === 0;
    const isProtectingPartnerNil = !solo && partnerBid === 0 && tricksWon[partnerSeat] === 0;

    const teamContract = (ownBid > 0 ? ownBid : 0) + (partnerBid > 0 ? partnerBid : 0);
    const teamTricks = (ownBid > 0 ? tricksWon[seat] : 0) + (!solo && partnerBid > 0 ? tricksWon[partnerSeat] : 0);
    const myBags = (solo ? teamBags[seat] : teamBags[seat % 2 === 0 ? 0 : 1]) || 0;

    const avoidBags = cfg.tier >= 4 &&
      !isProtectingPartnerNil &&
      oppNilSeat === null &&
      teamContract > 0 &&
      teamTricks >= teamContract &&
      myBags >= 5;

    if (Math.random() > cfg.precision) {
      const sortedAsc = [...legal].sort((a, b) => a.rank - b.rank);
      return sortedAsc[Math.floor(Math.random() * Math.min(2, sortedAsc.length))];
    }

    const memory = analyzePublicHistory(ownHand, currentTrick, playedHistory);
    const asc = [...legal].sort((a, b) => (a.suit === 'S' ? 20 : 0) + a.rank - ((b.suit === 'S' ? 20 : 0) + b.rank));

    if (isPlayingNil) {
      if (currentTrick.length === 0) {
        const nonSpades = legal.filter(c => c.suit !== 'S').sort((a, b) => a.rank - b.rank);
        return nonSpades[0] || asc[0];
      }
      const losingCards = legal.filter(c => !wouldBeatCurrentTrick(c, seat, currentTrick));
      if (losingCards.length > 0) {
        losingCards.sort((a, b) => b.rank - a.rank);
        return losingCards[0];
      }
      return asc[0];
    }

    if (currentTrick.length === 0) {
      if (isProtectingPartnerNil && cfg.tier >= 3) {
        const highNonSpades = legal.filter(c => c.suit !== 'S' && c.rank >= 12).sort((a, b) => b.rank - a.rank);
        if (highNonSpades.length > 0) return highNonSpades[0];
      }

      if (oppNilSeat !== null && cfg.tier >= 4) {
        const probeCards = legal
          .filter(c => c.suit !== 'S' && !memory.voidSuits[oppNilSeat].has(c.suit))
          .sort((a, b) => a.rank - b.rank);
        if (probeCards.length > 0) return probeCards[0];
      }

      if (avoidBags) {
        const lowNonSpades = legal.filter(c => c.suit !== 'S').sort((a, b) => a.rank - b.rank);
        if (lowNonSpades.length > 0) return lowNonSpades[0];
      }

      if (cfg.tier >= 3) {
        const bossNonSpades = legal.filter(c => c.suit !== 'S' && memory.isBossCard(c));
        if (bossNonSpades.length > 0) {
          const safeBoss = bossNonSpades.find(
            c => !memory.voidSuits[opp1].has(c.suit) && !memory.voidSuits[opp2].has(c.suit)
          );
          return safeBoss || bossNonSpades[0];
        }
      } else {
        const aces = legal.filter(c => c.suit !== 'S' && c.rank === 14);
        if (aces.length > 0) return aces[0];
      }

      const nonSpades = legal.filter(c => c.suit !== 'S').sort((a, b) => a.rank - b.rank);
      return nonSpades[0] || asc[0];
    }

    const currentWinnerSeat = SH.resolveTrickWinner(currentTrick);
    const partnerCurrentlyWinning = !solo && currentWinnerSeat === partnerSeat;
    const winningCards = legal.filter(c => wouldBeatCurrentTrick(c, seat, currentTrick));
    const losingCards = legal.filter(c => !wouldBeatCurrentTrick(c, seat, currentTrick));

    if (isProtectingPartnerNil && partnerCurrentlyWinning && winningCards.length > 0) {
      winningCards.sort((a, b) => a.rank - b.rank);
      return winningCards[0];
    }

    if (oppNilSeat !== null && cfg.tier >= 4) {
      if (currentWinnerSeat === oppNilSeat && losingCards.length > 0) {
        losingCards.sort((a, b) => b.rank - a.rank);
        return losingCards[0];
      }
    }

    if (avoidBags && losingCards.length > 0) {
      losingCards.sort((a, b) => b.rank - a.rank);
      return losingCards[0];
    }

    if (partnerCurrentlyWinning && !isProtectingPartnerNil) {
      const partnerPlay = currentTrick.find(p => p.seat === partnerSeat);
      const isLastSeat = currentTrick.length === lastPosition;
      const partnerCardStrong = partnerPlay && (
        partnerPlay.card.suit === 'S' ||
        partnerPlay.card.rank >= 13 ||
        (cfg.tier >= 4 && memory.isBossCard(partnerPlay.card))
      );
      if (isLastSeat || partnerCardStrong) {
        return asc[0];
      }
    }

    if (winningCards.length > 0) {
      const isLastSeat = currentTrick.length === lastPosition;
      winningCards.sort((a, b) => (a.suit === 'S' ? 20 : 0) + a.rank - ((b.suit === 'S' ? 20 : 0) + b.rank));

      if (isLastSeat) {
        return winningCards[0];
      }

      if (cfg.tier >= 3) {
        const bossWinner = winningCards.find(c => c.suit !== 'S' && memory.isBossCard(c));
        if (bossWinner) return bossWinner;
      }
      return winningCards[0];
    }

    const nonSpadeLosers = legal.filter(c => c.suit !== 'S').sort((a, b) => a.rank - b.rank);
    return nonSpadeLosers[0] || asc[0];
  }

  SH.BOT_LEVELS = BOT_LEVELS;
  SH.chooseBotBid = chooseBotBid;
  SH.chooseBotCard = chooseBotCard;
})(typeof globalThis !== 'undefined' ? globalThis : window);
