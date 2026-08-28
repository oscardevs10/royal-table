import { Card, Rank } from '../../types/card.types';

export type MeldType = 'SET' | 'RUN';

export interface Meld {
  id: string;
  type: MeldType;
  cards: Card[];
  laidByPlayerId: string;
}

/** Ace is always low in Conquian runs (A-2-3, never Q-K-A) - a separate ordering from poker's ace-high evaluator. */
const RUN_RANK_ORDER: Record<Rank, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
};

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const rank = cards[0].rank;
  if (!cards.every((c) => c.rank === rank)) return false;
  const suits = new Set(cards.map((c) => c.suit));
  return suits.size === cards.length;
}

export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0].suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  const values = [...cards].map((c) => RUN_RANK_ORDER[c.rank]).sort((a, b) => a - b);
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1]) return false; // no duplicate ranks
    if (values[i] !== values[i - 1] + 1) return false;
  }
  return true;
}

export function classifyMeld(cards: Card[]): MeldType | null {
  if (isValidSet(cards)) return 'SET';
  if (isValidRun(cards)) return 'RUN';
  return null;
}

/** Validates that `newCards` merged onto an existing meld still forms one valid, larger meld of the same type. */
export function canLayOff(meld: Meld, newCards: Card[]): boolean {
  if (newCards.length === 0) return false;
  const merged = [...meld.cards, ...newCards];
  return classifyMeld(merged) === meld.type;
}

/** Removes the given cards (by rank+suit) from a hand. Returns null if any card isn't actually present. */
export function removeCardsFromHand(hand: Card[], cardsToRemove: Card[]): Card[] | null {
  const remaining = [...hand];
  for (const card of cardsToRemove) {
    const idx = remaining.findIndex((c) => cardKey(c) === cardKey(card));
    if (idx === -1) return null;
    remaining.splice(idx, 1);
  }
  return remaining;
}
