import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin' });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },

    // NOTE: no `index: true` / `unique: true` on the field definition on purpose —
    // every index in this project is declared with schema.index() below so the
    // whole indexing strategy is readable in one place.
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },

    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },

    interests: {
      type: [String],
      default: [],
      validate: {
        validator: (v) => v.length <= 30,
        message: 'A user may have at most 30 interests.'
      }
    }
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
      }
    }
  }
);

/* ---------------------------------------------------------------------------
 * INDEXES  (see README "Indexing strategy" for the full justification)
 * ------------------------------------------------------------------------- */

// 1. Login (`findOne({ email })`) + enforces account uniqueness.
//    Equality lookup on a high-cardinality field — the single most frequent
//    read in the whole app, so it must be indexed.
userSchema.index({ email: 1 }, { unique: true, name: 'uniq_email' });

// 2. Aggregation Scenario 1 (group users by interests) and the
//    `GET /api/users?interest=chess` filter. Multikey index over the array,
//    so the pipeline seeds from an IXSCAN instead of a COLLSCAN.
userSchema.index({ interests: 1 }, { name: 'interests_multikey' });

// Deliberately NOT indexed:
//   - { role: 1 }        -> low cardinality (2 values); a filter on it would scan
//                           ~half the collection anyway, so an index earns nothing.
//   - { createdAt: -1 }  -> the admin user list sorts by `_id: -1`, which is already
//                           served by the mandatory _id index and is equivalent to
//                           insertion order. No second index needed.
//   - { name: 1 }        -> no query sorts or filters by name.

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptRounds);
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
