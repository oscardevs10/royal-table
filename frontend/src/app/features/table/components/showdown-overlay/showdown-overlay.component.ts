import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShowdownResult } from '../../../../core/models/game.models';
import { PlayingCardComponent } from '../playing-card/playing-card.component';

@Component({
  selector: 'app-showdown-overlay',
  standalone: true,
  imports: [CommonModule, PlayingCardComponent],
  templateUrl: './showdown-overlay.component.html',
  styleUrl: './showdown-overlay.component.scss',
})
export class ShowdownOverlayComponent {
  @Input() result: ShowdownResult | null = null;
  @Input() isHost = false;
  @Input() isGameOver = false;

  @Output() nextHand = new EventEmitter<void>();
  @Output() dismiss = new EventEmitter<void>();

  handDescriptionOf(playerId: string): string | null {
    const hand = this.result?.revealedHands.find((h) => h.playerId === playerId);
    return hand?.handDescription ?? null;
  }
}
