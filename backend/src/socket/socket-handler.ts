import { Server, Socket } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from '../types/socket-events.types';
import { roomService } from '../modules/rooms/room.service';
import { buildGameStateDTO, buildRoomStateDTO } from '../modules/rooms/dto-builder';
import { buildBlackjackStateDTO } from '../modules/blackjack/blackjack-dto-builder';
import { Room, RoomConfig, GameMode } from '../modules/rooms/room.types';
import { GameEngine } from '../modules/poker/game-engine';
import { BlackjackEngine } from '../modules/blackjack/blackjack-engine';
import { sanitizeChatText } from '../modules/chat/chat.service';
import { persistenceService } from '../database/persistence.service';
import { decideBotAction } from '../modules/poker/bot-ai';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const BOT_MIN_DELAY_MS = 700;
const BOT_MAX_DELAY_MS = 1500;
const RUNOUT_STEP_DELAY_MS = 1700;
const DEALER_STEP_DELAY_MS = 850;
const NEXT_ROUND_DELAY_MS = 4500;
/** How long a disconnected player's hand waits (e.g. for a page refresh) before it's stood for them. */
const AWAY_AUTO_STAND_MS = 15000;

function roomChannel(code: string): string {
  return `room:${code}`;
}

function broadcastRoomState(io: AppServer, room: Room): void {
  io.to(roomChannel(room.code)).emit('room:update', buildRoomStateDTO(room));
}

/** Broadcasts the appropriate per-player state DTO for whichever game mode this room is running. */
function broadcastGameStateForMode(io: AppServer, room: Room): void {
  if (room.config.gameMode === 'BLACKJACK') {
    broadcastBlackjackState(io, room);
  } else {
    broadcastGameState(io, room);
  }
}

// ---------------------------------------------------------------------------
// Texas Hold'em
// ---------------------------------------------------------------------------

function broadcastGameState(io: AppServer, room: Room): void {
  if (!room.engine || room.config.gameMode !== 'HOLDEM') return;
  for (const player of room.players) {
    if (!player.socketId) continue;
    const dto = buildGameStateDTO(room, player.id);
    if (dto) io.to(player.socketId).emit('game:state', dto);
  }
}

async function handleHandOutcomeIfAny(io: AppServer, room: Room): Promise<void> {
  if (!room.engine || room.config.gameMode !== 'HOLDEM') return;
  const engine = room.engine as GameEngine;
  const showdown = engine.consumeShowdownResult();
  if (!showdown) return;

  const state = engine.getState();
  await persistenceService.endHand(
    room.id,
    state.communityCards.map((c) => `${c.rank}${c.suit[0]}`).join(','),
    showdown.winners.reduce((sum, w) => sum + w.amountWon, 0),
    showdown
  );

  io.to(roomChannel(room.code)).emit('game:showdown', showdown);
  io.to(roomChannel(room.code)).emit('game:hand-ended', { reason: showdown.revealedHands.length > 0 ? 'showdown' : 'fold' });

  for (const eliminated of engine.consumeEliminated()) {
    await persistenceService.markPlayerEliminated(eliminated.id);
    io.to(roomChannel(room.code)).emit('player:eliminated', { playerId: eliminated.id, name: eliminated.name });
  }

  if (engine.isGameOver()) {
    room.status = 'FINISHED';
    await persistenceService.updateRoomStatus(room.id, 'FINISHED');
    await persistenceService.endGame(room.id);
    broadcastRoomState(io, room);
  }
}

/**
 * Validates and applies one poker action (from a human socket or a bot) through the
 * same server-authoritative path, persists it, broadcasts the result, and -
 * if it's now a bot's turn - schedules that bot's move. Shared by the
 * `game:action` handler and the bot turn scheduler so both go through
 * identical validation/broadcast logic.
 */
async function processPokerAction(
  io: AppServer,
  sessionToken: string,
  type: string,
  amount?: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = roomService.findBySession(sessionToken);
  if (!found) return { ok: false, error: 'Player not found' };
  const { room, player } = found;
  if (room.config.gameMode !== 'HOLDEM') return { ok: false, error: 'Not a Texas Hold\'em room' };
  const phaseBeforeAction = (room.engine as GameEngine | null)?.getState().currentPhase;

  const result = roomService.applyPokerAction(sessionToken, type, amount);
  if (!result.ok || !result.data) return { ok: false, error: result.error ?? 'Invalid action' };

  if (room.engine && phaseBeforeAction) {
    await persistenceService.recordAction(room.id, player.id, type as any, amount ?? 0, phaseBeforeAction);
  }

  const enginePlayer = room.engine?.getState().players.find((p: any) => p.id === player.id) as any;
  io.to(roomChannel(room.code)).emit('game:player-action', {
    playerId: player.id,
    playerName: player.name,
    type: type as any,
    amount: enginePlayer?.currentBet,
  });

  broadcastGameState(io, room);
  await handleHandOutcomeIfAny(io, room);
  scheduleBotTurnIfNeeded(io, room);
  scheduleRunoutIfNeeded(io, room);

  return { ok: true };
}

/**
 * When nobody can act anymore but the hand isn't over (an all-in runout, or an
 * extreme short stack that went all-in just posting blinds), deals the board out
 * one street at a time with a pause between each - instead of resolving the whole
 * rest of the hand silently in one instant - so players can watch cards get
 * revealed and the community cards land one by one, like a real all-in showdown.
 * Re-checks on each tick so a stale timer can never double-deal a street.
 */
function scheduleRunoutIfNeeded(io: AppServer, room: Room): void {
  if (!room.engine || room.config.gameMode !== 'HOLDEM') return;
  const engine = room.engine as GameEngine;
  if (!engine.isAllInRunout()) return;
  const handNumberAtSchedule = engine.getState().handNumber;

  setTimeout(async () => {
    if (!room.engine || room.config.gameMode !== 'HOLDEM') return;
    const liveEngine = room.engine as GameEngine;
    const state = liveEngine.getState();
    if (!state.handInProgress || state.handNumber !== handNumberAtSchedule) return;

    liveEngine.continueRunout();
    broadcastGameState(io, room);
    await handleHandOutcomeIfAny(io, room);
    scheduleRunoutIfNeeded(io, room);
  }, RUNOUT_STEP_DELAY_MS);
}

/**
 * If it's currently a bot's turn, computes its decision after a short human-like
 * delay and applies it through the exact same validated path a real player uses.
 * Re-checks the game state when the timer fires (hand/turn may have moved on)
 * so a stale timer can never double-act or act out of turn.
 */
function scheduleBotTurnIfNeeded(io: AppServer, room: Room): void {
  if (!room.engine || room.config.gameMode !== 'HOLDEM') return;
  const engine = room.engine as GameEngine;
  const state = engine.getState();
  if (!state.handInProgress) return;

  const current = state.players.find((p) => p.seatIndex === state.currentPlayerPosition);
  if (!current || !current.isBot) return;

  const botId = current.id;
  const handNumberAtSchedule = state.handNumber;
  const delay = BOT_MIN_DELAY_MS + Math.random() * (BOT_MAX_DELAY_MS - BOT_MIN_DELAY_MS);

  setTimeout(async () => {
    if (!room.engine || room.config.gameMode !== 'HOLDEM') return;
    const liveEngine = room.engine as GameEngine;
    const freshState = liveEngine.getState();
    if (!freshState.handInProgress || freshState.handNumber !== handNumberAtSchedule) return;

    const freshBot = freshState.players.find((p) => p.id === botId);
    const stillBotsTurn = freshState.players[freshState.currentPlayerPosition]?.id === botId;
    if (!freshBot || !stillBotsTurn) return;

    const decision = decideBotAction(freshState, freshBot);
    const res = await processPokerAction(io, freshBot.sessionToken, decision.type, decision.amount);
    if (!res.ok) {
      // Safety net: an unexpected validation mismatch should never stall the table.
      await processPokerAction(io, freshBot.sessionToken, 'FOLD');
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Blackjack
// ---------------------------------------------------------------------------

/** At most one pending dealer-step / next-round timer per room, so overlapping triggers can't double-step the dealer. */
const blackjackTimers = new WeakMap<Room, NodeJS.Timeout>();

function broadcastBlackjackState(io: AppServer, room: Room): void {
  if (!(room.engine instanceof BlackjackEngine)) return;
  for (const player of room.players) {
    if (!player.socketId) continue;
    const dto = buildBlackjackStateDTO(room, player.id);
    if (dto) io.to(player.socketId).emit('blackjack:state', dto);
  }
}

/**
 * Single follow-up for anything that changed a blackjack table (a bet, an action, a player
 * leaving/dropping, a dealer step): broadcasts the new state, records a settled round, and
 * schedules whatever the table does next on its own.
 */
async function afterBlackjackChange(io: AppServer, room: Room): Promise<void> {
  if (!(room.engine instanceof BlackjackEngine)) return;
  roomService.syncAfterAction(room);
  broadcastBlackjackState(io, room);
  await handleBlackjackRoundOutcomeIfAny(io, room);
  scheduleBlackjackProgress(io, room);
  scheduleAwayAutoStandIfNeeded(io, room);
}

async function handleBlackjackRoundOutcomeIfAny(io: AppServer, room: Room): Promise<void> {
  const engine = room.engine as BlackjackEngine;
  const result = engine.consumeRoundResult();
  if (!result) return;

  const totalBet = result.players.reduce((sum, p) => sum + p.totalBet, 0);
  const summary =
    result.players.map((p) => `${p.playerName}:${p.net >= 0 ? '+' : ''}${p.net}`).join(', ') +
    ` | dealer ${result.dealerBlackjack ? 'BJ' : result.dealerTotal}`;
  await persistenceService.recordCompletedHand(room.id, result.roundNumber, totalBet, summary);

  for (const eliminated of engine.consumeEliminated()) {
    await persistenceService.markPlayerEliminated(eliminated.id);
    io.to(roomChannel(room.code)).emit('player:eliminated', { playerId: eliminated.id, name: eliminated.name });
  }

  if (engine.isGameOver()) {
    room.status = 'FINISHED';
    await persistenceService.updateRoomStatus(room.id, 'FINISHED');
    await persistenceService.endGame(room.id);
    broadcastRoomState(io, room);
  }
}

/**
 * Paces the parts of a round nobody has to click for: the dealer reveals the hole card and
 * draws one card at a time (so the table can watch), and once a round is settled the results
 * stay up for a few seconds before betting reopens. Re-checks the round/phase when the timer
 * fires so a stale timer can never step the wrong round.
 */
function scheduleBlackjackProgress(io: AppServer, room: Room): void {
  if (blackjackTimers.has(room) || room.status !== 'PLAYING') return;
  const engine = room.engine as BlackjackEngine;
  const { phase, roundNumber } = engine.getState();
  if (phase !== 'DEALER_TURN' && phase !== 'ROUND_OVER') return;

  const timer = setTimeout(async () => {
    blackjackTimers.delete(room);
    if (room.engine !== engine || room.status !== 'PLAYING') return;
    const live = engine.getState();
    if (live.roundNumber !== roundNumber || live.phase !== phase) return;

    if (phase === 'DEALER_TURN') engine.dealerStep();
    else engine.startBetting();
    await afterBlackjackChange(io, room);
  }, phase === 'DEALER_TURN' ? DEALER_STEP_DELAY_MS : NEXT_ROUND_DELAY_MS);
  // The HTTP server keeps the process alive; table timers alone never should (clean test/shutdown exits).
  timer.unref();

  blackjackTimers.set(room, timer);
}

/** If the hand whose turn it is belongs to someone who dropped, stand it for them after a grace period. */
function scheduleAwayAutoStandIfNeeded(io: AppServer, room: Room): void {
  const engine = room.engine as BlackjackEngine;
  const hand = engine.getActiveHand();
  if (!hand || engine.getPlayer(hand.playerId)?.connected !== false) return;

  const { id: handId, playerId } = hand;
  setTimeout(async () => {
    if (room.engine !== engine) return;
    const stillAway = engine.getPlayer(playerId)?.connected === false;
    if (!stillAway || !engine.autoStandActiveHand(handId)) return;
    await afterBlackjackChange(io, room);
  }, AWAY_AUTO_STAND_MS).unref();
}

// ---------------------------------------------------------------------------

export function registerSocketHandlers(io: AppServer): void {
  io.on('connection', (socket: AppSocket) => {
    socket.on('room:create', async (payload, callback) => {
      try {
        const gameMode: GameMode = payload.gameMode === 'BLACKJACK' ? 'BLACKJACK' : 'HOLDEM';
        const config: RoomConfig =
          gameMode === 'BLACKJACK'
            ? {
                gameMode: 'BLACKJACK',
                maxPlayers: Number(payload.maxPlayers),
                startingStack: Number(payload.startingStack),
                minBet: Number(payload.minBet),
                maxBet: Number(payload.maxBet),
                deckCount: Number(payload.deckCount),
              }
            : {
                gameMode: 'HOLDEM',
                maxPlayers: Number(payload.maxPlayers),
                startingStack: Number(payload.startingStack),
                smallBlind: Number(payload.smallBlind),
                bigBlind: Number(payload.bigBlind),
              };

        const result = await roomService.createRoom(payload.playerName, config);

        if (!result.ok || !result.data) {
          callback({ ok: false, error: result.error ?? 'Could not create room' });
          return;
        }

        const { room, player } = result.data;
        player.socketId = socket.id;
        socket.join(roomChannel(room.code));
        callback({ ok: true, roomCode: room.code, sessionToken: player.sessionToken, playerId: player.id });
        broadcastRoomState(io, room);
      } catch (err) {
        console.error('room:create failed', err);
        callback({ ok: false, error: 'Unexpected server error' });
      }
    });

    socket.on('room:join', async (payload, callback) => {
      try {
        const result = await roomService.joinRoom(payload.roomCode?.toUpperCase() ?? '', payload.playerName);
        if (!result.ok || !result.data) {
          callback({ ok: false, error: result.error ?? 'Could not join room' });
          return;
        }

        const { room, player } = result.data;
        player.socketId = socket.id;
        socket.join(roomChannel(room.code));
        callback({ ok: true, sessionToken: player.sessionToken, playerId: player.id });
        broadcastRoomState(io, room);
        // Joined a blackjack table that's already dealing: send everyone the updated table.
        if (room.status === 'PLAYING') broadcastGameStateForMode(io, room);
      } catch (err) {
        console.error('room:join failed', err);
        callback({ ok: false, error: 'Unexpected server error' });
      }
    });

    socket.on('room:rejoin', (payload, callback) => {
      const found = roomService.attachSocket(payload.sessionToken, socket.id);
      if (!found) {
        callback({ ok: false, error: 'Session not found' });
        return;
      }
      const { room, player, wasDisconnected } = found;
      socket.join(roomChannel(room.code));
      callback({ ok: true });
      broadcastRoomState(io, room);
      if (room.status === 'PLAYING') {
        broadcastGameStateForMode(io, room);
      }
      if (wasDisconnected) {
        io.to(roomChannel(room.code)).emit('player:reconnected', { playerId: player.id, name: player.name });
      }
    });

    socket.on('room:leave', async (payload) => {
      const found = roomService.leaveRoom(payload.sessionToken);
      if (!found) return;
      const { room, player } = found;
      socket.leave(roomChannel(room.code));
      if (room.players.length > 0) {
        broadcastRoomState(io, room);
        if (room.status === 'PLAYING') {
          if (room.config.gameMode === 'BLACKJACK') {
            io.to(roomChannel(room.code)).emit('player:left', { playerId: player.id, name: player.name });
            // Their leaving can complete the bets (deal now) or end the players' turns (dealer plays).
            await afterBlackjackChange(io, room);
          } else {
            io.to(roomChannel(room.code)).emit('player:disconnected', { playerId: player.id, name: player.name });
          }
        }
      }
    });

    socket.on('room:ready', (payload) => {
      const result = roomService.setReady(payload.sessionToken, payload.ready);
      if (result.ok && result.data) broadcastRoomState(io, result.data);
    });

    socket.on('room:add-bot', (payload, callback) => {
      const result = roomService.addBot(payload.sessionToken);
      if (!result.ok || !result.data) {
        callback({ ok: false, error: result.error ?? 'Could not add bot' });
        return;
      }
      callback({ ok: true });
      broadcastRoomState(io, result.data);
    });

    socket.on('room:remove-bot', (payload, callback) => {
      const result = roomService.removeBot(payload.sessionToken, payload.botPlayerId);
      if (!result.ok || !result.data) {
        callback({ ok: false, error: result.error ?? 'Could not remove bot' });
        return;
      }
      callback({ ok: true });
      broadcastRoomState(io, result.data);
    });

    socket.on('game:start', async (payload, callback) => {
      const result = await roomService.startGame(payload.sessionToken);
      if (!result.ok || !result.data) {
        callback({ ok: false, error: result.error ?? 'Could not start game' });
        return;
      }
      callback({ ok: true });
      broadcastRoomState(io, result.data);
      broadcastGameStateForMode(io, result.data);
      scheduleBotTurnIfNeeded(io, result.data);
      scheduleRunoutIfNeeded(io, result.data);
    });

    socket.on('game:action', async (payload, callback) => {
      const res = await processPokerAction(io, payload.sessionToken, payload.type, payload.amount);
      callback(res);
    });

    socket.on('game:next-hand', async (payload) => {
      const result = await roomService.nextHand(payload.sessionToken);
      if (!result.ok || !result.data) return;
      broadcastGameStateForMode(io, result.data);
      scheduleBotTurnIfNeeded(io, result.data);
      scheduleRunoutIfNeeded(io, result.data);
    });

    socket.on('blackjack:bet', async (payload, callback) => {
      const result = roomService.blackjackBet(payload.sessionToken, Number(payload.amount));
      if (!result.ok || !result.data) {
        callback({ ok: false, error: result.error ?? 'Invalid bet' });
        return;
      }
      callback({ ok: true });
      await afterBlackjackChange(io, result.data);
    });

    socket.on('blackjack:deal', async (payload, callback) => {
      const result = roomService.blackjackDeal(payload.sessionToken);
      if (!result.ok || !result.data) {
        callback({ ok: false, error: result.error ?? 'Could not deal' });
        return;
      }
      callback({ ok: true });
      await afterBlackjackChange(io, result.data);
    });

    socket.on('blackjack:action', async (payload, callback) => {
      const result = roomService.blackjackAction(payload.sessionToken, payload.action);
      if (!result.ok || !result.data) {
        callback({ ok: false, error: result.error ?? 'Invalid action' });
        return;
      }
      callback({ ok: true });
      await afterBlackjackChange(io, result.data);
    });

    socket.on('chat:message', (payload) => {
      const found = roomService.findBySession(payload.sessionToken);
      if (!found) return;
      const text = sanitizeChatText(payload.text);
      if (!text) return;

      io.to(roomChannel(found.room.code)).emit('chat:message', {
        playerId: found.player.id,
        playerName: found.player.name,
        text,
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', async () => {
      const found = roomService.markDisconnected(socket.id);
      if (!found) return;
      const { room, player } = found;
      broadcastRoomState(io, room);
      if (room.status === 'PLAYING') {
        io.to(roomChannel(room.code)).emit('player:disconnected', { playerId: player.id, name: player.name });
        // Dropping can complete the bets, or leave the table waiting on this player's hand (grace timer).
        if (room.config.gameMode === 'BLACKJACK') await afterBlackjackChange(io, room);
      }
    });
  });
}
