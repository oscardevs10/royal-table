import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app';
import { registerSocketHandlers } from '../../src/socket/socket-handler';

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

describe('Realtime socket flow (server-authoritative)', () => {
  it('two players play a full hand end-to-end without leaking hole cards', async () => {
    const alice = connect();
    const bob = connect();
    await Promise.all([waitFor(alice, 'connect'), waitFor(bob, 'connect')]);

    const createRes: any = await emitAck(alice, 'room:create', {
      playerName: 'Alice',
      maxPlayers: 2,
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    expect(createRes.ok).toBe(true);

    const joinRes: any = await emitAck(bob, 'room:join', { roomCode: createRes.roomCode, playerName: 'Bob' });
    expect(joinRes.ok).toBe(true);

    const aliceStates: any[] = [];
    const bobStates: any[] = [];
    alice.on('game:state', (s) => aliceStates.push(s));
    bob.on('game:state', (s) => bobStates.push(s));

    let showdown: any = null;
    alice.on('game:showdown', (s) => (showdown = s));

    const startRes: any = await emitAck(alice, 'game:start', { sessionToken: createRes.sessionToken });
    expect(startRes.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 150));

    const bobAsSeenByAlice = aliceStates.at(-1).players.find((p: any) => p.name === 'Bob');
    expect(bobAsSeenByAlice.holeCards).toBeUndefined();
    expect(bobAsSeenByAlice.revealedHoleCards).toBeUndefined();
    expect(aliceStates.at(-1).myHoleCards).toHaveLength(2);

    let guard = 0;
    while (!showdown && guard < 40) {
      const stateAlice = aliceStates.at(-1);
      const stateBob = bobStates.at(-1);
      const actingIsAlice = stateAlice.players.find((p: any) => p.seatIndex === stateAlice.currentPlayerPosition)?.id === stateAlice.myPlayerId;
      const actor = actingIsAlice ? alice : bob;
      const session = actingIsAlice ? createRes.sessionToken : joinRes.sessionToken;
      const myState = actingIsAlice ? stateAlice : stateBob;
      const action = myState.myAvailableActions.find((a: any) => a.type === 'CHECK') ?? myState.myAvailableActions.find((a: any) => a.type === 'CALL');
      const res: any = await emitAck(actor, 'game:action', { sessionToken: session, type: action.type, amount: action.maxAmount });
      expect(res.ok).toBe(true);
      await new Promise((r) => setTimeout(r, 60));
      guard++;
    }

    expect(showdown).not.toBeNull();
    expect(showdown.winners.length).toBeGreaterThan(0);

    const finalState = aliceStates.at(-1);
    const totalChips = finalState.players.reduce((s: number, p: any) => s + p.chips, 0);
    expect(totalChips).toBe(2000);

    alice.close();
    bob.close();
  }, 20000);

  it('lets a disconnected player rejoin and resume seeing their own hole cards', async () => {
    const alice = connect();
    const bob = connect();
    await Promise.all([waitFor(alice, 'connect'), waitFor(bob, 'connect')]);

    const createRes: any = await emitAck(alice, 'room:create', {
      playerName: 'Alice',
      maxPlayers: 2,
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
    });
    const joinRes: any = await emitAck(bob, 'room:join', { roomCode: createRes.roomCode, playerName: 'Bob' });

    const bobDisconnectedEvent = waitFor(alice, 'player:disconnected');
    await emitAck(alice, 'game:start', { sessionToken: createRes.sessionToken });
    await new Promise((r) => setTimeout(r, 100));

    bob.close();
    await bobDisconnectedEvent;

    const bobReconnect = connect();
    await waitFor(bobReconnect, 'connect');

    const rejoinRes: any = await emitAck(bobReconnect, 'room:rejoin', { sessionToken: joinRes.sessionToken });
    expect(rejoinRes.ok).toBe(true);

    const bobState: any = await waitFor(bobReconnect, 'game:state');
    expect(bobState.myHoleCards).toHaveLength(2);
    expect(bobState.myPlayerId).toBe(joinRes.playerId);

    alice.close();
    bobReconnect.close();
  }, 20000);
});
