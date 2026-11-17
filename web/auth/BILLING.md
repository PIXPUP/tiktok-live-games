# Stripe membership

Plan: THB 299 per month, all five web games. Stripe-hosted Checkout and Customer Portal. Renewal is automatic; portal cancellation is at the end of the paid period. The site stores no card data. The 299 THB price must be monthly and inclusive (no extra tax added by this integration). Merchant tax treatment and invoices remain Stripe account settings.

## Server bindings

Cloudflare Pages production and preview require separate bindings and keys:

- `STRIPE_BILLING_ENABLED=true`: enforce subscriptions. Absent/false preserves existing login-only service while setup is incomplete. Set true only after working Stripe configuration is deployed.
- `STRIPE_SECRET_KEY` (Secret): Stripe secret key. Never expose it to browsers, repository, logs, or chat.
- `STRIPE_PRICE_ID`: exact recurring THB 299 price, quantity one, interval month.
- `STRIPE_WEBHOOK_SECRET` (Secret): endpoint signing secret.
- `STRIPE_PORTAL_CONFIGURATION`: portal configuration with cancellation at period end, payment updates, invoice history.
- `BILLING_KV`: separate Cloudflare KV namespace per Stripe test/live mode. Customer IDs map to Firebase UIDs. Back up this mapping; never clear it during upgrades.

The existing `OVERLAY_SIGNING_KEY` and Firebase configuration remain unchanged.

`python web/auth/configure-stripe.py` reads the current Stripe CLI test key and Wrangler OAuth credentials locally. It creates a test product, recurring price, portal configuration, webhook and preview KV binding; it never prints/saves keys or changes production. Run `stripe login` and `wrangler whoami` first. CLI keys expire; production needs a durable Stripe key or rotation before expiry. Avoid reusing the default portal configuration shared with unrelated apps.

## Endpoints and access

- `GET /api/billing/status` requires Firebase session. `?refresh=1` reads current Stripe state.
- `POST /api/billing/checkout` and `/portal` require Firebase session and exact Origin. Browser-supplied price/customer/UID/return URLs are not accepted.
- `POST /api/stripe/webhook` verifies the exact raw body, HMAC signature, timestamp within 5 minutes and test/live mode. Subscribe to checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid/payment_failed.
- Checkout redirect `?checkout=success` is only a UI hint. It grants no access. Access comes from Stripe subscription status and exact price/UID/customer ownership.
- Only active/trialing, unpaused, unexpired matching subscriptions grant access. Failed payments/past_due/unpaid/canceled/incomplete deny it. Cancellation at period end keeps access until the paid period ends.
- Status is cached for at most 60 seconds in KV; webhook invalidates it. Webhooks do not blindly write old state, so duplicates/out-of-order notifications cannot restore canceled access. KV propagation can add brief delay; refresh status after checkout.
- Game assets, game HTML, controls and new LIVE links all require membership when enforcement is enabled. Signed viewer links also check the owner's membership on server requests, even if minted before billing started.
- Signed viewer links remain bearer links usable by anyone holding them. They cannot control games or open the owner's account.
- Already-loaded code/assets cannot be recalled. The public GitHub source and downloadable local desktop app remain public and runnable offline; this subscription gates the hosted website, not a DRM license for local copies or the existing read-only Tunnel API.
- This implementation does not grant refunds, create trial periods, charge a user's card itself or migrate existing users into paid subscriptions automatically. Customers explicitly complete Checkout.

## Verification

`npm run test:web` covers expired/unpaid access, direct game routes, old signed viewer links, exact price and customer ownership, fixed checkout parameters, origin/auth checks, raw webhook signature tampering/replay/mode and old Firebase security tests. Test payment end to end in Stripe test mode before enabling production. Never use real cards for QA.

Official references:
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/api/customer_portal/sessions/create
- https://docs.stripe.com/events/manage-webhook-endpoints

Live activation: `python web/auth/configure-stripe.py --live` opens a masked local input for a durable live secret key. It verifies Stripe charges_enabled before creating live objects, sets isolated production KV and Secrets, and requires a new Pages deployment afterward. No payments are collected by this setup command. Canceling the key prompt leaves production unchanged.
