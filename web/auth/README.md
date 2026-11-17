# Firebase login and read-only LIVE links

Firebase project: `tiktoklive-93333`, web app `Moo Heng LIVE Games`. Public browser configuration is in `web/firebase-config.json`; this is not a Firebase Admin credential. No service-account key is required or included.

## User flow

1. Open https://pixpup-live-games.pages.dev and create an email/password account or sign in.
2. Choose a game and connect its Tunnel as before. Each account has separate browser-local gift-layout settings.
3. Copy the LIVE screen link from the website. The server issues a signed, read-only URL for that exact game, backend and layout, valid for seven days.
4. Paste the issued link in LIVE Studio. The LIVE screen does not need an interactive Firebase login and remains available when its owner signs out of the dashboard.

The Windows app 1.8.0 opens the dashboard with its selected game/Tunnel/layout. Its button no longer copies an unsigned game URL as the LIVE link. Old direct Pages URLs require login; generate a new LIVE link through the website.

## Server enforcement

`web/auth/worker.mjs` is bundled into Pages Advanced Mode `_worker.js`, with `_routes.json` including every path. Portal HTML, direct game HTML, game metadata, gift catalog and game resources require a Firebase ID-token session or a narrowly scoped read-only screen grant. Login assets and license texts are public.

ID tokens are checked using jose against Google's public Firebase signing keys, RS256, the expected issuer/audience, expiration, subject and auth time. Anonymous Firebase accounts are not accepted. The server stores the ID token in an HttpOnly, Secure, SameSite=Lax cookie; the browser SDK refreshes it. Session creation, logout and screen-grant creation require the same Origin. Private responses are not publicly cacheable.

Screen grants use HS256 with the Cloudflare secret `OVERLAY_SIGNING_KEY`, and include a game scope plus a hash of the exact target URL. They never contain a Firebase ID token, refresh token, password or email. A grant cannot open the dashboard or create another grant. It deliberately lasts independently of the dashboard session, to keep a running LIVE screen available. Rotate the signing secret to invalidate all existing screen links immediately; otherwise they expire after seven days.

This protects access through the Pages website. It does not make the public GitHub source or the existing read-only Tunnel feed private, and does not add paid-membership/administrator approval. All registered Firebase members can use the dashboard. Native server controls remain local.

## Build and deploy

```powershell
npm ci
npm run test:web
python web/build.py
wrangler pages deploy dist/pages --project-name pixpup-live-games --branch codex/three-games
```

Configure `OVERLAY_SIGNING_KEY` as a Cloudflare Pages secret (at least 32 characters), separately for production and preview. Do not commit it. Existing signing keys must be preserved on normal deployments. The Firebase Console needs Email/Password enabled and `pixpup-live-games.pages.dev` in Authentication authorized domains; initial Authentication activation is done in the Console, with no Billing upgrade required by this implementation.

Firebase manages account credentials. The app does not email users from the developer's account; password resets are requested directly by the signed-in site user through Firebase's standard flow. No Firestore/database/analytics integration is used.
