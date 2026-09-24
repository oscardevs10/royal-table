import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlackjackHandOutcome } from '../../../../core/models/game.models';

/**
 * The chip stack in front of a hand. Its outcome drives the settlement animation:
 * a losing stake is swept up to the dealer, a win gets a payout chip slid over from the
 * house (with the amount floating up), a push just bounces - and whatever's left then
 * slides back to the player.
 */
@Component({
  selector: 'app-bj-bet',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bj-bet.component.html',
  styleUrl: './bj-bet.component.scss',
})
export class BjBetComponent {
  @Input() amount = 0;
  @Input() doubled = false;
  @Input() outcome: BlackjackHandOutcome | null = null;
  /** Total returned at settlement (stake + winnings). */
  @Input() payout = 0;
  @Input() large = false;

  get won(): boolean {
    return this.outcome === 'WIN' || this.outcome === 'BLACKJACK';
  }

  get winnings(): number {
    return this.payout - this.amount;
  }
}
