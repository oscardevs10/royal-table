import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { GameMode } from '../../core/models/game.models';
import {
  ALLOWED_DECK_COUNTS,
  BLACKJACK_MAX_SEATS,
  CARDS_PER_DECK,
  minDecksForSeats,
  recommendedDecksForSeats,
} from '../../core/utils/blackjack-shoe';

interface StackPreset {
  label: string;
  value: number;
  smallBlind: number;
  bigBlind: number;
  minBet: number;
  maxBet: number;
}

const STACK_PRESETS: StackPreset[] = [
  { label: '1,000 fichas', value: 1000, smallBlind: 10, bigBlind: 20, minBet: 10, maxBet: 200 },
  { label: '5,000 fichas', value: 5000, smallBlind: 25, bigBlind: 50, minBet: 25, maxBet: 1000 },
  { label: '10,000 fichas', value: 10000, smallBlind: 50, bigBlind: 100, minBet: 50, maxBet: 2000 },
];

const HOLDEM_MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8];
const BLACKJACK_MULTI_SEAT_OPTIONS = Array.from({ length: BLACKJACK_MAX_SEATS - 1 }, (_, i) => i + 2);

export type BlackjackTableType = 'SOLO' | 'MULTI';

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './create-room.component.html',
  styleUrl: './create-room.component.scss',
})
export class CreateRoomComponent {
  readonly stackPresets = STACK_PRESETS;
  readonly cardsPerDeck = CARDS_PER_DECK;

  gameMode: GameMode = 'HOLDEM';
  blackjackTable: BlackjackTableType = 'SOLO';
  playerName = '';
  maxPlayers = 6;
  startingStack = STACK_PRESETS[0].value;
  smallBlind = STACK_PRESETS[0].smallBlind;
  bigBlind = STACK_PRESETS[0].bigBlind;
  minBet = STACK_PRESETS[0].minBet;
  maxBet = STACK_PRESETS[0].maxBet;
  deckCount = recommendedDecksForSeats(1);

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  constructor(private store: GameStoreService, private router: Router) {}

  get maxPlayerOptions(): number[] {
    return this.gameMode === 'BLACKJACK' ? BLACKJACK_MULTI_SEAT_OPTIONS : HOLDEM_MAX_PLAYER_OPTIONS;
  }

  /** Seats at the blackjack table (the dealer isn't a seat). */
  get blackjackSeats(): number {
    return this.blackjackTable === 'SOLO' ? 1 : Number(this.maxPlayers);
  }

  get deckOptions(): number[] {
    const min = minDecksForSeats(this.blackjackSeats);
    return ALLOWED_DECK_COUNTS.filter((n) => n >= min);
  }

  selectMode(mode: GameMode): void {
    this.gameMode = mode;
    if (mode === 'BLACKJACK' && this.maxPlayers > BLACKJACK_MAX_SEATS) this.maxPlayers = BLACKJACK_MAX_SEATS;
    this.syncDeckCount();
  }

  selectBlackjackTable(type: BlackjackTableType): void {
    this.blackjackTable = type;
    if (type === 'MULTI' && this.maxPlayers < 2) this.maxPlayers = 4;
    this.syncDeckCount();
  }

  onSeatsChange(): void {
    this.syncDeckCount();
  }

  /** Keeps the shoe at the recommended size for the table, and never below what the server accepts. */
  private syncDeckCount(): void {
    this.deckCount = recommendedDecksForSeats(this.blackjackSeats);
  }

  applyPreset(preset: StackPreset): void {
    this.startingStack = preset.value;
    this.smallBlind = preset.smallBlind;
    this.bigBlind = preset.bigBlind;
    this.minBet = preset.minBet;
    this.maxBet = preset.maxBet;
  }

  async submit(): Promise<void> {
    this.formError.set(null);

    if (!this.playerName.trim()) {
      this.formError.set('Ingresa tu nombre');
      return;
    }
    if (this.gameMode === 'HOLDEM' && this.bigBlind <= this.smallBlind) {
      this.formError.set('La Big Blind debe ser mayor que la Small Blind');
      return;
    }
    if (this.gameMode === 'BLACKJACK') {
      if (this.minBet <= 0) {
        this.formError.set('La apuesta mínima debe ser mayor que 0');
        return;
      }
      if (this.maxBet < this.minBet) {
        this.formError.set('La apuesta máxima no puede ser menor que la mínima');
        return;
      }
      if (this.minBet > this.startingStack) {
        this.formError.set('La apuesta mínima no puede superar el stack inicial');
        return;
      }
    }

    const isBlackjack = this.gameMode === 'BLACKJACK';
    const isSolo = isBlackjack && this.blackjackTable === 'SOLO';

    this.submitting.set(true);
    const res = await this.store.createRoom({
      playerName: this.playerName.trim(),
      gameMode: this.gameMode,
      maxPlayers: isBlackjack ? this.blackjackSeats : Number(this.maxPlayers),
      startingStack: this.startingStack,
      smallBlind: isBlackjack ? undefined : this.smallBlind,
      bigBlind: isBlackjack ? undefined : this.bigBlind,
      minBet: isBlackjack ? this.minBet : undefined,
      maxBet: isBlackjack ? this.maxBet : undefined,
      deckCount: isBlackjack ? Number(this.deckCount) : undefined,
    });

    // A solo table has nobody to wait for: skip the lobby and sit straight down with the dealer.
    if (res.ok && isSolo) await this.store.startGame();
    this.submitting.set(false);

    if (res.ok && res.roomCode) {
      this.router.navigate(['/room', res.roomCode]);
    } else {
      this.formError.set(res.error ?? 'No se pudo crear la partida');
    }
  }
}
