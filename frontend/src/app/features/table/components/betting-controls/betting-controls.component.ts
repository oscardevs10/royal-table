import { Component, EventEmitter, Input, OnChanges, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvailableAction, ActionType } from '../../../../core/models/game.models';

@Component({
  selector: 'app-betting-controls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './betting-controls.component.html',
  styleUrl: './betting-controls.component.scss',
})
export class BettingControlsComponent implements OnChanges {
  @Input() availableActions: AvailableAction[] = [];
  @Input() currentBet = 0;
  @Input() bigBlind = 20;
  @Input() callAmount = 0;

  @Output() action = new EventEmitter<{ type: ActionType; amount?: number }>();

  readonly raiseAmount = signal(0);

  private raiseAction(): AvailableAction | undefined {
    return this.availableActions.find((a) => a.type === 'RAISE');
  }

  get canFold(): boolean {
    return this.availableActions.some((a) => a.type === 'FOLD');
  }
  get canCheck(): boolean {
    return this.availableActions.some((a) => a.type === 'CHECK');
  }
  get canCall(): boolean {
    return this.availableActions.some((a) => a.type === 'CALL');
  }
  get canRaise(): boolean {
    return !!this.raiseAction();
  }
  get canAllIn(): boolean {
    return this.availableActions.some((a) => a.type === 'ALL_IN');
  }

  get raiseMin(): number {
    return this.raiseAction()?.minAmount ?? 0;
  }
  get raiseMax(): number {
    return this.raiseAction()?.maxAmount ?? 0;
  }

  ngOnChanges(): void {
    const raise = this.raiseAction();
    if (raise) {
      const current = this.raiseAmount();
      const clamped = Math.min(Math.max(current || raise.minAmount!, raise.minAmount!), raise.maxAmount!);
      this.raiseAmount.set(clamped);
    }
  }

  onSliderChange(value: string): void {
    this.raiseAmount.set(Number(value));
  }

  applyMultiplier(multiplier: number): void {
    const raise = this.raiseAction();
    if (!raise) return;
    const base = this.currentBet > 0 ? this.currentBet : this.bigBlind;
    const target = Math.round(base * multiplier);
    const clamped = Math.min(Math.max(target, raise.minAmount!), raise.maxAmount!);
    this.raiseAmount.set(clamped);
  }

  fold(): void {
    this.action.emit({ type: 'FOLD' });
  }

  check(): void {
    this.action.emit({ type: 'CHECK' });
  }

  call(): void {
    this.action.emit({ type: 'CALL', amount: this.callAmount });
  }

  submitRaise(): void {
    this.action.emit({ type: 'RAISE', amount: this.raiseAmount() });
  }

  allIn(): void {
    this.action.emit({ type: 'ALL_IN' });
  }
}
