import { GameStateDTO, RoomStateDTO } from './dto.types';
import { ActionType } from './game.types';
import { ShowdownResult } from './game.types';
import { BlackjackStateDTO } from './blackjack-dto.types';
import { GameMode } from '../modules/rooms/room.types';
import { BlackjackAction } from '../modules/blackjack/blackjack.types';

/** Events the client is allowed to emit. The server validates every payload. */
export interface ClientToServerEvents {
  'room:create': (
    payload: {
      playerName: string;
      gameMode: GameMode;
      maxPlayers: number;
      startingStack: number;
      smallBlind?: number;
      bigBlind?: number;
      minBet?: number;
      maxBet?: number;
      deckCount?: number;
    },
    callback: (res: { ok: true; roomCode: string; sessionToken: string; playerId: string } | { ok: false; error: string }) => void
  ) => void;

  'room:join': (
    payload: { roomCode: string; playerName: string },
    callback: (res: { ok: true; sessionToken: string; playerId: string } | { ok: false; error: string }) => void
  ) => void;

  'room:rejoin': (
    payload: { sessionToken: string },
    callback: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  'room:leave': (payload: { sessionToken: string }) => void;

  'room:ready': (payload: { sessionToken: string; ready: boolean }) => void;

  'room:add-bot': (payload: { sessionToken: string }, callback: (res: { ok: true } | { ok: false; error: string }) => void) => void;

  'room:remove-bot': (
    payload: { sessionToken: string; botPlayerId: string },
    callback: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  /** Host only, once the game is over: back to the lobby with the same room code and players. */
  'room:restart': (payload: { sessionToken: string }, callback: (res: { ok: true } | { ok: false; error: string }) => void) => void;

  'game:start': (payload: { sessionToken: string }, callback: (res: { ok: true } | { ok: false; error: string }) => void) => void;

  'game:action': (
    payload: { sessionToken: string; type: ActionType; amount?: number },
    callback: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  'game:next-hand': (payload: { sessionToken: string }) => void;

  'chat:message': (payload: { sessionToken: string; text: string }) => void;

  /** Sets the bet for the upcoming round; 0 withdraws it. */
  'blackjack:bet': (
    payload: { sessionToken: string; amount: number },
    callback: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  /** Host only: deal now without waiting for players who haven't bet. */
  'blackjack:deal': (payload: { sessionToken: string }, callback: (res: { ok: true } | { ok: false; error: string }) => void) => void;

  'blackjack:action': (
    payload: { sessionToken: string; action: BlackjackAction },
    callback: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;
}

export interface ServerToClientEvents {
  'room:update': (state: RoomStateDTO) => void;
  'room:error': (payload: { error: string }) => void;
  'game:state': (state: GameStateDTO) => void;
  'game:showdown': (result: ShowdownResult) => void;
  'game:hand-ended': (payload: { reason: 'fold' | 'showdown' }) => void;
  'player:disconnected': (payload: { playerId: string; name: string }) => void;
  'player:reconnected': (payload: { playerId: string; name: string }) => void;
  'player:eliminated': (payload: { playerId: string; name: string }) => void;
  'player:left': (payload: { playerId: string; name: string }) => void;
  'chat:message': (payload: { playerId: string; playerName: string; text: string; timestamp: number }) => void;
  'game:player-action': (payload: { playerId: string; playerName: string; type: ActionType; amount?: number }) => void;
  'blackjack:state': (state: BlackjackStateDTO) => void;
}
