import { connectToDatabase } from '../db/connect.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Ensures the (cached) Mongo connection is live before any handler runs.
 * Needed because on serverless there is no long-lived boot phase to connect in.
 */
export const withDatabase = asyncHandler(async (_req, _res, next) => {
  await connectToDatabase();
  next();
});
