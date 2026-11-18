/**
 * Vercel serverless entrypoint.
 *
 * `vercel.json` rewrites /api/:path* here, and the Express app is exported as the
 * request handler. The app object is built once per warm instance, and the Mongo
 * connection is cached on globalThis (see src/db/connect.js).
 */
import { createApp } from '../src/app.js';

export default createApp();
