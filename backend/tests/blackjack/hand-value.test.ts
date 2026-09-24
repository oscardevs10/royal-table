import { Card, Rank, Suit } from '../../src/types/card.types';
import { dealerShouldHit, handValue, isBust, isNaturalBlackjack, isSplittablePair } from '../../src/modules/blackjack/hand-value';

const c = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

describe('blackjack hand value', () => {
  it('counts an ace as 11 when it fits, making the hand soft', () => {
    expect(handValue([c('A'), c('6')])).toEqual({ total: 17, soft: true });
    expect(handValue([c('A'), c('A'), c('9')])).toEqual({ total: 21, soft: true });
  });

  it('drops the ace back to 1 once 11 would bust', () => {
    expect(handValue([c('A'), c('6'), c('10')])).toEqual({ total: 17, soft: false });
    expect(handValue([c('A'), c('A'), c('A'), c('A')])).toEqual({ total: 14, soft: true });
  });

  it('counts face cards as 10', () => {
    expect(handValue([c('K'), c('Q')]).total).toBe(20);
    expect(isBust([c('K'), c('Q'), c('5')])).toBe(true);
  });

  it('recognises a natural only on exactly two cards', () => {
    expect(isNaturalBlackjack([c('A'), c('K')])).toBe(true);
    expect(isNaturalBlackjack([c('10'), c('A')])).toBe(true);
    expect(isNaturalBlackjack([c('7'), c('7'), c('7')])).toBe(false);
  });

  it('dealer stands on soft 17 and hits 16', () => {
    expect(dealerShouldHit([c('A'), c('6')])).toBe(false);
    expect(dealerShouldHit([c('10'), c('6')])).toBe(true);
    expect(dealerShouldHit([c('10'), c('7')])).toBe(false);
  });

  it('allows splitting any two ten-value cards, not just identical ranks', () => {
    expect(isSplittablePair([c('K'), c('10')])).toBe(true);
    expect(isSplittablePair([c('8'), c('8')])).toBe(true);
    expect(isSplittablePair([c('9'), c('10')])).toBe(false);
    expect(isSplittablePair([c('8'), c('8'), c('8')])).toBe(false);
  });
});
