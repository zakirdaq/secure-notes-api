import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { landingPage } from './landing.js';
import authRoutes from './routes/authRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import userRoutes from './routes/userRoutes.js';
import postRoutes from './routes/postRoutes.js';

export function createApp() {
  const app = express();

  // Vercel sits in front of the function; trust its forwarded headers so the
  // rate limiter sees real client IPs instead of the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // The frontend is a separate project on a different origin, so CORS is load
  // bearing here rather than a formality. The JWT travels in the Authorization
  // header (never a cookie), so `credentials` stays off and no SameSite or CSRF
  // handling is needed.
  app.use(
    cors({
      origin: env.corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400
    })
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', env: env.nodeEnv, timestamp: new Date().toISOString() });
  });

  // This is an API with no frontend of its own, so the root would otherwise be
  // a dead end. Anyone opening the bare URL — a reviewer, most likely — gets a
  // list of the endpoints instead of a 404 or a platform error page.
  //
  // The page lives at /api/docs because on Vercel a request to `/` never
  // reaches this function; the root redirects here at the edge instead (see
  // vercel.json). Locally `/` serves it directly.
  const sendLanding = (_req, res) => {
    res.type('html').send(landingPage);
  };

  app.get('/api/docs', sendLanding);
  app.get('/', sendLanding);

  // Note: the database connection is opened per-router (see `withDatabase`),
  // deliberately NOT here. Mounting it on the whole /api prefix would make an
  // unknown path or a missing-token request connect to Mongo before being
  // rejected — turning a clean 404/401 into a 500 whenever the DB is down.
  app.use('/api/auth', authRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/posts', postRoutes);

  // Not scoped to /api, so a stray path returns the same JSON 404 shape as the
  // rest of the API rather than Express's default HTML page.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
