import { v4 as uuidv4 } from 'uuid';
import { Shoe } from './shoe';
import { cardPoints, dealerShouldHit, handValue, isBust, isNaturalBlackjack, isSplittablePair } from './hand-value';
import {
  BlackjackAction,
  BlackjackHand,
  BlackjackPlayerRoundResult,
  BlackjackPlayerState,
  BlackjackRoundResult,
  BlackjackState,
} from './blackjack.types';

export interface BlackjackSeatInput {
  id: string;
  name: string;
  chips: number;
  seatIndex: number;
  sessionToken: string;
  isHost: boolean;
  isBot: boolean;
}

export interface BlackjackActionResult {
  success: boolean;
  error?: string;
}

export interface BlackjackEngineOptions {
  minBet: number;
  maxBet: number;
  deckCount: number;
  rng?: () => number;
  penetration?: number;
  /** Inject a pre-built shoe (tests use this to stack the deal). */
  shoe?: Shoe;
}

/** A player may split up to 3 times (4 hands), the most common casino limit. */
export const MAX_HANDS_PER_PLAYER = 4;

/**
 * Server-authoritative multi-player blackjack against the house (US rules: dealer peeks
 * for blackjack with an ace or ten-value up card, stands on soft 17, blackjack pays 3:2,
 * double on any first two cards including after a split, split aces get one card each).
 *
 * The dealer is not a seat: every player plays their own hand(s) against the dealer,
 * so a table works with a single player just as well as with a full table of 7.
 */
export class BlackjackEngine {
  private state: BlackjackState;
  private shoe: Shoe;
  private lastEliminated: BlackjackPlayerState[] = [];
  private lastRoundResult: BlackjackRoundResult | null = null;
  private roundResultForDisplay: BlackjackRoundResult | null = null;
  /** The round number the most recent reshuffle happened in front of. */
  private reshuffledBeforeRound = 1;

  constructor(roomId: string, roomCode: string, seats: BlackjackSeatInput[], options: BlackjackEngineOptions) {
    this.shoe = options.shoe ?? new Shoe(options.deckCount, options.rng, options.penetration);
    this.state = {
      roomId,
      roomCode,
      roundNumber: 0,
      phase: 'BETTING',
      players: seats.map((s) => this.createPlayer(s)).sort((a, b) => a.seatIndex - b.seatIndex),
      hands: [],
      activeHandIndex: -1,
      dealerCards: [],
      dealerHoleRevealed: false,
      minBet: options.minBet,
      maxBet: options.maxBet,
      deckCount: options.deckCount,
    };
  }

  private createPlayer(seat: BlackjackSeatInput): BlackjackPlayerState {
    return {
      id: seat.id,
      sessionToken: seat.sessionToken,
      name: seat.name,
      seatIndex: seat.seatIndex,
      chips: seat.chips,
      status: 'ACTIVE',
      connected: true,
      isBot: seat.isBot,
      isHost: seat.isHost,
      pendingBet: 0,
    };
  }

  getState(): BlackjackState {
    return this.state;
  }

  getPlayer(playerId: string): BlackjackPlayerState | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  getActiveHand(): BlackjackHand | null {
    if (this.state.phase !== 'PLAYER_TURNS') return null;
    return this.state.hands[this.state.activeHandIndex] ?? null;
  }

  getShoeInfo(): { deckCount: number; totalCards: number; remaining: number; cutCardAt: number; justReshuffled: boolean } {
    const upcomingRound = this.state.phase === 'BETTING' ? this.state.roundNumber + 1 : this.state.roundNumber;
    return {
      deckCount: this.shoe.deckCount,
      totalCards: this.shoe.totalCards,
      remaining: this.shoe.remaining(),
      cutCardAt: this.shoe.cutCardAt(),
      justReshuffled: this.reshuffledBeforeRound === upcomingRound,
    };
  }

  /** Result of the round currently shown on the table (only during ROUND_OVER). */
  getDisplayedRoundResult(): BlackjackRoundResult | null {
    return this.state.phase === 'ROUND_OVER' ? this.roundResultForDisplay : null;
  }

  consumeRoundResult(): BlackjackRoundResult | null {
    const result = this.lastRoundResult;
    this.lastRoundResult = null;
    return result;
  }

  consumeEliminated(): BlackjackPlayerState[] {
    const eliminated = this.lastEliminated;
    this.lastEliminated = [];
    return eliminated;
  }

  activePlayerCount(): number {
    return this.state.players.filter((p) => p.status !== 'OUT').length;
  }

  /** It's the house against everyone: the game only ends once nobody at the table can cover the minimum bet. */
  isGameOver(): boolean {
    return this.activePlayerCount() === 0;
  }

  // -------------------------------------------------------------------------
  // Seating
  // -------------------------------------------------------------------------

  /** Blackjack tables can be joined mid-game: the new player sits in and bets from the next betting phase. */
  addPlayer(seat: BlackjackSeatInput): void {
    this.state.players.push(this.createPlayer(seat));
    this.state.players.sort((a, b) => a.seatIndex - b.seatIndex);
  }

  /**
   * Removes a player from the table. Their hands in the current round (if any) stay on the
   * table and are simply stood when their turn comes up; the stake is forfeited with them.
   */
  removePlayer(playerId: string): void {
    this.state.players = this.state.players.filter((p) => p.id !== playerId);
    if (this.state.phase === 'BETTING') {
      this.dealIfAllBetsIn();
    } else if (this.state.phase === 'PLAYER_TURNS' && this.getActiveHand()?.playerId === playerId) {
      this.getActiveHand()!.status = 'STOOD';
      this.advanceToNextPlayableHand();
    }
  }

  setHost(playerId: string): void {
    for (const player of this.state.players) player.isHost = player.id === playerId;
  }

  markDisconnected(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.connected = false;
    // Don't let the rest of the table wait on someone who dropped before betting.
    if (this.state.phase === 'BETTING') this.dealIfAllBetsIn();
  }

  markReconnected(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (player) player.connected = true;
  }

  // -------------------------------------------------------------------------
  // Betting
  // -------------------------------------------------------------------------

  /** Clears the table and opens betting for the next round, reshuffling the shoe if the cut card came out. */
  startBetting(): void {
    const tableCards = [...this.state.hands.flatMap((h) => h.cards), ...this.state.dealerCards];
    this.shoe.discard(tableCards);

    this.state.hands = [];
    this.state.dealerCards = [];
    this.state.dealerHoleRevealed = false;
    this.state.activeHandIndex = -1;
    this.roundResultForDisplay = null;
    for (const player of this.state.players) player.pendingBet = 0;

    if (this.shoe.needsReshuffle()) {
      this.shoe.reshuffle();
      this.reshuffledBeforeRound = this.state.roundNumber + 1;
    }

    this.state.phase = 'BETTING';
  }

  /** Sets (or changes) the player's bet for the upcoming round. An amount of 0 withdraws it. */
  placeBet(playerId: string, amount: number): BlackjackActionResult {
    if (this.state.phase !== 'BETTING') return { success: false, error: 'Las apuestas están cerradas' };
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Jugador no encontrado' };
    if (player.status === 'OUT') return { success: false, error: 'No tienes fichas suficientes para apostar' };
    if (!Number.isInteger(amount) || amount < 0) return { success: false, error: 'Apuesta inválida' };

    if (amount > 0) {
      if (amount < this.state.minBet) return { success: false, error: `La apuesta mínima es ${this.state.minBet}` };
      if (amount > this.state.maxBet) return { success: false, error: `La apuesta máxima es ${this.state.maxBet}` };
      if (amount > player.chips) return { success: false, error: 'No tienes fichas suficientes' };
    }

    player.pendingBet = amount;
    this.dealIfAllBetsIn();
    return { success: true };
  }

  /** Lets the host deal without waiting on players who haven't bet (they sit this round out). */
  forceDeal(playerId: string): BlackjackActionResult {
    if (this.state.phase !== 'BETTING') return { success: false, error: 'Las apuestas están cerradas' };
    const player = this.getPlayer(playerId);
    if (!player?.isHost) return { success: false, error: 'Solo el anfitrión puede repartir' };
    if (!this.state.players.some((p) => p.status === 'ACTIVE' && p.pendingBet > 0)) {
      return { success: false, error: 'Nadie ha apostado todavía' };
    }
    this.dealRound();
    return { success: true };
  }

  allBetsIn(): boolean {
    const waitingOn = this.state.players.filter((p) => p.status === 'ACTIVE' && p.connected);
    return waitingOn.length > 0 && waitingOn.every((p) => p.pendingBet > 0);
  }

  private dealIfAllBetsIn(): void {
    if (this.state.phase === 'BETTING' && this.allBetsIn()) this.dealRound();
  }

  // -------------------------------------------------------------------------
  // Dealing & playing
  // -------------------------------------------------------------------------

  private dealRound(): void {
    this.state.roundNumber += 1;

    const bettors = this.state.players.filter((p) => p.status === 'ACTIVE' && p.pendingBet > 0);
    this.state.hands = bettors.map((player) => {
      const bet = player.pendingBet;
      player.chips -= bet;
      return this.newHand(player, bet, false);
    });
    for (const player of this.state.players) player.pendingBet = 0;

    // Standard deal order: one card to each hand, dealer up card, second card to each hand, dealer hole card.
    for (let pass = 0; pass < 2; pass++) {
      for (const hand of this.state.hands) hand.cards.push(this.shoe.draw());
      this.state.dealerCards.push(this.shoe.draw());
    }

    for (const hand of this.state.hands) {
      if (isNaturalBlackjack(hand.cards)) hand.status = 'BLACKJACK';
    }

    this.state.phase = 'PLAYER_TURNS';

    // Dealer peek: with an ace or ten-value up card, a dealer blackjack ends the round before
    // anyone can double or split into a hand that's already lost.
    const upPoints = cardPoints(this.state.dealerCards[0].rank);
    if ((upPoints === 1 || upPoints === 10) && isNaturalBlackjack(this.state.dealerCards)) {
      this.state.dealerHoleRevealed = true;
      this.settle();
      return;
    }

    this.state.activeHandIndex = -1;
    this.advanceToNextPlayableHand();
  }

  private newHand(player: { id: string; name: string; seatIndex: number }, bet: number, fromSplit: boolean): BlackjackHand {
    return {
      id: uuidv4(),
      playerId: player.id,
      playerName: player.name,
      seatIndex: player.seatIndex,
      cards: [],
      bet,
      doubled: false,
      fromSplit,
      status: 'PLAYING',
      outcome: null,
      payout: 0,
    };
  }

  getAvailableActions(playerId: string): BlackjackAction[] {
    const hand = this.getActiveHand();
    const player = this.getPlayer(playerId);
    if (!hand || !player || hand.playerId !== playerId) return [];

    const actions: BlackjackAction[] = ['HIT', 'STAND'];
    if (hand.cards.length === 2 && player.chips >= hand.bet) actions.push('DOUBLE');
    if (this.canSplit(hand, player)) actions.push('SPLIT');
    return actions;
  }

  private canSplit(hand: BlackjackHand, player: BlackjackPlayerState): boolean {
    const handsOwned = this.state.hands.filter((h) => h.playerId === player.id).length;
    return isSplittablePair(hand.cards) && handsOwned < MAX_HANDS_PER_PLAYER && player.chips >= hand.bet;
  }

  act(playerId: string, action: BlackjackAction): BlackjackActionResult {
    if (this.state.phase !== 'PLAYER_TURNS') return { success: false, error: 'No es momento de jugar' };
    const hand = this.getActiveHand();
    if (!hand || hand.playerId !== playerId) return { success: false, error: 'No es tu turno' };
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Jugador no encontrado' };

    switch (action) {
      case 'HIT':
        hand.cards.push(this.shoe.draw());
        this.autoStandIfDone(hand);
        break;

      case 'STAND':
        hand.status = 'STOOD';
        break;

      case 'DOUBLE':
        if (hand.cards.length !== 2) return { success: false, error: 'Solo puedes doblar con tus dos primeras cartas' };
        if (player.chips < hand.bet) return { success: false, error: 'No tienes fichas suficientes para doblar' };
        player.chips -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(this.shoe.draw());
        hand.status = isBust(hand.cards) ? 'BUST' : 'STOOD';
        break;

      case 'SPLIT': {
        if (!isSplittablePair(hand.cards)) return { success: false, error: 'Solo puedes dividir un par' };
        if (!this.canSplit(hand, player)) {
          return { success: false, error: player.chips < hand.bet ? 'No tienes fichas suficientes para dividir' : 'Ya no puedes dividir más' };
        }
        player.chips -= hand.bet;
        const splitAces = hand.cards[0].rank === 'A';
        const second = this.newHand(player, hand.bet, true);
        second.cards.push(hand.cards.pop()!);
        hand.fromSplit = true;
        this.state.hands.splice(this.state.activeHandIndex + 1, 0, second);

        hand.cards.push(this.shoe.draw());
        second.cards.push(this.shoe.draw());

        if (splitAces) {
          // Split aces receive exactly one card each and can't be hit, doubled or re-split.
          hand.status = 'STOOD';
          second.status = 'STOOD';
        } else {
          this.autoStandIfDone(hand);
          this.autoStandIfDone(second);
        }
        break;
      }

      default:
        return { success: false, error: 'Acción inválida' };
    }

    if (hand.status !== 'PLAYING') this.advanceToNextPlayableHand();
    return { success: true };
  }

  /** Stands the active hand for a player who has been away too long (used by the server's grace-period timer). */
  autoStandActiveHand(handId: string): boolean {
    const hand = this.getActiveHand();
    if (!hand || hand.id !== handId) return false;
    hand.status = 'STOOD';
    this.advanceToNextPlayableHand();
    return true;
  }

  private autoStandIfDone(hand: BlackjackHand): void {
    const { total } = handValue(hand.cards);
    if (total > 21) hand.status = 'BUST';
    else if (total === 21) hand.status = 'STOOD';
  }

  private advanceToNextPlayableHand(): void {
    for (let i = this.state.activeHandIndex + 1; i < this.state.hands.length; i++) {
      const hand = this.state.hands[i];
      if (hand.status !== 'PLAYING') continue;
      if (!this.getPlayer(hand.playerId)) {
        // Owner left the table - nobody can play this hand.
        hand.status = 'STOOD';
        continue;
      }
      this.state.activeHandIndex = i;
      return;
    }
    this.state.activeHandIndex = -1;
    this.state.phase = 'DEALER_TURN';
  }

  // -------------------------------------------------------------------------
  // Dealer
  // -------------------------------------------------------------------------

  /**
   * Advances the dealer by one visible step (reveal the hole card, or draw one card) so the
   * server can pace the dealer's play for the table to watch. Settles the round once the
   * dealer is done. Returns false when there was nothing to do.
   */
  dealerStep(): boolean {
    if (this.state.phase !== 'DEALER_TURN') return false;

    if (!this.state.dealerHoleRevealed) {
      this.state.dealerHoleRevealed = true;
    } else {
      this.state.dealerCards.push(this.shoe.draw());
    }

    // If every hand already busted or was paid as a blackjack, the dealer doesn't draw.
    const handsStillLive = this.state.hands.some((h) => h.status === 'STOOD');
    if (!handsStillLive || !dealerShouldHit(this.state.dealerCards)) {
      this.settle();
    }
    return true;
  }

  /** Plays the dealer out instantly (tests / non-paced callers). */
  runDealerToCompletion(): void {
    while (this.dealerStep()) {
      // keep stepping until settled
    }
  }

  private settle(): void {
    const dealer = handValue(this.state.dealerCards);
    const dealerBlackjack = isNaturalBlackjack(this.state.dealerCards);
    const dealerBust = dealer.total > 21;

    for (const hand of this.state.hands) {
      if (hand.status === 'BLACKJACK') {
        if (dealerBlackjack) {
          hand.outcome = 'PUSH';
          hand.payout = hand.bet;
        } else {
          hand.outcome = 'BLACKJACK';
          hand.payout = hand.bet + Math.floor((hand.bet * 3) / 2);
        }
      } else if (hand.status === 'BUST' || dealerBlackjack) {
        hand.outcome = 'LOSE';
        hand.payout = 0;
      } else {
        const total = handValue(hand.cards).total;
        if (dealerBust || total > dealer.total) {
          hand.outcome = 'WIN';
          hand.payout = hand.bet * 2;
        } else if (total === dealer.total) {
          hand.outcome = 'PUSH';
          hand.payout = hand.bet;
        } else {
          hand.outcome = 'LOSE';
          hand.payout = 0;
        }
      }
      if (hand.status === 'PLAYING') hand.status = 'STOOD';

      const owner = this.getPlayer(hand.playerId);
      if (owner) owner.chips += hand.payout;
    }

    const byPlayer = new Map<string, BlackjackPlayerRoundResult>();
    for (const hand of this.state.hands) {
      const entry = byPlayer.get(hand.playerId) ?? {
        playerId: hand.playerId,
        playerName: hand.playerName,
        totalBet: 0,
        totalPayout: 0,
        net: 0,
      };
      entry.totalBet += hand.bet;
      entry.totalPayout += hand.payout;
      entry.net = entry.totalPayout - entry.totalBet;
      byPlayer.set(hand.playerId, entry);
    }

    const result: BlackjackRoundResult = {
      roundNumber: this.state.roundNumber,
      dealerTotal: dealer.total,
      dealerBlackjack,
      dealerBust,
      players: [...byPlayer.values()],
    };
    this.lastRoundResult = result;
    this.roundResultForDisplay = result;

    this.state.activeHandIndex = -1;
    this.state.dealerHoleRevealed = true;
    this.state.phase = 'ROUND_OVER';

    for (const player of this.state.players) {
      if (player.status !== 'OUT' && player.chips < this.state.minBet) {
        player.status = 'OUT';
        this.lastEliminated.push(player);
      }
    }
  }
}
