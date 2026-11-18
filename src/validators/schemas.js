import { z } from 'zod';
import mongoose from 'mongoose';
import { ROLES } from '../models/User.js';

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: 'Must be a valid ObjectId.' });

export const idParam = z.object({ id: objectId });
export const userIdParam = z.object({ userId: objectId });

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.');

const interests = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(30)
  .optional();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional()
});

/* ----------------------------- auth ----------------------------- */

export const registerBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password,
  interests
});

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1)
});

/* ----------------------------- notes ----------------------------- */

export const createNoteBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).optional()
});

export const updateNoteBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(20_000).optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' });

export const listNotesQuery = paginationQuery.extend({
  // Admin-only filter; ignored for regular users (they are always scoped to self).
  owner: objectId.optional()
});

/* ----------------------------- users ----------------------------- */

export const createUserBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password,
  role: z.enum([ROLES.USER, ROLES.ADMIN]).optional(),
  interests
});

export const updateUserBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    password: password.optional(),
    role: z.enum([ROLES.USER, ROLES.ADMIN]).optional(),
    interests
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update.' });

export const listUsersQuery = paginationQuery.extend({
  interest: z.string().trim().toLowerCase().min(1).max(40).optional()
});

/* ----------------------------- posts ----------------------------- */

export const createPostBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).optional()
});
