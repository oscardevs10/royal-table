import { Card, RANK_VALUES, RANKS, SUITS } from '../../types/card.types';
import { evaluateBestHand, HandCategory } from './hand-evaluator';

export const ALL_HAND_CATEGORIES: HandCategory[] = [
  'HIGH_CARD',
  'ONE_PAIR',
  'TWO_PAIR',
  'THREE_OF_A_KIND',
  'STRAIGHT',
  'FLUSH',
  'FULL_HOUSE',
  'FOUR_OF_A_KIND',
  'STRAIGHT_FLUSH',
  'ROYAL_FLUSH',
];

export interface HandOdds {
  probabilities: Record<HandCategory, number>;
  isExact: boolean;
  sampleSize: number;
}

export interface HandOddsEntry {
  category: HandCategory;
  probability: number;
}

export interface CurrentHandInfo {
  description: string;
  category: HandCategory | null;
}

const PREFLOP_MONTE_CARLO_SAMPLES = 1500;

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function unseenCards(known: Card[]): Card[] {
  const knownKeys = new Set(known.map(cardKey));
  return fullDeck().filter((c) => !knownKeys.has(cardKey(c)));
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

/** Fisher-Yates partial shuffle: picks k random unique cards from pool without mutating it. */
function sampleRandomSubset(pool: Card[], k: number): Card[] {
  const arr = [...pool];
  const n = arr.length;
  for (let i = 0; i < k && i < n; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, k);
}

function emptyTally(): Record<HandCategory, number> {
  return ALL_HAND_CATEGORIES.reduce((acc, category) => {
    acc[category] = 0;
    return acc;
  }, {} as Record<HandCategory, number>);
}

/**
 * Computes the probability that the player's best final 5-card hand will
 * land in each of the 10 categories, based on the community cards still to
 * come. With 0 or 1 unknown community cards the outcome space is small
 * enough to enumerate exactly (<=1081 combinations); pre-flop (5 unknown
 * cards, ~2.1M combinations) would be too slow to enumerate on every action,
 * so it falls back to Monte Carlo sampling - a standard, real technique used
 * by equity calculators, not a placeholder.
 */
export function calculateHandOdds(holeCards: Card[], communityCards: Card[]): HandOdds {
  const known = [...holeCards, ...communityCards];
  const remaining = 5 - communityCards.length;

  if (remaining <= 0) {
    const result = evaluateBestHand(known);
    const probabilities = emptyTally();
    probabilities[result.category] = 1;
    return { probabilities, isExact: true, sampleSize: 1 };
  }

  const unseen = unseenCards(known);
  const tally = emptyTally();
  let total = 0;

  if (remaining <= 2) {
    for (const combo of combinations(unseen, remaining)) {
      const result = evaluateBestHand([...known, ...combo]);
      tally[result.category]++;
      total++;
    }
  } else {
    for (let i = 0; i < PREFLOP_MONTE_CARLO_SAMPLES; i++) {
      const sample = sampleRandomSubset(unseen, remaining);
      const result = evaluateBestHand([...known, ...sample]);
      tally[result.category]++;
      total++;
    }
  }

  for (const category of ALL_HAND_CATEGORIES) {
    tally[category] = total > 0 ? tally[category] / total : 0;
  }

  return { probabilities: tally, isExact: remaining <= 2, sampleSize: total };
}

export function oddsToSortedList(odds: HandOdds): HandOddsEntry[] {
  return ALL_HAND_CATEGORIES.map((category) => ({ category, probability: odds.probabilities[category] }))
    .filter((entry) => entry.probability > 0)
    .sort((a, b) => b.probability - a.probability);
}

function describeHoleCardsPreflop(holeCards: Card[]): string {
  const [a, b] = holeCards;
  if (RANK_VALUES[a.rank] === RANK_VALUES[b.rank]) {
    return `Par de ${a.rank}s`;
  }
  const suited = a.suit === b.suit;
  const high = RANK_VALUES[a.rank] > RANK_VALUES[b.rank] ? a.rank : b.rank;
  const low = RANK_VALUES[a.rank] > RANK_VALUES[b.rank] ? b.rank : a.rank;
  return `${high}-${low}${suited ? ' del mismo palo' : ''}`;
}

/** Describes the player's current best hand. Pre-flop there aren't 5 cards yet, so it falls back to a starting-hand description. */
export function describeCurrentHand(holeCards: Card[], communityCards: Card[]): CurrentHandInfo {
  if (holeCards.length + communityCards.length < 5) {
    return { description: describeHoleCardsPreflop(holeCards), category: null };
  }
  const result = evaluateBestHand([...holeCards, ...communityCards]);
  return { description: result.description, category: result.category };
}
