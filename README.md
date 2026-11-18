# Secure Note-Taking Application

Backend REST API. Node.js / Express / MongoDB (Mongoose), JWT auth, role-based
access control, and a deliberately minimal indexing strategy.

Written from scratch — no starter template or scaffolding tool.

> **This is one of two projects.** The frontend is a separate project in
> [`secure-notes-web`](https://github.com/zakirdaq/secure-notes-web) with its own `package.json` and dev
> server. This one serves no HTML — it is a pure JSON API, and the two communicate
> cross-origin over CORS with the JWT in an `Authorization` header.

---

## Quick start

```bash
npm install
cp .env.example .env        # then edit MONGODB_URI and JWT_SECRET
npm run seed                # sample users/notes/posts + builds indexes
npm run dev                 # http://localhost:3000/api
```

Then start the frontend in a second terminal:

```bash
cd ../secure-notes-web && npm install && npm run dev   # http://localhost:5173
```

`CORS_ORIGIN` defaults to `http://localhost:5173,http://localhost:4173` (the
frontend's dev and preview ports), so the pair works with no extra configuration.

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Seeded logins (password `Password123!` for all):

| Role  | Email               |
| ----- | ------------------- |
| admin | admin@example.com   |
| user  | user1@example.com   |

### MongoDB

Either a local server via Docker:

```bash
docker run -d --name mongo-notes -p 27017:27017 -v mongo-notes-data:/data/db mongo:7
```

…or a free Atlas M0 cluster (required if deploying to Vercel).

### Verify the indexing work

```bash
npm run explain     # explain() report: plan + index name for every required query
npm run indexes     # apply schema.index() declarations, drop undeclared ones
```

`npm run explain` prints `OK` / `WARN` / `FAIL` per query and fails loudly on any
`COLLSCAN` or blocking in-memory `SORT`. Current output: every required query and
both aggregations are index-backed, with no collection scan and no blocking sort.

### Run the test suite

With the server running in another terminal:

```bash
npm run test:e2e
```

65 assertions over auth, RBAC boundaries, ownership isolation, pagination guards
and both aggregation scenarios. Point it at a deployment with
`E2E_BASE_URL=https://your-app.vercel.app npm run test:e2e`.

### Dependencies

Eight runtime dependencies, **no dev dependencies** and no build step — `npm run dev`
uses Node's built-in `--watch` rather than nodemon, which also keeps
`npm audit` clean (0 vulnerabilities).

---

## Roles & permissions

| Capability                        | user | admin |
| --------------------------------- | :--: | :---: |
| Create / update / delete own note | ✓    | ✓     |
| List own notes                    | ✓    | ✓     |
| View any note                     |      | ✓     |
| List / create / update / delete users |  | ✓     |
| Users grouped by interests         |      | ✓     |
| Create own post                   | ✓    | ✓     |
| Read any user's posts             | public | public |

Public registration always creates a `user`; only an admin can mint an admin
(`POST /api/users`). The role is read from the signed JWT rather than re-fetched
per request, so a role change takes effect when the current token expires —
hence the short default `JWT_EXPIRES_IN=2h`.

---

## API

All list endpoints accept `?page=1&limit=20` (`limit` capped at `MAX_PAGE_SIZE`)
and return `{ data, meta: { page, limit, total, totalPages, hasNextPage, hasPrevPage } }`.

### Auth

| Method | Path                 | Access | Notes |
| ------ | -------------------- | ------ | ----- |
| POST   | `/api/auth/register` | public | rate-limited; role forced to `user` |
| POST   | `/api/auth/login`    | public | rate-limited; generic failure message (no account enumeration) |
| GET    | `/api/auth/me`       | auth   | |

### Notes

| Method | Path             | Access | Notes |
| ------ | ---------------- | ------ | ----- |
| GET    | `/api/notes`     | auth   | user → own notes; admin → all, or `?owner=<id>` |
| POST   | `/api/notes`     | auth   | |
| GET    | `/api/notes/:id` | owner / admin | foreign note returns 404, not 403 |
| PATCH  | `/api/notes/:id` | owner / admin | |
| DELETE | `/api/notes/:id` | owner / admin | |

### Users

| Method | Path                               | Access | Notes |
| ------ | ---------------------------------- | ------ | ----- |
| GET    | `/api/users`                       | admin  | optional `?interest=chess` |
| POST   | `/api/users`                       | admin  | may set `role` |
| GET    | `/api/users/grouped-by-interests`  | admin  | **Aggregation Scenario 1** |
| GET    | `/api/users/:id`                   | admin or self | |
| PATCH  | `/api/users/:id`                   | admin  | |
| DELETE | `/api/users/:id`                   | admin  | cannot delete self |

### Posts

| Method | Path                        | Access | Notes |
| ------ | --------------------------- | ------ | ----- |
| POST   | `/api/posts`                | auth   | |
| GET    | `/api/posts/user/:userId`   | public | **Aggregation Scenario 2** |

---

## Indexing strategy

Every index is declared with `schema.index()` (never `index: true` on a field),
so the complete strategy is readable in three places:
[`src/models/User.js`](src/models/User.js), [`Note.js`](src/models/Note.js),
[`Post.js`](src/models/Post.js).

**Four indexes total**, beyond the mandatory `_id` on each collection.

| Collection | Index | Key | Serves |
| ---------- | ----- | --- | ------ |
| `users` | `uniq_email` | `{ email: 1 }`, unique | Login lookup + account uniqueness. Highest-frequency read in the app. The unique constraint also removes the need for a racy "does this email exist" pre-check — the duplicate-key error maps to a 409. |
| `users` | `interests_multikey` | `{ interests: 1 }` | Aggregation Scenario 1, and `GET /api/users?interest=chess`. |
| `notes` | `owner_createdAt` | `{ owner: 1, createdAt: -1 }` | "A user lists their own notes", paginated newest-first. Also the admin's `?owner=<id>` filter and the per-note ownership check. |
| `posts` | `author_createdAt` | `{ author: 1, createdAt: -1 }` | Aggregation Scenario 2's `$lookup` join, plus the newest-first ordering inside it. |

### Why these are the right shapes

**`{ owner: 1, createdAt: -1 }` follows ESR.** Equality (`owner`) leads, Sort
(`createdAt`) follows, so one `IXSCAN` satisfies filter *and* order and `skip`/
`limit` walk the index directly — no blocking `SORT` stage, no fetching rows just
to throw them away. Reversing the keys to `{ createdAt: -1, owner: 1 }` would
force an in-memory sort per owner.

**`{ author: 1, createdAt: -1 }` makes the `$lookup` cheap.** A `$lookup` is an
equality probe against the foreign collection for every input document. With
`author` leading, that probe is an index seek; without the index it degrades to a
full collection scan *per input document*. The trailing `createdAt: -1` lets the
sub-pipeline's `$sort` read straight off the index.

### Indexes deliberately NOT created

The spec grades efficiency, so each of these was considered and rejected:

| Candidate | Why it was rejected |
| --------- | ------------------- |
| `notes: { createdAt: -1 }` | Would only serve the admin "all notes" feed. That endpoint sorts by `_id: -1` instead — ObjectIds are monotonically increasing, so `_id` descending *is* newest-first, and the mandatory `_id` index already provides it. A second full-collection sort index would be write overhead for zero read gain. |
| `users: { createdAt: -1 }` | Same reasoning for the admin user list. |
| `users: { role: 1 }` | Two distinct values. A filter on it matches a large fraction of the collection, so the planner would (correctly) prefer a scan; the index would only slow writes. |
| `users: { name: 1 }` | Nothing filters or sorts by name. |
| `posts: { createdAt: -1 }` | There is no global post feed in the spec; the only listing is author-scoped. |
| `notes: { owner: 1, title: 'text' }` | No search requirement. |
| Any index to "cover" the interests `$group` | A complete grouping must visit every interest entry by definition. `interests_multikey` already provides the narrowest possible access path; nothing further can be covered because the grouped output carries user fields. |

`autoIndex` is disabled when `NODE_ENV=production`; index creation is an explicit
step (`npm run indexes`, which uses `syncIndexes()` and drops anything not
declared in code).

---

## Aggregation pipelines

### Scenario 1 — users grouped by interests

[`src/controllers/userController.js`](src/controllers/userController.js) →
`usersGroupedByInterests`

Constraint: *exactly one* `aggregate()` call, nothing else. Satisfied — pagination
metadata and the total group count are produced **inside** the pipeline via
`$facet`, so there is no companion `countDocuments()`.

```
$match  { interests: { $exists: true } }   // stays on interests_multikey
$unwind $interests
$group  { _id: '$interests', userCount: { $sum: 1 }, users: { $push: {…} } }
$sort   { userCount: -1, _id: 1 }
$facet  { data: [ $skip, $limit, $project ], totalGroups: [ $count ] }
$project flatten total out of the facet
```

With `?interest=chess` the leading `$match` becomes an equality predicate and the
plan is a pure `IXSCAN` over that one key.

### Scenario 2 — a user's posts via `$lookup`

[`src/controllers/postController.js`](src/controllers/postController.js) →
`listPostsByUser`

Constraint: a single pipeline containing a `$lookup`. Satisfied — the pipeline
starts from `users`, so the author profile and their posts arrive in one round trip.

```
$match  { _id: <userId> }                       // _id index
$lookup from: 'posts', localField: '_id', foreignField: 'author',
        pipeline: [ $sort { createdAt: -1 }, $skip, $limit(limit+1), $project ]
$project author fields + posts
```

The sub-pipeline requests `limit + 1` documents and derives `hasNextPage` from the
extra row. That is a deliberate choice over `$facet`/`$count` inside the join:
a `$facet` would discard the index-ordered stream purely to compute a total the
UI does not need.

---

## Project layout

```
server.js              local entrypoint (API only — serves no static files)
api/index.js           Vercel serverless entrypoint
vercel.json            rewrites /api/:path* -> the function
src/
  app.js               Express app factory (shared by both entrypoints)
  config/env.js        validated environment config
  db/connect.js        serverless-safe cached Mongoose connection
  models/              User, Note, Post — all schema.index() declarations
  middleware/          auth (JWT + roles), validation, errors, withDatabase
  controllers/         auth, note, user (scenario 1), post (scenario 2)
  routes/              route tables + per-route guards
  validators/          zod request schemas
  utils/               ApiError, asyncHandler, pagination, tokens
scripts/               seed.js, explain.js, indexes.js, e2e.js
```

---

## Security notes

- Passwords are hashed with bcrypt (12 rounds); `passwordHash` has
  `select: false` so it never leaves the database by accident, and `toJSON`
  strips it as a second line of defence.
- Login failures return one generic message whether the email or the password
  was wrong, so the endpoint cannot enumerate accounts.
- Auth endpoints are rate-limited (in-memory store — a shared store such as
  Redis would be needed across multiple instances).
- Every request body, query and path param is validated with zod before it
  reaches a controller.
- A non-owner requesting someone else's note gets `404`, not `403`, so the API
  does not confirm that the resource exists.
- `x-powered-by` disabled; JSON body capped at 1 MB.
- CORS is restricted to an explicit origin allow-list (`CORS_ORIGIN`), not `*`,
  with only the methods and headers the frontend actually uses. Credentials are
  off because the JWT travels in a header rather than a cookie — which also means
  there is no CSRF surface. The frontend's `localStorage` XSS trade-off is
  discussed in [its README](https://github.com/zakirdaq/secure-notes-web#how-auth-works).

`bcryptjs` is used rather than the native `bcrypt` binding — same algorithm, no
native build step, which keeps `npm install` working on Windows without Visual
Studio build tools.

---

## Deploying to Vercel (free tier)

Works, with caveats worth knowing:

```bash
npm i -g vercel
vercel          # first deploy
vercel --prod
```

Set `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production` and `CORS_ORIGIN` as project
environment variables, then run `npm run indexes` once against the Atlas cluster.

Because the two projects are separate, this becomes **two Vercel projects** — this
API, and the static frontend. They must agree on each other's URLs:

- the API's `CORS_ORIGIN` must list the frontend's deployed origin
- the frontend's `VITE_API_BASE_URL` must point at this API's deployed origin,
  set **before** its build (Vite inlines it at build time)

Get one wrong and every request fails in the browser while `curl` still works —
CORS is enforced by the browser, not the server.

1. **Atlas is mandatory** — a Dockerised local MongoDB is unreachable from Vercel.
2. **Connection caching is the thing people get wrong.** Each cold start would
   otherwise open a new pool and exhaust the M0 500-connection limit;
   `src/db/connect.js` caches on `globalThis` to prevent this.
3. **No fixed egress IP** on the free tier, so Atlas network access has to allow
   `0.0.0.0/0`.
4. **10 s execution limit** and cold starts of ~1 s on Hobby.
5. The rate limiter's in-memory store is per instance.
6. `GET /` returns 404 by design — there is no frontend here. Health lives at
   `/api/health`.

For a long-lived process instead (closer to local behaviour), Render's free web
service runs `npm start` directly — the trade-off being that it sleeps after
15 minutes idle.
