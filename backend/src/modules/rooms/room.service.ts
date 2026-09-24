import { Room, RoomConfig } from './room.types';
import { LobbyPlayer } from '../players/player.types';
import { createLobbyPlayer, createBotPlayer } from '../players/player.service';
import { generateRoomCode } from '../../utils/room-code';
import { GameEngine } from '../poker/game-engine';
import { BlackjackEngine, BlackjackActionResult } from '../blackjack/blackjack-engine';
import { BlackjackAction } from '../blackjack/blackjack.types';
import { ALLOWED_DECK_COUNTS, minDecksForSeats } from '../blackjack/shoe';
import { v4 as uuidv4 } from 'uuid';
import { persistenceService } from '../../database/persistence.service';

const ALLOWED_MAX_PLAYERS = [2, 3, 4, 5, 6, 8];
/** A standard blackjack table has 7 betting spots. */
export const BLACKJACK_MAX_SEATS = 7;

export interface ServiceResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

class RoomService {
  private roomsByCode = new Map<string, Room>();
  private roomCodeBySession = new Map<string, string>();

  private validateConfig(config: RoomConfig): string | null {
    if (!Number.isInteger(config.startingStack) || config.startingStack < 100 || config.startingStack > 1_000_000) {
      return 'Invalid starting stack';
    }

    if (config.gameMode === 'BLACKJACK') {
      if (!Number.isInteger(config.maxPlayers) || config.maxPlayers < 1 || config.maxPlayers > BLACKJACK_MAX_SEATS) {
        return 'Invalid max players';
      }
      if (!Number.isInteger(config.minBet) || config.minBet <= 0) return 'Invalid minimum bet';
      if (!Number.isInteger(config.maxBet) || config.maxBet < config.minBet) return 'Maximum bet must be at least the minimum bet';
      if (config.minBet > config.startingStack) return 'Minimum bet cannot exceed starting stack';
      if (!ALLOWED_DECK_COUNTS.includes(config.deckCount)) return 'Invalid deck count';
      const minDecks = minDecksForSeats(config.maxPlayers);
      if (config.deckCount < minDecks) return `A ${config.maxPlayers}-seat table needs at least ${minDecks} decks`;
      return null;
    }

    if (!ALLOWED_MAX_PLAYERS.includes(config.maxPlayers)) return 'Invalid max players';
    if (!Number.isInteger(config.smallBlind) || config.smallBlind <= 0) return 'Invalid small blind';
    if (!Number.isInteger(config.bigBlind) || config.bigBlind <= config.smallBlind) return 'Big blind must be greater than small blind';
    if (config.bigBlind > config.startingStack) return 'Big blind cannot exceed starting stack';
    return null;
  }

  async createRoom(playerName: string, config: RoomConfig): Promise<ServiceResult<{ room: Room; player: LobbyPlayer }>> {
    const configError = this.validateConfig(config);
    if (configError) return { ok: false, error: configError };

    let code = generateRoomCode();
    while (this.roomsByCode.has(code)) code = generateRoomCode();

    const player = createLobbyPlayer({ name: playerName, seatIndex: 0, isHost: true, chips: config.startingStack });

    const room: Room = {
      id: uuidv4(),
      code,
      config,
      status: 'WAITING',
      players: [player],
      engine: null,
      createdAt: Date.now(),
    };

    this.roomsByCode.set(code, room);
    this.roomCodeBySession.set(player.sessionToken, code);

    await persistenceService.createRoom(room.id, room.code, config);
    await persistenceService.addPlayer(room.id, player.id, player.sessionToken, player.name, player.seatIndex, player.chips, true);

    return { ok: true, data: { room, player } };
  }

  async joinRoom(code: string, playerName: string): Promise<ServiceResult<{ room: Room; player: LobbyPlayer }>> {
    const room = this.roomsByCode.get(code.toUpperCase());
    if (!room) return { ok: false, error: 'Room not found' };
    if (room.status === 'FINISHED') return { ok: false, error: 'Game already finished' };
    // A blackjack table can be joined mid-game: the newcomer sits in from the next betting round.
    const joinsMidGame = room.status === 'PLAYING';
    if (joinsMidGame && room.config.gameMode !== 'BLACKJACK') return { ok: false, error: 'Game already in progress' };
    if (room.players.length >= room.config.maxPlayers) return { ok: false, error: 'Room is full' };

    const player = createLobbyPlayer({
      name: playerName,
      seatIndex: room.config.gameMode === 'BLACKJACK' ? this.firstFreeSeat(room) : room.players.length,
      isHost: false,
      chips: room.config.startingStack,
    });

    room.players.push(player);
    this.roomCodeBySession.set(player.sessionToken, room.code);

    if (joinsMidGame && room.engine instanceof BlackjackEngine) {
      room.engine.addPlayer({
        id: player.id,
        name: player.name,
        chips: player.chips,
        seatIndex: player.seatIndex,
        sessionToken: player.sessionToken,
        isHost: false,
        isBot: false,
      });
    }

    await persistenceService.addPlayer(room.id, player.id, player.sessionToken, player.name, player.seatIndex, player.chips, false);

    return { ok: true, data: { room, player } };
  }

  /** Seats freed by players who left mid-game are reused, so seat numbers stay within the table size. */
  private firstFreeSeat(room: Room): number {
    const taken = new Set(room.players.map((p) => p.seatIndex));
    let seat = 0;
    while (taken.has(seat)) seat++;
    return seat;
  }

  findByCode(code: string): Room | undefined {
    return this.roomsByCode.get(code.toUpperCase());
  }

  findBySession(sessionToken: string): { room: Room; player: LobbyPlayer } | undefined {
    const code = this.roomCodeBySession.get(sessionToken);
    if (!code) return undefined;
    const room = this.roomsByCode.get(code);
    if (!room) return undefined;
    const player = room.players.find((p) => p.sessionToken === sessionToken);
    if (!player) return undefined;
    return { room, player };
  }

  addBot(sessionToken: string): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;

    if (!player.isHost) return { ok: false, error: 'Only the host can add bots' };
    if (room.status !== 'WAITING') return { ok: false, error: 'Cannot add bots once the game has started' };
    if (room.players.length >= room.config.maxPlayers) return { ok: false, error: 'Room is full' };
    if (room.config.gameMode === 'BLACKJACK') return { ok: false, error: 'Blackjack is played against the dealer - no bots needed' };

    const bot = createBotPlayer({
      seatIndex: room.players.length,
      chips: room.config.startingStack,
      existingNames: room.players.map((p) => p.name),
    });

    room.players.push(bot);
    this.roomCodeBySession.set(bot.sessionToken, room.code);

    return { ok: true, data: room };
  }

  removeBot(sessionToken: string, botPlayerId: string): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;

    if (!player.isHost) return { ok: false, error: 'Only the host can remove bots' };
    if (room.status !== 'WAITING') return { ok: false, error: 'Cannot remove bots once the game has started' };

    const bot = room.players.find((p) => p.id === botPlayerId && p.isBot);
    if (!bot) return { ok: false, error: 'Bot not found' };

    room.players = room.players.filter((p) => p.id !== botPlayerId);
    room.players.forEach((p, idx) => (p.seatIndex = idx));
    this.roomCodeBySession.delete(bot.sessionToken);

    return { ok: true, data: room };
  }

  setReady(sessionToken: string, ready: boolean): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    found.player.ready = ready;
    return { ok: true, data: found.room };
  }

  async startGame(sessionToken: string): Promise<ServiceResult<Room>> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;

    if (!player.isHost) return { ok: false, error: 'Only the host can start the game' };
    if (room.status !== 'WAITING') return { ok: false, error: 'Game already started' };
    // Blackjack is played against the house, so a single player is already a complete table.
    if (room.config.gameMode === 'HOLDEM' && room.players.length < 2) return { ok: false, error: 'Need at least 2 players' };

    room.status = 'PLAYING';

    const seats = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      seatIndex: p.seatIndex,
      sessionToken: p.sessionToken,
      isHost: p.isHost,
      isBot: p.isBot,
    }));

    await persistenceService.updateRoomStatus(room.id, 'PLAYING');
    await persistenceService.startGame(room.id);

    if (room.config.gameMode === 'BLACKJACK') {
      const engine = new BlackjackEngine(room.id, room.code, seats, {
        minBet: room.config.minBet,
        maxBet: room.config.maxBet,
        deckCount: room.config.deckCount,
      });
      engine.startBetting();
      room.engine = engine;
      return { ok: true, data: room };
    }

    const engine = new GameEngine(room.id, room.code, seats, room.config.smallBlind, room.config.bigBlind);
    room.engine = engine;
    engine.startNewHand();
    await persistenceService.startHand(room.id, engine.getState().handNumber);

    return { ok: true, data: room };
  }

  /**
   * "Play again": puts a finished room back in the lobby with the same code and the same
   * players (bots included), everyone back at the starting stack. The host can then change
   * who's at the table (invite, add/remove bots) before starting the next game.
   */
  async restartRoom(sessionToken: string): Promise<ServiceResult<Room>> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!player.isHost) return { ok: false, error: 'Only the host can restart the game' };
    if (room.status !== 'FINISHED') return { ok: false, error: 'The game is not over yet' };

    room.status = 'WAITING';
    room.engine = null;
    room.players.forEach((p, idx) => {
      p.seatIndex = idx;
      p.chips = room.config.startingStack;
      p.eliminated = false;
      p.ready = p.isHost || p.isBot;
    });

    await persistenceService.updateRoomStatus(room.id, 'WAITING');
    for (const p of room.players) {
      if (!p.isBot) await persistenceService.resetPlayer(p.id, p.chips);
    }

    return { ok: true, data: room };
  }

  applyPokerAction(sessionToken: string, type: string, amount?: number): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!room.engine || room.config.gameMode !== 'HOLDEM') return { ok: false, error: 'Game not started' };

    const result = (room.engine as GameEngine).applyAction(player.id, type as any, amount);
    if (!result.success) return { ok: false, error: result.error };

    this.syncChipsFromEngine(room);
    return { ok: true, data: room };
  }

  blackjackBet(sessionToken: string, amount: number): ServiceResult<Room> {
    return this.withBlackjackEngine(sessionToken, (engine, playerId) => engine.placeBet(playerId, amount));
  }

  blackjackDeal(sessionToken: string): ServiceResult<Room> {
    return this.withBlackjackEngine(sessionToken, (engine, playerId) => engine.forceDeal(playerId));
  }

  blackjackAction(sessionToken: string, action: BlackjackAction): ServiceResult<Room> {
    return this.withBlackjackEngine(sessionToken, (engine, playerId) => engine.act(playerId, action));
  }

  private withBlackjackEngine(
    sessionToken: string,
    apply: (engine: BlackjackEngine, playerId: string) => BlackjackActionResult
  ): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!(room.engine instanceof BlackjackEngine)) return { ok: false, error: 'Game not started' };

    const result = apply(room.engine, player.id);
    if (!result.success) return { ok: false, error: result.error };

    this.syncChipsFromEngine(room);
    return { ok: true, data: room };
  }

  async nextHand(sessionToken: string): Promise<ServiceResult<Room>> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    // Blackjack rounds advance on their own (see the socket handler), so this is Hold'em only.
    if (!room.engine || room.config.gameMode !== 'HOLDEM') return { ok: false, error: 'Game not started' };
    if (!player.isHost) return { ok: false, error: 'Only the host can start the next hand' };
    const engine = room.engine as GameEngine;

    if (engine.isGameOver()) {
      room.status = 'FINISHED';
      await persistenceService.updateRoomStatus(room.id, 'FINISHED');
      await persistenceService.endGame(room.id);
      return { ok: false, error: 'Game is already over' };
    }

    engine.startNewHand();
    await persistenceService.startHand(room.id, engine.getState().handNumber);
    return { ok: true, data: room };
  }

  private syncChipsFromEngine(room: Room): void {
    if (!room.engine) return;
    const state = room.engine.getState();
    for (const player of room.players) {
      const enginePlayer = state.players.find((p) => p.id === player.id);
      if (enginePlayer) {
        player.chips = enginePlayer.chips;
        if (enginePlayer.status === 'OUT') player.eliminated = true;
      }
    }
  }

  markDisconnected(socketId: string): { room: Room; player: LobbyPlayer } | undefined {
    for (const room of this.roomsByCode.values()) {
      const player = room.players.find((p) => p.socketId === socketId);
      if (player) {
        player.connected = false;
        player.socketId = null;
        room.engine?.markDisconnected(player.id);
        persistenceService.setPlayerConnected(player.id, false);
        return { room, player };
      }
    }
    return undefined;
  }

  attachSocket(sessionToken: string, socketId: string): { room: Room; player: LobbyPlayer; wasDisconnected: boolean } | undefined {
    const found = this.findBySession(sessionToken);
    if (!found) return undefined;
    found.player.socketId = socketId;
    const wasDisconnected = !found.player.connected;
    found.player.connected = true;
    found.room.engine?.markReconnected(found.player.id);
    if (wasDisconnected) persistenceService.setPlayerConnected(found.player.id, true);
    return { ...found, wasDisconnected };
  }

  leaveRoom(sessionToken: string): { room: Room; player: LobbyPlayer } | undefined {
    const found = this.findBySession(sessionToken);
    if (!found) return undefined;
    const { room, player } = found;

    // Poker keeps a leaving player's seat for the rest of the game (hand order depends on it);
    // at a blackjack table the seat is simply freed for someone else to take.
    if (room.status === 'WAITING' || room.config.gameMode === 'BLACKJACK') {
      room.players = room.players.filter((p) => p.sessionToken !== sessionToken);
      if (room.status === 'WAITING') room.players.forEach((p, idx) => (p.seatIndex = idx));
      this.roomCodeBySession.delete(sessionToken);

      if (room.engine instanceof BlackjackEngine) room.engine.removePlayer(player.id);

      if (player.isHost && room.players.length > 0) {
        room.players[0].isHost = true;
        if (room.engine instanceof BlackjackEngine) room.engine.setHost(room.players[0].id);
      }
      if (room.players.length === 0) this.roomsByCode.delete(room.code);
    } else {
      player.connected = false;
      player.socketId = null;
      room.engine?.markDisconnected(player.id);
    }

    return { room, player };
  }

  syncAfterAction(room: Room): void {
    this.syncChipsFromEngine(room);
  }
}

export const roomService = new RoomService();
