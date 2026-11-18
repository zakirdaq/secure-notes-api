/**
 * End-to-end API test suite — 65 assertions covering auth, RBAC boundaries,
 * ownership isolation, pagination guards and both aggregation scenarios.
 *
 * Needs the server running and the database seeded:
 *   npm run seed  &&  npm run dev        (one terminal)
 *   npm run test:e2e                     (another terminal)
 *
 * Override the target with E2E_BASE_URL (e.g. a deployed Vercel URL).
 */
const BASE = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000') + '/api';
let pass = 0;
let fail = 0;

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let payload = null;
  if (res.status !== 204) payload = await res.json().catch(() => null);
  return { status: res.status, payload };
}

function check(label, condition, extra = '') {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label} ${extra}`);
  }
}

const admin = { email: 'admin@example.com', password: 'Password123!' };
const user1 = { email: 'user1@example.com', password: 'Password123!' };
const user2 = { email: 'user2@example.com', password: 'Password123!' };

console.log('\n--- auth ---');
const badLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: admin.email, password: 'wrong-password' }
});
check('wrong password -> 401', badLogin.status === 401, JSON.stringify(badLogin));
check(
  'no account enumeration (generic message)',
  badLogin.payload?.error?.message === 'Invalid email or password.'
);

const aLogin = await call('/auth/login', { method: 'POST', body: admin });
check('admin login -> 200', aLogin.status === 200, JSON.stringify(aLogin).slice(0, 200));
const adminToken = aLogin.payload?.data?.accessToken;
check('admin role is admin', aLogin.payload?.data?.user?.role === 'admin');
check('passwordHash never returned', !JSON.stringify(aLogin.payload).includes('passwordHash'));

const u1 = await call('/auth/login', { method: 'POST', body: user1 });
const u1Token = u1.payload?.data?.accessToken;
const u1Id = u1.payload?.data?.user?._id;
const u2 = await call('/auth/login', { method: 'POST', body: user2 });
const u2Token = u2.payload?.data?.accessToken;
check('user1 + user2 login', Boolean(u1Token && u2Token));

const uniqueEmail = `new${Date.now()}@example.com`;
const reg = await call('/auth/register', {
  method: 'POST',
  body: { name: 'New Person', email: uniqueEmail, password: 'Password123!', interests: ['Chess', 'KAYAKING'] }
});
check('register -> 201', reg.status === 201, JSON.stringify(reg).slice(0, 200));
check('interests normalised to lowercase', JSON.stringify(reg.payload?.data?.user?.interests) === '["chess","kayaking"]');
check('self-registration cannot grant admin', reg.payload?.data?.user?.role === 'user');

const escalate = await call('/auth/register', {
  method: 'POST',
  body: { name: 'Sneaky', email: `sneak${Date.now()}@example.com`, password: 'Password123!', role: 'admin' }
});
check('role in register body is ignored', escalate.payload?.data?.user?.role === 'user');

const dup = await call('/auth/register', {
  method: 'POST',
  body: { name: 'Dup', email: uniqueEmail, password: 'Password123!' }
});
check('duplicate email -> 409 (unique index)', dup.status === 409, JSON.stringify(dup));

const weak = await call('/auth/register', {
  method: 'POST',
  body: { name: '', email: 'not-an-email', password: 'abc' }
});
check('validation -> 400 with details', weak.status === 400 && weak.payload?.error?.details?.length === 3);

console.log('\n--- notes + ownership ---');
const created = await call('/notes', {
  method: 'POST',
  body: { title: 'E2E note', body: 'hello' },
  token: u1Token
});
check('create note -> 201', created.status === 201);
const noteId = created.payload?.data?._id;

const mine = await call('/notes?page=1&limit=5', { token: u1Token });
check('own notes paginated -> 200', mine.status === 200);
check('meta present', typeof mine.payload?.meta?.total === 'number' && mine.payload.meta.limit === 5);
check('page size respected', mine.payload?.data?.length === 5);
check('all returned notes are mine', mine.payload?.data?.every((n) => n.owner === u1Id));

const foreign = await call(`/notes/${noteId}`, { token: u2Token });
check("another user's note -> 404 (not 403)", foreign.status === 404, JSON.stringify(foreign));

const foreignPatch = await call(`/notes/${noteId}`, {
  method: 'PATCH',
  body: { title: 'hijacked' },
  token: u2Token
});
check('cannot patch foreign note', foreignPatch.status === 404);

const foreignDelete = await call(`/notes/${noteId}`, { method: 'DELETE', token: u2Token });
check('cannot delete foreign note', foreignDelete.status === 404);

const patched = await call(`/notes/${noteId}`, {
  method: 'PATCH',
  body: { title: 'E2E note updated' },
  token: u1Token
});
check('owner can patch', patched.status === 200 && patched.payload?.data?.title === 'E2E note updated');

const adminSees = await call(`/notes/${noteId}`, { token: adminToken });
check("admin can read anyone's note", adminSees.status === 200);

const adminAll = await call('/notes?page=1&limit=10', { token: adminToken });
const owners = new Set(adminAll.payload?.data?.map((n) => n.owner));
check('admin list spans multiple owners', owners.size > 1, `owners=${owners.size}`);

const adminFiltered = await call(`/notes?owner=${u1Id}&limit=50`, { token: adminToken });
check('admin ?owner= filter works', adminFiltered.payload?.data?.every((n) => n.owner === u1Id));

const userTriesFilter = await call(`/notes?owner=${u2Token ? u1Id : ''}&limit=5`, { token: u2Token });
check(
  'regular user cannot use ?owner= to read others',
  userTriesFilter.payload?.data?.every((n) => n.owner !== u1Id)
);

const delOwn = await call(`/notes/${noteId}`, { method: 'DELETE', token: u1Token });
check('owner can delete -> 204', delOwn.status === 204);

console.log('\n--- pagination guards ---');
check('limit over cap -> 400', (await call('/notes?limit=5000', { token: u1Token })).status === 400);
check('page 0 -> 400', (await call('/notes?page=0', { token: u1Token })).status === 400);
check('non-numeric page -> 400', (await call('/notes?page=abc', { token: u1Token })).status === 400);

console.log('\n--- rbac on admin routes ---');
check('user cannot list users -> 403', (await call('/users', { token: u1Token })).status === 403);
check(
  'user cannot create users -> 403',
  (await call('/users', { method: 'POST', body: { name: 'x', email: `x${Date.now()}@e.com`, password: 'Password123!' }, token: u1Token })).status === 403
);
check('user cannot run interests view -> 403', (await call('/users/grouped-by-interests', { token: u1Token })).status === 403);
check('no token -> 401', (await call('/users')).status === 401);
check('garbage token -> 401', (await call('/users', { token: 'not.a.jwt' })).status === 401);
check('user can read own profile', (await call(`/users/${u1Id}`, { token: u1Token })).status === 200);
check("user cannot read another's profile -> 403", (await call(`/users/${(await call('/auth/me', { token: u2Token })).payload.data._id}`, { token: u1Token })).status === 403);
check('bad ObjectId -> 400', (await call('/users/nope', { token: adminToken })).status === 400);

console.log('\n--- admin user management ---');
const listUsers = await call('/users?page=1&limit=5', { token: adminToken });
check('admin lists users', listUsers.status === 200 && listUsers.payload.data.length === 5);
check('user list has no password hashes', !JSON.stringify(listUsers.payload).includes('passwordHash'));

const madeUser = await call('/users', {
  method: 'POST',
  body: { name: 'Made By Admin', email: `made${Date.now()}@example.com`, password: 'Password123!', role: 'admin', interests: ['chess'] },
  token: adminToken
});
check('admin can create an admin -> 201', madeUser.status === 201 && madeUser.payload.data.role === 'admin');
const madeId = madeUser.payload?.data?._id;

const demoted = await call(`/users/${madeId}`, { method: 'PATCH', body: { role: 'user' }, token: adminToken });
check('admin can change role', demoted.payload?.data?.role === 'user');

const adminId = aLogin.payload?.data?.user?._id;
check('admin cannot delete self -> 400', (await call(`/users/${adminId}`, { method: 'DELETE', token: adminToken })).status === 400);
check('admin can delete a user -> 204', (await call(`/users/${madeId}`, { method: 'DELETE', token: adminToken })).status === 204);
check('deleted user is gone -> 404', (await call(`/users/${madeId}`, { token: adminToken })).status === 404);

console.log('\n--- aggregation scenario 1: group by interests ---');
const grouped = await call('/users/grouped-by-interests?page=1&limit=4', { token: adminToken });
check('grouped -> 200', grouped.status === 200, JSON.stringify(grouped).slice(0, 200));
const g = grouped.payload?.data ?? [];
check('returns groups', g.length === 4, `got ${g.length}`);
check('each group has interest + userCount + users', g.every((x) => typeof x.interest === 'string' && typeof x.userCount === 'number' && Array.isArray(x.users)));
check('userCount matches users array length', g.every((x) => x.userCount === x.users.length));
check('sorted by userCount desc', g.every((x, i) => i === 0 || g[i - 1].userCount >= x.userCount));
check('pagination meta from inside the pipeline', typeof grouped.payload?.meta?.total === 'number' && grouped.payload.meta.total > 0);

const page2 = await call('/users/grouped-by-interests?page=2&limit=4', { token: adminToken });
check('page 2 differs from page 1', JSON.stringify(page2.payload.data) !== JSON.stringify(g));
check('total is stable across pages', page2.payload.meta.total === grouped.payload.meta.total);

const oneInterest = await call('/users/grouped-by-interests?interest=chess', { token: adminToken });
check('filtered to a single interest', oneInterest.payload?.data?.length === 1 && oneInterest.payload.data[0].interest === 'chess');

console.log('\n--- aggregation scenario 2: posts via $lookup ---');
const posts = await call(`/posts/user/${u1Id}?page=1&limit=3`);
check('public access (no token) -> 200', posts.status === 200, JSON.stringify(posts).slice(0, 200));
check('author returned alongside posts', posts.payload?.data?.author?._id === u1Id);
check('posts array present', Array.isArray(posts.payload?.data?.posts));
check('limit respected (no leaked +1 row)', posts.payload.data.posts.length <= 3);
check('hasNextPage derived', typeof posts.payload?.meta?.hasNextPage === 'boolean');
check('newest-first ordering', posts.payload.data.posts.every((p, i, a) => i === 0 || new Date(a[i - 1].createdAt) >= new Date(p.createdAt)));

const createdPost = await call('/posts', { method: 'POST', body: { title: 'E2E post' }, token: u1Token });
check('create post -> 201', createdPost.status === 201);
check('anonymous cannot create a post -> 401', (await call('/posts', { method: 'POST', body: { title: 'nope' } })).status === 401);
check('unknown user id -> 404', (await call('/posts/user/507f1f77bcf86cd799439011')).status === 404);

console.log('\n--- misc ---');
check('health -> 200', (await call('/health')).status === 200);
check('unknown route -> 404 json', (await call('/does-not-exist')).status === 404);
check('/auth/me works', (await call('/auth/me', { token: u1Token })).payload?.data?._id === u1Id);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
