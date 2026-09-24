import { Card } from './card.types';
import {
  BlackjackAction,
  BlackjackPhase,
  BlackjackPlayerStatus,
  BlackjackRoundResult,
  HandOutcome,
  HandStatus,
} from '../modules/blackjack/blackjack.types';

export interface BlackjackPlayerPublicDTO {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  status: BlackjackPlayerStatus;
  connected: boolean;
  isHost: boolean;
  /** Bet placed for the upcoming round (BETTING phase only). */
  pendingBet: number;
}

export interface BlackjackHandDTO {
  id: string;
  playerId: string;
  playerName: string;
  seatIndex: number;
  cards: Card[];
  total: number;
  soft: boolean;
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  status: HandStatus;
  outcome: HandOutcome | null;
  payout: number;
  isActive: boolean;
}

export interface BlackjackDealerDTO {
  /** Only face-up cards: the hole card is never sent before it's revealed. */
  cards: Card[];
  hiddenCardCount: number;
  /** Total of the face-up cards only. */
  total: number | null;
  soft: boolean;
  isBlackjack: boolean;
}

export interface BlackjackShoeDTO {
  deckCount: number;
  totalCards: number;
  remaining: number;
  cutCardAt: number;
  justReshuffled: boolean;
}

/** Per-player DTO. Player hands are face-up in shoe blackjack, so the only secret on the table is the dealer's hole card. */
export interface BlackjackStateDTO {
  roomId: string;
  roomCode: string;
  roundNumber: number;
  phase: BlackjackPhase;
  players: BlackjackPlayerPublicDTO[];
  hands: BlackjackHandDTO[];
  activeHandId: string | null;
  dealer: BlackjackDealerDTO;
  minBet: number;
  maxBet: number;
  shoe: BlackjackShoeDTO;
  lastRoundResult: BlackjackRoundResult | null;
  myPlayerId: string;
  myAvailableActions: BlackjackAction[];
  canPlaceBet: boolean;
  canForceDeal: boolean;
}
