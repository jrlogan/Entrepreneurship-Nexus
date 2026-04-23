# First Platform Admin Bootstrap

Invite and approval flows assume at least one existing `platform_admin`. A new deployed environment needs a first admin bootstrapped once.

The project includes a secret-gated HTTP Function for this:

- `bootstrapPlatformAdmin`

## Required Function Environment Value

```env
BOOTSTRAP_PLATFORM_ADMIN_SECRET=
```

## Example Request

After Functions are deployed:

```bash
curl -X POST "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/bootstrapPlatformAdmin" \
  -H "Content-Type: application/json" \
  -H "X-Bootstrap-Secret: YOUR_BOOTSTRAP_PLATFORM_ADMIN_SECRET" \
  -d '{
    "email": "admin@example.com",
    "password": "CHOOSE_A_STRONG_PASSWORD",
    "first_name": "Admin",
    "last_name": "User",
    "ecosystem_id": "YOUR_ECOSYSTEM_ID",
    "organization_id": ""
  }'
```

## Behavior

The bootstrap function:

- Works only when no `platform_admin` exists yet
- Creates the Firebase Auth user if needed
- Creates the `people` record
- Creates an active `person_memberships` record with role `platform_admin`

After this succeeds:

1. Sign in through the deployed app.
2. Verify admin access.
3. Rotate or remove `BOOTSTRAP_PLATFORM_ADMIN_SECRET`.
