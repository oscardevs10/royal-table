import { GameState, PlayerState } from '../../types/game.types';
import { AvailableAction } from '../../types/dto.types';

/** Players still holding cards and able to act (not folded, not all-in, not sitting out). */
export function canAct(player: PlayerState): boolean {
  return player.status === 'ACTIVE';
}

/** Players still contesting the pot (haven't folded, includes all-in players). */
export function isInHand(player: PlayerState): boolean {
  return player.status === 'ACTIVE' || player.status === 'ALL_IN';
}

export function playersInHand(state: GameState): PlayerState[] {
  return state.players.filter(isInHand);
}

export function findNextActionablePosition(state: GameState, fromPosition: number): number | null {
  const seatCount = state.players.length;
  if (seatCount === 0) return null;

  for (let step = 1; step <= seatCount; step++) {
    const position = (fromPosition + step) % seatCount;
    const player = state.players.find((p) => p.seatIndex === position);
    if (player && canAct(player)) {
      return position;
    }
  }
  return null;
}

export function callAmount(state: GameState, player: PlayerState): number {
  return Math.max(0, state.currentBet - player.currentBet);
}

export function isBettingRoundComplete(state: GameState): boolean {
  const contesting = playersInHand(state);
  if (contesting.length <= 1) return true;

  const actionable = contesting.filter(canAct);
  if (actionable.length === 0) return true;

  return actionable.every((p) => p.hasActedThisRound && p.currentBet === state.currentBet);
}

export function isHandOver(state: GameState): boolean {
  return playersInHand(state).length <= 1;
}

export function getAvailableActions(state: GameState, player: PlayerState): AvailableAction[] {
  if (!canAct(player) || state.players[state.currentPlayerPosition]?.id !== player.id) {
    return [];
  }

  const toCall = callAmount(state, player);
  const actions: AvailableAction[] = [];
  const maxRaiseTo = player.currentBet + player.chips;
  const minRaiseTo = state.currentBet + state.minRaise;

  actions.push({ type: 'FOLD' });

  if (toCall === 0) {
    actions.push({ type: 'CHECK' });
  } else if (player.chips > toCall) {
    actions.push({ type: 'CALL', minAmount: toCall, maxAmount: toCall });
  }
  // else: player cannot fully call - their only non-fold option is to go all-in for less (below).

  if (player.chips > toCall && maxRaiseTo >= minRaiseTo) {
    actions.push({ type: 'RAISE', minAmount: minRaiseTo, maxAmount: maxRaiseTo });
  }

  if (player.chips > 0) {
    actions.push({ type: 'ALL_IN', minAmount: maxRaiseTo, maxAmount: maxRaiseTo });
  }

  return actions;
}
