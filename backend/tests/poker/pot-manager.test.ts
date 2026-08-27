import { buildSidePots, totalPotAmount } from '../../src/modules/poker/pot-manager';

describe('Pot Manager', () => {
  it('builds a single main pot when all players bet equally', () => {
    const pots = buildSidePots([
      { playerId: 'a', totalBetInHand: 100, isFolded: false },
      { playerId: 'b', totalBetInHand: 100, isFolded: false },
      { playerId: 'c', totalBetInHand: 100, isFolded: false },
    ]);

    expect(pots).toHaveLength(1);
    expect(pots[0].amount).toBe(300);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('creates a side pot when one player is all-in for less', () => {
    const pots = buildSidePots([
      { playerId: 'short', totalBetInHand: 50, isFolded: false },
      { playerId: 'mid', totalBetInHand: 150, isFolded: false },
      { playerId: 'big', totalBetInHand: 150, isFolded: false },
    ]);

    expect(pots).toHaveLength(2);
    expect(pots[0].amount).toBe(150); // 50 * 3
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['big', 'mid', 'short']);
    expect(pots[1].amount).toBe(200); // (150-50) * 2
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['big', 'mid']);
    expect(totalPotAmount(pots)).toBe(350);
  });

  it('excludes folded players from eligibility but keeps their chips in the pot', () => {
    const pots = buildSidePots([
      { playerId: 'folder', totalBetInHand: 100, isFolded: true },
      { playerId: 'winner', totalBetInHand: 100, isFolded: false },
    ]);

    expect(totalPotAmount(pots)).toBe(200);
    expect(pots.every((p) => p.eligiblePlayerIds.includes('winner'))).toBe(true);
    expect(pots.every((p) => !p.eligiblePlayerIds.includes('folder'))).toBe(true);
  });

  it('handles multiple all-in tiers correctly', () => {
    const pots = buildSidePots([
      { playerId: 'a', totalBetInHand: 20, isFolded: false },
      { playerId: 'b', totalBetInHand: 60, isFolded: false },
      { playerId: 'c', totalBetInHand: 100, isFolded: false },
      { playerId: 'd', totalBetInHand: 100, isFolded: false },
    ]);

    expect(totalPotAmount(pots)).toBe(280);
    // Layer 1: 20*4=80 eligible all four
    expect(pots[0].amount).toBe(80);
    expect(pots[0].eligiblePlayerIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    // Layer 2: (60-20)*3=120 eligible b,c,d
    expect(pots[1].amount).toBe(120);
    expect(pots[1].eligiblePlayerIds.sort()).toEqual(['b', 'c', 'd']);
    // Layer 3: (100-60)*2=80 eligible c,d
    expect(pots[2].amount).toBe(80);
    expect(pots[2].eligiblePlayerIds.sort()).toEqual(['c', 'd']);
  });
});
