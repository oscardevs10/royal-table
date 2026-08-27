import { Card } from './card.types';
import { GamePhase, PlayerStatus, SidePot } from './game.types';
import { CurrentHandInfo, HandOddsEntry } from '../modules/poker/hand-odds';

/** Public view of another player - never exposes their hole cards unless revealed at showdown */
export interface PlayerPublicDTO {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  status: PlayerStatus;
  currentBet: number;
  totalBetInHand: number;
  isHost: boolean;
  connected: boolean;
  isBot: boolean;
  hasCards: boolean;
  isCurrentTurn: boolean;
  revealedHoleCards?: Card[];
}

/**
 * Per-player DTO of the game state. Built individually for each recipient so that
 * `myHoleCards` only ever contains that recipient's own cards.
 */
export interface GameStateDTO {
  roomId: string;
  roomCode: string;
  handNumber: number;
  players: PlayerPublicDTO[];
  dealerPosition: number;
  currentPlayerPosition: number;
  smallBlind: number;
  bigBlind: number;
  pot: number;
  sidePots: SidePot[];
  communityCards: Card[];
  currentPhase: GamePhase;
  currentBet: number;
  minRaise: number;
  handInProgress: boolean;
  myPlayerId: string;
  myHoleCards: Card[];
  myAvailableActions: AvailableAction[];
  myCallAmount: number;
  myCurrentHand: CurrentHandInfo | null;
  myHandOdds: HandOddsEntry[] | null;
  myHandOddsExact: boolean;
}

export interface AvailableAction {
  type: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN';
  minAmount?: number;
  maxAmount?: number;
}

export interface RoomPlayerDTO {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  isBot: boolean;
}

export interface RoomStateDTO {
  roomId: string;
  code: string;
  maxPlayers: number;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  players: RoomPlayerDTO[];
}
