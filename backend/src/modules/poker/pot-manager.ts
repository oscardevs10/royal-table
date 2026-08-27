import { SidePot } from '../../types/game.types';

export interface ContributingPlayer {
  playerId: string;
  totalBetInHand: number;
  isFolded: boolean;
}

/**
 * Builds the main pot and any side pots from each player's total contribution
 * in the hand. Standard all-in side-pot algorithm: sort distinct contribution
 * levels ascending, and for each level, every player who contributed at least
 * that much chips in the amount above the previous level, split among all
 * players (folded or not) who put money in that layer; only non-folded
 * players are eligible to win it.
 */
export function buildSidePots(contributions: ContributingPlayer[]): SidePot[] {
  const positiveContributions = contributions.filter((c) => c.totalBetInHand > 0);
  if (positiveContributions.length === 0) return [];

  const levels = Array.from(new Set(positiveContributions.map((c) => c.totalBetInHand))).sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of levels) {
    const layerHeight = level - previousLevel;
    const contributors = positiveContributions.filter((c) => c.totalBetInHand >= level);
    const layerAmount = layerHeight * contributors.length;

    if (layerAmount > 0) {
      const eligiblePlayerIds = contributors.filter((c) => !c.isFolded).map((c) => c.playerId);
      if (eligiblePlayerIds.length > 0) {
        pots.push({ amount: layerAmount, eligiblePlayerIds });
      } else {
        // Everyone eligible for this layer folded; fold it into the previous pot (uncontested chips).
        if (pots.length > 0) {
          pots[pots.length - 1].amount += layerAmount;
        } else {
          pots.push({ amount: layerAmount, eligiblePlayerIds: contributors.map((c) => c.playerId) });
        }
      }
    }
    previousLevel = level;
  }

  return mergeAdjacentEqualPots(pots);
}

function mergeAdjacentEqualPots(pots: SidePot[]): SidePot[] {
  const merged: SidePot[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameEligibility(last.eligiblePlayerIds, pot.eligiblePlayerIds)) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot });
    }
  }
  return merged;
}

function sameEligibility(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((id) => setA.has(id));
}

export function totalPotAmount(pots: SidePot[]): number {
  return pots.reduce((sum, p) => sum + p.amount, 0);
}
