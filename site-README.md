# ClaudePlay website

> Unofficial fan project, not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic, PBC.

This folder is the whole ClaudePlay website: one file, `index.html`. It has no server, no build step and no dependencies, so any static host can serve it. Anyone who opens it can play the games, make games with the kits, publish them, collect and tip, all on a devnet simulation.

## Put it online (free)

Pick one host. Each takes about five minutes.

**Netlify Drop**
1. Go to https://app.netlify.com/drop and sign in.
2. Drag this whole folder onto the page.
3. Netlify gives you a public link. Rename the site under *Site configuration* if you want a nicer address.

**GitHub Pages**
1. Create a new public repository on GitHub and upload `index.html`.
2. Open *Settings → Pages*, choose *Deploy from a branch*, pick `main` and `/ (root)`, then save.
3. The site appears at `https://<your-username>.github.io/<repository>/` within a minute or two.

**Cloudflare Pages**
1. In the Cloudflare dashboard, open *Workers & Pages → Create → Pages → Upload assets*.
2. Upload this folder and deploy.

To use your own domain (for example `gameplay.example`), add it in the host's domain settings and follow its DNS steps.

## What works on a plain website

- The front page, the arcade, the game pages and the business page.
- Making games with the five kits, including custom brand colors.
- Publishing, signed scores, collecting, tipping, boosting and the ledger. These run on a devnet simulation in each visitor's browser. Nothing is shared between visitors yet, and no real money moves.
- Downloading any game as a single HTML file.
- Accessibility settings: assist mode (slower games), high contrast, larger text, reduced motion and sound off.

## What needs more work

- **AI studio.** Describing games in words needs the ClaudePlay server (`server/server.mjs` in the source repository), which keeps the owner's Claude API key private. Hosted creation is free within daily creator allowances and a shared $400 lifetime API budget, including best builds, edits and reviews. A durable budget database is required; see the source repository's README for setup. On a static host without the server, the page tells visitors to tune a kit instead.
- **Shared gallery.** On a static host, games published by a visitor stay in that visitor's browser. The ClaudePlay server (`server/server.mjs` in the source repository) keeps a shared gallery so everyone sees every game.
- **Contact button.** To show a contact button on the Business page, open `index.html`, search for `window.GP_SITE`, and put your email address or an `https://` booking link in `contact`. If you build from source, `GP_CONTACT=hello@example.com node build.mjs` does the same.

ClaudePlay is an independent project and is not affiliated with Google.
