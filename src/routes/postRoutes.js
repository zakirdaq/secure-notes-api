import { Router } from 'express';
import { createPost, listPostsByUser } from '../controllers/postController.js';
import { requireAuth } from '../middleware/auth.js';
import { withDatabase } from '../middleware/withDatabase.js';
import { validate } from '../middleware/validate.js';
import { createPostBody, paginationQuery, userIdParam } from '../validators/schemas.js';

const router = Router();

// Public: the spec states posts "are visible to everyone", so no auth here.
// Params are validated before the connection is opened, so a malformed id is
// rejected without touching the database.
router.get(
  '/user/:userId',
  validate({ params: userIdParam, query: paginationQuery }),
  withDatabase,
  listPostsByUser
);

// Writing a post still requires an authenticated author.
router.post(
  '/',
  requireAuth,
  validate({ body: createPostBody }),
  withDatabase,
  createPost
);

export default router;
