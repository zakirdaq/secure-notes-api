import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ROLES } from '../models/User.js';

/**
 * Verifies the Bearer token and attaches `req.user = { id, role, email }`.
 *
 * The role is read from the signed token rather than re-fetched from Mongo on
 * every request: that keeps authenticated reads at zero extra round trips.
 * Trade-off (documented in the README): a role change only takes effect once the
 * current token expires, which is why JWT_EXPIRES_IN is kept short.
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';

  if (!header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing Bearer token.'));
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError' ? 'Token has expired.' : 'Invalid token.';
    return next(ApiError.unauthorized(message));
  }
}

/** Route guard: `requireRole(ROLES.ADMIN)`. Must run after requireAuth. */
export function requireRole(...allowed) {
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) return next(ApiError.forbidden());
    return next();
  };
}

export const requireAdmin = requireRole(ROLES.ADMIN);

export const isAdmin = (req) => req.user?.role === ROLES.ADMIN;
