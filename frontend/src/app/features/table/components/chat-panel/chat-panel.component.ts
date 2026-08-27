import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatMessage } from '../../../../core/models/game.models';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
})
export class ChatPanelComponent {
  @Input() messages: ChatMessage[] = [];
  @Input() myPlayerId: string | null = null;
  @Input() open = false;

  @Output() closePanel = new EventEmitter<void>();
  @Output() sendMessage = new EventEmitter<string>();

  draft = '';

  send(): void {
    const text = this.draft.trim();
    if (!text) return;
    this.sendMessage.emit(text);
    this.draft = '';
  }

  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
