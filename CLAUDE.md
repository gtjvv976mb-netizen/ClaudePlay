# GamePlay

GamePlay is a free, open alternative to Google Labs Playground with a Web3 layer on Solana. Anyone can play browser games, make one by tuning a kit (or by describing it to the AI studio), publish it as a signed, content-addressed "cartridge", and earn from collects, tips, remix royalties and weekly GPLY rewards. Today it is a **devnet prototype**: every transaction is a real Ed25519 signature replayed on a simulated ledger, and no real funds move.

The whole product ships as one self-contained HTML page with no dependencies.

## Commands

```bash
node build.mjs                 # build everything into dist/
node test/core.test.mjs        # protocol unit tests (RFC 8032 vectors, splits, epochs)
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
| `src/core.js` | Protocol: Ed25519 (WebCrypto with a pure-JS fallback), base58, SHA-256, canonical JSON, transaction signing (`GAMEPLAY/v1` domain), `buildWorld()` ledger replay, collect splits, epoch rewards, `RULES`. Exposed as `window.PPCore`. |
| `src/kits.js` | Canvas game engine, five tunable kits (runner, flap, shooter, breaker, dodge), brand palettes, the player SDK injected into every game (`window.SP`), procedural cover art. Exposed as `window.PPKits`. |
| `src/harness.js` | The AI build harness shared by the page and the server: `HARNESS` (system prompt, including the crypto-game rules), `harnessTask()`, `checkRequest()`, style and idea lists (`CRYPTO_IDEAS`). Exposed as `window.PPHarness`. |
| `src/app.js` | The app: routes (`home`, `explore`, `game-<id>`, `create`, `wallet`, `ledger`, `economy`, `business`), wallet, storage, sandboxed game players, AI studio (`aiBuild()` picks Claude's `sample` or the server), accessibility settings. |
| `server/server.mjs` | Zero-config Node server: serves `dist/site`, injects `GP_SITE.ai`, and streams `POST /api/build` from the Claude API (Sonnet 5.5 for new games, Haiku 5.5 for edits) with per-visitor daily limits. The only file that uses an npm package (`@anthropic-ai/sdk`). |
| `src/index.html` | Styles (design tokens, light/dark/high-contrast themes) and the page shell. `<!--INLINE-SCRIPTS-->` is replaced by the three scripts at build time. |
| `build.mjs` | Writes `dist/playpark.html` (body published as a claude.ai artifact), `dist/local.html` (test page) and `dist/site/` (the standalone website + README). |
| `test/` | `core.test.mjs` unit tests, `server.test.mjs` server tests, `e2e.py` browser scenarios and a11y audit, `mock_claude.js` fake artifact runtime, `fake_ai_server.mjs` the server with a fake Claude for the browser tests. |
| `render.yaml` | Render blueprint behind the README's Deploy to Render button: runs the server, prompts for `ANTHROPIC_API_KEY`, sets per-visitor and site-wide daily build caps. |
| `.github/workflows/pages.yml` | Builds, tests and deploys `dist/site` to GitHub Pages on every push to `main`. |

## Where it runs

- **Inside Claude** (`ENV === 'claude'`): the artifact runtime provides `window.claude.use('db' | 'user' | 'sample' | 'downloads')`. The owner and invited editors write to a shared gallery in `db`; public-link viewers are read-only and fall back to local mode. `sample` powers the AI studio using the viewer's own Claude account.
- **As a plain website** (`ENV === 'web'`): no `window.claude`. Everything runs in local mode with `localStorage`; downloads use a normal link. The AI studio is on only when `server/server.mjs` serves the page (it sets `window.GP_SITE.ai`); on a static host it shows a notice. Business inquiries use `window.GP_SITE.contact` (set `GP_CONTACT` when building).

## Rules that keep things working

- **No external scripts or libraries.** Everything is inlined. JS sources must never contain `</script`, `<!--` or `<script` (the build fails if they do); split tags like `'<scr' + 'ipt>'`.
- **Starter game hashes are part of the ledger.** Scores are signed against a game's SHA-256. Changing `ENGINE`, any `KIT_*` function, `kitDoc()` output for the named palettes, or `normalizeParams()` key order changes the starter hashes and orphans existing starter scores. Put per-player behavior in the SDK (`SDK()` in kits.js), which is injected at play time and is not hashed.
- **Do not change the signing format** (`txMessage`, `delegationMessage`, `epochMessage`, the `GAMEPLAY/v1` domain) without a migration: it invalidates every existing signature.
- **Storage keys keep the old `pp.` prefix** (from the working name PlayPark) so existing browsers keep their wallets and games. Display preferences live in `gp.prefs.v1`.
- **Accessibility is tested.** Type sizes are in `rem`, colors come only from tokens, every theme (light, dark, contrast) must pass the e2e contrast audit, headings must not skip levels, and nothing may scroll sideways at 390px even with the largest text size.
- **Assist mode** slows the game clock in the SDK. Assisted runs must never be signed to ranked leaderboards.

## Guardrails

- Keep everything on devnet. Real money (USDC collects, payouts) waits for a security audit; the GPLY token waits for a legal opinion. The Philippine SEC's CASP Rules (in force since 5 July 2025) cover anyone offering crypto services to people in the Philippines, and the BSP has kept new VASP licenses frozen since 2025, so do not build custody, token sales or a peso-to-crypto exchange.
- Never put secrets in the shared `db` or in the page. AI keys belong on the server (`ANTHROPIC_API_KEY` for `server/server.mjs`), and `/api/build` only accepts structured requests checked by `checkRequest()`, never a raw prompt, so it cannot be used as an open Claude proxy.

## Next engineering steps

1. Deploy `server/server.mjs` with a Claude API key (`render.yaml` / the README's Deploy to Render button), and move its in-memory daily limits to a shared store (and tie them to Sparks) once it runs on more than one instance.
2. A shared gallery for the plain website (a small database or the Solana programs below).
3. Solana programs: an Anchor registry, Metaplex Core / Bubblegum v2 editions, a Merkle rewards distributor.
4. Passkey embedded wallets (Privy, Dynamic or Para) and a Kora fee relayer for gasless actions.
5. Game files on Arweave, plus content screening and a moderation queue.
6. A real contact form on the Business page.

## Links

- Live prototype and website (claude.ai artifact): https://claude.ai/artifact/LWD53ZnDZH4DYnuGbL7qy6
- Blueprint doc (teardown, architecture, economy, risks, roadmap, launch plan): https://claude.ai/artifact/1q6BrR26CTdLVg4AaMZCVg
