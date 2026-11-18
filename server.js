/**
 * Local / long-lived-process entrypoint.
 * On Vercel the app is served by `api/index.js` instead.
 *
 * This project is an API only — the frontend is the separate `secure-notes-web`
 * project and is served by its own dev server, so nothing static is mounted here.
 */
import { createApp } from './src/app.js';
import { env } from './src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './src/db/connect.js';

const app = createApp();

const server = app.listen(env.port, async () => {
  console.log(`API listening on http://localhost:${env.port}/api`);
  console.log(`Health check      http://localhost:${env.port}/api/health`);
  console.log(`CORS origin       ${env.corsOrigin}`);
  try {
    const conn = await connectToDatabase();
    console.log(`MongoDB connected: ${conn.name}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down.`);
  server.close(async () => {
    await disconnectFromDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
