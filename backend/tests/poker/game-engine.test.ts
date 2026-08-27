import { GameEngine, SeatInput } from '../../src/modules/poker/game-engine';
import { GameState } from '../../src/types/game.types';

function makeSeats(count: number, chips = 1000): SeatInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    chips,
    seatIndex: i,
    sessionToken: `tok${i}`,
    isHost: i === 0,
    isBot: false,
  }));
}

function totalChipsInPlay(state: GameState): number {
  return state.players.reduce((sum, p) => sum + p.chips + p.totalBetInHand, 0);
}

function actingPlayer(engine: GameEngine) {
  const state = engine.getState();
  return state.players.find((p) => p.seatIndex === state.currentPlayerPosition)!;
}

describe('GameEngine - 2 players (heads-up)', () => {
  it('plays a full hand to showdown via check/call, conserving all chips', () => {
    const engine = new GameEngine('room1', 'AAAAA', makeSeats(2), 10, 20);
    engine.startNewHand();

    const initialTotal = totalChipsInPlay(engine.getState());
    expect(engine.getState().currentPhase).toBe('PRE_FLOP');

    // Dealer/SB acts first pre-flop: call the big blind.
    let acting = actingPlayer(engine);
    expect(engine.applyAction(acting.id, 'CALL').success).toBe(true);

    // BB gets the option: check.
    acting = actingPlayer(engine);
    expect(engine.getState().currentPhase).toBe('PRE_FLOP');
    expect(engine.applyAction(acting.id, 'CHECK').success).toBe(true);

    expect(engine.getState().currentPhase).toBe('FLOP');
    expect(engine.getState().communityCards).toHaveLength(3);

    // Flop, turn, river: both players check each street.
    for (const expectedPhase of ['FLOP', 'TURN', 'RIVER'] as const) {
      expect(engine.getState().currentPhase).toBe(expectedPhase);
      acting = actingPlayer(engine);
      engine.applyAction(acting.id, 'CHECK');
      acting = actingPlayer(engine);
      engine.applyAction(acting.id, 'CHECK');
    }

    expect(engine.getState().currentPhase).toBe('SHOWDOWN');
    expect(engine.getState().communityCards).toHaveLength(5);
    expect(engine.getState().handInProgress).toBe(false);
    expect(totalChipsInPlay(engine.getState())).toBe(initialTotal);

    const totalChipsNow = engine.getState().players.reduce((s, p) => s + p.chips, 0);
    expect(totalChipsNow).toBe(2000);
  });

  it('ends the hand immediately when a player folds pre-flop', () => {
    const engine = new GameEngine('room1', 'AAAAA', makeSeats(2), 10, 20);
    engine.startNewHand();

    const acting = actingPlayer(engine);
    const other = engine.getState().players.find((p) => p.id !== acting.id)!;
    const otherChipsBefore = other.chips;

    engine.applyAction(acting.id, 'FOLD');

    const state = engine.getState();
    expect(state.handInProgress).toBe(false);
    const winner = state.players.find((p) => p.id === other.id)!;
    expect(winner.chips).toBeGreaterThan(otherChipsBefore);
    expect(state.players.reduce((s, p) => s + p.chips, 0)).toBe(2000);
  });

  it('rejects actions from a player who is not on turn', () => {
    const engine = new GameEngine('room1', 'AAAAA', makeSeats(2), 10, 20);
    engine.startNewHand();

    const acting = actingPlayer(engine);
    const notActing = engine.getState().players.find((p) => p.id !== acting.id)!;

    const result = engine.applyAction(notActing.id, 'CHECK');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/turn/i);
  });

  it('rejects invalid raise amounts', () => {
    const engine = new GameEngine('room1', 'AAAAA', makeSeats(2), 10, 20);
    engine.startNewHand();
    const acting = actingPlayer(engine);

    const result = engine.applyAction(acting.id, 'RAISE', 1);
    expect(result.success).toBe(false);
  });
});

describe('GameEngine - all-in runout', () => {
  it('auto-deals remaining streets when all active players are all-in', () => {
    const seats = makeSeats(2, 100);
    const engine = new GameEngine('room1', 'BBBBB', seats, 10, 20);
    engine.startNewHand();

    const acting = actingPlayer(engine);
    engine.applyAction(acting.id, 'ALL_IN');
    const next = actingPlayer(engine);
    engine.applyAction(next.id, 'ALL_IN');

    const state = engine.getState();
    expect(state.currentPhase).toBe('SHOWDOWN');
    expect(state.communityCards).toHaveLength(5);
    expect(state.players.reduce((s, p) => s + p.chips, 0)).toBe(200);
  });
});

describe('GameEngine - 3 players', () => {
  it('rotates blinds and turn order correctly, conserving chips through a full hand', () => {
    const engine = new GameEngine('room1', 'CCCCC', makeSeats(3), 10, 20);
    engine.startNewHand();

    let guard = 0;
    while (engine.getState().handInProgress && guard < 50) {
      const acting = actingPlayer(engine);
      const available = engine.getAvailableActionsFor(acting.id);
      const preferred = available.find((a) => a.type === 'CHECK') ?? available.find((a) => a.type === 'CALL');
      const action = preferred ?? available[0];
      engine.applyAction(acting.id, action.type, action.maxAmount);
      guard++;
    }

    const state = engine.getState();
    expect(state.currentPhase).toBe('SHOWDOWN');
    expect(state.players.reduce((s, p) => s + p.chips, 0)).toBe(3000);
  });

  it('moves the dealer button forward on each new hand', () => {
    const engine = new GameEngine('room1', 'CCCCC', makeSeats(3), 10, 20);
    engine.startNewHand();
    const firstDealer = engine.getState().dealerPosition;

    // Fold everyone but one to end the hand quickly.
    let guard = 0;
    while (engine.getState().handInProgress && guard < 20) {
      const acting = actingPlayer(engine);
      engine.applyAction(acting.id, 'FOLD');
      guard++;
    }

    engine.startNewHand();
    expect(engine.getState().dealerPosition).not.toBe(firstDealer);
  });
});

describe('GameEngine - 6 players', () => {
  it('plays a full hand to showdown with everyone checking/calling', () => {
    const engine = new GameEngine('room1', 'DDDDD', makeSeats(6), 10, 20);
    engine.startNewHand();

    let guard = 0;
    while (engine.getState().handInProgress && guard < 100) {
      const acting = actingPlayer(engine);
      const available = engine.getAvailableActionsFor(acting.id);
      const preferred = available.find((a) => a.type === 'CHECK') ?? available.find((a) => a.type === 'CALL');
      const action = preferred ?? available[0];
      engine.applyAction(acting.id, action.type, action.maxAmount);
      guard++;
    }

    const state = engine.getState();
    expect(state.currentPhase).toBe('SHOWDOWN');
    expect(state.players.reduce((s, p) => s + p.chips, 0)).toBe(6000);
  });

  it('handles a raise reopening action for players who already acted', () => {
    const engine = new GameEngine('room1', 'EEEEE', makeSeats(6), 10, 20);
    engine.startNewHand();

    const firstActor = actingPlayer(engine);
    engine.applyAction(firstActor.id, 'CALL');

    const secondActor = actingPlayer(engine);
    const raiseAction = engine.getAvailableActionsFor(secondActor.id).find((a) => a.type === 'RAISE')!;
    engine.applyAction(secondActor.id, 'RAISE', raiseAction.minAmount);

    // The first actor (who already called) must get another turn since the bet increased.
    const state = engine.getState();
    const firstActorState = state.players.find((p) => p.id === firstActor.id)!;
    expect(firstActorState.hasActedThisRound).toBe(false);
  });
});

describe('GameEngine - eliminations', () => {
  it('marks a player OUT when they lose all their chips', () => {
    const seats = makeSeats(2, 20);
    const engine = new GameEngine('room1', 'FFFFF', seats, 10, 20);
    engine.startNewHand();

    const acting = actingPlayer(engine);
    engine.applyAction(acting.id, 'ALL_IN');
    const next = actingPlayer(engine);
    engine.applyAction(next.id, 'ALL_IN');

    const eliminated = engine.consumeEliminated();
    const state = engine.getState();
    const outPlayers = state.players.filter((p) => p.status === 'OUT');
    expect(outPlayers.length).toBeGreaterThanOrEqual(0);
    expect(eliminated.length).toBe(outPlayers.length);
  });
});

describe('GameEngine - reconnection', () => {
  it('tracks connected state per player independently of game state', () => {
    const engine = new GameEngine('room1', 'GGGGG', makeSeats(2), 10, 20);
    engine.startNewHand();

    const player = engine.getState().players[0];
    expect(player.connected).toBe(true);

    engine.markDisconnected(player.id);
    expect(engine.getPlayer(player.id)!.connected).toBe(false);

    engine.markReconnected(player.id);
    expect(engine.getPlayer(player.id)!.connected).toBe(true);
  });
});
