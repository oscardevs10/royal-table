import { isValidSet, isValidRun, classifyMeld, canLayOff, removeCardsFromHand } from '../../src/modules/conquian/meld-validator';
import { Card } from '../../src/types/card.types';

function cards(spec: string[]): Card[] {
  return spec.map((s) => {
    const suitLetter = s.slice(-1);
    const rank = s.slice(0, -1);
    const suitMap: Record<string, Card['suit']> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };
    return { rank: rank as Card['rank'], suit: suitMap[suitLetter] };
  });
}

describe('Conquian meld validator', () => {
  describe('isValidSet', () => {
    it('accepts three of a kind with distinct suits', () => {
      expect(isValidSet(cards(['7H', '7D', '7C']))).toBe(true);
    });

    it('accepts four of a kind', () => {
      expect(isValidSet(cards(['7H', '7D', '7C', '7S']))).toBe(true);
    });

    it('rejects a repeated suit', () => {
      expect(isValidSet(cards(['7H', '7H', '7C']))).toBe(false);
    });

    it('rejects mismatched ranks', () => {
      expect(isValidSet(cards(['7H', '8D', '7C']))).toBe(false);
    });

    it('rejects fewer than 3 or more than 4 cards', () => {
      expect(isValidSet(cards(['7H', '7D']))).toBe(false);
    });
  });

  describe('isValidRun', () => {
    it('accepts a consecutive run of the same suit', () => {
      expect(isValidRun(cards(['5H', '6H', '7H']))).toBe(true);
    });

    it('accepts ace-low runs (A-2-3)', () => {
      expect(isValidRun(cards(['AH', '2H', '3H']))).toBe(true);
    });

    it('rejects ace-high wraparound (Q-K-A)', () => {
      expect(isValidRun(cards(['QH', 'KH', 'AH']))).toBe(false);
    });

    it('rejects mixed suits', () => {
      expect(isValidRun(cards(['5H', '6D', '7H']))).toBe(false);
    });

    it('rejects a gap in the sequence', () => {
      expect(isValidRun(cards(['5H', '6H', '8H']))).toBe(false);
    });

    it('rejects unsorted input that still has a gap/duplicate', () => {
      expect(isValidRun(cards(['7H', '5H', '5H']))).toBe(false);
    });
  });

  describe('classifyMeld', () => {
    it('classifies a set', () => {
      expect(classifyMeld(cards(['7H', '7D', '7C']))).toBe('SET');
    });

    it('classifies a run', () => {
      expect(classifyMeld(cards(['5H', '6H', '7H']))).toBe('RUN');
    });

    it('returns null for invalid combinations', () => {
      expect(classifyMeld(cards(['5H', '6D', '7C']))).toBeNull();
    });
  });

  describe('canLayOff', () => {
    it('allows extending a set with the 4th suit', () => {
      const meld = { id: '1', type: 'SET' as const, cards: cards(['7H', '7D', '7C']), laidByPlayerId: 'p1' };
      expect(canLayOff(meld, cards(['7S']))).toBe(true);
    });

    it('rejects extending a set beyond 4 cards', () => {
      const meld = { id: '1', type: 'SET' as const, cards: cards(['7H', '7D', '7C', '7S']), laidByPlayerId: 'p1' };
      expect(canLayOff(meld, cards(['8H']))).toBe(false);
    });

    it('allows extending a run upward', () => {
      const meld = { id: '2', type: 'RUN' as const, cards: cards(['5H', '6H', '7H']), laidByPlayerId: 'p1' };
      expect(canLayOff(meld, cards(['8H']))).toBe(true);
    });

    it('allows extending a run downward', () => {
      const meld = { id: '2', type: 'RUN' as const, cards: cards(['5H', '6H', '7H']), laidByPlayerId: 'p1' };
      expect(canLayOff(meld, cards(['4H']))).toBe(true);
    });

    it('rejects a card that does not extend the run', () => {
      const meld = { id: '2', type: 'RUN' as const, cards: cards(['5H', '6H', '7H']), laidByPlayerId: 'p1' };
      expect(canLayOff(meld, cards(['9H']))).toBe(false);
    });

    it('rejects laying off a card of the wrong suit onto a run', () => {
      const meld = { id: '2', type: 'RUN' as const, cards: cards(['5H', '6H', '7H']), laidByPlayerId: 'p1' };
      expect(canLayOff(meld, cards(['8D']))).toBe(false);
    });
  });

  describe('removeCardsFromHand', () => {
    it('removes matching cards and returns the remaining hand', () => {
      const hand = cards(['7H', '8D', '9C']);
      const result = removeCardsFromHand(hand, cards(['8D']));
      expect(result).toEqual(cards(['7H', '9C']));
    });

    it('returns null if a card is not actually in the hand', () => {
      const hand = cards(['7H', '8D']);
      expect(removeCardsFromHand(hand, cards(['9C']))).toBeNull();
    });
  });
});
