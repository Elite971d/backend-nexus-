# Authentication & environment variables

## Required for production

| Variable | Description | Example |
|----------|-------------|---------|
| `JWT_SECRET` | Secret used to sign/verify JWTs. **Must be strong and unique in production.** | `openssl rand -base64 32` |
| `CORS_ORIGIN` | Allowed origin(s), comma-separated. Production should be locked to front-end origin. | `https://nexus.elitesolutionsnetwork.com` |
| `COOKIE_SECURE` | Set to `true` in production (HTTPS only). | `true` |
| `COOKIE_DOMAIN` | Cookie domain (optional). Set for subdomain sharing. | `.elitesolutionsnetwork.com` |
| `COOKIE_SAME_SITE` | `lax` or `strict`. | `lax` |

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_COOKIE_NAME` | Name of the httpOnly cookie. | `nexus_token` |
| `JWT_EXPIRES_IN` | JWT expiry (e.g. `7d`, `24h`). | `7d` |

## Admin seeding (first user)

| Variable | Description |
|----------|-------------|
| `ADMIN_EMAIL` | Email for the first admin user (only used when no users exist). |
| `ADMIN_PASSWORD` | Password for the first admin user (hashed with bcrypt; never stored in plaintext). |

## CORS behavior

- **Production:** If `CORS_ORIGIN` is not set, only `https://nexus.elitesolutionsnetwork.com` is allowed.
- **Development:** Localhost origins are allowed when `NODE_ENV !== 'production'`.
- Set `CORS_ORIGIN` explicitly to override (e.g. `https://nexus.elitesolutionsnetwork.com,https://staging.example.com`).

## Auth endpoints

- `POST /api/auth/login` — Body: `{ email, password }`. Sets httpOnly cookie and returns `{ user, tenant, token }`.
- `POST /api/auth/logout` — Clears auth cookie.
- `GET /api/auth/me` — Returns current user and tenant (requires cookie or `Authorization: Bearer <token>`).

No plaintext passwords are stored; passwords are hashed with bcrypt (via `bcryptjs`).
