import { v4 as uuidv4 } from 'uuid';
import { Card } from '../../types/card.types';
import { Deck } from '../poker/deck';
import { classifyMeld, canLayOff, removeCardsFromHand, Meld } from './meld-validator';
import { ConquianState, ConquianPlayerState, ConquianHandResult, DrawSource } from './conquian.types';

export interface ConquianSeatInput {
  id: string;
  name: string;
  chips: number;
  seatIndex: number;
  sessionToken: string;
  isHost: boolean;
  isBot: boolean;
}

export interface ConquianActionResult {
  success: boolean;
  error?: string;
}

/** Conquian is traditionally strictly 2-handed (10 cards each); this adapts it to 3-4 players
 * using the standard multiplayer-Rummy dealing convention (fewer cards per player as the table grows). */
const CARDS_PER_PLAYER: Record<number, number> = {
  2: 10,
  3: 7,
  4: 6,
};

export class ConquianEngine {
  private state: ConquianState;
  private deck: Deck | null = null;
  private lastEliminated: ConquianPlayerState[] = [];
  private lastHandResult: ConquianHandResult | null = null;

  constructor(roomId: string, roomCode: string, seats: ConquianSeatInput[], ante: number) {
    this.state = {
      roomId,
      roomCode,
      handNumber: 0,
      players: seats
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((s) => ({
          id: s.id,
          sessionToken: s.sessionToken,
          name: s.name,
          seatIndex: s.seatIndex,
          chips: s.chips,
          hand: [],
          status: 'ACTIVE',
          connected: true,
          isBot: s.isBot,
          isHost: s.isHost,
        })),
      dealerPosition: -1,
      currentPlayerPosition: -1,
      stock: [],
      discardPile: [],
      melds: [],
      ante,
      pot: 0,
      turnPhase: 'DRAW',
      handInProgress: false,
    };
  }

  getState(): ConquianState {
    return this.state;
  }

  getPlayer(playerId: string): ConquianPlayerState | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  consumeEliminated(): ConquianPlayerState[] {
    const eliminated = this.lastEliminated;
    this.lastEliminated = [];
    return eliminated;
  }

  consumeHandResult(): ConquianHandResult | null {
    const result = this.lastHandResult;
    this.lastHandResult = null;
    return result;
  }

  activePlayerCount(): number {
    return this.state.players.filter((p) => p.status !== 'OUT').length;
  }

  isGameOver(): boolean {
    return this.activePlayerCount() <= 1;
  }

  markDisconnected(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (player) player.connected = false;
  }

  markReconnected(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (player) player.connected = true;
  }

  private nextOccupiedSeat(fromPosition: number, predicate: (p: ConquianPlayerState) => boolean): number {
    const seatCount = this.state.players.length;
    for (let step = 1; step <= seatCount; step++) {
      const position = (fromPosition + step) % seatCount;
      const player = this.state.players.find((p) => p.seatIndex === position);
      if (player && predicate(player)) return position;
    }
    return fromPosition;
  }

  startNewHand(): void {
    this.state.handNumber += 1;

    // Anyone who can't cover the ante is out before the deal (no partial antes/side pots here).
    for (const player of this.state.players) {
      if (player.status !== 'OUT' && player.chips < this.state.ante) {
        player.status = 'OUT';
        this.lastEliminated.push(player);
      }
    }

    this.state.melds = [];
    this.state.discardPile = [];
    this.state.pot = 0;
    this.state.handInProgress = true;

    for (const player of this.state.players) {
      player.hand = [];
    }

    this.state.dealerPosition =
      this.state.dealerPosition === -1
        ? this.state.players.find((p) => p.status === 'ACTIVE')!.seatIndex
        : this.nextOccupiedSeat(this.state.dealerPosition, (p) => p.status === 'ACTIVE');

    const deck = new Deck();
    deck.shuffle();

    const active = () => this.state.players.filter((p) => p.status === 'ACTIVE').sort((a, b) => a.seatIndex - b.seatIndex);
    const cardsPerPlayer = CARDS_PER_PLAYER[active().length] ?? 6;

    for (let round = 0; round < cardsPerPlayer; round++) {
      for (const player of active()) {
        player.hand.push(deck.draw());
      }
    }

    this.state.stock = [];
    while (deck.remaining() > 0) {
      this.state.stock.push(deck.draw());
    }
    this.deck = deck;

    for (const player of active()) {
      player.chips -= this.state.ante;
      this.state.pot += this.state.ante;
    }

    this.state.turnPhase = 'DRAW';
    this.state.currentPlayerPosition = this.nextOccupiedSeat(this.state.dealerPosition, (p) => p.status === 'ACTIVE');
  }

  draw(playerId: string, source: DrawSource): ConquianActionResult {
    const validation = this.validateTurn(playerId, 'DRAW');
    if (validation) return validation;

    const player = this.getPlayer(playerId)!;

    if (source === 'STOCK') {
      if (this.state.stock.length === 0) {
        this.endHandAsPush();
        return { success: true };
      }
      player.hand.push(this.state.stock.pop()!);
    } else {
      if (this.state.discardPile.length === 0) {
        return { success: false, error: 'El descarte está vacío' };
      }
      player.hand.push(this.state.discardPile.pop()!);
    }

    this.state.turnPhase = 'ACT';
    return { success: true };
  }

  meld(playerId: string, cards: Card[], targetMeldId?: string): ConquianActionResult {
    const validation = this.validateTurn(playerId, 'ACT');
    if (validation) return validation;

    const player = this.getPlayer(playerId)!;
    const newHand = removeCardsFromHand(player.hand, cards);
    if (!newHand) return { success: false, error: 'No tienes esas cartas en tu mano' };

    if (targetMeldId) {
      const meld = this.state.melds.find((m) => m.id === targetMeldId);
      if (!meld) return { success: false, error: 'Combinación no encontrada' };
      if (!canLayOff(meld, cards)) return { success: false, error: 'No puedes agregar esas cartas a esa combinación' };
      meld.cards.push(...cards);
    } else {
      const type = classifyMeld(cards);
      if (!type) return { success: false, error: 'Esas cartas no forman una combinación válida' };
      const meld: Meld = { id: uuidv4(), type, cards, laidByPlayerId: playerId };
      this.state.melds.push(meld);
    }

    player.hand = newHand;

    if (player.hand.length === 0) {
      this.finishHandByGoingOut(playerId);
    }

    return { success: true };
  }

  discard(playerId: string, card: Card): ConquianActionResult {
    const validation = this.validateTurn(playerId, 'ACT');
    if (validation) return validation;

    const player = this.getPlayer(playerId)!;
    const newHand = removeCardsFromHand(player.hand, [card]);
    if (!newHand) return { success: false, error: 'No tienes esa carta en tu mano' };

    player.hand = newHand;
    this.state.discardPile.push(card);

    if (player.hand.length === 0) {
      this.finishHandByGoingOut(playerId);
      return { success: true };
    }

    this.state.turnPhase = 'DRAW';
    this.state.currentPlayerPosition = this.nextOccupiedSeat(this.state.currentPlayerPosition, (p) => p.status === 'ACTIVE');
    return { success: true };
  }

  private validateTurn(playerId: string, expectedPhase: 'DRAW' | 'ACT'): ConquianActionResult | null {
    if (!this.state.handInProgress) return { success: false, error: 'No hay una mano en curso' };
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Jugador no encontrado' };
    if (this.state.players[this.state.currentPlayerPosition]?.id !== playerId) {
      return { success: false, error: 'No es tu turno' };
    }
    if (this.state.turnPhase !== expectedPhase) {
      const message = expectedPhase === 'DRAW' ? 'Ya robaste esta ronda, debes jugar o descartar' : 'Debes robar una carta primero';
      return { success: false, error: message };
    }
    return null;
  }

  private finishHandByGoingOut(winnerId: string): void {
    const winner = this.getPlayer(winnerId)!;
    winner.chips += this.state.pot;
    this.lastHandResult = { winnerId, winnerName: winner.name, potWon: this.state.pot, isPush: false };
    this.state.pot = 0;
    this.state.handInProgress = false;
    this.applyEliminations();
  }

  private endHandAsPush(): void {
    const refund = this.state.ante;
    for (const player of this.state.players) {
      if (player.status === 'ACTIVE') player.chips += refund;
    }
    this.lastHandResult = { winnerId: null, winnerName: null, potWon: 0, isPush: true };
    this.state.pot = 0;
    this.state.handInProgress = false;
  }

  private applyEliminations(): void {
    for (const player of this.state.players) {
      if (player.status !== 'OUT' && player.chips <= 0) {
        player.status = 'OUT';
        this.lastEliminated.push(player);
      }
    }
  }
}
