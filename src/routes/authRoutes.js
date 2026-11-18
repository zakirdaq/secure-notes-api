import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { withDatabase } from '../middleware/withDatabase.js';
import { validate } from '../middleware/validate.js';
import { registerBody, loginBody } from '../validators/schemas.js';

const router = Router();

// Credential endpoints are the obvious brute-force target, so they get their own
// limiter. (In-memory store: per serverless instance — fine for this exercise,
// but a shared store such as Redis would be required for real multi-instance use.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Try again later.' } }
});

// `withDatabase` sits after the limiter and validation so a throttled or
// malformed request is rejected without a database round trip.
router.post('/register', authLimiter, validate({ body: registerBody }), withDatabase, register);
router.post('/login', authLimiter, validate({ body: loginBody }), withDatabase, login);
router.get('/me', requireAuth, withDatabase, me);

export default router;
