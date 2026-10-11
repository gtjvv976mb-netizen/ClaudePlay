# Persistent animated-world release review

The owner accepted the pixel-world artwork and requested a moving full-site background: moving clouds, flying vehicles, floating islands, background activity and a camera journey into an individual island for every page. This release updates existing draft PR 18 on `codex/claudeplay-playground-redesign`. It supersedes the earlier per-hero/static review in `redesign-review.md`; neither the initial rejected workshop nor the earlier static snapshot establishes this release's results.

## Reviewed behavior

One `#site-world` host stays outside the replaceable `#view` and the fitted pager. The transparent page shell reveals the same fixed viewport world behind all ten routes. Required copy, fields, controls and data remain on bounded opaque cream/navy/high-contrast surfaces. Home exposes the world to the right of its creation card; the actual playable game and shelf remain separate fitted panes.

The accepted original image is unchanged. Native browser layers composite six independently floating original-art fragments over a matching generated sky plate. Five clouds drift at different depths; three original pixel-style vehicles cross the sky; waterfall streaks, sparkles and vehicle bobbing add activity. Stepped contours and a small runtime SVG edge mask remove the initial broad sky wedges without changing the source bitmap. No external runtime script/library, WebGL context or per-frame JavaScript loop is required for this background. The previous workshop module remains as source/isolated tests and is no longer shipped or mounted by current routes.

Camera journeys last 1.45 seconds, start at the currently rendered position and settle at the selected destination. Every route has a distinct framing, with four main island families:

| Route | Island |
| --- | --- |
| Home | Wide overview |
| Create | Forest platformer |
| Explore | Castle/puzzle |
| Game | Neon arcade city |
| Maker | Forest platformer |
| Group | Castle/puzzle |
| Wallet | Race/coast |
| Ledger | Neon arcade city |
| Economy | Race/coast |
| Business | Castle/puzzle |

Match my device honors OS reduction. Reduce motion always freezes decoration and settles the camera immediately. Full motion is an explicit preference that enables animation even when the device requests reduction; high contrast and forced colors still hide/freeze the world. Hidden pages, dialogs, text/select/contenteditable focus and game-frame focus pause motion. Mounts are idempotent; teardown cancels travel, removes its finish listener and releases owned listeners, observers and DOM without removing unowned children.

The owner's actual in-app browser reports device reduced motion. The new Full motion option was selected through the real Accessibility UI for the retained local preview; its world state is running. No OS setting was changed. Native Chrome/Chromium tests and a recorded real-browser tour demonstrate movement and all four camera destinations.

## Frozen source and assets

- Website HTML SHA-256: `f5412f43a2ae7b85c70fa93fe9ca89e8afb1317d0f8d4c25a3c9836b4b35f5fc`.
- World module SHA-256: `50a1d640447e08464e487836abd375049472ab76a16b25c8bf239b9b05d84b68`.
- Build-input snapshot SHA-256: `188cc7b3333d2bc346fa70512643d0e4dc8bc3f5d9d01e8869402be5cd77a594`. Method: sorted relative path, NUL, raw bytes, NUL, across fourteen explicit inputs listed in ignored `reports/world-motion-performance-shots/fixture-metadata.json`.
- Original art SHA-256 remains `9817189b2eaa5a48a66e0a56af0a03180788425f1e641b6bccb0acd3b98418ac`; source and website copy match.
- New sky plate: `src/assets/world-sky-v1.webp`, 1672×941, 62,570 bytes; SHA-256 `eabf88c6c8c9566b1017249768a59e7e628b31feb6af0a017b118037172363eb`. Source/website copy match.
- Built-in imagegen edit, original output, full prompt and encoding provenance: [play-world-asset.md](play-world-asset.md). Standalone artifact/local pages inline both images; the website ships local preloaded copies.

A deterministic rebuild reproduced the frozen HTML. All source-tag restrictions, JavaScript/Python syntax and whitespace checks passed. `git diff fcfa4dc9ade51acb6fc2b23db1b670049b0ab1aa -- src/core.js src/kits.js src/harness.js src/solana.js src/qr.js server` is empty: protected starter hashes, protocol, sandbox/harness and permanent spending guard are unchanged.

## Final checks on the frozen release

- `npm test`: 289 existing assertions + 28 budget/store/sponsored tests, all 317 pass. The immutable server/protocol sources are the same in the final frozen frontend.
- Existing E2E suite: all 335 checks across all 15 scenarios pass. Final creator group 78, hosted/social/payment group 138 and layout/accessibility group 119; every runner exited 0 naturally. The three stale assertions for the removed `#home-world` canvas were replaced with the equivalent stronger persistent fixed-world/no-pager-part assertions; no coverage was silently disabled.
- `WORLD_SITE_URL=http://127.0.0.1:8765/site/index.html npm run test:world`: all 12 tests pass, no skips. Real CSS movement, all ten cameras, finite travel, rapid route/pause behavior, calm/device/forced/contrast guards, Full motion via actual Settings UI, input/game/dialog/hidden pauses, destroy during active camera travel, listener/observer/frame cleanup, persistent integration and desktop/phone fit are covered. Tests record native browser, source hash and served HTML hash and reject a changing build.
- Legacy `test:workshop`: nine checks pass, including actual site navigation proving the retired scene allocates no GPU resources. Its isolated native software-WebGL tests do not claim hardware GPU support for the current decorative background.
- Final design audit: 579 states / 36 contexts / zero blocking findings; Chromium 153.0.8010.12, October 11 15:54:09–15:57:50 UTC (23:54:09–23:57:50 Manila). HTTP before/after HTML hashes match the frozen release. All ten routes, both layouts, three themes, loaded/offline fonts, every fitted pane, desktop/default and phone/xl text, settings and fresh guest/calm visits are covered. No fatal/setup/runtime/font/image errors or blocked writes.
- Final manual Home review: 90 computed text/input/placeholder checks across six desktop/md and 390×844/xl light/dark/contrast contexts pass after finite entrances settle. Opaque backgrounds are `#fffdf0`, `#15304c`, `#000`; minimum ratios are 6.21/7.37/14.88, title ratios 12.81/12.97/21. Nine inspected screenshots include phone internal-scroll bottom controls; required Play action and pager remain reachable, with zero global overflow.
- Final manual Home/Create/Explore/guest Wallet probes at desktop/default and phone/xl have zero errors/overflow. Contour review confirms broad sky wedges removed and the race shore/forest/castle lower edges improved.

Evidence is local in ignored logs/shots: `reports/world-motion-unit.log`, `reports/world-final-{creator,hosted,layout}.log`, `reports/world-final-workshop.log`, `reports/world-background-final-tests.log`, `reports/world-motion-final-audit-shots/`, and `reports/world-motion-proof-shots/home-contrast.json`. The actual moving-world tour is `reports/world-motion-preview-shots/world-tour.mp4`; final in-app proof is `home-final.png` in that folder. No validation contacted paid Claude, published a live game, moved funds or reset the durable store.

## Performance and practical limits

The frozen HTML is 552,681 bytes raw. The local Python gzip fixture serves a 171,384-byte HTML payload; Node's separate level-9 gzip reproduction is 172,235 bytes because the compression implementations differ. The two world assets total 276,070 bytes. A local simulated-mobile Lighthouse 13.5.0 run with Chromium 153 scored 92 performance / 100 accessibility / 100 best practices / 100 SEO, FCP 1,649ms, LCP 3,315ms, TBT 19ms and CLS 0, with no warnings. Other local browser checks were active during this measurement. Reports/metadata are in ignored `reports/world-motion-performance-shots/`. This does not establish live Render compression/performance, physical-phone/Safari behavior or hardware GPU performance.

The final axe matrix retains 187 inconclusive color-contrast rule results, 879 node occurrences and 260 grouped entries, primarily overlap/background determination. They remain documented manual limits; the six Home checks and route spot checks do not certify all WCAG requirements. Initial first-build audit/failed legacy canvas expectations and the early numeric probe during a title entrance are explicitly historical; final passing evidence above uses the named frozen build.

## Release boundary

This is a reviewed draft release, not a production deployment. Render service `srv-db53jro473hc739om89g` was rechecked before the branch update: main branch, auto-deploy off, free plan, one instance, last service update 14:16:18 UTC. The approved guarded production release remains separate; no merge, deployment, environment update, store replacement or Blueprint sync change occurred for this motion work. Any launch must receive current approval and pin the exact reviewed commit on devnet. The prior question naming static PR 18 commit `2e575b7d` is superseded by this animation release and must not be used to ship the old snapshot.

The original unpushed Claude pixel-art patch remains unrecovered. This independently authored artwork/animation does not close that historical recovery gap.
