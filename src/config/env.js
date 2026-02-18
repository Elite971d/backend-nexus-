/**
 * Environment validation at startup.
 * Uses Zod to validate required and optional env vars.
 * Call validateEnv() before starting the server.
 */
const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().optional().transform(Number).or(z.number()).optional().default(8080),

  // Required in production
  MONGO_URI: z.string().min(1).optional(),

  // Auth
  JWT_SECRET: z.string().min(1).optional(),
  JWT_EXPIRES_IN: z.string().optional().default('7d'),
  AUTH_COOKIE_NAME: z.string().optional().default('nexus_token'),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).optional().default('lax'),
  COOKIE_DOMAIN: z.string().optional(),

  // CORS - strict in production: only nexus.elitesolutionsnetwork.com
  CORS_ORIGIN: z.string().optional(),

  // Admin seeding (first deploy)
  ADMIN_EMAIL: z.union([z.string().email(), z.literal('')]).optional().transform((v) => (v === '' ? undefined : v)),
  ADMIN_PASSWORD: z.string().optional(),

  // Rate limiting (optional overrides)
  RATE_LIMIT_WINDOW_MS: z.string().optional().transform(Number),
  RATE_LIMIT_MAX: z.string().optional().transform(Number),
  AUTH_RATE_LIMIT_WINDOW_MS: z.string().optional().transform(Number),
  AUTH_RATE_LIMIT_MAX: z.string().optional().transform(Number),
});

/** @type {z.infer<typeof envSchema>} */
let validatedEnv = null;

/**
 * Validates environment variables at startup.
 * Throws if required vars are missing in production.
 * @returns {z.infer<typeof envSchema>} Validated env object
 */
function validateEnv() {
  const raw = process.env;
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const msg = parsed.error.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${msg}`);
  }

  const { data } = parsed;
  const isProd = data.NODE_ENV === 'production';

  if (isProd) {
    if (!data.MONGO_URI) {
      throw new Error('MONGO_URI is required in production');
    }
    if (!data.JWT_SECRET || data.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
  }

  validatedEnv = data;
  return data;
}

/**
 * Get validated env (must call validateEnv() first)
 */
function getEnv() {
  if (!validatedEnv) {
    throw new Error('validateEnv() must be called before getEnv()');
  }
  return validatedEnv;
}

module.exports = { validateEnv, getEnv };
