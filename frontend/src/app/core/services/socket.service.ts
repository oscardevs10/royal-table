import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../config';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;
  readonly connected = signal(false);

  connect(): Socket {
    if (this.socket) return this.socket;

    this.socket = io(BACKEND_URL, { autoConnect: true, transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));

    return this.socket;
  }

  getSocket(): Socket {
    return this.socket ?? this.connect();
  }

  emitWithAck<TResponse = any>(event: string, payload: unknown): Promise<TResponse> {
    return new Promise((resolve) => {
      this.getSocket().emit(event, payload, (response: TResponse) => resolve(response));
    });
  }

  emit(event: string, payload: unknown): void {
    this.getSocket().emit(event, payload);
  }

  on<T = any>(event: string, handler: (payload: T) => void): void {
    this.getSocket().on(event, handler);
  }

  off(event: string, handler?: (...args: any[]) => void): void {
    this.getSocket().off(event, handler);
  }
}
