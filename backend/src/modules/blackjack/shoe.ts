import { Card, RANKS, SUITS } from '../../types/card.types';

export const CARDS_PER_DECK = RANKS.length * SUITS.length;

/** Deck counts a table can be configured with (1 = single-deck "pitch" game, 6-8 = standard casino shoe). */
export const ALLOWED_DECK_COUNTS = [1, 2, 4, 6, 8];

/** Fraction of the shoe dealt before the cut card comes out and the shoe is reshuffled between rounds. */
export const DEFAULT_PENETRATION = 0.75;

/**
 * A single 52-card deck isn't enough for a full table: a round averages ~3 cards per hand
 * plus the dealer's, and with splits/hits a 7-spot table can burn through 40+ cards in one
 * round. With a 25% cut reserve, a single deck would reshuffle every round and could still
 * run dry mid-round. These minimums keep the reserve behind the cut card larger than a
 * realistic worst-case round for the table size.
 */
export function minDecksForSeats(seats: number): number {
  if (seats <= 2) return 1;
  if (seats <= 4) return 2;
  return 4;
}

/** Sensible default shoe size for a given table size (what the create-room form preselects). */
export function recommendedDecksForSeats(seats: number): number {
  if (seats <= 2) return 2;
  if (seats <= 4) return 4;
  return 6;
}

/**
 * A multi-deck blackjack shoe. Cards that leave the table after a round go to the discard
 * tray; the shoe is reshuffled between rounds once the cut card is reached. If the shoe
 * ever empties mid-round anyway (an extreme run of splits/hits), the discard tray is
 * shuffled back in so the round can always finish - cards still on the table are never
 * recycled. Lives only on the server; the order is never serialized to a client.
 */
export class Shoe {
  private cards: Card[] = [];
  private discards: Card[] = [];

  constructor(
    readonly deckCount: number,
    private readonly rng: () => number = Math.random,
    readonly penetration: number = DEFAULT_PENETRATION
  ) {
    this.reshuffle();
  }

  get totalCards(): number {
    return this.deckCount * CARDS_PER_DECK;
  }

  remaining(): number {
    return this.cards.length;
  }

  discardCount(): number {
    return this.discards.length;
  }

  /** Card count at which the cut card sits (reshuffle once `remaining()` drops below it). */
  cutCardAt(): number {
    return Math.floor(this.totalCards * (1 - this.penetration));
  }

  needsReshuffle(): boolean {
    return this.cards.length < this.cutCardAt();
  }

  /** Rebuilds the full shoe from scratch and shuffles it. Only call between rounds (no cards on the table). */
  reshuffle(): void {
    const cards: Card[] = [];
    for (let d = 0; d < this.deckCount; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          cards.push({ rank, suit });
        }
      }
    }
    this.cards = cards;
    this.discards = [];
    this.shuffleInPlace(this.cards);
  }

  draw(): Card {
    if (this.cards.length === 0) {
      if (this.discards.length > 0) {
        this.cards = this.discards;
        this.discards = [];
      } else {
        // Every card of the shoe is on the table at once - practically impossible with the
        // enforced minimum deck counts, but never crash a live round over it.
        for (const suit of SUITS) for (const rank of RANKS) this.cards.push({ rank, suit });
      }
      this.shuffleInPlace(this.cards);
    }
    return this.cards.pop()!;
  }

  /** Puts cards on top of the shoe so they're drawn next, in the given order (deterministic deals in tests). */
  stack(cards: Card[]): void {
    this.cards.push(...[...cards].reverse());
  }

  discard(cards: Card[]): void {
    this.discards.push(...cards);
  }

  private shuffleInPlace(cards: Card[]): void {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }
}
