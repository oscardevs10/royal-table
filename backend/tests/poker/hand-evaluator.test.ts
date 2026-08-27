import { evaluateBestHand, compareHands } from '../../src/modules/poker/hand-evaluator';
import { Card } from '../../src/types/card.types';

function cards(spec: string[]): Card[] {
  // spec like ['AH','KH','QH','JH','10H'] -> rank + suit letter
  return spec.map((s) => {
    const suitLetter = s.slice(-1);
    const rank = s.slice(0, -1);
    const suitMap: Record<string, Card['suit']> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };
    return { rank: rank as Card['rank'], suit: suitMap[suitLetter] };
  });
}

describe('Hand Evaluator', () => {
  it('detects a Royal Flush', () => {
    const hand = evaluateBestHand(cards(['AH', 'KH', 'QH', 'JH', '10H', '2C', '3D']));
    expect(hand.category).toBe('ROYAL_FLUSH');
  });

  it('detects a Straight Flush', () => {
    const hand = evaluateBestHand(cards(['9H', '8H', '7H', '6H', '5H', '2C', '3D']));
    expect(hand.category).toBe('STRAIGHT_FLUSH');
  });

  it('detects Four of a Kind', () => {
    const hand = evaluateBestHand(cards(['9H', '9D', '9C', '9S', '5H', '2C', '3D']));
    expect(hand.category).toBe('FOUR_OF_A_KIND');
  });

  it('detects a Full House', () => {
    const hand = evaluateBestHand(cards(['9H', '9D', '9C', '5S', '5H', '2C', '3D']));
    expect(hand.category).toBe('FULL_HOUSE');
  });

  it('detects a Flush', () => {
    const hand = evaluateBestHand(cards(['9H', '2H', '7H', 'KH', '5H', '2C', '3D']));
    expect(hand.category).toBe('FLUSH');
  });

  it('detects a Straight', () => {
    const hand = evaluateBestHand(cards(['9H', '8D', '7C', '6S', '5H', '2C', '3D']));
    expect(hand.category).toBe('STRAIGHT');
  });

  it('detects the wheel straight (A-2-3-4-5)', () => {
    const hand = evaluateBestHand(cards(['AH', '2D', '3C', '4S', '5H', 'KC', 'QD']));
    expect(hand.category).toBe('STRAIGHT');
    expect(hand.score[1]).toBe(5);
  });

  it('detects Three of a Kind', () => {
    const hand = evaluateBestHand(cards(['9H', '9D', '9C', '5S', '2H', 'KC', 'QD']));
    expect(hand.category).toBe('THREE_OF_A_KIND');
  });

  it('detects Two Pair', () => {
    const hand = evaluateBestHand(cards(['9H', '9D', '5C', '5S', '2H', 'KC', 'QD']));
    expect(hand.category).toBe('TWO_PAIR');
  });

  it('detects One Pair', () => {
    const hand = evaluateBestHand(cards(['9H', '9D', '5C', '4S', '2H', 'KC', 'QD']));
    expect(hand.category).toBe('ONE_PAIR');
  });

  it('detects High Card', () => {
    const hand = evaluateBestHand(cards(['9H', '2D', '5C', '4S', 'JH', 'KC', 'QD']));
    expect(hand.category).toBe('HIGH_CARD');
  });

  it('correctly ranks category strength', () => {
    const royalFlush = evaluateBestHand(cards(['AH', 'KH', 'QH', 'JH', '10H', '2C', '3D']));
    const quads = evaluateBestHand(cards(['9H', '9D', '9C', '9S', '5H', '2C', '3D']));
    const pair = evaluateBestHand(cards(['9H', '9D', '5C', '4S', '2H', 'KC', 'QD']));

    expect(compareHands(royalFlush, quads)).toBe(1);
    expect(compareHands(quads, pair)).toBe(1);
    expect(compareHands(pair, quads)).toBe(-1);
  });

  it('breaks ties correctly with kickers', () => {
    const acesKingKicker = evaluateBestHand(cards(['AH', 'AD', 'KC', '5S', '2H', '9C', '3D']));
    const acesQueenKicker = evaluateBestHand(cards(['AS', 'AC', 'QD', '5H', '2D', '9S', '3C']));

    expect(compareHands(acesKingKicker, acesQueenKicker)).toBe(1);
  });

  it('detects a true tie between identical hand strength', () => {
    const handA = evaluateBestHand(cards(['AH', 'AD', 'KC', 'QS', 'JH', '9C', '3D']));
    const handB = evaluateBestHand(cards(['AS', 'AC', 'KD', 'QH', 'JD', '9S', '3C']));

    expect(compareHands(handA, handB)).toBe(0);
  });
});
