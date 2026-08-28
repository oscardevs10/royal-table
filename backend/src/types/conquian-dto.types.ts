import { Card } from './card.types';
import { MeldType } from '../modules/conquian/meld-validator';
import { ConquianPlayerStatus, TurnPhase } from '../modules/conquian/conquian.types';

export interface ConquianMeldDTO {
  id: string;
  type: MeldType;
  cards: Card[];
  laidByPlayerId: string;
}

export interface ConquianPlayerPublicDTO {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  status: ConquianPlayerStatus;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
  handCount: number;
  isCurrentTurn: boolean;
}

export interface ConquianAvailableActions {
  canDrawStock: boolean;
  canDrawDiscard: boolean;
  canDiscard: boolean;
}

/** Per-player DTO: `myHand` only ever contains the recipient's own cards - opponents only expose a card count. */
export interface ConquianStateDTO {
  roomId: string;
  roomCode: string;
  handNumber: number;
  players: ConquianPlayerPublicDTO[];
  dealerPosition: number;
  currentPlayerPosition: number;
  stockCount: number;
  discardTopCard: Card | null;
  discardCount: number;
  melds: ConquianMeldDTO[];
  ante: number;
  pot: number;
  turnPhase: TurnPhase;
  handInProgress: boolean;
  myPlayerId: string;
  myHand: Card[];
  myAvailableActions: ConquianAvailableActions;
}

export interface ConquianHandResultDTO {
  winnerId: string | null;
  winnerName: string | null;
  potWon: number;
  isPush: boolean;
}
