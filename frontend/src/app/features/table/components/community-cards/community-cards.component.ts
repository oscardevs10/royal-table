import { Component, Input } from '@angular/core';
import { Card } from '../../../../core/models/game.models';
import { PlayingCardComponent } from '../playing-card/playing-card.component';

@Component({
  selector: 'app-community-cards',
  standalone: true,
  imports: [PlayingCardComponent],
  templateUrl: './community-cards.component.html',
  styleUrl: './community-cards.component.scss',
})
export class CommunityCardsComponent {
  @Input() cards: Card[] = [];

  readonly placeholders = [0, 1, 2, 3, 4];
}
