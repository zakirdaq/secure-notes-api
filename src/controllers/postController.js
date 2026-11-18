import mongoose from 'mongoose';
import { Post } from '../models/Post.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parsePagination } from '../utils/pagination.js';

/** POST /api/posts — create a post authored by the caller. */
export const createPost = asyncHandler(async (req, res) => {
  const post = await Post.create({
    author: req.user.id,
    title: req.body.title,
    body: req.body.body ?? ''
  });
  res.status(201).json({ data: post });
});

/**
 * GET /api/posts/user/:userId   (public — posts are visible to everyone)
 *
 * AGGREGATION SCENARIO 2 — all posts belonging to a particular user.
 *
 * Constraint satisfied: a single aggregation pipeline containing a `$lookup`
 * stage. The pipeline starts from `users`, so the author's profile and their
 * posts come back in one round trip.
 *
 * Index: `author_createdAt` { author: 1, createdAt: -1 } on `posts`.
 *   - `author` leads the index, so the $lookup's equality probe is an IXSCAN
 *     (without it, a $lookup degrades to a collection scan per input document).
 *   - `createdAt: -1` is the second key, so the sub-pipeline's newest-first
 *     $sort is served by the same index scan — no blocking SORT inside the join.
 *
 * Pagination note: the sub-pipeline fetches `limit + 1` documents and derives
 * `hasNextPage` from the extra row. That deliberately avoids a `$facet`/$count
 * inside the join, which would discard the index-ordered stream just to produce
 * a total the UI does not need.
 */
export const listPostsByUser = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.validatedQuery ?? req.query);
  const userId = new mongoose.Types.ObjectId(req.params.userId);

  const [result] = await User.aggregate([
    { $match: { _id: userId } },
    {
      $lookup: {
        from: 'posts',
        localField: '_id',
        foreignField: 'author',
        as: 'posts',
        pipeline: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit + 1 },
          { $project: { title: 1, body: 1, createdAt: 1, updatedAt: 1 } }
        ]
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        posts: 1
      }
    }
  ]);

  if (!result) throw ApiError.notFound('User not found.');

  const hasNextPage = result.posts.length > limit;
  const posts = hasNextPage ? result.posts.slice(0, limit) : result.posts;

  res.json({
    data: {
      author: { _id: result._id, name: result.name, email: result.email },
      posts
    },
    meta: { page, limit, hasNextPage, hasPrevPage: page > 1 }
  });
});
