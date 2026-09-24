import { Card } from '../../src/types/card.types';
import { Shoe, minDecksForSeats, recommendedDecksForSeats, CARDS_PER_DECK } from '../../src/modules/blackjack/shoe';

const key = (card: Card) => `${card.rank}${card.suit}`;

describe('Shoe', () => {
  it('holds every card of every deck exactly once per deck', () => {
    const shoe = new Shoe(6);
    expect(shoe.totalCards).toBe(312);

    const counts = new Map<string, number>();
    for (let i = 0; i < 312; i++) {
      const k = key(shoe.draw());
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(CARDS_PER_DECK);
    for (const count of counts.values()) expect(count).toBe(6);
  });

  it('places the cut card at 75% penetration', () => {
    const shoe = new Shoe(2);
    expect(shoe.cutCardAt()).toBe(26);
    for (let i = 0; i < 78; i++) shoe.draw();
    expect(shoe.needsReshuffle()).toBe(false);
    shoe.draw();
    expect(shoe.needsReshuffle()).toBe(true);

    shoe.reshuffle();
    expect(shoe.remaining()).toBe(104);
    expect(shoe.discardCount()).toBe(0);
  });

  it('refills from the discard tray (never from cards still in play) if it runs dry mid-round', () => {
    const shoe = new Shoe(1);
    const inPlay: Card[] = [];
    for (let i = 0; i < 52; i++) inPlay.push(shoe.draw());
    expect(shoe.remaining()).toBe(0);

    const returned = inPlay.splice(0, 10);
    shoe.discard(returned);

    const next = shoe.draw();
    expect(returned.map(key)).toContain(key(next));
    expect(shoe.remaining()).toBe(9);
  });

  it('draws stacked cards first, in order', () => {
    const shoe = new Shoe(1);
    shoe.stack([{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'clubs' }]);
    expect(shoe.draw()).toEqual({ rank: 'A', suit: 'hearts' });
    expect(shoe.draw()).toEqual({ rank: 'K', suit: 'clubs' });
  });

  it('requires more decks for bigger tables', () => {
    expect(minDecksForSeats(1)).toBe(1);
    expect(minDecksForSeats(4)).toBe(2);
    expect(minDecksForSeats(7)).toBe(4);
    for (let seats = 1; seats <= 7; seats++) {
      expect(recommendedDecksForSeats(seats)).toBeGreaterThanOrEqual(minDecksForSeats(seats));
    }
  });
});
