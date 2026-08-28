import { Room, RoomConfig } from './room.types';
import { LobbyPlayer } from '../players/player.types';
import { createLobbyPlayer, createBotPlayer } from '../players/player.service';
import { generateRoomCode } from '../../utils/room-code';
import { GameEngine } from '../poker/game-engine';
import { ConquianEngine } from '../conquian/conquian-engine';
import { Card } from '../../types/card.types';
import { DrawSource } from '../conquian/conquian.types';
import { v4 as uuidv4 } from 'uuid';
import { persistenceService } from '../../database/persistence.service';

const ALLOWED_MAX_PLAYERS = [2, 3, 4, 5, 6, 8];
const ALLOWED_CONQUIAN_MAX_PLAYERS = [2, 3, 4];

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

    if (config.gameMode === 'CONQUIAN') {
      if (!ALLOWED_CONQUIAN_MAX_PLAYERS.includes(config.maxPlayers)) return 'Invalid max players';
      if (!Number.isInteger(config.ante) || config.ante <= 0) return 'Invalid ante';
      if (config.ante > config.startingStack) return 'Ante cannot exceed starting stack';
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
    if (room.status !== 'WAITING') return { ok: false, error: 'Game already in progress' };
    if (room.players.length >= room.config.maxPlayers) return { ok: false, error: 'Room is full' };

    const player = createLobbyPlayer({
      name: playerName,
      seatIndex: room.players.length,
      isHost: false,
      chips: room.config.startingStack,
    });

    room.players.push(player);
    this.roomCodeBySession.set(player.sessionToken, room.code);

    await persistenceService.addPlayer(room.id, player.id, player.sessionToken, player.name, player.seatIndex, player.chips, false);

    return { ok: true, data: { room, player } };
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
    if (room.config.gameMode === 'CONQUIAN') return { ok: false, error: 'Bots are not supported in Conquian yet' };

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
    if (room.players.length < 2) return { ok: false, error: 'Need at least 2 players' };

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

    room.engine =
      room.config.gameMode === 'CONQUIAN'
        ? new ConquianEngine(room.id, room.code, seats, room.config.ante)
        : new GameEngine(room.id, room.code, seats, room.config.smallBlind, room.config.bigBlind);

    await persistenceService.updateRoomStatus(room.id, 'PLAYING');
    await persistenceService.startGame(room.id);

    room.engine.startNewHand();
    await persistenceService.startHand(room.id, room.engine.getState().handNumber);

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

  conquianDraw(sessionToken: string, source: DrawSource): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!room.engine || room.config.gameMode !== 'CONQUIAN') return { ok: false, error: 'Game not started' };

    const result = (room.engine as ConquianEngine).draw(player.id, source);
    if (!result.success) return { ok: false, error: result.error };

    this.syncChipsFromEngine(room);
    return { ok: true, data: room };
  }

  conquianMeld(sessionToken: string, cards: Card[], targetMeldId?: string): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!room.engine || room.config.gameMode !== 'CONQUIAN') return { ok: false, error: 'Game not started' };

    const result = (room.engine as ConquianEngine).meld(player.id, cards, targetMeldId);
    if (!result.success) return { ok: false, error: result.error };

    this.syncChipsFromEngine(room);
    return { ok: true, data: room };
  }

  conquianDiscard(sessionToken: string, card: Card): ServiceResult<Room> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!room.engine || room.config.gameMode !== 'CONQUIAN') return { ok: false, error: 'Game not started' };

    const result = (room.engine as ConquianEngine).discard(player.id, card);
    if (!result.success) return { ok: false, error: result.error };

    this.syncChipsFromEngine(room);
    return { ok: true, data: room };
  }

  async nextHand(sessionToken: string): Promise<ServiceResult<Room>> {
    const found = this.findBySession(sessionToken);
    if (!found) return { ok: false, error: 'Player not found' };
    const { room, player } = found;
    if (!room.engine) return { ok: false, error: 'Game not started' };
    if (!player.isHost) return { ok: false, error: 'Only the host can start the next hand' };

    if (room.engine.isGameOver()) {
      room.status = 'FINISHED';
      await persistenceService.updateRoomStatus(room.id, 'FINISHED');
      await persistenceService.endGame(room.id);
      return { ok: false, error: 'Game is already over' };
    }

    room.engine.startNewHand();
    await persistenceService.startHand(room.id, room.engine.getState().handNumber);
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

    if (room.status === 'WAITING') {
      room.players = room.players.filter((p) => p.sessionToken !== sessionToken);
      room.players.forEach((p, idx) => (p.seatIndex = idx));
      if (player.isHost && room.players.length > 0) room.players[0].isHost = true;
      this.roomCodeBySession.delete(sessionToken);
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
