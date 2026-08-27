import { Card } from './card.types';

export type GamePhase = 'WAITING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';

export type PlayerStatus = 'ACTIVE' | 'FOLDED' | 'ALL_IN' | 'SITTING_OUT' | 'OUT';

export type ActionType = 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN' | 'SMALL_BLIND' | 'BIG_BLIND';

export interface PlayerAction {
  playerId: string;
  type: ActionType;
  amount: number;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface PlayerState {
  id: string;
  sessionToken: string;
  name: string;
  seatIndex: number;
  chips: number;
  holeCards: Card[];
  status: PlayerStatus;
  currentBet: number;
  totalBetInHand: number;
  hasActedThisRound: boolean;
  isHost: boolean;
  connected: boolean;
  isBot: boolean;
}

export interface GameState {
  roomId: string;
  roomCode: string;
  handNumber: number;
  players: PlayerState[];
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
  deck: Card[];
  lastAggressorPosition: number | null;
  handInProgress: boolean;
}

export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amountWon: number;
  handRank: string;
  handDescription: string;
  bestCards: Card[];
}

export interface ShowdownResult {
  winners: WinnerInfo[];
  revealedHands: { playerId: string; holeCards: Card[]; handRank: string; handDescription: string }[];
}
