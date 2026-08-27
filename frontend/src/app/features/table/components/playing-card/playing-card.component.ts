import { Component, Input, computed, signal } from '@angular/core';
import { Card, Suit } from '../../../../core/models/game.models';

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const RED_SUITS: Suit[] = ['hearts', 'diamonds'];

@Component({
  selector: 'app-playing-card',
  standalone: true,
  templateUrl: './playing-card.component.html',
  styleUrl: './playing-card.component.scss',
})
export class PlayingCardComponent {
  private cardSignal = signal<Card | null>(null);

  @Input() set card(value: Card | null | undefined) {
    this.cardSignal.set(value ?? null);
  }

  @Input() faceDown = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() dealDelayMs = 0;

  readonly displayCard = computed(() => this.cardSignal());

  readonly suitSymbol = computed(() => {
    const c = this.cardSignal();
    return c ? SUIT_SYMBOLS[c.suit] : '';
  });

  readonly isRed = computed(() => {
    const c = this.cardSignal();
    return c ? RED_SUITS.includes(c.suit) : false;
  });
}
