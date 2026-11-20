# New web games

`bbq-live` and `garden-live` are lightweight Canvas 2D themes hosted with the existing Firebase/manual-access website. They are catalogued separately in `web/games/catalog.json`; the desktop build still contains its original five games.

## Play and stream

1. Sign in to the website with an account approved by the administrator.
2. Select ร้านหมูกระทะ or สวนผักของคนดู. Use the portal demo buttons to send named preview events. Full-screen offline demo screens also have a one-person demo button.
3. For real gifts, open ร้านข้าวราดแกง in the existing desktop app, connect TikFinity there, and create its Cloudflare Tunnel. Paste that URL into the new web theme. Both themes explicitly accept only the curry-shop-3d feed; other game feeds remain rejected.
4. For custom gifts, export the theme's gift layout and import it in the desktop curry game. The export intentionally uses the native source game's key while browser layout storage remains separate for each theme. Return to the chosen web theme and copy its own signed LIVE screen link.
5. Add the copied screen link to LIVE Studio at 1080 × 1920. Native narration still belongs to the source game; mute that narration if unwanted. Optional browser sound uses newly synthesized notes/effects and a Thai installed speech voice when available. No AI token API is used. Browser audio requires a click and depends on autoplay/voice support.

Garden progress is stored only in that browser, separately for each backend URL (or the demo room), with at most nine visible plots. It is not a shared cloud save and a new Tunnel URL starts a separate garden. Names/gift activity are public LIVE content. Demo events do not add real supporter points; source-server state remains authoritative for the real score.

The renderer caps visible characters (6 in lite mode, 12 otherwise), uses 15/30 fps only while movement is active, pauses rendering/poll work while hidden, and has no WebGL/3D dependency. Old physical Compaq hardware was not available for verification.

Tests: `npm run test:web` covers per-gift actions, named arrivals, demo-score separation, garden save/reload, character/plot bounds, source-feed validation and membership/signed-link checks for the new routes.
