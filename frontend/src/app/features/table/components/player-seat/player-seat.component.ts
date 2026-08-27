import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActionType, Card, PlayerPublicDTO } from '../../../../core/models/game.models';
import { PlayingCardComponent } from '../playing-card/playing-card.component';

export interface ActionBubbleInput {
  type: ActionType;
  amount?: number;
}

@Component({
  selector: 'app-player-seat',
  standalone: true,
  imports: [PlayingCardComponent, CommonModule],
  templateUrl: './player-seat.component.html',
  styleUrl: './player-seat.component.scss',
})
export class PlayerSeatComponent {
  private playerSignal = signal<PlayerPublicDTO | null>(null);

  @Input() set player(value: PlayerPublicDTO | null | undefined) {
    this.playerSignal.set(value ?? null);
  }

  @Input() isDealer = false;
  @Input() isSmallBlind = false;
  @Input() isBigBlind = false;
  @Input() isMe = false;
  @Input() myHoleCards: Card[] = [];
  @Input() dealDelays: [number, number] = [0, 0];

  private actionBubbleSignal = signal<ActionBubbleInput | null>(null);

  @Input() set actionBubble(value: ActionBubbleInput | null | undefined) {
    this.actionBubbleSignal.set(value ?? null);
  }

  readonly p = computed(() => this.playerSignal());

  readonly holeCardsToShow = computed<(Card | null)[]>(() => {
    const player = this.playerSignal();
    if (!player) return [];
    if (this.isMe && this.myHoleCards.length > 0) return this.myHoleCards;
    if (player.revealedHoleCards && player.revealedHoleCards.length > 0) return player.revealedHoleCards;
    if (player.hasCards) return [null, null];
    return [];
  });

  readonly actionBubbleLabel = computed(() => {
    const action = this.actionBubbleSignal();
    if (!action) return null;
    switch (action.type) {
      case 'FOLD':
        return 'Fold';
      case 'CHECK':
        return 'Check';
      case 'CALL':
        return `Call ${action.amount ?? ''}`.trim();
      case 'RAISE':
        return `Raise to ${action.amount ?? ''}`.trim();
      case 'ALL_IN':
        return 'ALL-IN';
      default:
        return null;
    }
  });

  readonly actionBubbleClass = computed(() => {
    const action = this.actionBubbleSignal();
    if (!action) return '';
    return action.type.toLowerCase().replace('_', '-');
  });

  readonly statusLabel = computed(() => {
    const player = this.playerSignal();
    if (!player) return '';
    switch (player.status) {
      case 'FOLDED':
        return 'Se retiró';
      case 'ALL_IN':
        return 'ALL-IN';
      case 'OUT':
        return 'OUT';
      case 'SITTING_OUT':
        return 'Fuera de mano';
      default:
        return player.connected ? '' : 'Desconectado';
    }
  });
}
