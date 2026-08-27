import { ActionType, GameState, PlayerState } from '../../types/game.types';
import { AvailableAction } from '../../types/dto.types';
import { Card, RANK_VALUES } from '../../types/card.types';
import { getAvailableActions, callAmount } from './betting-round';
import { evaluateBestHand, HandCategory } from './hand-evaluator';

export interface BotDecision {
  type: ActionType;
  amount?: number;
}

const POSTFLOP_TIER_STRENGTH: Record<HandCategory, number> = {
  HIGH_CARD: 0.12,
  ONE_PAIR: 0.28,
  TWO_PAIR: 0.45,
  THREE_OF_A_KIND: 0.6,
  STRAIGHT: 0.72,
  FLUSH: 0.8,
  FULL_HOUSE: 0.88,
  FOUR_OF_A_KIND: 0.95,
  STRAIGHT_FLUSH: 0.99,
  ROYAL_FLUSH: 1,
};

function preflopStrength(holeCards: Card[]): number {
  const [a, b] = holeCards;
  const va = RANK_VALUES[a.rank];
  const vb = RANK_VALUES[b.rank];
  const high = Math.max(va, vb);
  const low = Math.min(va, vb);
  const isPair = va === vb;
  const isSuited = a.suit === b.suit;
  const gap = high - low;

  let score = (high + low) / 28;
  if (isPair) score += 0.25;
  if (isSuited) score += 0.08;
  if (gap <= 1) score += 0.05;

  return Math.min(1, score);
}

function estimateHandStrength(player: PlayerState, communityCards: Card[]): number {
  if (communityCards.length === 0) {
    return preflopStrength(player.holeCards);
  }
  const result = evaluateBestHand([...player.holeCards, ...communityCards]);
  return POSTFLOP_TIER_STRENGTH[result.category] ?? 0.3;
}

function pickRaiseAmount(raiseAction: AvailableAction, strength: number): number {
  const min = raiseAction.minAmount ?? 0;
  const max = raiseAction.maxAmount ?? min;
  const span = max - min;
  const aggressiveness = Math.min(1, Math.max(0, (strength - 0.5) * 1.6));
  const amount = Math.round(min + span * aggressiveness * 0.5);
  return Math.min(max, Math.max(min, amount));
}

/**
 * A simple but real heuristic decision engine: estimates hand strength from
 * hole cards + community cards (using the same evaluator that judges the
 * showdown), then folds/calls/raises based on that strength plus a bit of
 * randomness so it doesn't play like a deterministic robot.
 */
export function decideBotAction(state: GameState, bot: PlayerState): BotDecision {
  const available = getAvailableActions(state, bot);
  if (available.length === 0) {
    return { type: 'CHECK' };
  }

  const canCheck = available.some((a) => a.type === 'CHECK');
  const canCall = available.some((a) => a.type === 'CALL');
  const raiseAction = available.find((a) => a.type === 'RAISE');
  const canAllIn = available.some((a) => a.type === 'ALL_IN');

  const strength = estimateHandStrength(bot, state.communityCards);
  const noise = (Math.random() - 0.5) * 0.16;
  const effectiveStrength = Math.min(1, Math.max(0, strength + noise));

  const toCall = callAmount(state, bot);
  const stackRatio = bot.chips > 0 ? toCall / bot.chips : 1;

  if (toCall === 0 && canCheck) {
    if (effectiveStrength > 0.72 && raiseAction && Math.random() < 0.55) {
      return { type: 'RAISE', amount: pickRaiseAmount(raiseAction, effectiveStrength) };
    }
    return { type: 'CHECK' };
  }

  if (effectiveStrength < 0.2 || (stackRatio > 0.6 && effectiveStrength < 0.48)) {
    return { type: 'FOLD' };
  }

  if (effectiveStrength > 0.8 && Math.random() < 0.5) {
    if (raiseAction) return { type: 'RAISE', amount: pickRaiseAmount(raiseAction, effectiveStrength) };
    if (canAllIn) return { type: 'ALL_IN' };
  }

  if (canCall) return { type: 'CALL' };
  if (canAllIn) return { type: 'ALL_IN' };
  return { type: 'FOLD' };
}
