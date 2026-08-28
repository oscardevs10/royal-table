import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConquianHandResultDTO } from '../../../../core/models/game.models';

@Component({
  selector: 'app-conquian-hand-result-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './conquian-hand-result-overlay.component.html',
  styleUrl: './conquian-hand-result-overlay.component.scss',
})
export class ConquianHandResultOverlayComponent {
  @Input() result: ConquianHandResultDTO | null = null;
  @Input() isHost = false;
  @Input() isGameOver = false;

  @Output() nextHand = new EventEmitter<void>();
  @Output() dismiss = new EventEmitter<void>();
}
