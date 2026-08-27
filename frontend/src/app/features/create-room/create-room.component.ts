import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';

interface StackPreset {
  label: string;
  value: number;
  smallBlind: number;
  bigBlind: number;
}

const STACK_PRESETS: StackPreset[] = [
  { label: '1,000 fichas', value: 1000, smallBlind: 10, bigBlind: 20 },
  { label: '5,000 fichas', value: 5000, smallBlind: 25, bigBlind: 50 },
  { label: '10,000 fichas', value: 10000, smallBlind: 50, bigBlind: 100 },
];

const MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8];

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './create-room.component.html',
  styleUrl: './create-room.component.scss',
})
export class CreateRoomComponent {
  readonly stackPresets = STACK_PRESETS;
  readonly maxPlayerOptions = MAX_PLAYER_OPTIONS;

  playerName = '';
  maxPlayers = 6;
  startingStack = STACK_PRESETS[0].value;
  smallBlind = STACK_PRESETS[0].smallBlind;
  bigBlind = STACK_PRESETS[0].bigBlind;

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  constructor(private store: GameStoreService, private router: Router) {}

  applyPreset(preset: StackPreset): void {
    this.startingStack = preset.value;
    this.smallBlind = preset.smallBlind;
    this.bigBlind = preset.bigBlind;
  }

  async submit(): Promise<void> {
    this.formError.set(null);

    if (!this.playerName.trim()) {
      this.formError.set('Ingresa tu nombre');
      return;
    }
    if (this.bigBlind <= this.smallBlind) {
      this.formError.set('La Big Blind debe ser mayor que la Small Blind');
      return;
    }

    this.submitting.set(true);
    const res = await this.store.createRoom({
      playerName: this.playerName.trim(),
      maxPlayers: this.maxPlayers,
      startingStack: this.startingStack,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
    });
    this.submitting.set(false);

    if (res.ok && res.roomCode) {
      this.router.navigate(['/room', res.roomCode]);
    } else {
      this.formError.set(res.error ?? 'No se pudo crear la partida');
    }
  }
}
