import { Router } from 'express';
import {
  createNote,
  listNotes,
  getNote,
  updateNote,
  deleteNote
} from '../controllers/noteController.js';
import { requireAuth } from '../middleware/auth.js';
import { withDatabase } from '../middleware/withDatabase.js';
import { validate } from '../middleware/validate.js';
import {
  createNoteBody,
  updateNoteBody,
  listNotesQuery,
  idParam
} from '../validators/schemas.js';

const router = Router();

// Authenticate first, then open the connection — an unauthenticated request
// must never cost a database round trip.
router.use(requireAuth, withDatabase);

router
  .route('/')
  .get(validate({ query: listNotesQuery }), listNotes)
  .post(validate({ body: createNoteBody }), createNote);

router
  .route('/:id')
  .get(validate({ params: idParam }), getNote)
  .patch(validate({ params: idParam, body: updateNoteBody }), updateNote)
  .delete(validate({ params: idParam }), deleteNote);

export default router;
