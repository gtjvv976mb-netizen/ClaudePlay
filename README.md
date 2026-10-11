# ClaudePlay

> Unofficial fan project. ClaudePlay is not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic, PBC.

A free game maker where anyone can play browser games, make one in a minute, and own and earn from it on Solana. This is the full project: the website, the app, the tests and the build script.

> Devnet prototype. Transactions are real Ed25519 signatures on a simulated Solana ledger. No real money moves, and GPLY is a working name that is not for sale.

## Try it

Open `dist/site/index.html` in any browser. That one file is the whole website.

## Put the website online

- **Quickest:** drag the `dist/site` folder onto https://app.netlify.com/drop.
- **GitHub Pages, updated on every push:** in this repository, open *Settings → Pages* and set *Source* to *GitHub Actions*, then run the *Build and deploy website* workflow once from the *Actions* tab. After that, every push to `main` builds, tests and publishes the site. GitHub Pages on a free account needs a public repository. To show a contact button on the Business page, add a repository variable named `GP_CONTACT` with your email address or booking link.

`dist/site/README.md` lists more hosts and explains what works on a plain website.

## Put the full ClaudePlay online

A static host serves the site with the AI studio off, and each visitor's games stay in their own browser. The ClaudePlay server adds hosted AI and a shared gallery: published games and share links work across devices, and leaderboards include all players. Its default sponsored mode gives everyone the same free access, including best-quality AI edits, without a paid Pro pass or their own Claude subscription. The owner's Anthropic key stays on the server.

### Free access and the $400 AI budget

Hosted AI has a **$400 lifetime allowance for this platform's Claude API requests**, shared by all users and all AI endpoints. `GP_AI_BUDGET_USD` defaults to `400`; it can be lowered to any value from `0` to `400`. This counter has no daily or monthly reset. Builds, edits, safety reviews and play-test reviews all use it. It does not cover requests made by other applications with the same Anthropic account or key, infrastructure charges, domain renewals or taxes.

Before contacting Claude, the server atomically reserves a conservative maximum for the model's context and requested output. A completed response with valid usage data settles that reservation against a conservative priced usage total and releases the excess. Failed, aborted or ambiguous calls retain their full reservation, including across restarts. When there is too little remaining allowance to reserve another call, or the durable counter cannot be checked, the server stops AI requests. Consequently it can stop before actual billed usage reaches $400.

Daily allowances reset at midnight UTC. Each gallery account has its own allowance, and a shared network has a separate ceiling ten times higher by default (`GP_NETWORK_MULTIPLIER=10`). Changing browser keys alone does not bypass that network ceiling. Requests without a valid gallery key use an anonymous address bucket at the per-user allowance.

| AI action | Per account per day | Per shared network per day | Account environment setting |
| --- | --- | --- | --- |
| New games | 2 | 20 | `GP_DAILY_BUILDS` |
| Edits and fixes, including best-quality edits | 20 | 200 | `GP_DAILY_EDITS` |
| Publishing safety reviews | 20 | 200 | `GP_DAILY_SCREENS` |
| Play-test reviews | 40 | 400 | `GP_DAILY_PLAYTESTS_USER` |

The Blueprint also limits the whole site to 40 new games, 300 edits and 1,000 play-test reviews a day. These capacity limits are separate from the permanent $400 counter. Paid Pro is disabled while `GP_SPONSORED=1`, which is the hosted default.

Exhausting sponsored AI does not create a paywall. Playing existing games, tuning kits, keeping drafts, multiplayer, downloads and manual editing of saved game files remain free. New AI calls pause; publishing a changed file still needs the required safety review. `/api/status` reports each daily allowance, `resetAt`, and the budget's `capUsd`, `reservedUsd`, `remainingUsd` and `available` fields. Remaining daily requests respect both the account and network ceilings; `allowancesUnavailable` signals a count-store failure.

Keep the same budget database across deployments. Do not delete its lifetime counter, expire it, flush the database or replace it with an empty store to restart the allowance. Provider-side spend controls and a dedicated Anthropic key are useful additional protections, but the platform counter does not establish an account-wide spending limit.

Automatic gallery migration from a file store to Redis refuses a source with a nonzero lifetime budget counter. Moving a funded deployment requires stopping all writers and explicitly preserving its budget total and reservation receipts before switching stores; startup fails closed until that migration is handled.

### One click on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gtjvv976mb-netizen/ClaudePlay)

1. Set up a durable Redis database at [Upstash](https://console.upstash.com), preferably near your Render region, and keep its *REST API* tab open. The same database stores published games, daily counts and the lifetime AI budget. Configure it to retain those records; check the database plan's current storage and request limits.
2. Click the button and sign in to Render with GitHub.
3. Paste the database's `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` when Render asks. Paste your Anthropic API key (from https://console.anthropic.com/settings/keys) when Render asks for `ANTHROPIC_API_KEY`. For `GP_TREASURY`, paste the public address of a Solana wallet you control (it receives the 5% protocol fee), or leave it blank to start on the simulated ledger. Then click *Deploy Blueprint*.
4. Keep `GP_SPONSORED=1`, `GP_AI_BUDGET_USD=400` and `GP_PRO_PRICE_SOL=0`. Free Render instances must use Upstash; leave `GP_DATA_PERSISTENT=0`. For an existing service, set new variables in its *Environment* tab: Blueprint `sync: false` prompts appear only during initial creation, so an updated file alone does not fill missing secrets.
5. When the deploy finishes, open the service URL and `/api/status`. Confirm `ai: true`, `plan: "sponsored"`, `pro: null`, the 2/20 daily build/edit limits, and a readable budget with `capUsd: 400`. Then make and publish a test game. Without the API key the AI studio is off; without a durable budget store sponsored requests fail closed.
6. In the service's *Logs*, find the line `Owner link (keep it private)`. Open your site with that `?admin=…` ending once, in your own browser: that browser can then settle the weekly rewards (Economy page) and delist games. Keep that link and `GP_ADMIN_KEY` private.

**Your own domain.** `render.yaml` lists `claudeplay.si`; change it for a separate deployment. Follow the DNS records displayed in Render's *Settings → Custom Domains*, then verify the domain there. Render manages its HTTPS certificate.

The Blueprint uses Render's free compute plan. Free service hours are shared across the workspace; bandwidth and build limits depend on its plan. A free service sleeps after 15 minutes without inbound traffic, can take about a minute to wake, and loses local files on restart, redeploy or spin-down. Free Render Key Value instances also lose data on restart, so they cannot hold the permanent sponsorship counter. See [Render's current free-service limitations](https://render.com/docs/free). Upstash, domain and hosting charges are separate from the sponsored API budget. The deploy button needs a public repository; for a private one, use *New → Blueprint* in Render and select the repository.

### Anywhere else

Run it wherever Node 20 or newer runs (Fly.io, Railway, a small VPS):

```bash
npm install
node build.mjs
npm start                 # http://localhost:8787
```

Configure `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` through your host's secret settings before enabling AI. Never put their values in Git, browser code, the shared gallery or a public status response. `GP_ADMIN_KEY` is also private. Set `GP_TRUST_PROXY=1` only behind a proxy that replaces the visitor-address header correctly.

The server serves `dist/site` and keeps its gallery and budget in Upstash. A file store in `GP_DATA_DIR` is allowed for sponsorship only on a genuinely persistent filesystem, with `GP_DATA_PERSISTENT=1` attesting that it survives restarts and deployments. Use it on a host with a durable disk, run one process, and keep that disk. Memory and unverified file storage cannot safely enforce the lifetime cap. Never set this flag to bypass the restriction on free Render.

New games and best-quality edits use Sonnet 5.5 by default; standard edits and reviews use Haiku 5.5. The budget module accepts only models with a supported conservative price schedule; unpriced model overrides fail closed. `server/server.mjs` lists the deployment settings, including `GP_MAX_ACTIVE`, daily/site limits and model overrides. Sponsored mode is the default; `GP_SPONSORED=0` selects legacy compatibility behavior and should not be used for this free public deployment.

Claude writes games against three engines injected only into games that use them: `SP2D` for sprites, tile maps, arcade physics and touch controls; `SP3D` for WebGL scenes; and `SPSound` for effects and music. Creators can add up to four pictures: the browser shrinks them, removes a plain background and restyles them; the game draws them with `SP.image(name)`. Multiplayer uses an in-memory relay for up to 16 players per room (`GP_ROOM_PLAYERS`, at most 32), so run one instance. A separate daily traffic allowance, `GP_ROOM_MB_DAY` (100 MB by default), protects outbound bandwidth. The studio's Test 2 players runs two local previews. Games have ratings, and publishing uses pattern checks plus an AI safety review; checked files are enforced by the shared gallery. Without an API key, the site and gallery remain available with hosted AI off.

AI builds are instructed to draw pixel art in code (`SP.sprite`, `SP.paint` and parallax layers) and are play-tested before the creator sees them: the page presses keys and taps, then Claude can review three screenshots and a run log. These reviews share the sponsored budget and daily review limits; when review is unavailable, the in-page checks still run. A detected problem can trigger one automatic AI fix, subject to the edit allowance and remaining budget. Changes use search-and-replace patches, with Undo, Before and after and What changed. Big requests get a checklist and Build the rest. Makers have guided starts, saved drafts, unlisted publishing and republishing. Players can follow makers, start friends boards, open a game on a phone by QR code and remix it. Downloads carry the player SDK and engines and play independently.

The front page and the studio offer crypto game ideas (Block Miner, Rug Pull Runner, Gas Fee Dodger and more). The build instructions keep crypto make-believe inside games: tokens are points, nothing asks for a wallet or seed phrase, and there is no betting. ClaudePlay itself signs scores and handles collects on Solana devnet.

### Real Solana payments

Set `GP_SOLANA_CLUSTER` (`devnet` in `render.yaml`) and `GP_TREASURY` (a wallet address, never a secret key), and collects and tips become real Solana transfers. The player's wallet pays the creator, the remix lineage and the treasury directly in one transaction; ClaudePlay never holds funds and the server holds no private key. Every page checks each payment on Solana before it counts. On devnet, the Wallet page has a faucet for free test SOL. Optional: `GP_SOLANA_RPC` for your own RPC endpoint.

Mainnet (real money) refuses to start unless `GP_ALLOW_MAINNET=yes` and your own RPC endpoint in `GP_SOLANA_RPC` are also set. On mainnet, players pay and creators publish from a wallet app (Phantom, Solflare or Backpack), never from a key kept in the browser. Do that only after the owner checklist in [SECURITY.md](SECURITY.md): your own fee wallet, an independent security audit, a legal opinion and moderation.

## Work on it with Claude Code

Clone this repository (or unzip the project), open a terminal in the folder and run `claude`. `CLAUDE.md` tells Claude Code how the project fits together, how to build and test it, and which rules keep saved games and signatures valid.

## Build and test

```bash
node build.mjs            # writes dist/
node test/core.test.mjs   # unit tests
node test/solana.test.mjs # Solana payment tests (npm install for the web3.js cross-checks)
node test/server.test.mjs # AI server tests (fake Claude, no key needed)
cd dist && python3 -m http.server 8765 --bind 127.0.0.1 &
python3 test/e2e.py /tmp/gameplay-shots   # browser + accessibility tests (Python Playwright)
```

The website needs no npm packages; only the AI server uses the Anthropic SDK (`npm install`). The browser tests need `pip install playwright` and `playwright install chromium`.

ClaudePlay is an independent project and is not affiliated with Google.
