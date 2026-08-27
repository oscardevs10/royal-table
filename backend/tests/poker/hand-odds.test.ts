import { calculateHandOdds, describeCurrentHand, oddsToSortedList, ALL_HAND_CATEGORIES } from '../../src/modules/poker/hand-odds';
import { Card } from '../../src/types/card.types';

function cards(spec: string[]): Card[] {
  return spec.map((s) => {
    const suitLetter = s.slice(-1);
    const rank = s.slice(0, -1);
    const suitMap: Record<string, Card['suit']> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };
    return { rank: rank as Card['rank'], suit: suitMap[suitLetter] };
  });
}

describe('Hand Odds', () => {
  it('river: returns 100% for the single already-determined category', () => {
    const hole = cards(['AH', 'AD']);
    const community = cards(['AC', 'KH', 'QH', '5D', '2C']);
    const odds = calculateHandOdds(hole, community);

    expect(odds.isExact).toBe(true);
    expect(odds.sampleSize).toBe(1);
    const total = Object.values(odds.probabilities).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
    expect(odds.probabilities.THREE_OF_A_KIND).toBe(1);
  });

  it('turn: probabilities sum to 1 and are computed exactly over all remaining cards', () => {
    const hole = cards(['AH', 'KH']);
    const community = cards(['QH', 'JH', '2C', '5D']);
    const odds = calculateHandOdds(hole, community);

    expect(odds.isExact).toBe(true);
    expect(odds.sampleSize).toBe(46);
    const total = Object.values(odds.probabilities).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
    // Ace-high with a made flush draw needing one heart to complete a straight flush or royal - both should be reachable.
    expect(odds.probabilities.ROYAL_FLUSH).toBeGreaterThan(0);
  });

  it('flop: probabilities sum to 1 and are computed exactly over C(47,2) combinations', () => {
    const hole = cards(['9C', '9D']);
    const community = cards(['9H', '2S', '5C']);
    const odds = calculateHandOdds(hole, community);

    expect(odds.isExact).toBe(true);
    expect(odds.sampleSize).toBe(1081);
    const total = Object.values(odds.probabilities).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
    // Already has trip nines - can never end up with just a pair or high card.
    expect(odds.probabilities.HIGH_CARD).toBe(0);
    expect(odds.probabilities.ONE_PAIR).toBe(0);
    expect(odds.probabilities.THREE_OF_A_KIND).toBeGreaterThan(0);
  });

  it('preflop: falls back to Monte Carlo sampling and still sums to ~1', () => {
    const hole = cards(['AH', 'AD']);
    const odds = calculateHandOdds(hole, []);

    expect(odds.isExact).toBe(false);
    expect(odds.sampleSize).toBeGreaterThan(1000);
    const total = Object.values(odds.probabilities).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 1);
    // Pocket aces should very often end up at least a pair.
    expect(odds.probabilities.HIGH_CARD).toBeLessThan(0.05);
  });

  it('oddsToSortedList excludes zero-probability categories and sorts descending', () => {
    const hole = cards(['9C', '9D']);
    const community = cards(['9H', '2S', '5C']);
    const odds = calculateHandOdds(hole, community);
    const list = oddsToSortedList(odds);

    expect(list.every((entry) => entry.probability > 0)).toBe(true);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].probability).toBeGreaterThanOrEqual(list[i].probability);
    }
    expect(list.some((e) => e.category === 'HIGH_CARD')).toBe(false);
  });

  it('describeCurrentHand falls back to a starting-hand description pre-flop', () => {
    const pairInfo = describeCurrentHand(cards(['KH', 'KD']), []);
    expect(pairInfo.category).toBeNull();
    expect(pairInfo.description).toContain('Par de K');

    const suitedInfo = describeCurrentHand(cards(['AH', 'KH']), []);
    expect(suitedInfo.description).toContain('mismo palo');
  });

  it('describeCurrentHand uses the real evaluator once 5+ cards are known', () => {
    const info = describeCurrentHand(cards(['9C', '9D']), cards(['9H', '2S', '5C']));
    expect(info.category).toBe('THREE_OF_A_KIND');
    expect(info.description).toBe('Three of a Kind');
  });

  it('covers all 10 hand categories in the category list', () => {
    expect(ALL_HAND_CATEGORIES).toHaveLength(10);
  });
});
