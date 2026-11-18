import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 20_000 }
  },
  { timestamps: true, versionKey: false }
);

/* ---------------------------------------------------------------------------
 * INDEXES
 * ------------------------------------------------------------------------- */

// 1. Aggregation Scenario 2: `$lookup` from users into posts on
//    localField `_id` -> foreignField `author`.
//    A $lookup is an indexed equality probe per input document, so `author`
//    MUST lead this index or the join degrades to a collection scan per user.
//    `createdAt: -1` is appended so the $lookup sub-pipeline's newest-first
//    $sort + $limit is served by the same index scan (no blocking SORT inside
//    the join), making one index cover both the join and the ordering.
postSchema.index({ author: 1, createdAt: -1 }, { name: 'author_createdAt' });

// Deliberately NOT indexed:
//   - { createdAt: -1 } -> there is no "global posts feed" requirement; the one
//     public listing is scoped to a single author and is served by the index above.

export const Post = mongoose.models.Post ?? mongoose.model('Post', postSchema);
