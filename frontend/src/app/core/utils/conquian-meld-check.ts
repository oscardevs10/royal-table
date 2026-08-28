import { Card, Rank } from '../models/game.models';

/**
 * Client-side mirror of the backend's meld validator, used only to enable/disable
 * buttons instantly as the player selects cards. The server always re-validates
 * every meld/lay-off independently - this never decides the outcome, only the UX.
 */
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
  return new Set(cards.map((c) => c.suit)).size === cards.length;
}

export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0].suit;
  if (!cards.every((c) => c.suit === suit)) return false;
  const values = cards.map((c) => RUN_RANK_ORDER[c.rank]).sort((a, b) => a - b);
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) return false;
  }
  return true;
}

export function classifyMeld(cards: Card[]): 'SET' | 'RUN' | null {
  if (isValidSet(cards)) return 'SET';
  if (isValidRun(cards)) return 'RUN';
  return null;
}

export function canLayOff(existingCards: Card[], newCards: Card[], type: 'SET' | 'RUN'): boolean {
  if (newCards.length === 0) return false;
  return classifyMeld([...existingCards, ...newCards]) === type;
}
