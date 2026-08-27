import { Card, RANK_VALUES } from '../../types/card.types';

export type HandCategory =
  | 'HIGH_CARD'
  | 'ONE_PAIR'
  | 'TWO_PAIR'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'FULL_HOUSE'
  | 'FOUR_OF_A_KIND'
  | 'STRAIGHT_FLUSH'
  | 'ROYAL_FLUSH';

const CATEGORY_TIER: Record<Exclude<HandCategory, 'ROYAL_FLUSH'>, number> = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
};

const CATEGORY_LABEL: Record<HandCategory, string> = {
  HIGH_CARD: 'High Card',
  ONE_PAIR: 'One Pair',
  TWO_PAIR: 'Two Pair',
  THREE_OF_A_KIND: 'Three of a Kind',
  STRAIGHT: 'Straight',
  FLUSH: 'Flush',
  FULL_HOUSE: 'Full House',
  FOUR_OF_A_KIND: 'Four of a Kind',
  STRAIGHT_FLUSH: 'Straight Flush',
  ROYAL_FLUSH: 'Royal Flush',
};

export interface HandResult {
  category: HandCategory;
  /** Comparable strength: [tier(1-9), ...tiebreakers] compared lexicographically. */
  score: number[];
  bestFiveCards: Card[];
  description: string;
}

function combinations<T>(items: T[], k: number): T[][] {
  const results: T[][] = [];
  const combo: T[] = [];

  function backtrack(start: number): void {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      combo.push(items[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return results;
}

function detectStraight(sortedDescValues: number[]): number | null {
  const unique = Array.from(new Set(sortedDescValues)).sort((a, b) => b - a);

  for (let i = 0; i <= unique.length - 5; i++) {
    const window = unique.slice(i, i + 5);
    const isConsecutive = window.every((v, idx) => idx === 0 || window[idx - 1] - v === 1);
    if (isConsecutive) {
      return window[0];
    }
  }

  // Wheel straight: A-2-3-4-5 (Ace plays low, straight high = 5)
  const isWheel = unique.includes(14) && [2, 3, 4, 5].every((v) => unique.includes(v));
  return isWheel ? 5 : null;
}

function evaluateFiveCardHand(cards: Card[]): HandResult {
  const values = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);
  const straightHigh = detectStraight(values);

  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.value - a.value));

  const byRankDesc = (vals: number[]) => vals.sort((a, b) => b - a);
  const sortedCardsDesc = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);

  if (isFlush && straightHigh !== null) {
    const category: HandCategory = straightHigh === 14 ? 'ROYAL_FLUSH' : 'STRAIGHT_FLUSH';
    return {
      category,
      score: [CATEGORY_TIER.STRAIGHT_FLUSH, straightHigh],
      bestFiveCards: orderStraightCards(cards, straightHigh),
      description: CATEGORY_LABEL[category],
    };
  }

  if (groups[0].count === 4) {
    const kicker = groups.find((g) => g.count === 1)!.value;
    return {
      category: 'FOUR_OF_A_KIND',
      score: [CATEGORY_TIER.FOUR_OF_A_KIND, groups[0].value, kicker],
      bestFiveCards: sortedCardsDesc,
      description: CATEGORY_LABEL.FOUR_OF_A_KIND,
    };
  }

  if (groups[0].count === 3 && groups[1]?.count === 2) {
    return {
      category: 'FULL_HOUSE',
      score: [CATEGORY_TIER.FULL_HOUSE, groups[0].value, groups[1].value],
      bestFiveCards: sortedCardsDesc,
      description: CATEGORY_LABEL.FULL_HOUSE,
    };
  }

  if (isFlush) {
    return {
      category: 'FLUSH',
      score: [CATEGORY_TIER.FLUSH, ...byRankDesc(values)],
      bestFiveCards: sortedCardsDesc,
      description: CATEGORY_LABEL.FLUSH,
    };
  }

  if (straightHigh !== null) {
    return {
      category: 'STRAIGHT',
      score: [CATEGORY_TIER.STRAIGHT, straightHigh],
      bestFiveCards: orderStraightCards(cards, straightHigh),
      description: CATEGORY_LABEL.STRAIGHT,
    };
  }

  if (groups[0].count === 3) {
    const kickers = byRankDesc(groups.filter((g) => g.count === 1).map((g) => g.value));
    return {
      category: 'THREE_OF_A_KIND',
      score: [CATEGORY_TIER.THREE_OF_A_KIND, groups[0].value, ...kickers],
      bestFiveCards: sortedCardsDesc,
      description: CATEGORY_LABEL.THREE_OF_A_KIND,
    };
  }

  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairValues = byRankDesc([groups[0].value, groups[1].value]);
    const kicker = groups.find((g) => g.count === 1)!.value;
    return {
      category: 'TWO_PAIR',
      score: [CATEGORY_TIER.TWO_PAIR, ...pairValues, kicker],
      bestFiveCards: sortedCardsDesc,
      description: CATEGORY_LABEL.TWO_PAIR,
    };
  }

  if (groups[0].count === 2) {
    const kickers = byRankDesc(groups.filter((g) => g.count === 1).map((g) => g.value));
    return {
      category: 'ONE_PAIR',
      score: [CATEGORY_TIER.ONE_PAIR, groups[0].value, ...kickers],
      bestFiveCards: sortedCardsDesc,
      description: CATEGORY_LABEL.ONE_PAIR,
    };
  }

  return {
    category: 'HIGH_CARD',
    score: [CATEGORY_TIER.HIGH_CARD, ...byRankDesc(values)],
    bestFiveCards: sortedCardsDesc,
    description: CATEGORY_LABEL.HIGH_CARD,
  };
}

function orderStraightCards(cards: Card[], straightHigh: number): Card[] {
  const wanted = straightHigh === 5 ? [5, 4, 3, 2, 14] : [straightHigh, straightHigh - 1, straightHigh - 2, straightHigh - 3, straightHigh - 4];
  const pool = [...cards];
  const ordered: Card[] = [];
  for (const value of wanted) {
    const idx = pool.findIndex((c) => RANK_VALUES[c.rank] === value);
    if (idx !== -1) {
      ordered.push(pool[idx]);
      pool.splice(idx, 1);
    }
  }
  return ordered;
}

function compareScores(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Evaluates the best possible 5-card hand out of any 5-7 given cards
 * (2 hole cards + up to 5 community cards in Texas Hold'em).
 */
export function evaluateBestHand(cards: Card[]): HandResult {
  if (cards.length < 5) {
    throw new Error('At least 5 cards are required to evaluate a hand');
  }
  const allFive = combinations(cards, 5);
  let best: HandResult | null = null;
  for (const five of allFive) {
    const result = evaluateFiveCardHand(five);
    if (!best || compareScores(result.score, best.score) > 0) {
      best = result;
    }
  }
  return best!;
}

/** Returns 1 if a beats b, -1 if b beats a, 0 if tied. */
export function compareHands(a: HandResult, b: HandResult): number {
  const cmp = compareScores(a.score, b.score);
  return cmp > 0 ? 1 : cmp < 0 ? -1 : 0;
}
