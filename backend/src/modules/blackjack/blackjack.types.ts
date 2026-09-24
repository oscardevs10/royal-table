import { Card } from '../../types/card.types';

export type BlackjackPlayerStatus = 'ACTIVE' | 'OUT';

/**
 * BETTING       - players place their bets for the next round.
 * PLAYER_TURNS  - hands are played one at a time, in seat order.
 * DEALER_TURN   - hole card revealed, dealer draws to 17 (stepped by the server with pauses).
 * ROUND_OVER    - hands settled; results are shown until the next betting phase opens.
 */
export type BlackjackPhase = 'BETTING' | 'PLAYER_TURNS' | 'DEALER_TURN' | 'ROUND_OVER';

export type BlackjackAction = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT';

export type HandStatus = 'PLAYING' | 'STOOD' | 'BUST' | 'BLACKJACK';

export type HandOutcome = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE';

export interface BlackjackPlayerState {
  id: string;
  sessionToken: string;
  name: string;
  seatIndex: number;
  chips: number;
  status: BlackjackPlayerStatus;
  connected: boolean;
  isBot: boolean;
  isHost: boolean;
  /** Bet placed during BETTING (not yet taken from chips until the deal). 0 = no bet yet. */
  pendingBet: number;
}

export interface BlackjackHand {
  id: string;
  playerId: string;
  playerName: string;
  seatIndex: number;
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Created by splitting - a 21 on it is not a natural blackjack. */
  fromSplit: boolean;
  status: HandStatus;
  outcome: HandOutcome | null;
  /** Total returned to the player at settlement (stake + winnings; 0 on a loss). */
  payout: number;
}

export interface BlackjackState {
  roomId: string;
  roomCode: string;
  roundNumber: number;
  phase: BlackjackPhase;
  players: BlackjackPlayerState[];
  /** All hands in play this round, in play order (split hands sit right after their parent). */
  hands: BlackjackHand[];
  activeHandIndex: number;
  dealerCards: Card[];
  dealerHoleRevealed: boolean;
  minBet: number;
  maxBet: number;
  deckCount: number;
}

export interface BlackjackPlayerRoundResult {
  playerId: string;
  playerName: string;
  totalBet: number;
  totalPayout: number;
  /** payout - bet: positive = won, 0 = pushed/broke even, negative = lost. */
  net: number;
}

export interface BlackjackRoundResult {
  roundNumber: number;
  dealerTotal: number;
  dealerBlackjack: boolean;
  dealerBust: boolean;
  players: BlackjackPlayerRoundResult[];
}
