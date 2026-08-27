import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';
import { registerSocketHandlers } from './socket/socket-handler';

const PORT = Number(process.env.PORT ?? 3001);

const app = createApp();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    // Reflect the request origin - see the comment in app.ts for why this is safe here.
    origin: true,
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Royal Table backend listening on port ${PORT} (all interfaces)`);
});
