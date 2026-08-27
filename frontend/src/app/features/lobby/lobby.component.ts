import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { SessionService } from '../../core/services/session.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.scss',
})
export class LobbyComponent {
  readonly copied = signal(false);
  readonly starting = signal(false);
  readonly addingBot = signal(false);

  constructor(readonly store: GameStoreService, readonly session: SessionService, private router: Router) {}

  get inviteLink(): string {
    const code = this.store.roomState()?.code ?? '';
    return `${window.location.origin}/join?code=${code}`;
  }

  async copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.inviteLink);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard API unavailable - user can still select the code manually.
    }
  }

  async startGame(): Promise<void> {
    this.starting.set(true);
    await this.store.startGame();
    this.starting.set(false);
  }

  async addBot(): Promise<void> {
    this.addingBot.set(true);
    await this.store.addBot();
    this.addingBot.set(false);
  }

  async removeBot(botPlayerId: string): Promise<void> {
    await this.store.removeBot(botPlayerId);
  }

  leave(): void {
    this.store.leaveRoom();
    this.router.navigate(['/']);
  }

  initials(name: string): string {
    return name.trim().slice(0, 2).toUpperCase();
  }

  emptySeats(current: number, max: number): number[] {
    return Array.from({ length: Math.max(0, max - current) });
  }
}
