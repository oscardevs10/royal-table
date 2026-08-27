import { Deck } from '../../src/modules/poker/deck';

describe('Deck', () => {
  it('contains exactly 52 unique cards', () => {
    const deck = new Deck();
    const drawn = [];
    for (let i = 0; i < 52; i++) drawn.push(deck.draw());

    const unique = new Set(drawn.map((c) => `${c.rank}${c.suit}`));
    expect(unique.size).toBe(52);
  });

  it('throws when drawing from an empty deck', () => {
    const deck = new Deck();
    for (let i = 0; i < 52; i++) deck.draw();
    expect(() => deck.draw()).toThrow();
  });

  it('shuffle produces a different order (statistically)', () => {
    const a = new Deck();
    const b = new Deck();
    b.shuffle(() => 0.42);

    const orderA = Array.from({ length: 52 }, () => a.draw()).map((c) => `${c.rank}${c.suit}`);
    const orderB = Array.from({ length: 52 }, () => b.draw()).map((c) => `${c.rank}${c.suit}`);

    expect(orderA).not.toEqual(orderB);
  });

  it('burn removes exactly one card and reduces remaining count', () => {
    const deck = new Deck();
    expect(deck.remaining()).toBe(52);
    deck.burn();
    expect(deck.remaining()).toBe(51);
  });
});
