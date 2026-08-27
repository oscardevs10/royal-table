import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';

@Component({
  selector: 'app-join-room',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './join-room.component.html',
  styleUrl: './join-room.component.scss',
})
export class JoinRoomComponent implements OnInit {
  playerName = '';
  roomCode = '';

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  constructor(private store: GameStoreService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    const codeFromQuery = this.route.snapshot.queryParamMap.get('code');
    if (codeFromQuery) this.roomCode = codeFromQuery.toUpperCase();
  }

  async submit(): Promise<void> {
    this.formError.set(null);

    if (!this.playerName.trim()) {
      this.formError.set('Ingresa tu nombre');
      return;
    }
    if (!this.roomCode.trim()) {
      this.formError.set('Ingresa el código de la sala');
      return;
    }

    this.submitting.set(true);
    const code = this.roomCode.trim().toUpperCase();
    const res = await this.store.joinRoom(code, this.playerName.trim());
    this.submitting.set(false);

    if (res.ok) {
      this.router.navigate(['/room', code]);
    } else {
      this.formError.set(res.error ?? 'No se pudo unir a la partida');
    }
  }
}
