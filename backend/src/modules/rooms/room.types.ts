import { GameEngine } from '../poker/game-engine';
import { BlackjackEngine } from '../blackjack/blackjack-engine';
import { LobbyPlayer } from '../players/player.types';

export type GameMode = 'HOLDEM' | 'BLACKJACK';

export interface HoldemConfig {
  gameMode: 'HOLDEM';
  maxPlayers: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
}

export interface BlackjackConfig {
  gameMode: 'BLACKJACK';
  /** 1 = a private table against the dealer; 2-7 = a shared table others join with the room code. */
  maxPlayers: number;
  startingStack: number;
  minBet: number;
  maxBet: number;
  /** Number of 52-card decks in the shoe. */
  deckCount: number;
}

export type RoomConfig = HoldemConfig | BlackjackConfig;

export type RoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED';

export interface Room {
  id: string;
  code: string;
  config: RoomConfig;
  status: RoomStatus;
  players: LobbyPlayer[];
  engine: GameEngine | BlackjackEngine | null;
  createdAt: number;
}
