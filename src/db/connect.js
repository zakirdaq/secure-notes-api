import mongoose from 'mongoose';
import { env, isProd } from '../config/env.js';

/**
 * Serverless-safe connection handling.
 *
 * On Vercel every cold start runs this module afresh, but the Node process can be
 * reused across many invocations. Caching the connection promise on `globalThis`
 * means one warm instance opens exactly one connection instead of one per request,
 * which is what otherwise exhausts an Atlas M0 connection limit.
 */
const globalForMongoose = globalThis;

if (!globalForMongoose.__mongooseCache) {
  globalForMongoose.__mongooseCache = { conn: null, promise: null };
}

const cache = globalForMongoose.__mongooseCache;

// Fail fast instead of buffering queries forever when the cluster is unreachable.
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

// `autoIndex` is intentionally off in production: index builds belong in a
// deliberate migration/sync step (`npm run indexes`), not in request handling.
mongoose.set('autoIndex', !isProd);

export async function connectToDatabase() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.mongoUri, {
        dbName: env.dbName,
        maxPoolSize: 10,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10_000,
        socketTimeoutMS: 45_000
      })
      .then((m) => m.connection);
  }

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    // Clear the cached rejection so the next request can retry.
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}

export async function disconnectFromDatabase() {
  if (cache.conn) {
    await mongoose.disconnect();
    cache.conn = null;
    cache.promise = null;
  }
}
