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

  /**
   * Rejects the ack wait after a timeout instead of hanging forever - matters most
   * when there's no reachable backend at all (e.g. a static demo deployment), where
   * the server would otherwise never call the ack and the UI would spin indefinitely.
   */
  emitWithAck<TResponse = any>(event: string, payload: unknown, timeoutMs = 8000): Promise<TResponse> {
    return new Promise((resolve) => {
      const socket = this.getSocket();
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.' } as TResponse);
      }, timeoutMs);

      socket.emit(event, payload, (response: TResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(response);
      });
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
