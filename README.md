# GamePlay

A free game maker where anyone can play browser games, make one in a minute, and own and earn from it on Solana. This is the full project: the website, the app, the tests and the build script.

> Devnet prototype. Transactions are real Ed25519 signatures on a simulated Solana ledger. No real money moves, and GPLY is a working name that is not for sale.

## Try it

Open `dist/site/index.html` in any browser. That one file is the whole website.

## Put the website online

- **Quickest:** drag the `dist/site` folder onto https://app.netlify.com/drop.
- **GitHub Pages, updated on every push:** in this repository, open *Settings → Pages* and set *Source* to *GitHub Actions*, then run the *Build and deploy website* workflow once from the *Actions* tab. After that, every push to `main` builds, tests and publishes the site. GitHub Pages on a free account needs a public repository. To show a contact button on the Business page, add a repository variable named `GP_CONTACT` with your email address or booking link.

`dist/site/README.md` lists more hosts and explains what works on a plain website.

## Put the full GamePlay online

A static host (like GitHub Pages) serves the site with the AI studio off, and each visitor's games stay in their own browser. The GamePlay server adds both missing pieces: it holds your Claude API key and runs AI builds, and it keeps a shared gallery, so every visitor sees every published game, share links work for everyone, and leaderboards show all players. The gallery is saved to disk and survives restarts.

### One click on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gtjvv976mb-netizen/GamePlay)

1. Click the button and sign in to Render with GitHub.
2. Paste your Anthropic API key (from https://console.anthropic.com/settings/keys) when Render asks for `ANTHROPIC_API_KEY`. For `GP_TREASURY`, paste the public address of a Solana wallet you control (it receives the 5% protocol fee), or leave it blank to start on the simulated ledger. Then click *Deploy Blueprint*.
3. When the deploy finishes, open the `onrender.com` link Render shows. Build a game from one of the crypto ideas to check it works.
4. In the service's *Logs*, find the line `Owner link (keep it private)`. Open your site with that `?admin=…` ending once, in your own browser: that browser can then settle the weekly rewards (Economy page) and delist games.

`render.yaml` uses Render's Starter instance with a 1 GB disk for the gallery (Render shows the price before you confirm; a disk needs a paid instance). For a free trial, set `plan: free` and remove the `disk` block: everything works, but published games reset on every deploy or restart. It also sets 12 AI builds per visitor per day and 300 for the whole site, so a public link can't run up your bill; change those in the *Environment* tab. The button needs this repository to be public; for a private one, use *New → Blueprint* in the Render dashboard and pick the repository.

### Anywhere else

Run it wherever Node 20 or newer runs (Fly.io, Railway, a small VPS):

```bash
npm install
node build.mjs
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://localhost:8787
```

The server serves `dist/site`, keeps the shared gallery in `GP_DATA_DIR` (default `./data`), and streams AI builds from Claude: Sonnet 5.5 builds new games and Haiku 5.5 applies changes and bug fixes. Each visitor gets 12 builds a day by default. `server/server.mjs` lists the settings (`GP_DATA_DIR`, `GP_ADMIN_KEY`, `GP_DAILY_BUILDS`, `GP_DAILY_TOTAL`, `GP_MAX_ACTIVE`, `GP_MODEL_NEW`, `GP_MODEL_EDIT`, and `GP_TRUST_PROXY=1` behind a proxy). Without an API key it still serves the site and the shared gallery, with the AI studio off.

The front page and the studio offer crypto game ideas (Block Miner, Rug Pull Runner, Gas Fee Dodger and more). The build instructions keep crypto make-believe inside games: tokens are points, nothing asks for a wallet or seed phrase, and there is no betting. GamePlay itself signs scores and handles collects on Solana devnet.

### Real Solana payments

Set `GP_SOLANA_CLUSTER` (`devnet` in `render.yaml`) and `GP_TREASURY` (a wallet address, never a secret key), and collects and tips become real Solana transfers. The player's wallet pays the creator, the remix lineage and the treasury directly in one transaction; GamePlay never holds funds and the server holds no private key. Every page checks each payment on Solana before it counts. On devnet, the Wallet page has a faucet for free test SOL. Optional: `GP_SOLANA_RPC` for your own RPC endpoint.

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

GamePlay is an independent project and is not affiliated with Google.
