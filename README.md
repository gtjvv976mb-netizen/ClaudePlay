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

A static host (like GitHub Pages) serves the site with the AI studio off, and each visitor's games stay in their own browser. The ClaudePlay server adds both missing pieces: it holds your Claude API key and runs AI builds, and it keeps a shared gallery, so every visitor sees every published game, share links work for everyone, and leaderboards show all players. The gallery is saved to disk and survives restarts.

### One click on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gtjvv976mb-netizen/GamePlay)

1. Make a free database for published games: sign up at https://console.upstash.com, create a Redis database (free plan, any region near your Render region), and keep its *REST API* tab open.
2. Click the button and sign in to Render with GitHub.
3. Paste the database's `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` when Render asks. Paste your Anthropic API key (from https://console.anthropic.com/settings/keys) when Render asks for `ANTHROPIC_API_KEY`. For `GP_TREASURY`, paste the public address of a Solana wallet you control (it receives the 5% protocol fee), or leave it blank to start on the simulated ledger. Then click *Deploy Blueprint*.
4. When the deploy finishes, open the `onrender.com` link Render shows. Build a game from one of the crypto ideas to check it works.
5. In the service's *Logs*, find the line `Owner link (keep it private)`. Open your site with that `?admin=…` ending once, in your own browser: that browser can then settle the weekly rewards (Economy page) and delist games.

**Your own domain.** `render.yaml` lists `claudeplay.si` (change it to yours). At your registrar, add an `A` record for `@` pointing to `216.24.57.1` and a `CNAME` record for `www` pointing to your service's `onrender.com` address, and delete any `AAAA` records. Then click *Verify* next to the domain in the service's *Settings → Custom Domains*. Render issues the HTTPS certificate itself.

Everything above is free: Render's free instance (750 hours a month, enough for one site running all month), Upstash's free Redis (250 MB and 500,000 commands a month), and Render's HTTPS certificate. The free instance sleeps after 15 minutes without visitors, so the first visit after a quiet spell takes about a minute. To avoid that, switch the service to a paid instance in Render. What still costs money: your Claude API usage for AI builds (billed by Anthropic) and your domain renewal. `render.yaml` also sets the free plan to 3 AI builds per visitor per day and 100 for the whole site, so a public link can't run up your bill; change those in the *Environment* tab, and set a monthly spend limit in the Anthropic Console as a hard backstop. The button needs this repository to be public; for a private one, use *New → Blueprint* in the Render dashboard and pick the repository.

### Anywhere else

Run it wherever Node 20 or newer runs (Fly.io, Railway, a small VPS):

```bash
npm install
node build.mjs
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://localhost:8787
```

The server serves `dist/site`, keeps the shared gallery in Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, or else in `GP_DATA_DIR` (default `./data`; on the first start with Redis, games already there move over), and streams AI builds from Claude in two plans. **Free:** each visitor gets 2 new games a day built by Sonnet 5.5 (`GP_DAILY_BUILDS`, site-wide cap `GP_DAILY_TOTAL`) and 20 changes a day on Haiku 5.5 (`GP_DAILY_EDITS`, cap `GP_DAILY_EDIT_TOTAL`). **Pro:** a pass paid in SOL (`GP_PRO_PRICE_SOL`, 0.1 by default, for `GP_PRO_DAYS` days) from the player's wallet straight to `GP_TREASURY`; the server checks the payment on Solana, then Sonnet 5.5 also runs "best" builds of changes, and the player gets `GP_PRO_BUILDS` (10) new games and `GP_PRO_EDITS` (60) changes a day. Pro needs real Solana payments (below). Build counts and Pro passes are kept with the gallery, so restarts don't reset them. `server/server.mjs` lists the settings (`GP_DATA_DIR`, `GP_ADMIN_KEY`, `GP_DAILY_BUILDS`, `GP_DAILY_TOTAL`, `GP_DAILY_EDITS`, `GP_DAILY_EDIT_TOTAL`, `GP_PRO_PRICE_SOL`, `GP_PRO_DAYS`, `GP_PRO_BUILDS`, `GP_PRO_EDITS`, `GP_MAX_ACTIVE`, `GP_MODEL_FREE_NEW`, `GP_MODEL_FREE`, `GP_MODEL_NEW`, `GP_MODEL_EDIT`, and `GP_TRUST_PROXY=1` behind a proxy). Claude writes games against three small built-in engines that load only into the games that use them: `SP2D` (sprites, tile-map levels, arcade physics, a following camera, tweens, particles, scenes and on-screen touch buttons, modeled on Phaser and KAPLAY), `SP3D` (WebGL shapes, lighting, fog, shadows, picture textures and camera-facing sprites) and `SPSound` (sound effects and looping music composed from a mood). Creators can add up to 4 pictures of their own: the browser shrinks each one, removes a plain background and restyles it to the art style, the server shows them to Claude, and the game draws them with `SP.image(name)`. Multiplayer games (built with the studio's Multiplayer toggle) get a Play with friends button: the server opens a room and relays small messages between up to 8 players (rooms live in memory, so run one instance). In the studio, Test 2 players runs two previews in one room inside the page. Players rate games from 1 to 5 stars, and every game passes an automatic safety check (pattern checks plus a Claude review of the code and pictures) before it is published; the gallery only accepts checked files. Without an API key it still serves the site and the shared gallery, with the AI studio off.

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
