import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { AudioService } from '../../core/services/audio.service';
import { Card, ConquianPlayerPublicDTO } from '../../core/models/game.models';
import { cardKey, classifyMeld, canLayOff } from '../../core/utils/conquian-meld-check';
import { ConquianPlayerSeatComponent } from './components/conquian-player-seat/conquian-player-seat.component';
import { PlayingCardComponent } from '../table/components/playing-card/playing-card.component';
import { ChatPanelComponent } from '../table/components/chat-panel/chat-panel.component';

interface SeatView {
  player: ConquianPlayerPublicDTO;
  style: Record<string, string>;
  isDealer: boolean;
  isMe: boolean;
}

@Component({
  selector: 'app-conquian-table',
  standalone: true,
  imports: [CommonModule, ConquianPlayerSeatComponent, PlayingCardComponent, ChatPanelComponent],
  templateUrl: './conquian-table.component.html',
  styleUrl: './conquian-table.component.scss',
})
export class ConquianTableComponent {
  readonly chatOpen = signal(false);
  readonly selectedKeys = signal<Set<string>>(new Set());
  readonly busy = signal(false);

  constructor(readonly store: GameStoreService, readonly audio: AudioService, private router: Router) {}

  readonly isMyTurn = computed(() => {
    const state = this.store.conquianState();
    return !!state && state.handInProgress && state.players[state.currentPlayerPosition]?.id === state.myPlayerId;
  });

  readonly selectedCards = computed<Card[]>(() => {
    const state = this.store.conquianState();
    if (!state) return [];
    const keys = this.selectedKeys();
    return state.myHand.filter((c) => keys.has(cardKey(c)));
  });

  readonly canFormMeld = computed(() => classifyMeld(this.selectedCards()) !== null);
  readonly canDiscardSelected = computed(() => this.selectedCards().length === 1);

  readonly meldTargets = computed(() => {
    const state = this.store.conquianState();
    const selected = this.selectedCards();
    if (!state || selected.length === 0) return new Set<string>();
    const targets = new Set<string>();
    for (const meld of state.melds) {
      if (canLayOff(meld.cards, selected, meld.type)) targets.add(meld.id);
    }
    return targets;
  });

  readonly seats = computed<SeatView[]>(() => {
    const state = this.store.conquianState();
    if (!state) return [];

    const myId = state.myPlayerId;
    const total = state.players.length;
    const mySeatIndex = state.players.find((p) => p.id === myId)?.seatIndex ?? 0;

    return [...state.players]
      .map((player) => {
        const relativeIndex = (player.seatIndex - mySeatIndex + total) % total;
        return {
          player,
          style: this.seatStyle(relativeIndex, total),
          isDealer: player.seatIndex === state.dealerPosition,
          isMe: player.id === myId,
        };
      })
      .sort((a, b) => a.player.seatIndex - b.player.seatIndex);
  });

  private seatStyle(relativeIndex: number, total: number): Record<string, string> {
    const angleDeg = 90 + (360 / total) * relativeIndex;
    const angleRad = (angleDeg * Math.PI) / 180;
    const rx = 42;
    const ry = 36;
    const left = 50 + rx * Math.cos(angleRad);
    const top = 50 + ry * Math.sin(angleRad);
    return { left: `${left}%`, top: `${top}%` };
  }

  readonly currentTurnName = computed(() => {
    const state = this.store.conquianState();
    if (!state) return '—';
    return state.players.find((p) => p.seatIndex === state.currentPlayerPosition)?.name ?? '—';
  });

  isSelected(card: Card): boolean {
    return this.selectedKeys().has(cardKey(card));
  }

  toggleCard(card: Card): void {
    const key = cardKey(card);
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedKeys.set(new Set());
  }

  async drawFrom(source: 'STOCK' | 'DISCARD'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    await this.store.conquianDraw(source);
    this.busy.set(false);
  }

  async formMeld(): Promise<void> {
    if (this.busy() || !this.canFormMeld()) return;
    this.busy.set(true);
    const res = await this.store.conquianMeld(this.selectedCards());
    this.busy.set(false);
    if (res.ok) this.clearSelection();
  }

  async layOff(meldId: string): Promise<void> {
    if (this.busy() || !this.meldTargets().has(meldId)) return;
    this.busy.set(true);
    const res = await this.store.conquianMeld(this.selectedCards(), meldId);
    this.busy.set(false);
    if (res.ok) this.clearSelection();
  }

  async discardSelected(): Promise<void> {
    if (this.busy() || !this.canDiscardSelected()) return;
    const card = this.selectedCards()[0];
    this.busy.set(true);
    const res = await this.store.conquianDiscard(card);
    this.busy.set(false);
    if (res.ok) this.clearSelection();
  }

  sendChat(text: string): void {
    this.store.sendChatMessage(text);
  }

  exitTable(): void {
    this.store.leaveRoom();
    this.router.navigate(['/']);
  }
}
