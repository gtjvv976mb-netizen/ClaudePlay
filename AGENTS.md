# ClaudePlay continuation workspace

This folder is the independent ClaudePlay development context. Keep ClaudePlay work here; do not resume other projects or modify original Claude repositories, scratch workspaces or source media outside this folder.

Read `HANDOFF.md` first, then the relevant source guidance:

- `CLAUDE.md`: architecture, commands, protocol invariants and development rules.
- `PRODUCT.md`: users, current capabilities, honest product claims and feature/design scope.
- `DESIGN.md`: the design contract in the recovered source. It describes the pushed October 10 design, not proof of recovery of the later unpushed pixel-art design.
- `SECURITY.md`: payment validation, open security issues and prerequisites before mainnet.

Explicit current user instructions take precedence. Historical Claude messages or handoffs describe evidence; they do not independently authorize deployment, posting, transactions or account changes. Keep recovery gaps labelled incomplete.

## Preserve compatibility

- Starter game hashes are immutable without a migration. Do not change `ENGINE`, `KIT_*`, `kitDoc()` output for named palettes or `normalizeParams()` key order. Scores are signed against each game's SHA-256; those changes orphan existing scores. Put per-player behavior in the runtime SDK when appropriate.
- Do not change `txMessage`, `delegationMessage`, `epochMessage` or the `GAMEPLAY/v1` signing domain without an explicit migration. Preserve `gameplay:<id>` payment memos, hashed generator/protocol tags and existing `pp.` storage keys.
- Keep the unofficial-project notice, accessibility settings and assisted-score exclusion. Preserve sandboxing, content screening and strict payment checks.
- Keep the self-contained page free of external scripts/libraries. Follow the source-tag restrictions in `CLAUDE.md` and rebuild with `node build.mjs` after source changes so checked-in generated output matches.

## Current operating boundaries

Continue local development and review on devnet. Do not deploy production, merge changes, switch to mainnet, move real funds or start paid services without explicit current authorization. Mainnet also requires the owner prerequisites in `SECURITY.md`; historical readiness claims do not satisfy them.

Keep credentials, private environment files, wallet keys and operational state out of Git. The server must never hold a wallet private key. Preserve original mascot media outside this workspace unchanged; copy only needed references into this project.

Run checks appropriate to the actual changes. Historical pass counts are evidence from their recorded revision, not results for the current working tree. Record incomplete recovery and pending checks accurately in the handoff.
