# File-by-File Recommended Changes (Quick Reference)

Use this list to tick off changes; see **PRODUCTION_READINESS_REPORT.md** for full context and migration strategy.

---

## Server & config

- [ ] **server.js** — Restrict CORS (e.g. `FRONTEND_ORIGIN`); restrict Socket.IO origin; add 404 handler before errorHandler; add `GET /health` (DB ping); optional: helmet, rate-limit.
- [ ] **config/auth.js** — In production, require `JWT_SECRET` (no default).
- [ ] **middleware/errorHandler.js** — In production, return generic message for 5xx (no internal `err.message` leak).

---

## Routes

- [ ] **routes/authRoutes.js** — Rate limit login/register; add body validation (email, password).
- [ ] **routes/preforeclosureRoutes.js** — Add `authRequired`; optional tenant scope.
- [ ] **routes/taxLienRoutes.js** — Add `authRequired`; optional tenant scope.
- [ ] **routes/CodeViolationRoutes.js** — Add `authRequired`; optional tenant scope.
- [ ] **routes/probateRoutes.js** — Add `authRequired`; optional tenant scope.
- [ ] **routes/exportRoutes.js** — Add `authRequired` to all exports; add alias routes: `GET /preforeclosures/export`, `/taxliens/export`, `/codeviolations/export`, `/probate/export` (so front-end URLs work); scope by tenant if applicable.
- [ ] **routes/letterRoutes.js** — Add `GET /:id` (authRequired, getLetterPdf) so `/api/letter/:id` works; scope lead by `req.user.tenantId` in controller.
- [ ] **routes/webhookRoutes.js** — Verify Twilio request signature; return 403 if invalid.

---

## Controllers

- [ ] **controllers/authControllers.js** — Validate email and password (format, presence, length); return 400 on validation error.
- [ ] **controllers/crmController.js** — In `getLeads`, use `next(err)` instead of `res.json([])` on error.
- [ ] **controllers/preforeclosureController.js** — In `getAll`, use `next(err)` instead of `res.json([])` on error.
- [ ] **controllers/taxLienController.js** — Same: `next(err)` on error.
- [ ] **controllers/codeViolationController.js** — Same.
- [ ] **controllers/probateController.js** — Same.
- [ ] **controllers/letterController.js** — In `getLetterPdf`, filter lead by `req.user.tenantId`.
- [ ] **controllers/exportController.js** — Add tenant filter to all export queries if models have tenantId.

---

## Front-end (script-only; no layout/CSS change)

- [ ] **index.html** — If export is protected by auth: switch CSV export to fetch with `Authorization` + blob download (keep same buttons/tabs). Optionally document API_BASE. Letter URL can stay `/api/letter/:id` once backend has the new route.

---

## New files (optional)

- [ ] **.env.example** — List MONGO_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_ORIGIN, FRONTEND_URL, TWILIO_*, CRON_SCHEDULE, OPENAI_API_KEY, etc.
- [ ] **middleware/validateAuth.js** — Optional validation middleware for login/register.
- [ ] **middleware/rateLimit.js** — Optional rate limiters for auth and API.

---

## No change needed (audit only)

- **middleware/authMiddleware.js**
- **middleware/roleMiddleware.js**
- **config/db.js**
- **middleware/tenantScope.js** — Use where tenant-scoped data is served (see report for which routes).
