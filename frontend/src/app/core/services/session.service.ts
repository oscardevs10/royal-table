import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'royal-table-session';

export interface StoredSession {
  sessionToken: string;
  playerId: string;
  playerName: string;
  roomCode: string;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  readonly session = signal<StoredSession | null>(this.loadFromStorage());

  private loadFromStorage(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  }

  save(data: StoredSession): void {
    this.session.set(data);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // localStorage unavailable (private mode, etc.) - session still works for this tab session.
    }
  }

  clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
