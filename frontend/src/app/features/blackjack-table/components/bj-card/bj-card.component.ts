import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Card } from '../../../../core/models/game.models';
import { AudioService } from '../../../../core/services/audio.service';
import { PlayingCardComponent } from '../../../table/components/playing-card/playing-card.component';

/** How a card arrives on the table: flown from the shoe, popped in place (a split card), or already there. */
export type DealMode = 'shoe' | 'pop' | 'none';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A blackjack card with two faces. A card dealt face down (the dealer's hole card) keeps the
 * same element when it's revealed, so it flips over in 3D instead of popping in as a new card.
 */
@Component({
  selector: 'app-bj-card',
  standalone: true,
  imports: [PlayingCardComponent],
  templateUrl: './bj-card.component.html',
  styleUrl: './bj-card.component.scss',
})
export class BjCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** null = face down. */
  @Input() card: Card | null = null;
  @Input() size: 'md' | 'lg' = 'md';
  @Input() dealMode: DealMode = 'none';
  @Input() dealDelayMs = 0;
  /** Element the card flies out of (the shoe). */
  @Input() origin: HTMLElement | null = null;

  private soundTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private host: ElementRef<HTMLElement>, private audio: AudioService) {}

  ngOnChanges(changes: SimpleChanges): void {
    const cardChange = changes['card'];
    if (cardChange && !cardChange.firstChange && !cardChange.previousValue && cardChange.currentValue) {
      this.audio.play('deal'); // hole card flipping over
    }
  }

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;
    if (this.dealMode === 'none') return;

    this.soundTimer = setTimeout(() => this.audio.play('deal'), this.dealDelayMs);
    if (prefersReducedMotion()) return;

    if (this.dealMode === 'pop' || !this.origin) {
      el.animate(
        [
          { transform: 'scale(0.7) translateY(-8px)', opacity: 0 },
          { transform: 'scale(1.06)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 320, delay: this.dealDelayMs, easing: 'ease-out', fill: 'backwards' }
      );
      return;
    }

    const from = this.origin.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    // Slight spin that settles as the card lands, like a real pitch across the felt.
    const spin = dx > 0 ? -28 : 28;

    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(0.55)`, opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: 'translate(0, -6px) rotate(-2deg) scale(1.04)', offset: 0.82 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 520, delay: this.dealDelayMs, easing: 'cubic-bezier(0.22, 0.8, 0.3, 1)', fill: 'backwards' }
    );
  }

  ngOnDestroy(): void {
    if (this.soundTimer) clearTimeout(this.soundTimer);
  }
}
