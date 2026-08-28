import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { SessionService } from '../../core/services/session.service';
import { AudioService } from '../../core/services/audio.service';
import { ActionType, PlayerPublicDTO } from '../../core/models/game.models';
import { PlayerSeatComponent } from './components/player-seat/player-seat.component';
import { CommunityCardsComponent } from './components/community-cards/community-cards.component';
import { PotDisplayComponent } from './components/pot-display/pot-display.component';
import { BettingControlsComponent } from './components/betting-controls/betting-controls.component';
import { ChatPanelComponent } from './components/chat-panel/chat-panel.component';
import { HandOddsPanelComponent } from './components/hand-odds-panel/hand-odds-panel.component';

interface SeatView {
  player: PlayerPublicDTO;
  style: Record<string, string>;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isMe: boolean;
  dealDelays: [number, number];
  actionBubble: { type: ActionType; amount?: number } | null;
}

const DEAL_STAGGER_MS = 90;
const DEAL_ROUND_GAP_MS = 70;

const PHASE_LABELS: Record<string, string> = {
  WAITING: 'Esperando',
  PRE_FLOP: 'Pre-Flop',
  FLOP: 'Flop',
  TURN: 'Turn',
  RIVER: 'River',
  SHOWDOWN: 'Showdown',
};

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [
    CommonModule,
    PlayerSeatComponent,
    CommunityCardsComponent,
    PotDisplayComponent,
    BettingControlsComponent,
    ChatPanelComponent,
    HandOddsPanelComponent,
  ],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
})
export class TableComponent {
  readonly chatOpen = signal(false);

  constructor(readonly store: GameStoreService, readonly session: SessionService, readonly audio: AudioService, private router: Router) {}

  readonly phaseLabel = computed(() => PHASE_LABELS[this.store.gameState()?.currentPhase ?? 'WAITING']);

  readonly isMyTurn = computed(() => {
    const state = this.store.gameState();
    return !!state && state.myAvailableActions.length > 0;
  });

  readonly currentTurnPlayerName = computed(() => {
    const state = this.store.gameState();
    if (!state) return '—';
    return state.players.find((p) => p.seatIndex === state.currentPlayerPosition)?.name ?? '—';
  });

  readonly seats = computed<SeatView[]>(() => {
    const state = this.store.gameState();
    if (!state) return [];

    const myId = state.myPlayerId;
    const total = state.players.length;
    const mySeatIndex = state.players.find((p) => p.id === myId)?.seatIndex ?? 0;

    const bbSeat = this.secondFromDealer(state.players, state.dealerPosition);

    const firstToReceive = this.nextSeat(state.dealerPosition, total);
    const recentActions = this.store.lastPlayerActions();

    return [...state.players]
      .map((player) => {
        const relativeIndex = (player.seatIndex - mySeatIndex + total) % total;
        const dealOrder = (player.seatIndex - firstToReceive + total) % total;
        const dealDelays: [number, number] = [
          dealOrder * DEAL_STAGGER_MS,
          total * DEAL_STAGGER_MS + DEAL_ROUND_GAP_MS + dealOrder * DEAL_STAGGER_MS,
        ];
        const recent = recentActions[player.id];
        return {
          player,
          style: this.seatStyle(relativeIndex, total),
          isDealer: player.seatIndex === state.dealerPosition,
          isSmallBlind: total === 2 ? player.seatIndex === state.dealerPosition : player.seatIndex === this.nextSeat(state.dealerPosition, total),
          isBigBlind: player.seatIndex === bbSeat,
          isMe: player.id === myId,
          dealDelays,
          actionBubble: recent ? { type: recent.type, amount: recent.amount } : null,
        };
      })
      .sort((a, b) => a.player.seatIndex - b.player.seatIndex);
  });

  private nextSeat(from: number, total: number): number {
    return (from + 1) % total;
  }

  private secondFromDealer(players: PlayerPublicDTO[], dealerSeat: number): number {
    const total = players.length;
    return total === 2 ? this.nextSeat(dealerSeat, total) : (dealerSeat + 2) % total;
  }

  private seatStyle(relativeIndex: number, total: number): Record<string, string> {
    const angleDeg = 90 + (360 / total) * relativeIndex;
    const angleRad = (angleDeg * Math.PI) / 180;
    const rx = 42;
    const ry = 33;
    const left = 50 + rx * Math.cos(angleRad);
    const top = 50 + ry * Math.sin(angleRad);
    return { left: `${left}%`, top: `${top}%` };
  }

  async handleAction(evt: { type: ActionType; amount?: number }): Promise<void> {
    await this.store.sendAction(evt.type, evt.amount);
  }

  sendChat(text: string): void {
    this.store.sendChatMessage(text);
  }

  exitTable(): void {
    this.store.leaveRoom();
    this.router.navigate(['/']);
  }
}
