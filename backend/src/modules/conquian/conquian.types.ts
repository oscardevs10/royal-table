import { Card } from '../../types/card.types';
import { Meld } from './meld-validator';

export type ConquianPlayerStatus = 'ACTIVE' | 'OUT';
export type TurnPhase = 'DRAW' | 'ACT';
export type DrawSource = 'STOCK' | 'DISCARD';

export interface ConquianPlayerState {
  id: string;
  sessionToken: string;
  name: string;
  seatIndex: number;
  chips: number;
  hand: Card[];
  status: ConquianPlayerStatus;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
}

export interface ConquianState {
  roomId: string;
  roomCode: string;
  handNumber: number;
  players: ConquianPlayerState[];
  dealerPosition: number;
  currentPlayerPosition: number;
  stock: Card[];
  discardPile: Card[];
  melds: Meld[];
  ante: number;
  pot: number;
  turnPhase: TurnPhase;
  handInProgress: boolean;
}

export interface ConquianHandResult {
  winnerId: string | null;
  winnerName: string | null;
  potWon: number;
  isPush: boolean;
}
