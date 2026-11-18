import { ApiError } from '../utils/ApiError.js';

/**
 * Validates `req.body` / `req.query` / `req.params` against zod schemas and
 * replaces them with the parsed (coerced, stripped) result.
 */
export function validate({ body, query, params }) {
  return function validator(req, _res, next) {
    try {
      if (params) req.params = params.parse(req.params);
      if (query) req.validatedQuery = query.parse(req.query);
      if (body) req.body = body.parse(req.body);
      return next();
    } catch (error) {
      if (error?.issues) {
        const details = error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message
        }));
        return next(ApiError.badRequest('Validation failed.', details));
      }
      return next(error);
    }
  };
}
