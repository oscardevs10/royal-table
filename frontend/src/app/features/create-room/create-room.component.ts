import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { GameMode } from '../../core/models/game.models';

interface StackPreset {
  label: string;
  value: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
}

const STACK_PRESETS: StackPreset[] = [
  { label: '1,000 fichas', value: 1000, smallBlind: 10, bigBlind: 20, ante: 10 },
  { label: '5,000 fichas', value: 5000, smallBlind: 25, bigBlind: 50, ante: 25 },
  { label: '10,000 fichas', value: 10000, smallBlind: 50, bigBlind: 100, ante: 50 },
];

const HOLDEM_MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8];
const CONQUIAN_MAX_PLAYER_OPTIONS = [2, 3, 4];

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './create-room.component.html',
  styleUrl: './create-room.component.scss',
})
export class CreateRoomComponent {
  readonly stackPresets = STACK_PRESETS;

  gameMode: GameMode = 'HOLDEM';
  playerName = '';
  maxPlayers = 6;
  startingStack = STACK_PRESETS[0].value;
  smallBlind = STACK_PRESETS[0].smallBlind;
  bigBlind = STACK_PRESETS[0].bigBlind;
  ante = STACK_PRESETS[0].ante;

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  constructor(private store: GameStoreService, private router: Router) {}

  get maxPlayerOptions(): number[] {
    return this.gameMode === 'CONQUIAN' ? CONQUIAN_MAX_PLAYER_OPTIONS : HOLDEM_MAX_PLAYER_OPTIONS;
  }

  selectMode(mode: GameMode): void {
    this.gameMode = mode;
    if (mode === 'CONQUIAN' && this.maxPlayers > 4) {
      this.maxPlayers = 4;
    }
  }

  applyPreset(preset: StackPreset): void {
    this.startingStack = preset.value;
    this.smallBlind = preset.smallBlind;
    this.bigBlind = preset.bigBlind;
    this.ante = preset.ante;
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
    if (this.gameMode === 'CONQUIAN' && this.ante <= 0) {
      this.formError.set('La apuesta (ante) debe ser mayor que 0');
      return;
    }

    this.submitting.set(true);
    const res = await this.store.createRoom({
      playerName: this.playerName.trim(),
      gameMode: this.gameMode,
      maxPlayers: this.maxPlayers,
      startingStack: this.startingStack,
      smallBlind: this.gameMode === 'HOLDEM' ? this.smallBlind : undefined,
      bigBlind: this.gameMode === 'HOLDEM' ? this.bigBlind : undefined,
      ante: this.gameMode === 'CONQUIAN' ? this.ante : undefined,
    });
    this.submitting.set(false);

    if (res.ok && res.roomCode) {
      this.router.navigate(['/room', res.roomCode]);
    } else {
      this.formError.set(res.error ?? 'No se pudo crear la partida');
    }
  }
}
