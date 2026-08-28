import { prisma } from './prisma';
import { GameState, ActionType, ShowdownResult } from '../types/game.types';
import { RoomConfig } from '../modules/rooms/room.types';

/**
 * Persists room/player/hand history to PostgreSQL. The live game is always
 * authoritative from the in-memory GameEngine; persistence here is a
 * best-effort record for history/analytics and never blocks gameplay -
 * a DB hiccup must not stop two people from playing a hand of poker.
 */
class PersistenceService {
  private gameIdByRoom = new Map<string, string>();
  private handIdByRoom = new Map<string, string>();

  async createRoom(roomId: string, code: string, config: RoomConfig): Promise<void> {
    try {
      await prisma.room.create({
        data: {
          id: roomId,
          code,
          gameMode: config.gameMode,
          maxPlayers: config.maxPlayers,
          startingStack: config.startingStack,
          smallBlind: config.gameMode === 'HOLDEM' ? config.smallBlind : null,
          bigBlind: config.gameMode === 'HOLDEM' ? config.bigBlind : null,
          ante: config.gameMode === 'CONQUIAN' ? config.ante : null,
        },
      });
    } catch (err) {
      console.error('[persistence] createRoom failed', err);
    }
  }

  async addPlayer(roomId: string, playerId: string, sessionToken: string, name: string, seatIndex: number, chips: number, isHost: boolean): Promise<void> {
    try {
      await prisma.player.create({
        data: { id: playerId, roomId, sessionToken, name, seatIndex, chips, isHost },
      });
    } catch (err) {
      console.error('[persistence] addPlayer failed', err);
    }
  }

  async updateRoomStatus(roomId: string, status: 'WAITING' | 'PLAYING' | 'FINISHED'): Promise<void> {
    try {
      await prisma.room.update({ where: { id: roomId }, data: { status } });
    } catch (err) {
      console.error('[persistence] updateRoomStatus failed', err);
    }
  }

  async startGame(roomId: string): Promise<void> {
    try {
      const game = await prisma.game.create({ data: { roomId } });
      this.gameIdByRoom.set(roomId, game.id);
    } catch (err) {
      console.error('[persistence] startGame failed', err);
    }
  }

  async startHand(roomId: string, handNumber: number): Promise<void> {
    const gameId = this.gameIdByRoom.get(roomId);
    if (!gameId) return;
    try {
      const hand = await prisma.hand.create({ data: { gameId, handNumber } });
      this.handIdByRoom.set(roomId, hand.id);
    } catch (err) {
      console.error('[persistence] startHand failed', err);
    }
  }

  async recordAction(roomId: string, playerId: string, type: ActionType, amount: number, phase: GameState['currentPhase']): Promise<void> {
    const handId = this.handIdByRoom.get(roomId);
    if (!handId || phase === 'WAITING' || phase === 'SHOWDOWN') return;
    try {
      await prisma.action.create({
        data: { handId, playerId, type: type as any, amount, phase: phase as any },
      });
    } catch (err) {
      console.error('[persistence] recordAction failed', err);
    }
  }

  async endHand(roomId: string, communityCards: string, potTotal: number, showdown: ShowdownResult): Promise<void> {
    const handId = this.handIdByRoom.get(roomId);
    if (!handId) return;
    try {
      const summary = showdown.winners.map((w) => `${w.playerName}:${w.amountWon}(${w.handDescription})`).join(', ');
      await prisma.hand.update({
        where: { id: handId },
        data: { communityCards, potTotal, winnerSummary: summary, endedAt: new Date() },
      });
    } catch (err) {
      console.error('[persistence] endHand failed', err);
    }
  }

  async updatePlayerChips(playerId: string, chips: number): Promise<void> {
    try {
      await prisma.player.update({ where: { id: playerId }, data: { chips } });
    } catch (err) {
      console.error('[persistence] updatePlayerChips failed', err);
    }
  }

  async markPlayerEliminated(playerId: string): Promise<void> {
    try {
      await prisma.player.update({ where: { id: playerId }, data: { eliminated: true } });
    } catch (err) {
      console.error('[persistence] markPlayerEliminated failed', err);
    }
  }

  async setPlayerConnected(playerId: string, connected: boolean): Promise<void> {
    try {
      await prisma.player.update({ where: { id: playerId }, data: { connected } });
    } catch (err) {
      console.error('[persistence] setPlayerConnected failed', err);
    }
  }

  async endGame(roomId: string): Promise<void> {
    const gameId = this.gameIdByRoom.get(roomId);
    if (!gameId) return;
    try {
      await prisma.game.update({ where: { id: gameId }, data: { endedAt: new Date() } });
    } catch (err) {
      console.error('[persistence] endGame failed', err);
    }
    this.gameIdByRoom.delete(roomId);
    this.handIdByRoom.delete(roomId);
  }
}

export const persistenceService = new PersistenceService();
