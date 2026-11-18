import { Note } from '../models/Note.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination, paginated } from '../utils/pagination.js';
import { isAdmin } from '../middleware/auth.js';

/** POST /api/notes — create a note owned by the caller. */
export const createNote = asyncHandler(async (req, res) => {
  const note = await Note.create({
    owner: req.user.id,
    title: req.body.title,
    body: req.body.body ?? ''
  });
  res.status(201).json({ data: note });
});

/**
 * GET /api/notes
 *   - user : always scoped to their own notes.
 *   - admin: every note, or one owner's notes via `?owner=<id>`.
 *
 * Index usage:
 *   - scoped  -> `owner_createdAt` { owner: 1, createdAt: -1 }
 *                Equality on owner + index-ordered sort => IXSCAN, no SORT stage.
 *   - all     -> default `_id` index, sorted `_id: -1`.
 *                ObjectIds increase monotonically, so this is newest-first
 *                without paying for a second index on createdAt.
 */
export const listNotes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.validatedQuery ?? req.query);

  const ownerFilter = isAdmin(req) ? req.validatedQuery?.owner : req.user.id;

  const filter = ownerFilter ? { owner: ownerFilter } : {};
  const sort = ownerFilter ? { createdAt: -1 } : { _id: -1 };

  const [data, total] = await Promise.all([
    Note.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Note.countDocuments(filter)
  ]);

  res.json(paginated({ data, page, limit, total }));
});

/**
 * GET /api/notes/:id
 * Index used: `_id`. A regular user's ownership check is applied in the same
 * query (`{ _id, owner }`) so a foreign note returns 404 rather than leaking
 * that it exists.
 */
export const getNote = asyncHandler(async (req, res) => {
  const filter = isAdmin(req)
    ? { _id: req.params.id }
    : { _id: req.params.id, owner: req.user.id };

  const note = await Note.findOne(filter).lean();
  if (!note) throw ApiError.notFound('Note not found.');

  res.json({ data: note });
});

/** PATCH /api/notes/:id — owner (or admin) only. */
export const updateNote = asyncHandler(async (req, res) => {
  const filter = isAdmin(req)
    ? { _id: req.params.id }
    : { _id: req.params.id, owner: req.user.id };

  const note = await Note.findOneAndUpdate(filter, { $set: req.body }, {
    new: true,
    runValidators: true
  }).lean();

  if (!note) throw ApiError.notFound('Note not found.');
  res.json({ data: note });
});

/** DELETE /api/notes/:id — owner (or admin) only. */
export const deleteNote = asyncHandler(async (req, res) => {
  const filter = isAdmin(req)
    ? { _id: req.params.id }
    : { _id: req.params.id, owner: req.user.id };

  const note = await Note.findOneAndDelete(filter).lean();
  if (!note) throw ApiError.notFound('Note not found.');

  res.status(204).send();
});
