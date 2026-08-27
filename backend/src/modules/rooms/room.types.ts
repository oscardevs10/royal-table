import { GameEngine } from '../poker/game-engine';
import { LobbyPlayer } from '../players/player.types';

export interface RoomConfig {
  maxPlayers: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface Room {
  id: string;
  code: string;
  config: RoomConfig;
  status: RoomStatus;
  players: LobbyPlayer[];
  engine: GameEngine | null;
  createdAt: number;
}
