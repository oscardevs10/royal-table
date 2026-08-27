import express, { Express } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/error-handler';

export function createApp(): Express {
  const app = express();

  // Reflects the request's own origin instead of a single fixed value: the host opens
  // http://localhost:4200 while a friend joins from http://<lan-ip>:4200 - both need to
  // be accepted by the same backend. There's no cookie-based auth to protect against CSRF
  // here (session tokens travel explicitly in each socket payload), so this is safe.
  app.use(cors({ origin: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.use(errorHandler);

  return app;
}
