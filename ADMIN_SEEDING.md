# Admin User Seeding

## Overview

The Elite Nexus backend includes an automatic admin user seeding mechanism that runs on server startup. This ensures that a production deployment always has an admin user available for CRM login, without requiring manual database setup.

## How It Works

1. **Automatic Execution**: The seed script (`scripts/seedAdmin.js`) runs automatically after the database connection is established in `server.js`.

2. **Safe Behavior**: 
   - If **NO users exist**: Creates an admin user with role "admin"
   - If **users already exist**: Skips seeding (safe to run on every deploy)
   - Never creates duplicate admin users

3. **Environment-Driven**: Uses environment variables for credentials (no hardcoded values)

## Required Fly.io Secrets

Set these secrets in your Fly.io app:

```bash
fly secrets set ADMIN_EMAIL="your-admin@example.com"
fly secrets set ADMIN_PASSWORD="your-secure-password"
```

**Important**: 
- Use a strong password for production
- The email will be stored in lowercase (normalized)
- Passwords are hashed using bcrypt before storage

## Registration Endpoint Behavior

Once an admin user exists (either seeded or manually created), the `/api/auth/register` endpoint automatically locks and returns:

```json
{
  "error": "Registration disabled once admin exists."
}
```

This prevents unauthorized user creation after the initial admin is in place.

## Role-Based Access

The seeded admin user has the `role: "admin"` field, which is:
- Included in JWT tokens (available in `req.user.role` after authentication)
- Ready for future role-based access control (RBAC) implementation
- Available roles: `admin`, `dialer`, `closer`, `manager`

## Troubleshooting

- **Admin not created**: Check that `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set in Fly.io secrets
- **Duplicate user error**: This is safe to ignore - it means the admin already exists
- **Seeding errors**: Non-fatal - the server will continue to start even if seeding fails

## Security Notes

- Passwords are never logged or exposed
- Seeding only works when the database is empty (first deploy)
- Subsequent deployments skip seeding automatically
- All authentication uses existing secure middleware
