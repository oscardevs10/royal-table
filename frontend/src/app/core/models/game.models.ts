export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type GamePhase = 'WAITING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';
export type PlayerStatus = 'ACTIVE' | 'FOLDED' | 'ALL_IN' | 'SITTING_OUT' | 'OUT';
export type ActionType = 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN' | 'SMALL_BLIND' | 'BIG_BLIND';

export type HandCategory =
  | 'HIGH_CARD'
  | 'ONE_PAIR'
  | 'TWO_PAIR'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'FULL_HOUSE'
  | 'FOUR_OF_A_KIND'
  | 'STRAIGHT_FLUSH'
  | 'ROYAL_FLUSH';

export interface HandOddsEntry {
  category: HandCategory;
  probability: number;
}

export interface CurrentHandInfo {
  description: string;
  category: HandCategory | null;
}

export interface AvailableAction {
  type: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN';
  minAmount?: number;
  maxAmount?: number;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

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

export interface RoomPlayerDTO {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  isBot: boolean;
}

export type GameMode = 'HOLDEM' | 'BLACKJACK';

export interface RoomStateDTO {
  roomId: string;
  code: string;
  gameMode: GameMode;
  maxPlayers: number;
  startingStack: number;
  smallBlind?: number;
  bigBlind?: number;
  minBet?: number;
  maxBet?: number;
  deckCount?: number;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  players: RoomPlayerDTO[];
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

export interface ChatMessage {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface CreateRoomPayload {
  playerName: string;
  gameMode: GameMode;
  maxPlayers: number;
  startingStack: number;
  smallBlind?: number;
  bigBlind?: number;
  minBet?: number;
  maxBet?: number;
  deckCount?: number;
}

// --- Blackjack ---

export type BlackjackPhase = 'BETTING' | 'PLAYER_TURNS' | 'DEALER_TURN' | 'ROUND_OVER';
export type BlackjackAction = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT';
export type BlackjackHandStatus = 'PLAYING' | 'STOOD' | 'BUST' | 'BLACKJACK';
export type BlackjackHandOutcome = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE';

export interface BlackjackPlayerPublicDTO {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  status: 'ACTIVE' | 'OUT';
  connected: boolean;
  isHost: boolean;
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
  status: BlackjackHandStatus;
  outcome: BlackjackHandOutcome | null;
  payout: number;
  isActive: boolean;
}

export interface BlackjackDealerDTO {
  cards: Card[];
  hiddenCardCount: number;
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

export interface BlackjackPlayerRoundResult {
  playerId: string;
  playerName: string;
  totalBet: number;
  totalPayout: number;
  net: number;
}

export interface BlackjackRoundResult {
  roundNumber: number;
  dealerTotal: number;
  dealerBlackjack: boolean;
  dealerBust: boolean;
  players: BlackjackPlayerRoundResult[];
}

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
