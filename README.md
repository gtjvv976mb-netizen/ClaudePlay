# GamePlay

A free game maker where anyone can play browser games, make one in a minute, and own and earn from it on Solana. This is the full project: the website, the app, the tests and the build script.

> Devnet prototype. Transactions are real Ed25519 signatures on a simulated Solana ledger. No real money moves, and GPLY is a working name that is not for sale.

## Try it

Open `dist/site/index.html` in any browser. That one file is the whole website.

## Put the website online

- **Quickest:** drag the `dist/site` folder onto https://app.netlify.com/drop.
- **GitHub Pages, updated on every push:** in this repository, open *Settings → Pages* and set *Source* to *GitHub Actions*, then run the *Build and deploy website* workflow once from the *Actions* tab. After that, every push to `main` builds, tests and publishes the site. GitHub Pages on a free account needs a public repository. To show a contact button on the Business page, add a repository variable named `GP_CONTACT` with your email address or booking link.

`dist/site/README.md` lists more hosts and explains what works on a plain website.

## Work on it with Claude Code

Clone this repository (or unzip the project), open a terminal in the folder and run `claude`. `CLAUDE.md` tells Claude Code how the project fits together, how to build and test it, and which rules keep saved games and signatures valid.

## Build and test

```bash
node build.mjs            # writes dist/
node test/core.test.mjs   # unit tests
cd dist && python3 -m http.server 8765 --bind 127.0.0.1 &
python3 test/e2e.py /tmp/gameplay-shots   # browser + accessibility tests (Python Playwright)
```

No npm packages are needed. The browser tests need `pip install playwright` and `playwright install chromium`.

GamePlay is an independent project and is not affiliated with Google.
