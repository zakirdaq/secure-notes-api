import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

/**
 * Parses `?page=1&limit=20` into skip/limit, clamped so a client cannot ask for
 * an unbounded page and turn a list endpoint into a full-collection read.
 */
export function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number.parseInt(query.page, 10);
  const limit = query.limit === undefined ? env.defaultPageSize : Number.parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) {
    throw ApiError.badRequest('`page` must be an integer >= 1.');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw ApiError.badRequest('`limit` must be an integer >= 1.');
  }
  if (limit > env.maxPageSize) {
    throw ApiError.badRequest(`\`limit\` must not exceed ${env.maxPageSize}.`);
  }

  return { page, limit, skip: (page - 1) * limit };
}

export function buildMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1
  };
}

export function paginated({ data, page, limit, total }) {
  return { data, meta: buildMeta({ page, limit, total }) };
}
