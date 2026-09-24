import { Card, Rank } from '../../types/card.types';

export interface HandValue {
  /** Best total that doesn't bust (or the minimum total if every option busts). */
  total: number;
  /** True when an ace is currently counted as 11. */
  soft: boolean;
}

export function cardPoints(rank: Rank): number {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

export function handValue(cards: Card[]): HandValue {
  let total = 0;
  let hasAce = false;
  for (const card of cards) {
    total += cardPoints(card.rank);
    if (card.rank === 'A') hasAce = true;
  }
  // At most one ace can ever count as 11 without busting (11 + 11 = 22).
  if (hasAce && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

/** A natural: exactly two cards totalling 21. (21 on a split hand is not a natural - callers check that.) */
export function isNaturalBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards).total > 21;
}

/** Splits are allowed on any two cards of equal blackjack value (e.g. K-10), not just identical ranks. */
export function isSplittablePair(cards: Card[]): boolean {
  return cards.length === 2 && cardPoints(cards[0].rank) === cardPoints(cards[1].rank);
}

/** Dealer stands on all 17s, including soft 17 (the S17 rule). */
export function dealerShouldHit(cards: Card[]): boolean {
  return handValue(cards).total < 17;
}
