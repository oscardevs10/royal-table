import { Injectable, signal, computed } from '@angular/core';
import { SocketService } from './socket.service';
import { SessionService } from './session.service';
import { AudioService } from './audio.service';
import {
  ChatMessage,
  CreateRoomPayload,
  GameStateDTO,
  RoomStateDTO,
  ShowdownResult,
  ActionType,
} from '../models/game.models';

export interface Toast {
  id: number;
  text: string;
}

export interface PlayerActionEvent {
  type: ActionType;
  amount?: number;
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class GameStoreService {
  readonly roomState = signal<RoomStateDTO | null>(null);
  readonly gameState = signal<GameStateDTO | null>(null);
  readonly showdown = signal<ShowdownResult | null>(null);
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly toasts = signal<Toast[]>([]);
  readonly rejoining = signal(false);
  readonly lastPlayerActions = signal<Record<string, PlayerActionEvent>>({});

  readonly isHost = computed(() => {
    const room = this.roomState();
    const session = this.session.session();
    if (!room || !session) return false;
    return room.players.find((p) => p.id === session.playerId)?.isHost ?? false;
  });

  readonly myPlayerId = computed(() => this.session.session()?.playerId ?? null);

  private toastCounter = 0;
  private listenersRegistered = false;
  private rejoinInFlight: Promise<boolean> | null = null;

  constructor(private socket: SocketService, private session: SessionService, private audio: AudioService) {}

  init(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    this.socket.on<RoomStateDTO>('room:update', (state) => this.roomState.set(state));

    this.socket.on<GameStateDTO>('game:state', (state) => {
      const previous = this.gameState();
      this.gameState.set(state);
      this.reactToStateChange(previous, state);
    });

    this.socket.on<ShowdownResult>('game:showdown', (result) => {
      this.showdown.set(result);
      this.audio.play('win');
    });

    this.socket.on('game:hand-ended', () => {
      // showdown signal already carries the outcome; nothing else required here.
    });

    this.socket.on<{ playerId: string; name: string }>('player:disconnected', (p) => this.pushToast(`${p.name} se desconectó`));
    this.socket.on<{ playerId: string; name: string }>('player:reconnected', (p) => this.pushToast(`${p.name} se reconectó`));
    this.socket.on<{ playerId: string; name: string }>('player:eliminated', (p) => this.pushToast(`${p.name} quedó eliminado`));

    this.socket.on<ChatMessage>('chat:message', (msg) => {
      this.chatMessages.update((list) => [...list, msg]);
    });

    this.socket.on<{ playerId: string; playerName: string; type: ActionType; amount?: number }>('game:player-action', (payload) => {
      const ts = Date.now();
      this.lastPlayerActions.update((map) => ({ ...map, [payload.playerId]: { type: payload.type, amount: payload.amount, ts } }));
      setTimeout(() => {
        this.lastPlayerActions.update((map) => {
          if (map[payload.playerId]?.ts !== ts) return map;
          const { [payload.playerId]: _removed, ...rest } = map;
          return rest;
        });
      }, 2200);

      const soundMap: Partial<Record<ActionType, 'check' | 'call' | 'raise' | 'fold'>> = {
        CHECK: 'check',
        CALL: 'call',
        RAISE: 'raise',
        ALL_IN: 'raise',
        FOLD: 'fold',
      };
      const sound = soundMap[payload.type];
      if (sound) this.audio.play(sound);
    });

    const socket = this.socket.getSocket();
    socket.on('connect', () => {
      const session = this.session.session();
      if (session) this.attemptRejoin();
    });
  }

  private reactToStateChange(previous: GameStateDTO | null, next: GameStateDTO): void {
    if (!previous) {
      if (next.handInProgress) this.audio.play('deal');
      return;
    }
    if (next.handNumber !== previous.handNumber) {
      this.audio.play('deal');
      this.showdown.set(null);
    }
  }

  private pushToast(text: string): void {
    const id = ++this.toastCounter;
    this.toasts.update((list) => [...list, { id, text }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 4000);
  }

  async attemptRejoin(): Promise<boolean> {
    if (this.rejoinInFlight) return this.rejoinInFlight;

    const session = this.session.session();
    if (!session) return false;

    this.rejoining.set(true);
    this.rejoinInFlight = this.socket
      .emitWithAck<{ ok: boolean; error?: string }>('room:rejoin', { sessionToken: session.sessionToken })
      .then((res) => {
        if (!res.ok) this.session.clear();
        return res.ok;
      })
      .finally(() => {
        this.rejoining.set(false);
        this.rejoinInFlight = null;
      });

    return this.rejoinInFlight;
  }

  async createRoom(payload: CreateRoomPayload): Promise<{ ok: boolean; error?: string; roomCode?: string }> {
    this.socket.connect();
    const res = await this.socket.emitWithAck<{ ok: boolean; error?: string; roomCode?: string; sessionToken?: string; playerId?: string }>(
      'room:create',
      payload
    );
    if (res.ok && res.sessionToken && res.playerId && res.roomCode) {
      this.session.save({ sessionToken: res.sessionToken, playerId: res.playerId, playerName: payload.playerName, roomCode: res.roomCode });
    } else {
      this.errorMessage.set(res.error ?? 'No se pudo crear la partida');
    }
    return res;
  }

  async joinRoom(roomCode: string, playerName: string): Promise<{ ok: boolean; error?: string }> {
    this.socket.connect();
    const res = await this.socket.emitWithAck<{ ok: boolean; error?: string; sessionToken?: string; playerId?: string }>('room:join', {
      roomCode,
      playerName,
    });
    if (res.ok && res.sessionToken && res.playerId) {
      this.session.save({ sessionToken: res.sessionToken, playerId: res.playerId, playerName, roomCode: roomCode.toUpperCase() });
    } else {
      this.errorMessage.set(res.error ?? 'No se pudo unir a la partida');
    }
    return res;
  }

  async addBot(): Promise<{ ok: boolean; error?: string }> {
    const session = this.session.session();
    if (!session) return { ok: false, error: 'No hay sesión activa' };
    const res = await this.socket.emitWithAck<{ ok: boolean; error?: string }>('room:add-bot', { sessionToken: session.sessionToken });
    if (!res.ok) this.errorMessage.set(res.error ?? 'No se pudo agregar el bot');
    return res;
  }

  async removeBot(botPlayerId: string): Promise<{ ok: boolean; error?: string }> {
    const session = this.session.session();
    if (!session) return { ok: false, error: 'No hay sesión activa' };
    const res = await this.socket.emitWithAck<{ ok: boolean; error?: string }>('room:remove-bot', {
      sessionToken: session.sessionToken,
      botPlayerId,
    });
    if (!res.ok) this.errorMessage.set(res.error ?? 'No se pudo quitar el bot');
    return res;
  }

  async startGame(): Promise<{ ok: boolean; error?: string }> {
    const session = this.session.session();
    if (!session) return { ok: false, error: 'No hay sesión activa' };
    const res = await this.socket.emitWithAck<{ ok: boolean; error?: string }>('game:start', { sessionToken: session.sessionToken });
    if (!res.ok) this.errorMessage.set(res.error ?? 'No se pudo iniciar la partida');
    return res;
  }

  async sendAction(type: ActionType, amount?: number): Promise<{ ok: boolean; error?: string }> {
    const session = this.session.session();
    if (!session) return { ok: false, error: 'No hay sesión activa' };
    const res = await this.socket.emitWithAck<{ ok: boolean; error?: string }>('game:action', { sessionToken: session.sessionToken, type, amount });
    if (!res.ok) {
      this.errorMessage.set(res.error ?? 'Acción inválida');
    }
    return res;
  }

  nextHand(): void {
    const session = this.session.session();
    if (!session) return;
    this.socket.emit('game:next-hand', { sessionToken: session.sessionToken });
    this.showdown.set(null);
  }

  sendChatMessage(text: string): void {
    const session = this.session.session();
    if (!session || !text.trim()) return;
    this.socket.emit('chat:message', { sessionToken: session.sessionToken, text });
  }

  leaveRoom(): void {
    const session = this.session.session();
    if (session) this.socket.emit('room:leave', { sessionToken: session.sessionToken });
    this.session.clear();
    this.roomState.set(null);
    this.gameState.set(null);
    this.showdown.set(null);
    this.chatMessages.set([]);
  }

  clearError(): void {
    this.errorMessage.set(null);
  }
}
