import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SidePot } from '../../../../core/models/game.models';

@Component({
  selector: 'app-pot-display',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pot-display.component.html',
  styleUrl: './pot-display.component.scss',
})
export class PotDisplayComponent {
  @Input() pot = 0;
  @Input() sidePots: SidePot[] = [];
}
