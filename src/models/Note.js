import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 20_000 }
  },
  { timestamps: true, versionKey: false }
);

/* ---------------------------------------------------------------------------
 * INDEXES
 * ------------------------------------------------------------------------- */

// 1. The hot path: "a user listing their own notes", paginated and newest-first.
//    Compound ESR layout — Equality on `owner`, then Sort on `createdAt: -1` —
//    so a single IXSCAN satisfies both the filter and the sort with no in-memory
//    SORT stage, and skip/limit walk the index directly.
//    This same index also serves the admin's `GET /api/notes?owner=<id>` filter
//    and the ownership check on a single note.
noteSchema.index({ owner: 1, createdAt: -1 }, { name: 'owner_createdAt' });

// Deliberately NOT indexed:
//   - { createdAt: -1 } for the admin "all notes" feed -> that endpoint sorts by
//     `_id: -1` instead. ObjectIds are monotonically increasing, so `_id` descending
//     is equivalent to newest-first, and the mandatory _id index already serves it.
//     Adding a second whole-collection sort index would be pure write overhead.
//   - { title: 'text' } -> no search requirement in the spec.

export const Note = mongoose.models.Note ?? mongoose.model('Note', noteSchema);
