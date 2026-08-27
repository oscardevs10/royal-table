import { v4 as uuidv4 } from 'uuid';
import { LobbyPlayer } from './player.types';

const BOT_NAMES = ['Bot Ana', 'Bot Leo', 'Bot Max', 'Bot Sofia', 'Bot Ivan', 'Bot Nora', 'Bot Diego', 'Bot Vera'];

export function createSessionToken(): string {
  return uuidv4();
}

export function createLobbyPlayer(params: { name: string; seatIndex: number; isHost: boolean; chips: number }): LobbyPlayer {
  return {
    id: uuidv4(),
    sessionToken: createSessionToken(),
    name: sanitizeName(params.name),
    seatIndex: params.seatIndex,
    isHost: params.isHost,
    ready: params.isHost, // host is implicitly ready
    connected: true,
    socketId: null,
    chips: params.chips,
    eliminated: false,
    isBot: false,
  };
}

export function createBotPlayer(params: { seatIndex: number; chips: number; existingNames: string[] }): LobbyPlayer {
  const available = BOT_NAMES.filter((name) => !params.existingNames.includes(name));
  const pool = available.length > 0 ? available : BOT_NAMES;
  const name = pool[Math.floor(Math.random() * pool.length)];

  return {
    id: uuidv4(),
    sessionToken: createSessionToken(),
    name,
    seatIndex: params.seatIndex,
    isHost: false,
    ready: true,
    connected: true,
    socketId: null,
    chips: params.chips,
    eliminated: false,
    isBot: true,
  };
}

export function sanitizeName(name: string): string {
  const trimmed = (name ?? '').trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : 'Player';
}
