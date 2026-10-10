# ClaudePlay

ClaudePlay is a free, open alternative to Google Labs Playground with a Web3 layer on Solana. Anyone can play browser games, make one by tuning a kit (or by describing it to the AI studio), publish it as a signed, content-addressed "cartridge", and earn from collects, tips, remix royalties and weekly GPLY rewards. Today it is a **devnet prototype**: every transaction is a real Ed25519 signature replayed on a simulated ledger. When the server runs with `GP_SOLANA_CLUSTER` and `GP_TREASURY`, collects and tips are real wallet-to-wallet Solana payments (devnet by default; mainnet is locked behind `GP_ALLOW_MAINNET=yes`).

The whole product ships as one self-contained HTML page with no dependencies.

## Commands

```bash
node build.mjs                 # build everything into dist/
node test/core.test.mjs        # protocol unit tests (RFC 8032 vectors, splits, epochs)
node test/solana.test.mjs      # Solana payments: transactions vs @solana/web3.js, the relay filter, ledger payment checks
node test/server.test.mjs      # AI server tests with a fake Claude client (no key needed)
ANTHROPIC_API_KEY=... npm start   # serve dist/site with the AI studio on (npm install first)
cd dist && python3 -m http.server 8765 --bind 127.0.0.1   # serve for the browser tests
python3 test/e2e.py /tmp/gameplay-shots   # end-to-end + accessibility tests (needs the server above)
```

Run `node build.mjs` before committing so `dist/site/index.html` (kept in the repo as the ready-to-host website) matches the source. The deploy workflow rebuilds it anyway.

The browser tests need Python Playwright (`pip install playwright && playwright install chromium`). Set `CHROME_PATH` to use a different Chrome. Screenshots land in the folder you pass.

## Layout

| Path | What it is |
| --- | --- |
| `src/core.js` | Protocol: Ed25519 (WebCrypto with a pure-JS fallback), base58, SHA-256, canonical JSON, transaction signing (`GAMEPLAY/v1` domain), `buildWorld()` ledger replay (including `rate` transactions: 1 to 5 stars, one per account per game, not by the creator), collect splits, epoch rewards, `RULES`. Exposed as `window.PPCore`. |
| `src/kits.js` | Canvas game engine, five tunable kits (runner, flap, shooter, breaker, dodge), brand palettes, the player SDK injected into every game (`window.SP`, including `SP.image(name)` for the creator's pictures and `SP.room` for multiplayer), the built-in engines `SP2D_LIB` (2D: sprites, tile levels, arcade physics, camera, tweens, particles, scenes, touch buttons), `SP3D_LIB` (WebGL 3D with picture textures and sprites) and `SPSOUND_LIB` (sound effects and composed music), each injected only into games whose code mentions `SP2D`, `SP3D` or `SPSound`, procedural cover art. Exposed as `window.PPKits`. |
| `src/harness.js` | The AI build harness shared by the page and the server: `HARNESS` (system prompt, including the crypto-game rules), `harnessTask()`, `checkRequest()` (limits, 2D/3D `MODES`, `GENRES`, up to `PICS.max` creator pictures), `withPictures()` / `stripPictures()` (the `sp-pictures` block that carries a game's pictures; the AI never sees it), style and idea lists (`CRYPTO_IDEAS`). Exposed as `window.PPHarness`. |
| `src/solana.js` | Builds and reads ClaudePlay's one Solana transaction shape (System transfers + a `gameplay:<ledger id>` memo) by hand, and the relay filter `parsePayment()`. Exposed as `window.PPSolana`; shared with the server. |
| `server/chain.mjs` | Real-network settings (`GP_SOLANA_CLUSTER`, `GP_TREASURY`, `GP_SOLANA_RPC`, the `GP_ALLOW_MAINNET` gate) and the narrow `/api/chain/*` RPC proxy: blockhash, balance, status, payment lookups, relaying ClaudePlay payments only, and a devnet faucet. Holds no keys. |
| `SECURITY.md` | Security review of everything that moves value, open items, and the owner's checklist before mainnet. |
| `src/app.js` | The app: routes (`home`, `explore`, `game-<id>`, `create`, `wallet`, `ledger`, `economy`, `business`), wallet, storage, sandboxed game players, AI studio (`aiBuild()` picks Claude's `sample` or the server), accessibility settings. |
| `server/server.mjs` | Zero-config Node server: serves `dist/site`, injects `GP_SITE.ai` / `GP_SITE.gallery`, serves the shared gallery at `/api/db/*`, and streams `POST /api/build` from the Claude API: new games use Sonnet 5.5 and edits Haiku 5.5 on both plans; Pro (`POST /api/pro`, paid in SOL) adds Sonnet "best" edits and higher limits. Daily limits per plan, counted separately for new games and edits. The only file that uses an npm package (`@anthropic-ai/sdk`). |
| `server/plans.mjs` | Free and Pro plans for AI builds: daily counts (`limiter`) and Pro passes in the store's `kv` (Redis or `kv.json`), and `claim()`, which checks a Pro payment on Solana (signer paid `GP_TREASURY` at least the price, memo `gameplay:<proId(uid)>`, each signature once). |
| Safety check | Every game passes `H.staticScreen()` pattern checks and a Claude review (`H.SCREEN_PROMPT`, Haiku, sees the pictures) before publishing. On the website `POST /api/screen` returns an HMAC token for the file's hash and the gallery only stores game files carrying a valid token (`gallery.setBlobCheck`); unclear reviews or an unreachable Claude block publishing. Inside Claude the viewer's `sample` runs the review. |
| `server/rooms.mjs` | Multiplayer rooms: an in-memory relay for games that use `SP.room`. `POST /api/rooms` opens a room for a game (6-letter code in the share link `#game-<gid>&room=<code>`), players stream it over Server-Sent Events and send through `POST /api/rooms/<code>/send` with a per-player token; size and rate limits per player. The page passes messages into the sandboxed game frame (the frame's CSP blocks network). One instance only. |
| `server/gallery.mjs` | Shared gallery for the hosted website: the same `accounts/`, `blobs/`, `protocol/` documents as Claude's `db`, saved to Upstash Redis (`redisStore`, REST over fetch, used on Render's free plan) or a folder (`fileStore`, `GP_DATA_DIR`). A browser's uid is derived from its random gallery key (`pp.gallery.v1`); blobs must match their SHA-256; only the owner (`GP_ADMIN_KEY`) writes `protocol/`. |
| `src/index.html` | Styles (design tokens, light/dark/high-contrast themes) and the page shell. `<!--INLINE-SCRIPTS-->` is replaced by the three scripts at build time. |
| `src/assets/` | The mascot: `mascot.webp` (a still, inlined into the page at build time in place of `'MASCOT_STILL'` in app.js) and `mascot-wave.webp` (its animated loop, copied next to the website as a separate file and loaded only when `GP_SITE.mascot` is set). Made with Higgsfield and cut out from its background. |
| `build.mjs` | Writes `dist/playpark.html` (body published as a claude.ai artifact), `dist/local.html` (test page) and `dist/site/` (the standalone website + README). |
| `test/` | `core.test.mjs` unit tests, `solana.test.mjs` payment tests, `server.test.mjs` server tests, `e2e.py` browser scenarios and a11y audit, `mock_claude.js` fake artifact runtime, `fake_ai_server.mjs` the server with a fake Claude (and, with `chain`, a fake Solana from `fake_rpc.mjs`) for the browser tests. |
| `render.yaml` | Render blueprint behind the README's Deploy to Render button: free plan, the `claudeplay.si` domain, prompts for `ANTHROPIC_API_KEY`, the Upstash Redis REST URL/token and `GP_TREASURY`, sets per-visitor and site-wide daily build caps. |
| `.github/workflows/pages.yml` | Builds, tests and deploys `dist/site` to GitHub Pages on every push to `main`. |

## Where it runs

- **Inside Claude** (`ENV === 'claude'`): the artifact runtime provides `window.claude.use('db' | 'user' | 'sample' | 'downloads')`. The owner and invited editors write to a shared gallery in `db`; public-link viewers are read-only and fall back to local mode. `sample` powers the AI studio using the viewer's own Claude account.
- **As a plain website** (`ENV === 'web'`): no `window.claude`. Everything runs in local mode with `localStorage`; downloads use a normal link. When `server/server.mjs` serves the page it sets `window.GP_SITE.ai` (AI studio on) and `window.GP_SITE.gallery` (`webCaps()` in app.js gives the page a `db`/`user` backed by the server, so it runs in shared mode like the artifact). On a static host the AI studio shows a notice and everything stays in local mode. Business inquiries use `window.GP_SITE.contact` (set `GP_CONTACT` when building).

## Rules that keep things working

- **No external scripts or libraries.** Everything is inlined. JS sources must never contain `</script`, `<!--` or `<script` (the build fails if they do); split tags like `'<scr' + 'ipt>'`.
- **Starter game hashes are part of the ledger.** Scores are signed against a game's SHA-256. Changing `ENGINE`, any `KIT_*` function, `kitDoc()` output for the named palettes, or `normalizeParams()` key order changes the starter hashes and orphans existing starter scores. Put per-player behavior in the SDK (`SDK()` in kits.js), which is injected at play time and is not hashed.
- **Do not change the signing format** (`txMessage`, `delegationMessage`, `epochMessage`, the `GAMEPLAY/v1` domain) without a migration: it invalidates every existing signature.
- **The product is named ClaudePlay (formerly GamePlay), an unofficial fan project.** Keep the "not affiliated with or endorsed by Anthropic" notice in the footer, FAQ and READMEs. Protocol names stay `gameplay`: the `GAMEPLAY/v1` signing domain, the `gameplay:<id>` payment memo, the `gameplay-genre` / `gameplay-controls` meta tags, and the `GamePlay kit` generator tag inside `kitDoc()` (it is hashed).
- **Storage keys keep the old `pp.` prefix** (from the working name PlayPark) so existing browsers keep their wallets and games. Display preferences live in `gp.prefs.v1`.
- **Accessibility is tested.** Type sizes are in `rem`, colors come only from tokens, every theme (light, dark, contrast) must pass the e2e contrast audit, headings must not skip levels, and nothing may scroll sideways at 390px even with the largest text size.
- **Assist mode** slows the game clock in the SDK. Assisted runs must never be signed to ranked leaderboards.

## Guardrails

- Keep everything on devnet. Real money (USDC collects, payouts) waits for a security audit; the GPLY token waits for a legal opinion. The Philippine SEC's CASP Rules (in force since 5 July 2025) cover anyone offering crypto services to people in the Philippines, and the BSP has kept new VASP licenses frozen since 2025, so do not build custody, token sales or a peso-to-crypto exchange.
- Real Solana payments are non-custodial: players pay recipients directly, the treasury is only an address, and the server must never hold a private key. Do not switch production to mainnet or move real funds until the owner has finished the checklist in `SECURITY.md` and said go. Payment checks live in `checkPayment()` / `buildWorld({ chain })`; keep them strict (signer, memo with the ledger id, amount per recipient, each signature used once).
- Never put secrets in the shared `db` or in the page. AI keys belong on the server (`ANTHROPIC_API_KEY` for `server/server.mjs`), and `/api/build` only accepts structured requests checked by `checkRequest()`, never a raw prompt, so it cannot be used as an open Claude proxy.

## Next engineering steps

1. Deploy `server/server.mjs` with a Claude API key (`render.yaml` / the README's Deploy to Render button), and move its in-memory daily limits to a shared store (and tie them to Sparks) once it runs on more than one instance.
2. Move the gallery from a JSON file on one disk to a database once traffic needs more than one instance.
3. Solana programs: an Anchor registry, Metaplex Core / Bubblegum v2 editions, a Merkle rewards distributor.
4. Passkey embedded wallets (Privy, Dynamic or Para) and a Kora fee relayer for gasless actions.
5. Game files on Arweave, plus content screening and a moderation queue.
6. A real contact form on the Business page.

## Links

- Live prototype and website (claude.ai artifact): https://claude.ai/artifact/LWD53ZnDZH4DYnuGbL7qy6
- Blueprint doc (teardown, architecture, economy, risks, roadmap, launch plan): https://claude.ai/artifact/1q6BrR26CTdLVg4AaMZCVg
