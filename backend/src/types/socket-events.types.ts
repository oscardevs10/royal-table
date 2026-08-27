import { GameStateDTO, RoomStateDTO } from './dto.types';
import { ActionType } from './game.types';
import { ShowdownResult } from './game.types';

/** Events the client is allowed to emit. The server validates every payload. */
export interface ClientToServerEvents {
  'room:create': (
    payload: {
      playerName: string;
      maxPlayers: number;
      startingStack: number;
      smallBlind: number;
      bigBlind: number;
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

  'game:start': (payload: { sessionToken: string }, callback: (res: { ok: true } | { ok: false; error: string }) => void) => void;

  'game:action': (
    payload: { sessionToken: string; type: ActionType; amount?: number },
    callback: (res: { ok: true } | { ok: false; error: string }) => void
  ) => void;

  'game:next-hand': (payload: { sessionToken: string }) => void;

  'chat:message': (payload: { sessionToken: string; text: string }) => void;
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
  'chat:message': (payload: { playerId: string; playerName: string; text: string; timestamp: number }) => void;
  'game:player-action': (payload: { playerId: string; playerName: string; type: ActionType; amount?: number }) => void;
}
