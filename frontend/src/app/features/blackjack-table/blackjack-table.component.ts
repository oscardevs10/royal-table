import { Component, ElementRef, OnDestroy, ViewChild, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStoreService } from '../../core/services/game-store.service';
import { AudioService } from '../../core/services/audio.service';
import {
  BlackjackAction,
  BlackjackHandDTO,
  BlackjackPlayerPublicDTO,
  BlackjackStateDTO,
  Card,
} from '../../core/models/game.models';
import { ChatPanelComponent } from '../table/components/chat-panel/chat-panel.component';
import { BjCardComponent, DealMode, prefersReducedMotion } from './components/bj-card/bj-card.component';
import { BjBetComponent } from './components/bj-bet/bj-bet.component';

interface CardView {
  key: string;
  card: Card | null;
  mode: DealMode;
  delay: number;
}

interface HandView {
  hand: BlackjackHandDTO;
  cards: CardView[];
}

interface SeatView {
  player: BlackjackPlayerPublicDTO;
  hands: HandView[];
  isMe: boolean;
  /** Vertical offset that lays the seats out along the table's curved edge. */
  lift: number;
}

interface DealStep {
  mode: DealMode;
  delay: number;
}

const CHIP_DENOMINATIONS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];

/** Gap between consecutive cards of one deal, so the table can follow the real dealing order. */
const DEAL_STAGGER_MS = 300;
/** Duration of a card's flight from the shoe (kept in sync with BjCardComponent). */
const DEAL_FLIGHT_MS = 520;
/** When, after a round settles, the dealer clears the cards to the discard tray (the server reopens betting at 4.5s). */
const SWEEP_AFTER_MS = 3400;
const SHUFFLE_MS = 1400;

const PHASE_LABELS: Record<BlackjackStateDTO['phase'], string> = {
  BETTING: 'Apuestas',
  PLAYER_TURNS: 'Jugadores',
  DEALER_TURN: 'Dealer',
  ROUND_OVER: 'Resultados',
};

const ACTION_LABELS: Record<BlackjackAction, string> = {
  HIT: 'Pedir',
  STAND: 'Plantarse',
  DOUBLE: 'Doblar',
  SPLIT: 'Dividir',
};

@Component({
  selector: 'app-blackjack-table',
  standalone: true,
  imports: [CommonModule, ChatPanelComponent, BjCardComponent, BjBetComponent],
  templateUrl: './blackjack-table.component.html',
  styleUrl: './blackjack-table.component.scss',
})
export class BlackjackTableComponent implements OnDestroy {
  @ViewChild('tableEl') private tableEl?: ElementRef<HTMLElement>;
  @ViewChild('shoeEl') private shoeEl?: ElementRef<HTMLElement>;
  @ViewChild('discardEl') private discardEl?: ElementRef<HTMLElement>;

  readonly chatOpen = signal(false);
  readonly busy = signal(false);
  /** Bet being built with the chip buttons before it's sent. */
  readonly draftBet = signal(0);
  /** True while freshly dealt cards are still flying in (actions and results wait for them). */
  readonly dealing = signal(false);
  readonly shuffling = signal(false);
  private lastConfirmedBet = 0;

  readonly actions: BlackjackAction[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT'];
  readonly actionLabels = ACTION_LABELS;
  readonly phaseLabels = PHASE_LABELS;

  private seenCardKeys = new Set<string>();
  private planInitialized = false;
  private dealingTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;
  private shuffleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly store: GameStoreService, readonly audio: AudioService, private router: Router) {
    // Each betting phase starts the chip builder on the player's previous bet (or the table minimum).
    let lastBettingRound = -1;
    effect(() => {
      const state = this.store.blackjackState();
      if (!state || state.phase !== 'BETTING' || state.roundNumber === lastBettingRound) return;
      lastBettingRound = state.roundNumber;
      const me = this.me();
      const start = this.lastConfirmedBet || state.minBet;
      this.draftBet.set(Math.min(start, state.maxBet, me?.chips ?? start));
    });

    // Hold actions and results until the last card of a deal has landed.
    effect(() => {
      let lastDelay = -1;
      this.dealPlan().forEach((step) => (lastDelay = Math.max(lastDelay, step.delay)));
      if (lastDelay < 0 || prefersReducedMotion()) return;
      this.dealing.set(true);
      if (this.dealingTimer) clearTimeout(this.dealingTimer);
      this.dealingTimer = setTimeout(() => this.dealing.set(false), lastDelay + DEAL_FLIGHT_MS);
    });

    // Once results have had their moment, the dealer sweeps the cards into the discard tray.
    let lastSweptRound = -1;
    effect(() => {
      const state = this.store.blackjackState();
      if (!state || state.phase !== 'ROUND_OVER' || state.roundNumber === lastSweptRound) return;
      lastSweptRound = state.roundNumber;
      if (this.sweepTimer) clearTimeout(this.sweepTimer);
      this.sweepTimer = setTimeout(() => this.sweepTable(), SWEEP_AFTER_MS);
    });

    // Riffle the shoe whenever it's been reshuffled (including the very first shuffle when the table opens).
    let lastShuffleRound = -1;
    effect(() => {
      const state = this.store.blackjackState();
      if (!state || state.phase !== 'BETTING' || !state.shoe.justReshuffled || state.roundNumber === lastShuffleRound) return;
      lastShuffleRound = state.roundNumber;
      this.shuffling.set(true);
      if (this.shuffleTimer) clearTimeout(this.shuffleTimer);
      this.shuffleTimer = setTimeout(() => this.shuffling.set(false), SHUFFLE_MS);
      this.audio.play('chip');
    });
  }

  ngOnDestroy(): void {
    for (const timer of [this.dealingTimer, this.sweepTimer, this.shuffleTimer]) if (timer) clearTimeout(timer);
  }

  readonly state = computed(() => this.store.blackjackState());

  /**
   * Works out which cards are new in this update and how each should arrive. New cards are
   * staggered in the real dealing order (first card to every hand, dealer up card, second card
   * to every hand, hole card), so the initial deal plays out around the table instead of
   * appearing all at once. Cards already on the table when the player sat down don't animate.
   */
  readonly dealPlan = computed<Map<string, DealStep>>(() => {
    const state = this.state();
    const plan = new Map<string, DealStep>();
    if (!state) return plan;

    const entries: { key: string; cardIndex: number; order: number; mode: DealMode }[] = [];
    state.hands.forEach((hand, order) =>
      hand.cards.forEach((card, i) =>
        entries.push({
          key: this.handCardKey(hand, card, i),
          cardIndex: i,
          order,
          // The first card of a hand created by a split was moved over, not dealt.
          mode: hand.fromSplit && i === 0 ? 'pop' : 'shoe',
        })
      )
    );
    const dealerCount = state.dealer.cards.length + state.dealer.hiddenCardCount;
    for (let i = 0; i < dealerCount; i++) {
      entries.push({ key: this.dealerCardKey(state, i), cardIndex: i, order: Number.MAX_SAFE_INTEGER, mode: 'shoe' });
    }

    const fresh = entries.filter((e) => !this.seenCardKeys.has(e.key));
    this.seenCardKeys = new Set(entries.map((e) => e.key));
    if (!this.planInitialized) {
      this.planInitialized = true;
      return plan;
    }

    fresh.sort((a, b) => a.cardIndex - b.cardIndex || a.order - b.order);
    fresh.forEach((e, i) => plan.set(e.key, { mode: e.mode, delay: i * DEAL_STAGGER_MS }));
    return plan;
  });

  readonly dealerCards = computed<CardView[]>(() => {
    const state = this.state();
    if (!state) return [];
    const plan = this.dealPlan();
    const count = state.dealer.cards.length + state.dealer.hiddenCardCount;
    return Array.from({ length: count }, (_, i) => {
      const key = this.dealerCardKey(state, i);
      const step = plan.get(key);
      return { key, card: state.dealer.cards[i] ?? null, mode: step?.mode ?? 'none', delay: step?.delay ?? 0 };
    });
  });

  private handCardKey(hand: BlackjackHandDTO, card: Card, index: number): string {
    return `${hand.id}:${index}:${card.rank}${card.suit}`;
  }

  /** Dealer slots are keyed by position only, so the hole card keeps its element and flips when revealed. */
  private dealerCardKey(state: BlackjackStateDTO, index: number): string {
    return `dealer:${state.roundNumber}:${index}`;
  }

  private toHandView(hand: BlackjackHandDTO, plan: Map<string, DealStep>): HandView {
    return {
      hand,
      cards: hand.cards.map((card, i) => {
        const key = this.handCardKey(hand, card, i);
        const step = plan.get(key);
        return { key, card, mode: step?.mode ?? 'none', delay: step?.delay ?? 0 };
      }),
    };
  }

  get shoeOrigin(): HTMLElement | null {
    return this.shoeEl?.nativeElement ?? null;
  }

  /** Slides every card on the felt into the discard tray, dealer-style, right before the table clears. */
  private sweepTable(): void {
    const table = this.tableEl?.nativeElement;
    const tray = this.discardEl?.nativeElement;
    if (!table || !tray || prefersReducedMotion() || this.state()?.phase !== 'ROUND_OVER') return;

    table.classList.add('sweeping');
    setTimeout(() => table.classList.remove('sweeping'), 1600);

    const target = tray.getBoundingClientRect();
    const cards = Array.from(table.querySelectorAll<HTMLElement>('app-bj-card'));
    cards.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const dx = target.left + target.width / 2 - (rect.left + rect.width / 2);
      const dy = target.top + target.height / 2 - (rect.top + rect.height / 2);
      el.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${-15 + (i % 5) * 8}deg) scale(0.5)`, opacity: 0.2 },
        ],
        { duration: 560, delay: i * 45, easing: 'cubic-bezier(0.55, 0, 0.75, 0.3)', fill: 'forwards' }
      );
    });
    if (cards.length > 0) this.audio.play('deal');
  }

  readonly me = computed(() => {
    const state = this.state();
    return state?.players.find((p) => p.id === state.myPlayerId) ?? null;
  });

  readonly seats = computed<SeatView[]>(() => {
    const state = this.state();
    if (!state) return [];
    const plan = this.dealPlan();
    const players = [...state.players].sort((a, b) => a.seatIndex - b.seatIndex);
    const mid = (players.length - 1) / 2;
    return players.map((player, i) => ({
      player,
      hands: state.hands.filter((h) => h.playerId === player.id).map((h) => this.toHandView(h, plan)),
      isMe: player.id === state.myPlayerId,
      lift: mid === 0 ? 0 : -Math.pow(Math.abs(i - mid) / mid, 2) * 34,
    }));
  });

  readonly myHands = computed(() => {
    const state = this.state();
    return state ? state.hands.filter((h) => h.playerId === state.myPlayerId) : [];
  });

  readonly activeHand = computed(() => {
    const state = this.state();
    return state?.hands.find((h) => h.id === state.activeHandId) ?? null;
  });

  readonly isMyTurn = computed(() => {
    const state = this.state();
    return !!state && this.activeHand()?.playerId === state.myPlayerId;
  });

  readonly myResult = computed(() => {
    const state = this.state();
    return state?.lastRoundResult?.players.find((p) => p.playerId === state.myPlayerId) ?? null;
  });

  readonly myBlackjack = computed(() => this.myHands().some((h) => h.outcome === 'BLACKJACK'));

  readonly waitingOnBets = computed(() => {
    const state = this.state();
    if (!state || state.phase !== 'BETTING') return [];
    return state.players.filter((p) => p.status === 'ACTIVE' && p.connected && p.pendingBet === 0).map((p) => p.name);
  });

  readonly chipValues = computed(() => {
    const state = this.state();
    if (!state) return [];
    const usable = CHIP_DENOMINATIONS.filter((d) => d <= state.maxBet && d >= Math.max(1, state.minBet / 5));
    const start = Math.max(0, usable.findIndex((d) => d >= state.minBet) - 1);
    return usable.slice(start, start + 5);
  });

  readonly betCeiling = computed(() => {
    const state = this.state();
    return state ? Math.min(state.maxBet, this.me()?.chips ?? 0) : 0;
  });

  readonly draftValid = computed(() => {
    const state = this.state();
    const draft = this.draftBet();
    return !!state && draft >= state.minBet && draft <= this.betCeiling();
  });

  /** Fraction of the shoe already dealt, and where the cut card sits, for the shoe gauge. */
  readonly shoeGauge = computed(() => {
    const shoe = this.state()?.shoe;
    if (!shoe) return { dealtPct: 0, cutPct: 75 };
    return {
      dealtPct: Math.round(((shoe.totalCards - shoe.remaining) / shoe.totalCards) * 100),
      cutPct: Math.round(((shoe.totalCards - shoe.cutCardAt) / shoe.totalCards) * 100),
    };
  });

  readonly activePlayerName = computed(() => this.activeHand()?.playerName ?? '—');

  range(count: number): number[] {
    return Array.from({ length: count }, (_, i) => i);
  }

  handTotalLabel(hand: { total: number; soft: boolean }): string {
    return hand.soft && hand.total < 21 ? `${hand.total - 10}/${hand.total}` : `${hand.total}`;
  }

  handBadge(hand: BlackjackHandDTO): { text: string; tone: 'win' | 'lose' | 'push' | 'info' } | null {
    switch (hand.outcome) {
      case 'BLACKJACK':
        return { text: 'Blackjack 3:2', tone: 'win' };
      case 'WIN':
        return { text: 'Gana', tone: 'win' };
      case 'PUSH':
        return { text: 'Empate', tone: 'push' };
      case 'LOSE':
        return { text: hand.status === 'BUST' ? 'Se pasó' : 'Pierde', tone: 'lose' };
    }
    if (hand.status === 'BUST') return { text: 'Se pasó', tone: 'lose' };
    if (hand.status === 'BLACKJACK') return { text: 'Blackjack', tone: 'win' };
    if (hand.doubled) return { text: 'Doblada', tone: 'info' };
    return null;
  }

  canAct(action: BlackjackAction): boolean {
    return this.isMyTurn() && !this.busy() && !this.dealing() && (this.state()?.myAvailableActions.includes(action) ?? false);
  }

  addChip(value: number): void {
    this.draftBet.update((bet) => Math.min(bet + value, this.betCeiling()));
  }

  clearDraft(): void {
    this.draftBet.set(0);
  }

  maxDraft(): void {
    this.draftBet.set(this.betCeiling());
  }

  async confirmBet(): Promise<void> {
    if (this.busy() || !this.draftValid()) return;
    const amount = this.draftBet();
    this.busy.set(true);
    const res = await this.store.blackjackBet(amount);
    this.busy.set(false);
    if (res.ok) this.lastConfirmedBet = amount;
  }

  async withdrawBet(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    await this.store.blackjackBet(0);
    this.busy.set(false);
  }

  async forceDeal(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    await this.store.blackjackDeal();
    this.busy.set(false);
  }

  async act(action: BlackjackAction): Promise<void> {
    if (!this.canAct(action)) return;
    this.busy.set(true);
    await this.store.blackjackAction(action);
    this.busy.set(false);
  }

  sendChat(text: string): void {
    this.store.sendChatMessage(text);
  }

  exitTable(): void {
    this.store.leaveRoom();
    this.router.navigate(['/']);
  }
}
