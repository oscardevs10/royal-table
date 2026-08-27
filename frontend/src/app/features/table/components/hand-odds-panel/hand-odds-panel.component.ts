import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrentHandInfo, HandCategory, HandOddsEntry } from '../../../../core/models/game.models';

const CATEGORY_LABELS: Record<HandCategory, string> = {
  HIGH_CARD: 'Carta Alta',
  ONE_PAIR: 'Par',
  TWO_PAIR: 'Doble Par',
  THREE_OF_A_KIND: 'Trío',
  STRAIGHT: 'Escalera',
  FLUSH: 'Color',
  FULL_HOUSE: 'Full House',
  FOUR_OF_A_KIND: 'Póker',
  STRAIGHT_FLUSH: 'Escalera de Color',
  ROYAL_FLUSH: 'Escalera Real',
};

@Component({
  selector: 'app-hand-odds-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hand-odds-panel.component.html',
  styleUrl: './hand-odds-panel.component.scss',
})
export class HandOddsPanelComponent {
  @Input() currentHand: CurrentHandInfo | null = null;
  @Input() odds: HandOddsEntry[] | null = null;
  @Input() isExact = true;

  readonly expanded = signal(false);

  toggle(): void {
    this.expanded.set(!this.expanded());
  }

  categoryLabel(category: HandCategory): string {
    return CATEGORY_LABELS[category];
  }
}
