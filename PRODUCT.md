# Product

<!-- impeccable:product-schema 1 -->

Written from the repository (CLAUDE.md, README, the site's copy) and the owner's messages in the project. Facts marked *(inferred)* were not confirmed by the owner in an interview.

## Platform

web

## Users

- **Players** on phones and laptops who want a quick browser game, often arriving from a shared link. No sign-up, no wallet needed to play.
- **Makers**, mostly people who have never written a game, who describe one in a sentence (or tune a kit) and want something playable and shareable in minutes. *(inferred: many come from crypto communities, given the crypto game ideas and Solana tips)*
- **Brands, communities and schools** who want branded mini-games or game-making workshops.

## Product Purpose

ClaudePlay is a free, open alternative to Google Labs Playground with an earning layer on Solana. Anyone can play browser games, make one by describing it to Claude or tuning a kit, publish it as a signed, content-addressed cartridge, and earn from collects, tips and remix royalties. Success is a stranger going from the front page to a game they made, playing it, and sending the link to a friend.

## Positioning

- The game you make is yours: a single signed file you can download, play offline and self-host.
- Creators earn directly: collects and tips go wallet to wallet on Solana, remixes pay the original creator, and the site never holds funds.
- It is built on Claude, runs from one self-contained page, and works with no AI at all through five tunable kits.

## Operating Context

Played in short sessions on phones (often inside Phantom or Solflare's in-app browser) and on laptops. Games run in a sandboxed frame on a "console" screen. Cartridges are the unit of a game: cover art, title, creator, edition count.

## Capabilities and Constraints

- One self-contained HTML page with no external scripts; only Google Fonts stylesheets are loaded from outside.
- Light, dark and high-contrast themes, three text sizes, calm motion and assist mode; all tested by an automated contrast and layout audit.
- Starter game hashes, the signing format and the `gameplay` protocol names must not change.
- Feature work belongs to the main build thread; design work changes look and feel only.

## Brand Commitments

- Name: **ClaudePlay**, an unofficial fan project, "not affiliated with or endorsed by Anthropic". The notice stays in the footer, FAQ and READMEs.
- Mascot: **Cart**, the animated character generated for the front page (`src/assets/`).
- The owner asked for a site that does not look AI-generic.

## Evidence on Hand

- Five real starter games (Neon Dash and the kits) with real cover art drawn by the engine.
- Real game data: plays, scores, editions and ratings from the ledger.
- No testimonials, customer logos or usage numbers exist. Do not invent them.

## Product Principles

1. Play first: the first screen should let someone play or make a game, not read about it.
2. Owned, not rented: every claim about earning or ownership must be true on the current network (devnet or mainnet).
3. Everyone can play: accessibility settings are part of the product, not an afterthought.
4. Honest about status: preview, devnet and fee details are stated plainly.

## Accessibility & Inclusion

WCAG AA contrast in every theme, rem-based type, no sideways scroll at 390px with the largest text, headings in order, reduced motion respected, keyboard and screen reader support inside games.
