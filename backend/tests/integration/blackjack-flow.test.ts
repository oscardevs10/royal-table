import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { registerSocketHandlers } from '../../src/socket/socket-handler';
import { roomService } from '../../src/modules/rooms/room.service';

let httpServer: HttpServer;
let io: Server;
let url: string;

beforeAll(async () => {
  const app = createApp();
  httpServer = createServer(app);
  io = new Server(httpServer, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  url = `http://localhost:${port}`;
});

afterAll(async () => {
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(): ClientSocket {
  return ioClient(url, { transports: ['websocket'], forceNew: true });
}

function waitFor<T = any>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

function emitAck<T = any>(socket: ClientSocket, event: string, payload: any): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/** Resolves with the first `blackjack:state` (already received or upcoming) that matches. */
function waitForState(socket: ClientSocket, states: any[], predicate: (s: any) => boolean, timeoutMs = 12000): Promise<any> {
  const existing = states.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for blackjack state')), timeoutMs);
    const handler = (s: any) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      socket.off('blackjack:state', handler);
      resolve(s);
    };
    socket.on('blackjack:state', handler);
  });
}

const BLACKJACK_TABLE = { gameMode: 'BLACKJACK', startingStack: 1000, minBet: 10, maxBet: 500 };

describe('Realtime blackjack socket flow', () => {
  it('a solo player plays a full round against the dealer and betting reopens on its own', async () => {
    const solo = connect();
    await waitFor(solo, 'connect');
    const states: any[] = [];
    solo.on('blackjack:state', (s) => states.push(s));

    const createRes: any = await emitAck(solo, 'room:create', { ...BLACKJACK_TABLE, playerName: 'Solo', maxPlayers: 1, deckCount: 2 });
    expect(createRes.ok).toBe(true);
    const session = createRes.sessionToken;

    // A single player can start: the dealer is the opponent.
    expect((await emitAck<any>(solo, 'game:start', { sessionToken: session })).ok).toBe(true);
    const betting = await waitForState(solo, states, (s) => s.phase === 'BETTING');
    expect(betting.canPlaceBet).toBe(true);
    expect(betting.shoe).toMatchObject({ deckCount: 2, totalCards: 104, remaining: 104 });

    expect((await emitAck<any>(solo, 'blackjack:bet', { sessionToken: session, amount: 5 })).ok).toBe(false);
    expect((await emitAck<any>(solo, 'blackjack:bet', { sessionToken: session, amount: 100 })).ok).toBe(true);

    const dealt = await waitForState(solo, states, (s) => s.roundNumber === 1);
    expect(dealt.hands).toHaveLength(1);
    expect(dealt.hands[0].cards).toHaveLength(2);
    if (dealt.phase === 'PLAYER_TURNS') {
      // Hole card is never on the wire until the dealer's turn.
      expect(dealt.dealer.cards).toHaveLength(1);
      expect(dealt.dealer.hiddenCardCount).toBe(1);
      expect((await emitAck<any>(solo, 'blackjack:action', { sessionToken: session, action: 'STAND' })).ok).toBe(true);
    }

    const settled = await waitForState(solo, states, (s) => s.phase === 'ROUND_OVER');
    expect(settled.dealer.hiddenCardCount).toBe(0);
    expect(settled.lastRoundResult.players[0].playerName).toBe('Solo');
    const me = settled.players[0];
    expect(me.chips).toBe(1000 + settled.lastRoundResult.players[0].net);

    const nextBetting = await waitForState(solo, states, (s) => s.phase === 'BETTING' && s.roundNumber === 1);
    expect(nextBetting.hands).toHaveLength(0);
    expect(nextBetting.lastRoundResult).toBeNull();

    solo.close();
  }, 25000);

  it('friends join a running table with the room code and are dealt in from the next round', async () => {
    const host = connect();
    const friend = connect();
    await Promise.all([waitFor(host, 'connect'), waitFor(friend, 'connect')]);
    const hostStates: any[] = [];
    const friendStates: any[] = [];
    host.on('blackjack:state', (s) => hostStates.push(s));
    friend.on('blackjack:state', (s) => friendStates.push(s));

    const createRes: any = await emitAck(host, 'room:create', { ...BLACKJACK_TABLE, playerName: 'Host', maxPlayers: 4, deckCount: 4 });
    expect(createRes.ok).toBe(true);
    expect((await emitAck<any>(host, 'game:start', { sessionToken: createRes.sessionToken })).ok).toBe(true);

    // Joining after the game already started is allowed for blackjack.
    const joinRes: any = await emitAck(friend, 'room:join', { roomCode: createRes.roomCode, playerName: 'Friend' });
    expect(joinRes.ok).toBe(true);

    const friendView = await waitForState(friend, friendStates, (s) => s.players.length === 2);
    expect(friendView.phase).toBe('BETTING');
    expect(friendView.canForceDeal).toBe(false);

    // Host bets first: the table waits for the friend.
    await emitAck(host, 'blackjack:bet', { sessionToken: createRes.sessionToken, amount: 50 });
    const waiting = await waitForState(host, hostStates, (s) => s.players.some((p: any) => p.pendingBet === 50));
    expect(waiting.phase).toBe('BETTING');
    expect(waiting.canForceDeal).toBe(true);

    await emitAck(friend, 'blackjack:bet', { sessionToken: joinRes.sessionToken, amount: 20 });
    const dealt = await waitForState(friend, friendStates, (s) => s.roundNumber === 1);
    expect(dealt.hands.map((h: any) => h.playerName)).toEqual(['Host', 'Friend']);

    host.close();
    friend.close();
  }, 25000);

  it('"play again" reopens the same room with the same players back at the starting stack', async () => {
    const host = connect();
    const friend = connect();
    await Promise.all([waitFor(host, 'connect'), waitFor(friend, 'connect')]);
    const hostStates: any[] = [];
    host.on('blackjack:state', (s) => hostStates.push(s));

    const createRes: any = await emitAck(host, 'room:create', { ...BLACKJACK_TABLE, playerName: 'Host', maxPlayers: 3, deckCount: 2 });
    const joinRes: any = await emitAck(friend, 'room:join', { roomCode: createRes.roomCode, playerName: 'Friend' });
    await emitAck(host, 'game:start', { sessionToken: createRes.sessionToken });

    // Can't restart a game that's still going.
    expect((await emitAck<any>(host, 'room:restart', { sessionToken: createRes.sessionToken })).ok).toBe(false);

    // Simulate the house cleaning everyone out.
    const room = roomService.findByCode(createRes.roomCode)!;
    for (const p of room.players) {
      p.chips = 0;
      p.eliminated = true;
    }
    room.status = 'FINISHED';

    expect((await emitAck<any>(friend, 'room:restart', { sessionToken: joinRes.sessionToken })).ok).toBe(false);

    const lobbyUpdate = waitFor<any>(friend, 'room:update');
    expect((await emitAck<any>(host, 'room:restart', { sessionToken: createRes.sessionToken })).ok).toBe(true);
    const lobby = await lobbyUpdate;
    expect(lobby).toMatchObject({ code: createRes.roomCode, status: 'WAITING' });
    expect(lobby.players.map((p: any) => p.name)).toEqual(['Host', 'Friend']);

    hostStates.length = 0;
    expect((await emitAck<any>(host, 'game:start', { sessionToken: createRes.sessionToken })).ok).toBe(true);
    const fresh = await waitForState(host, hostStates, (s) => s.phase === 'BETTING');
    expect(fresh.roundNumber).toBe(0);
    expect(fresh.players.map((p: any) => [p.name, p.chips, p.status])).toEqual([
      ['Host', 1000, 'ACTIVE'],
      ['Friend', 1000, 'ACTIVE'],
    ]);

    host.close();
    friend.close();
  }, 20000);

  it('rejects a shoe too small for the table size', async () => {
    const socket = connect();
    await waitFor(socket, 'connect');
    const res: any = await emitAck(socket, 'room:create', { ...BLACKJACK_TABLE, playerName: 'X', maxPlayers: 7, deckCount: 1 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/at least 4 decks/);
    socket.close();
  });
});
