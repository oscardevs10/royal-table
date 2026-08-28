import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConquianPlayerPublicDTO } from '../../../../core/models/game.models';

@Component({
  selector: 'app-conquian-player-seat',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conquian-player-seat.component.html',
  styleUrl: './conquian-player-seat.component.scss',
})
export class ConquianPlayerSeatComponent {
  private playerSignal = signal<ConquianPlayerPublicDTO | null>(null);

  @Input() set player(value: ConquianPlayerPublicDTO | null | undefined) {
    this.playerSignal.set(value ?? null);
  }

  @Input() isDealer = false;
  @Input() isMe = false;

  readonly p = computed(() => this.playerSignal());

  readonly cardBacks = computed(() => {
    const player = this.playerSignal();
    return player ? Array.from({ length: Math.min(player.handCount, 10) }) : [];
  });
}
