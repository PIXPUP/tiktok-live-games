# Manual access administration

Firebase handles login. Cloudflare Pages checks access server-side using a dedicated MEMBERS_KV namespace. Stripe is not used. This system grants access to the hosted web games; the public GitHub repository and local desktop games remain downloadable and runnable offline.

## Roles and setup

- MANUAL_ACCESS_ENABLED=true enforces approval for all seven web games, game assets, controls and new LIVE viewer links. Absence/false preserves the older login-only behavior during setup.
- MEMBERS_KV stores user profiles, access records and an append-only audit trail. Use separate namespaces for preview/production. Do not clear the namespace during deployment.
- ADMIN_UIDS is an explicit comma-separated allowlist of Firebase UIDs configured by the owner on Cloudflare. Users cannot set roles, and the admin UI cannot create new admins. Never bootstrap admin access by email claimed in a browser request.
- Existing OVERLAY_SIGNING_KEY and Firebase settings are preserved.
- `python web/auth/configure-members.py --admin-uid UID` configures isolated preview/production KV and removes obsolete Stripe bindings. It reads the existing Wrangler login in memory. No secret is printed or stored in this repository.

The first administrator account can be created with a random discarded password and the owner sets their own password via the existing Forgot password UI. No shared/default password is embedded in the app.

## Behavior

1. A valid Firebase session registers only its cryptographically verified UID/email. New users start pending.
2. Users see /membership. The admin sees /admin with paginated profiles (50 at a time), local search over loaded users, approval/extension/suspension buttons.
3. Grant opens all seven games for 30 days starting now. Extend adds 30 days from the later of now and the existing expiry. Suspend disables access. Client-supplied expiry, role or actor values are ignored.
4. Only server-configured admins can list users or change access; admin pages and APIs are protected separately from membership. Exact Origin is required for writes. Admin access cannot be changed through these user buttons.
5. Audit records include server time, authenticated actor UID, target UID and before/after access state. Stored in KV for owner review (not publicly served).
6. Existing signed LIVE links check the owner's current access on server requests. A revoked or expired owner cannot reopen their old links. Already-loaded resources/code cannot be recalled; this is not DRM. The existing read-only Tunnel API is not made private by this gate.
7. Cloudflare KV is eventually consistent. Changes usually appear quickly in the same region but can take roughly a minute to propagate. The mutation response returns the newly saved state directly rather than reading a stale value back.
8. This system does not collect money or auto-renew subscriptions. Any payment/renewal arrangements are handled by the owner; users never enter card details here.

## Tests

`npm run test:web` verifies manual grant/extension/expiry/suspension, audit actors, forged roles, self-approval denial, CSRF, direct asset access, existing signed viewer links and all previous Firebase/runtime/layout security tests.

The owner administrator UID is configured on Cloudflare, not in browser code. Test-only preview administrators must be removed after QA.
