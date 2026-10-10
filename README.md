# GamePlay

A free game maker where anyone can play browser games, make one in a minute, and own and earn from it on Solana. This is the full project: the website, the app, the tests and the build script.

> Devnet prototype. Transactions are real Ed25519 signatures on a simulated Solana ledger. No real money moves, and GPLY is a working name that is not for sale.

## Try it

Open `dist/site/index.html` in any browser. That one file is the whole website.

## Put the website online

- **Quickest:** drag the `dist/site` folder onto https://app.netlify.com/drop.
- **GitHub Pages, updated on every push:** in this repository, open *Settings → Pages* and set *Source* to *GitHub Actions*, then run the *Build and deploy website* workflow once from the *Actions* tab. After that, every push to `main` builds, tests and publishes the site. GitHub Pages on a free account needs a public repository. To show a contact button on the Business page, add a repository variable named `GP_CONTACT` with your email address or booking link.

`dist/site/README.md` lists more hosts and explains what works on a plain website.

## Turn on the AI studio for everyone

A static host serves the site with the AI studio switched off, because describing games in words needs a Claude API key that must never be in the page. The GamePlay server holds the key and runs the builds.

### One click on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/gtjvv976mb-netizen/GamePlay)

1. Click the button and sign in to Render with GitHub.
2. Paste your Anthropic API key (from https://console.anthropic.com/settings/keys) when Render asks for `ANTHROPIC_API_KEY`, then click *Deploy Blueprint*.
3. When the deploy finishes, open the `onrender.com` link Render shows. Build a game from one of the crypto ideas to check it works.

`render.yaml` sets everything else: 12 builds per visitor per day and 300 for the whole site, so a public link can't run up your bill. Change those in the service's *Environment* tab. The free plan sleeps after a while without visitors, so the first visit after that takes about a minute to wake up. The button needs this repository to be public; for a private one, use *New → Blueprint* in the Render dashboard and pick the repository.

### Anywhere else

Run it wherever Node 20 or newer runs (Fly.io, Railway, a small VPS):

```bash
npm install
node build.mjs
ANTHROPIC_API_KEY=sk-ant-... npm start      # http://localhost:8787
```

The server serves `dist/site` and streams AI builds from Claude: Sonnet 5.5 builds new games and Haiku 5.5 applies changes and bug fixes. Each visitor gets 12 builds a day by default. `server/server.mjs` lists the settings (`GP_DAILY_BUILDS`, `GP_DAILY_TOTAL`, `GP_MAX_ACTIVE`, `GP_MODEL_NEW`, `GP_MODEL_EDIT`, and `GP_TRUST_PROXY=1` behind a proxy). Without a key it still serves the site, with the AI studio off.

The front page and the studio offer crypto game ideas (Block Miner, Rug Pull Runner, Gas Fee Dodger and more). The build instructions keep crypto make-believe inside games: tokens are points, nothing asks for a wallet or seed phrase, and there is no betting. GamePlay itself signs scores and handles collects on Solana devnet.

## Work on it with Claude Code

Clone this repository (or unzip the project), open a terminal in the folder and run `claude`. `CLAUDE.md` tells Claude Code how the project fits together, how to build and test it, and which rules keep saved games and signatures valid.

## Build and test

```bash
node build.mjs            # writes dist/
node test/core.test.mjs   # unit tests
node test/server.test.mjs # AI server tests (fake Claude, no key needed)
cd dist && python3 -m http.server 8765 --bind 127.0.0.1 &
python3 test/e2e.py /tmp/gameplay-shots   # browser + accessibility tests (Python Playwright)
```

The website needs no npm packages; only the AI server uses the Anthropic SDK (`npm install`). The browser tests need `pip install playwright` and `playwright install chromium`.

GamePlay is an independent project and is not affiliated with Google.
