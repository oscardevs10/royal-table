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

describe('Realtime Conquian socket flow', () => {
  it('two players play a hand without ever seeing each other\'s cards', async () => {
    const alice = connect();
    const bob = connect();
    await Promise.all([waitFor(alice, 'connect'), waitFor(bob, 'connect')]);

    const createRes: any = await emitAck(alice, 'room:create', {
      playerName: 'Alice',
      gameMode: 'CONQUIAN',
      maxPlayers: 2,
      startingStack: 500,
      ante: 10,
    });
    expect(createRes.ok).toBe(true);

    const joinRes: any = await emitAck(bob, 'room:join', { roomCode: createRes.roomCode, playerName: 'Bob' });
    expect(joinRes.ok).toBe(true);

    const aliceStates: any[] = [];
    const bobStates: any[] = [];
    alice.on('conquian:state', (s) => aliceStates.push(s));
    bob.on('conquian:state', (s) => bobStates.push(s));

    const startRes: any = await emitAck(alice, 'game:start', { sessionToken: createRes.sessionToken });
    expect(startRes.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 150));

    const lastAliceState = aliceStates.at(-1);
    expect(lastAliceState.myHand).toHaveLength(10);

    const bobAsSeenByAlice = lastAliceState.players.find((p: any) => p.name === 'Bob');
    expect(bobAsSeenByAlice.handCount).toBe(10);
    expect(bobAsSeenByAlice.hand).toBeUndefined();
    expect(JSON.stringify(bobAsSeenByAlice)).not.toContain('rank');

    // Whoever is first to act draws from the stock, then discards to pass the turn.
    const actingIsAlice = lastAliceState.players.find((p: any) => p.seatIndex === lastAliceState.currentPlayerPosition)?.id === lastAliceState.myPlayerId;
    const actor = actingIsAlice ? alice : bob;
    const actorSession = actingIsAlice ? createRes.sessionToken : joinRes.sessionToken;

    const drawRes: any = await emitAck(actor, 'conquian:draw', { sessionToken: actorSession, source: 'STOCK' });
    expect(drawRes.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));

    const actorStates = actingIsAlice ? aliceStates : bobStates;
    const handAfterDraw = actorStates.at(-1).myHand;
    expect(handAfterDraw).toHaveLength(11);

    const discardRes: any = await emitAck(actor, 'conquian:discard', { sessionToken: actorSession, card: handAfterDraw[0] });
    expect(discardRes.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 100));

    const stateAfterDiscard = actorStates.at(-1);
    expect(stateAfterDiscard.discardTopCard).toEqual(handAfterDraw[0]);
    expect(stateAfterDiscard.currentPlayerPosition).not.toBe(lastAliceState.currentPlayerPosition);

    alice.close();
    bob.close();
  }, 20000);
});
