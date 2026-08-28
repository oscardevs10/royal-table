import { GameEngine, SeatInput } from '../../src/modules/poker/game-engine';
import { decideBotAction } from '../../src/modules/poker/bot-ai';
import { GameState } from '../../src/types/game.types';

function makeSeats(count: number, chips = 1000): SeatInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Bot ${i}`,
    chips,
    seatIndex: i,
    sessionToken: `tok${i}`,
    isHost: i === 0,
    isBot: true,
  }));
}

function actingPlayer(engine: GameEngine) {
  const state = engine.getState();
  return state.players.find((p) => p.seatIndex === state.currentPlayerPosition)!;
}

describe('Bot AI', () => {
  it('always returns an action that is present in the available actions for the player', () => {
    const engine = new GameEngine('room1', 'AAAAA', makeSeats(4), 10, 20);
    engine.startNewHand();

    let guard = 0;
    while (engine.getState().handInProgress && guard < 100) {
      if (engine.isAllInRunout()) {
        engine.continueRunout();
        guard++;
        continue;
      }

      const state = engine.getState();
      const bot = actingPlayer(engine);
      const decision = decideBotAction(state, bot);

      const available = engine.getAvailableActionsFor(bot.id);
      expect(available.some((a) => a.type === decision.type)).toBe(true);

      const result = engine.applyAction(bot.id, decision.type, decision.amount);
      expect(result.success).toBe(true);
      guard++;
    }

    expect(guard).toBeLessThan(100);
  });

  it('plays a full 6-bot hand to completion while conserving all chips', () => {
    const engine = new GameEngine('room1', 'BBBBB', makeSeats(6, 500), 5, 10);
    engine.startNewHand();

    let guard = 0;
    while (engine.getState().handInProgress && guard < 150) {
      if (engine.isAllInRunout()) {
        engine.continueRunout();
        guard++;
        continue;
      }

      const state = engine.getState();
      const bot = actingPlayer(engine);
      const decision = decideBotAction(state, bot);
      const result = engine.applyAction(bot.id, decision.type, decision.amount);
      expect(result.success).toBe(true);
      guard++;
    }

    const finalState = engine.getState();
    expect(finalState.currentPhase).toBe('SHOWDOWN');
    expect(finalState.players.reduce((sum, p) => sum + p.chips, 0)).toBe(3000);
  });

  it('never proposes a raise amount outside the valid min/max range', () => {
    const engine = new GameEngine('room1', 'CCCCC', makeSeats(3), 10, 20);
    engine.startNewHand();

    let guard = 0;
    while (engine.getState().handInProgress && guard < 100) {
      if (engine.isAllInRunout()) {
        engine.continueRunout();
        guard++;
        continue;
      }

      const state = engine.getState();
      const bot = actingPlayer(engine);
      const decision = decideBotAction(state, bot);

      if (decision.type === 'RAISE') {
        const raiseAction = engine.getAvailableActionsFor(bot.id).find((a) => a.type === 'RAISE')!;
        expect(decision.amount).toBeGreaterThanOrEqual(raiseAction.minAmount!);
        expect(decision.amount).toBeLessThanOrEqual(raiseAction.maxAmount!);
      }

      engine.applyAction(bot.id, decision.type, decision.amount);
      guard++;
    }
  });

  it('resolves an all-in runout to showdown via continueRunout without ever needing a decision mid-runout', () => {
    const engine = new GameEngine('room1', 'DDDDD', makeSeats(2, 50), 10, 20);
    engine.startNewHand();

    const acting = actingPlayer(engine);
    engine.applyAction(acting.id, 'ALL_IN');

    let guard = 0;
    while (engine.isAllInRunout() && guard < 10) {
      engine.continueRunout();
      guard++;
    }

    expect(engine.getState().currentPhase).toBe('SHOWDOWN');
    expect(engine.getState().players.reduce((s, p) => s + p.chips, 0)).toBe(100);
  });
});
