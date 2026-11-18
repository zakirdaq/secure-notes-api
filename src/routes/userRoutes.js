import { Router } from 'express';
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  usersGroupedByInterests
} from '../controllers/userController.js';
import { requireAuth, requireAdmin, isAdmin } from '../middleware/auth.js';
import { withDatabase } from '../middleware/withDatabase.js';
import { validate } from '../middleware/validate.js';
import { ApiError } from '../utils/ApiError.js';
import {
  createUserBody,
  updateUserBody,
  listUsersQuery,
  idParam
} from '../validators/schemas.js';

const router = Router();

router.use(requireAuth, withDatabase);

/**
 * Declared BEFORE `/:id` — otherwise Express would match
 * "grouped-by-interests" as an :id param and fail ObjectId validation.
 */
router.get(
  '/grouped-by-interests',
  requireAdmin,
  validate({ query: listUsersQuery }),
  usersGroupedByInterests
);

router
  .route('/')
  .get(requireAdmin, validate({ query: listUsersQuery }), listUsers)
  .post(requireAdmin, validate({ body: createUserBody }), createUser);

/** A user may read their own profile; everything else is admin-only. */
const adminOrSelf = (req, _res, next) => {
  if (isAdmin(req) || req.params.id === req.user.id) return next();
  return next(ApiError.forbidden());
};

router
  .route('/:id')
  .get(validate({ params: idParam }), adminOrSelf, getUser)
  .patch(requireAdmin, validate({ params: idParam, body: updateUserBody }), updateUser)
  .delete(requireAdmin, validate({ params: idParam }), deleteUser);

export default router;
