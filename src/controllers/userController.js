import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, paginated, buildMeta } from '../utils/pagination.js';

/**
 * GET /api/users  (admin)
 * Index usage:
 *   - with `?interest=chess` -> `interests_multikey`, equality IXSCAN.
 *   - without a filter       -> default `_id` index, sorted `_id: -1`
 *                               (newest-first without a second sort index).
 */
export const listUsers = asyncHandler(async (req, res) => {
  const query = req.validatedQuery ?? req.query;
  const { page, limit, skip } = parsePagination(query);

  const filter = query.interest ? { interests: query.interest } : {};

  const [data, total] = await Promise.all([
    User.find(filter).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);

  res.json(paginated({ data, page, limit, total }));
});

/**
 * GET /api/users/:id  (admin, or the user themselves)
 * Index used: `_id`.
 */
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound('User not found.');
  res.json({ data: user });
});

/** POST /api/users  (admin) — may create admins, unlike public registration. */
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, interests = [] } = req.body;

  const user = await User.create({
    name,
    email,
    role,
    interests,
    passwordHash: await User.hashPassword(password)
  });

  res.status(201).json({ data: user.toJSON() });
});

/** PATCH /api/users/:id  (admin) */
export const updateUser = asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  const update = { ...rest };

  if (password) update.passwordHash = await User.hashPassword(password);

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!user) throw ApiError.notFound('User not found.');
  res.json({ data: user });
});

/** DELETE /api/users/:id  (admin) */
export const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw ApiError.badRequest('You cannot delete your own account.');
  }

  const user = await User.findByIdAndDelete(req.params.id).lean();
  if (!user) throw ApiError.notFound('User not found.');

  res.status(204).send();
});

/**
 * GET /api/users/grouped-by-interests  (admin)
 *
 * AGGREGATION SCENARIO 1 — users grouped by interest.
 *
 * Constraint satisfied: exactly ONE aggregate call, no find/count alongside it.
 * Pagination and the total group count are produced inside the same pipeline
 * with `$facet`, which is why no companion `countDocuments()` is needed.
 *
 * Index: `interests_multikey` { interests: 1 }.
 *   - `?interest=chess` becomes an equality predicate -> pure IXSCAN.
 *   - unfiltered, `$match: { interests: { $exists: true } }` keeps the access
 *     path on the multikey index instead of a COLLSCAN. A complete grouping must
 *     by definition visit every interest entry, so an index scan over exactly
 *     those entries is the best available plan.
 */
export const usersGroupedByInterests = asyncHandler(async (req, res) => {
  const query = req.validatedQuery ?? req.query;
  const { page, limit, skip } = parsePagination(query);

  const match = query.interest
    ? { interests: query.interest }
    : { interests: { $exists: true } };

  const [result] = await User.aggregate([
    { $match: match },
    { $unwind: '$interests' },
    ...(query.interest ? [{ $match: { interests: query.interest } }] : []),
    {
      $group: {
        _id: '$interests',
        userCount: { $sum: 1 },
        users: { $push: { _id: '$_id', name: '$name', email: '$email' } }
      }
    },
    { $sort: { userCount: -1, _id: 1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 0, interest: '$_id', userCount: 1, users: 1 } }
        ],
        totalGroups: [{ $count: 'value' }]
      }
    },
    {
      $project: {
        data: 1,
        total: { $ifNull: [{ $arrayElemAt: ['$totalGroups.value', 0] }, 0] }
      }
    }
  ]);

  const data = result?.data ?? [];
  const total = result?.total ?? 0;

  res.json({ data, meta: buildMeta({ page, limit, total }) });
});
