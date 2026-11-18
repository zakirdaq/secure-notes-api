import { User, ROLES } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken } from '../utils/tokens.js';

/**
 * POST /api/auth/register
 * Self-service signup. The role is hard-coded to `user`: privilege escalation
 * must never be possible from a public request body.
 */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, interests = [] } = req.body;

  const passwordHash = await User.hashPassword(password);

  // Relies on the unique index `uniq_email`; the duplicate-key error is mapped
  // to a 409 by the error handler, so there is no racy pre-check read here.
  const user = await User.create({
    name,
    email,
    passwordHash,
    interests,
    role: ROLES.USER
  });

  res.status(201).json({
    data: { user: user.toJSON(), accessToken: signAccessToken(user) }
  });
});

/**
 * POST /api/auth/login
 * Index used: `uniq_email` (equality lookup).
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // `passwordHash` has `select: false`, so it must be requested explicitly.
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same generic message whether the email or the password was wrong, so the
  // endpoint cannot be used to enumerate registered accounts.
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password.');
  }

  res.json({ data: { user: user.toJSON(), accessToken: signAccessToken(user) } });
});

/**
 * GET /api/auth/me
 * Index used: `_id` (mandatory default index).
 */
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User no longer exists.');
  res.json({ data: user.toJSON() });
});
