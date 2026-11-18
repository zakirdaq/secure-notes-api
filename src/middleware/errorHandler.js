import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No route matches ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature.
export function errorHandler(error, _req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (error instanceof ApiError) {
    status = error.status;
    message = error.message;
    details = error.details;
  } else if (error instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed.';
    details = Object.values(error.errors).map((e) => ({
      path: e.path,
      message: e.message
    }));
  } else if (error instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for \`${error.path}\`.`;
  } else if (
    error?.name === 'MongooseServerSelectionError' ||
    error?.name === 'MongoNetworkError'
  ) {
    // The cluster is unreachable — that is not the client's fault, and 503 tells
    // callers (and uptime checks) it is worth retrying.
    status = 503;
    message = 'Database unavailable. Please try again shortly.';
  } else if (error?.code === 11000) {
    status = 409;
    const field = Object.keys(error.keyPattern ?? {}).join(', ') || 'field';
    message = `A record with that ${field} already exists.`;
  }

  if (status === 503) {
    console.error('[error] database unreachable:', error.message);
  } else if (status >= 500) {
    console.error('[error]', error);
  }

  res.status(status).json({
    error: {
      message,
      ...(details ? { details } : {}),
      ...(isProd || status >= 500 ? {} : { stack: error.stack?.split('\n').slice(0, 4) })
    }
  });
}
