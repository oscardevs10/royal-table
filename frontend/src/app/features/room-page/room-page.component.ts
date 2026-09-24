import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { SessionService } from '../../core/services/session.service';
import { LobbyComponent } from '../lobby/lobby.component';
import { TableComponent } from '../table/table.component';
import { ShowdownOverlayComponent } from '../table/components/showdown-overlay/showdown-overlay.component';
import { BlackjackTableComponent } from '../blackjack-table/blackjack-table.component';

@Component({
  selector: 'app-room-page',
  standalone: true,
  imports: [LobbyComponent, TableComponent, ShowdownOverlayComponent, BlackjackTableComponent],
  templateUrl: './room-page.component.html',
  styleUrl: './room-page.component.scss',
})
export class RoomPageComponent implements OnInit {
  readonly connecting = signal(true);
  readonly connectError = signal<string | null>(null);
  readonly restarting = signal(false);

  constructor(private route: ActivatedRoute, private router: Router, readonly store: GameStoreService, private session: SessionService) {}

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code')?.toUpperCase() ?? '';
    const currentSession = this.session.session();

    if (!currentSession || currentSession.roomCode !== code) {
      // Direct link / refresh without an active matching session - send them through the join flow.
      this.router.navigate(['/join'], { queryParams: { code } });
      return;
    }

    if (!this.store.roomState()) {
      const ok = await this.store.attemptRejoin();
      if (!ok) {
        this.connectError.set('No se pudo reconectar a la sala. Es posible que haya expirado.');
        this.connecting.set(false);
        return;
      }
    }

    this.connecting.set(false);
  }

  backToLanding(): void {
    this.store.leaveRoom();
    this.router.navigate(['/']);
  }

  /**
   * Same room, same code, same players, fresh stacks. A solo blackjack table has nobody to
   * wait for, so it goes straight back to the dealer; any other table returns to the lobby
   * so the host can see who's still there (and invite or add bots) before starting.
   */
  async playAgain(): Promise<void> {
    if (this.restarting()) return;
    this.restarting.set(true);
    const room = this.store.roomState();
    const res = await this.store.restartRoom();
    if (res.ok && room?.gameMode === 'BLACKJACK' && room.maxPlayers === 1) {
      await this.store.startGame();
    }
    this.restarting.set(false);
  }

  nextHand(): void {
    this.store.nextHand();
  }

  dismissShowdown(): void {
    this.store.dismissShowdown();
  }

  get overallWinnerName(): string | null {
    const pokerState = this.store.gameState();
    if (pokerState) return pokerState.players.find((p) => p.status !== 'OUT')?.name ?? null;
    return null;
  }
}
