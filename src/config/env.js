import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer.`);
  return parsed;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int('PORT', 3000),

  mongoUri: required('MONGODB_URI'),
  dbName: process.env.DB_NAME?.trim() || undefined,

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '2h',

  bcryptRounds: int('BCRYPT_ROUNDS', 12),

  // Max page size accepted by any list endpoint.
  maxPageSize: int('MAX_PAGE_SIZE', 100),
  defaultPageSize: int('DEFAULT_PAGE_SIZE', 20),

  /**
   * Allowed browser origins for the separate frontend project.
   * Accepts a comma-separated list (dev + preview + production), or `*`.
   * Defaults to the Vite dev server so a fresh clone works without config.
   */
  corsOrigin: list('CORS_ORIGIN', ['http://localhost:5173', 'http://localhost:4173'])
};

function list(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (raw === '*') return '*';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export const isProd = env.nodeEnv === 'production';
