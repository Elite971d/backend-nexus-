# Elite Nexus Backend

## Nexus MongoDB Schema

Production-grade Mongoose models and indexes for the Nexus deal pipeline. All collections are multi-tenant via `tenantId` (ref: `Tenant`).

### Collections

| Collection      | Purpose |
|----------------|---------|
| **users**      | Auth + role (admin, dialer, closer, manager). Roles are embedded; no separate roles collection. |
| **deals**      | Deal pipeline (email, website, referral, manual, zoho) with status, assignment, property, numbers. |
| **dealNotes**  | Notes attached to deals (author, body, timestamps). |
| **activityLog**| Audit trail: entityType, entityId, action, actorId, details. |
| **notifications** | In-app notifications with read/delivery status and badge support. |
| **inboundEmails** | Optional raw email ingestion (messageId, from, to, subject, bodySnippet, dealId). |

### Deal status enum

Deals use a single `status` field with these values:

| Value            | Description        |
|------------------|--------------------|
| `new`            | Just received      |
| `reviewing`      | Being reviewed     |
| `underwriting`   | Underwriting       |
| `offer_sent`     | Offer sent         |
| `under_contract` | Under contract     |
| `closed`         | Closed             |
| `dead`           | Dead / no go       |

### Deal source enum

| Value      |
|-----------|
| `email`   |
| `website` |
| `referral`|
| `manual`  |
| `zoho`    |

### Deal priority enum

| Value    |
|----------|
| `low`    |
| `normal` |
| `high`   |

### Indexes

- **deals:** `status`, `assignedTo`, `createdAt`; compound `tenantId + status`, `tenantId + assignedTo + createdAt`.
- **users:** `email` (unique).
- **notifications:** `userId`, `readAt`; `userId + read`; `userId + type + createdAt`.
- **activityLog:** `entityId`, `createdAt`; compound `tenantId + entityType + entityId + createdAt`.

### Models location

All Nexus models live under `models/`:

- `models/user.js` — User (roles embedded)
- `models/Deal.js`
- `models/DealNote.js`
- `models/ActivityLog.js`
- `models/Notification.js`
- `models/InboundEmail.js`

### Initial Admin seed

- **On startup:** `scripts/seedAdmin.js` runs after DB connect; if no users exist, it creates a default tenant and one Admin user (uses `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- **One-off:** `node scripts/seedNexusInitial.js` (requires `MONGO_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

See `ADMIN_SEEDING.md` for details.

---

## Nexus Deals REST API

REST endpoints for the deal pipeline live under `/api/deals` and `/api/activity`. All require authentication (JWT via cookie or `Authorization: Bearer`) and tenant context. Create/update/assign/note actions write to `activityLog` with `actorId`, `entityType`, `entityId`, `action`, `details.changes`, and schema timestamps.

### Endpoints

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/api/deals` | List deals (filter: status, assignedTo, search; pagination: page, limit) | deals:read |
| POST | `/api/deals` | Create deal | deals:create |
| GET | `/api/deals/:id` | Get one deal | deals:read |
| PATCH | `/api/deals/:id` | Update deal (whitelisted fields only) | deals:update |
| POST | `/api/deals/:id/assign` | Assign deal to user | deals:assign (admin/manager) |
| POST | `/api/deals/:id/notes` | Add note | deals:read + note body |
| GET | `/api/deals/:id/notes` | List notes for deal | deals:read |
| GET | `/api/activity` | List activity log (filter: entityId, entityType; pagination) | admin or manager only |

### Consistent API response shapes

- **Success (single resource):** `200` or `201` with the resource object (e.g. deal or note).
  - Example: `{ "_id": "...", "tenantId": "...", "status": "new", ... }`

- **Success (list):**
  - **Deals:** `{ "deals": [...], "pagination": { "page", "limit", "total", "pages" } }`
  - **Notes:** `{ "notes": [...] }`
  - **Activity:** `{ "activity": [...], "pagination": { "page", "limit", "total", "pages" } }`

- **Error (consistent JSON):**  
  `{ "error": "<message>", "code": "<optional>", "details": [<optional array>] }`
  - `401`: `{ "error": "Auth token missing" }` or `{ "error": "Invalid or expired token" }`
  - `403`: `{ "error": "Insufficient permissions" }` or `{ "error": "Tenant context required" }`
  - `404`: `{ "error": "Deal not found", "code": "NOT_FOUND" }`
  - `422` (validation): `{ "error": "Validation failed", "code": "VALIDATION_ERROR", "details": [{ "path": "field", "message": "..." }] }`
  - `500`: `{ "error": "Server error" }` (or message from handler)

### Validation and security

- Inputs are validated with Zod; invalid body or query returns `422` with `details` listing path/message.
- **Mass-assignment:** PATCH only allows: `status`, `priority`, `senderName`, `senderEmail`, `subject`, `bodySnippet`, `property`, `numbers`. Assignment is only via `POST /api/deals/:id/assign` (admin/manager). `tenantId` and `createdBy` are never accepted from the client.

---

## Deployment

### Node version

Use **Node.js 20.x LTS** (or 22.x). Set in `package.json`:

```json
"engines": {
  "node": ">=20.0.0"
}
```

Or via Fly.io: add `node_version = "20"` in `[build]` (if using Node buildpack).

### Start scripts

| Script | Command | Use |
|--------|---------|-----|
| `npm start` | `node server.js` | Production |
| `npm run dev` | `nodemon server.js` | Development with hot reload |

### Environment

1. Copy `.env.example` to `.env` (local) or set secrets in Fly.io:
   ```bash
   fly secrets set MONGO_URI="mongodb+srv://..."
   fly secrets set JWT_SECRET="your-32-char-min-secret"
   fly secrets set ADMIN_EMAIL="admin@example.com"
   fly secrets set ADMIN_PASSWORD="secure-password"
   ```

2. **Production required:** `MONGO_URI`, `JWT_SECRET` (≥32 chars). Env validation runs at startup; the process exits if validation fails.

3. **CORS:** In production, only `https://nexus.elitesolutionsnetwork.com` is allowed by default. Override with `CORS_ORIGIN` (comma-separated).

4. **Static hosting:** Frontend can be served from `public/`. Place built assets there; the backend serves them. API is under `/api`.

### Fly.io

```bash
fly deploy
```

Ensure `PORT` is 8080 (matches `fly.toml` internal_port) and the app listens on `0.0.0.0`.
