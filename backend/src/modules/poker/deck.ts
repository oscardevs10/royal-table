import { Card, RANKS, SUITS } from '../../types/card.types';

/**
 * Cryptographically-irrelevant but statistically-sound shuffle (Fisher-Yates).
 * The deck only ever lives on the server; it is never serialized to a client.
 */
export class Deck {
  private cards: Card[];

  constructor() {
    this.cards = Deck.freshCards();
  }

  private static freshCards(): Card[] {
    const cards: Card[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ rank, suit });
      }
    }
    return cards;
  }

  shuffle(rng: () => number = Math.random): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): Card {
    const card = this.cards.pop();
    if (!card) {
      throw new Error('Cannot draw from an empty deck');
    }
    return card;
  }

  /** Burns one card before dealing the flop/turn/river, per standard Hold'em rules. */
  burn(): void {
    this.draw();
  }

  remaining(): number {
    return this.cards.length;
  }
}
