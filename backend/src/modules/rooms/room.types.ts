import { GameEngine } from '../poker/game-engine';
import { ConquianEngine } from '../conquian/conquian-engine';
import { LobbyPlayer } from '../players/player.types';

export type GameMode = 'HOLDEM' | 'CONQUIAN';

export interface HoldemConfig {
  gameMode: 'HOLDEM';
  maxPlayers: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface ConquianConfig {
  gameMode: 'CONQUIAN';
  maxPlayers: number;
  startingStack: number;
  ante: number;
}

export type RoomConfig = HoldemConfig | ConquianConfig;

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface Room {
  id: string;
  code: string;
  config: RoomConfig;
  status: RoomStatus;
  players: LobbyPlayer[];
  engine: GameEngine | ConquianEngine | null;
  createdAt: number;
}
