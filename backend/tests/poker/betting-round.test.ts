import { GameState, PlayerState } from '../../src/types/game.types';
import { findNextActionablePosition, isBettingRoundComplete, getAvailableActions, callAmount } from '../../src/modules/poker/betting-round';

function makePlayer(overrides: Partial<PlayerState>): PlayerState {
  return {
    id: 'p',
    sessionToken: 'tok',
    name: 'P',
    seatIndex: 0,
    chips: 1000,
    holeCards: [],
    status: 'ACTIVE',
    currentBet: 0,
    totalBetInHand: 0,
    hasActedThisRound: false,
    isHost: false,
    connected: true,
    isBot: false,
    ...overrides,
  };
}

function makeState(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'r',
    roomCode: 'ABCDE',
    handNumber: 1,
    players,
    dealerPosition: 0,
    currentPlayerPosition: 0,
    smallBlind: 10,
    bigBlind: 20,
    pot: 0,
    sidePots: [],
    communityCards: [],
    currentPhase: 'PRE_FLOP',
    currentBet: 20,
    minRaise: 20,
    deck: [],
    lastAggressorPosition: null,
    handInProgress: true,
    ...overrides,
  };
}

describe('Betting Round', () => {
  it('finds the next actionable player, skipping folded/all-in seats', () => {
    const players = [
      makePlayer({ id: 'a', seatIndex: 0, status: 'ACTIVE' }),
      makePlayer({ id: 'b', seatIndex: 1, status: 'FOLDED' }),
      makePlayer({ id: 'c', seatIndex: 2, status: 'ALL_IN' }),
      makePlayer({ id: 'd', seatIndex: 3, status: 'ACTIVE' }),
    ];
    const state = makeState(players);
    expect(findNextActionablePosition(state, 0)).toBe(3);
  });

  it('round is not complete if an active player has not matched the current bet', () => {
    const players = [
      makePlayer({ id: 'a', seatIndex: 0, currentBet: 20, hasActedThisRound: true }),
      makePlayer({ id: 'b', seatIndex: 1, currentBet: 0, hasActedThisRound: false }),
    ];
    const state = makeState(players);
    expect(isBettingRoundComplete(state)).toBe(false);
  });

  it('round is complete when all actionable players matched and acted', () => {
    const players = [
      makePlayer({ id: 'a', seatIndex: 0, currentBet: 20, hasActedThisRound: true }),
      makePlayer({ id: 'b', seatIndex: 1, currentBet: 20, hasActedThisRound: true }),
    ];
    const state = makeState(players);
    expect(isBettingRoundComplete(state)).toBe(true);
  });

  it('round is complete when only one player remains in the hand', () => {
    const players = [
      makePlayer({ id: 'a', seatIndex: 0, status: 'ACTIVE' }),
      makePlayer({ id: 'b', seatIndex: 1, status: 'FOLDED' }),
    ];
    const state = makeState(players);
    expect(isBettingRoundComplete(state)).toBe(true);
  });

  it('computes correct call amount', () => {
    const player = makePlayer({ currentBet: 5 });
    const state = makeState([player], { currentBet: 20 });
    expect(callAmount(state, player)).toBe(15);
  });

  it('only offers actions to the player whose turn it is', () => {
    const players = [makePlayer({ id: 'a', seatIndex: 0 }), makePlayer({ id: 'b', seatIndex: 1 })];
    const state = makeState(players, { currentPlayerPosition: 1 });
    expect(getAvailableActions(state, players[0])).toEqual([]);
    expect(getAvailableActions(state, players[1]).length).toBeGreaterThan(0);
  });

  it('offers CHECK when no bet is owed and CALL when a bet is owed', () => {
    const player = makePlayer({ currentBet: 20 });
    const stateNoOwed = makeState([player], { currentBet: 20, currentPlayerPosition: 0 });
    const actionsNoOwed = getAvailableActions(stateNoOwed, player);
    expect(actionsNoOwed.some((a) => a.type === 'CHECK')).toBe(true);
    expect(actionsNoOwed.some((a) => a.type === 'CALL')).toBe(false);

    const owedPlayer = makePlayer({ currentBet: 0 });
    const stateOwed = makeState([owedPlayer], { currentBet: 20, currentPlayerPosition: 0 });
    const actionsOwed = getAvailableActions(stateOwed, owedPlayer);
    expect(actionsOwed.some((a) => a.type === 'CALL')).toBe(true);
    expect(actionsOwed.some((a) => a.type === 'CHECK')).toBe(false);
  });
});
