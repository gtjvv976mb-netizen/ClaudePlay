# Playful pixel-world portal

The owner's latest direction replaces the kinetic workshop proposal with a game-first pixel-world interface, informed by the official Google Labs Playground reference at https://labs.google/playground. This is a new ClaudePlay design, not a recovered Claude patch or a copy of Google's assets, branding or product.

ClaudePlay should make its purpose immediate: create a game, play a game, remix it and share it. Original floating-world art, pixel display lettering, real game previews and useful creation controls carry that purpose across all ten routes.

## Visual language

- Light mode uses cream panels and pale sky surfaces with navy text. Dark mode uses slate/navy surfaces and readable pale text. High contrast keeps its explicit black, white, yellow and cyan choices.
- Silkscreen provides the pixel identity for the logo and major headings. Space Grotesk keeps forms, instructions and body text readable. Geist Mono identifies genuine addresses, signatures and numeric records. All have local fallbacks.
- The optional Google Fonts stylesheet begins with a nonmatching media condition, switches on its native load event, and uses font-display swap. Fonts never gate first paint or essential interaction. Loaded-font verification waits for the optional stylesheet before checking font faces.
- Cyan, orange and lime are gameplay accents. Required small text uses the contrast-tested theme tokens; accent color alone never communicates selection or status.
- Game cards lead with real game art, readable names and maker information. Mechanical grooves, barcodes, cartridge-shell decoration and condensed editorial typography have been removed.
- Tools stay plain enough to use: generous inputs, clear tabs, rounded panels, distinct buttons, genuine data and recognizable game previews. Pixel type does not replace body text or reduce caption sizes.

## Home composition

The first pane is a wide floating pixel world using original `src/assets/play-world-v1.webp` artwork. Its open sky supports the Make a game heading and prompt; a controlled pale overlay protects text contrast. Four general ideas cover a runner, tower defense, racing and a cozy puzzle. The home does not lead with crypto-only prompts.

`PLAY_WORLD_STILL` is the build placeholder for this decorative art. Website builds use the compressed asset; self-contained builds embed it. Art cannot intercept input and carries no essential information.

A native floating-island scene sits in the decorative visual area. The retained `#home-world.workshop-scene` host and `PPWorkshop` API are compatibility names, not visible workshop branding. The scene is independent of creation and gameplay.

The next pane contains a real playable Neon Dash game with readable instructions and a leaderboard link. A direct Play Neon Dash action is also available from the invitation. The following pane opens real starter and community games through larger visual cards. The default fitted layout treats these three home sections as panes at all widths; the Scrolling pages preference presents them in sequence.

## Whole-site surfaces

| Surface | Composition |
| --- | --- |
| Home | A visual pixel world, an idea-to-game prompt, a direct play action, a real playable game and an art-led discovery shelf. |
| Explore | Large game art, readable titles and maker details, genuine tags, all filters and clear empty states. |
| Player | A large actual player with clear actions, remix tools and the existing leaderboard, game details, splits and lineage tabs. |
| Studio | Readable guided and direct creation tools, kit controls, drafts, versions, preview and publishing. Dark mode is a restrained navy/slate creation surface. |
| Maker | A community profile with real identity, follow controls, statistics and games. |
| Friends board | A readable invite, membership and score surface with the existing group controls. |
| Wallet | Clear balances, identity, collection and activity. Optional payments remain separate from free creation. |
| Ledger | Compact, selectable transaction data and the existing verification details. |
| Economy | Readable actual values, the accessible horizontally scrollable emission chart, existing reward explanations and optional collect/tip rules. |
| Business | A real branded game preview, practical offers, process and contact actions in the same playful visual language. |
| Settings | The existing accessible dialog, complete preference choices, immediate feedback and readable controls. |

## Motion and reliability

The self-contained native scene mounts through `window.PPWorkshop.mount(host, { reducedMotion })`. Its stable decorative host is 360px tall on desktop and 280px on phones. Its canvas is transparent, bounded in resolution and never a fitted content pane.

The scene pauses when hidden, offscreen, a dialog is open, or an input/select/iframe has focus. In the illustrated home hero, the original world artwork supplies the static fallback and the live canvas stays translucent so the illustration leads. The independent scene retains its CSS fallback for reduced motion, high contrast, missing WebGL and context loss. The scene handle releases observers, listeners and GPU resources; home navigation also cleans up pointer and shelf-reveal decorations before elements are replaced.

Brief route/dialog entrances, game-card lifts and button feedback support interaction. Calm motion removes decorative travel and entrance effects. Game controls, assist preferences and sound remain independent of decoration. No external runtime library, external script, paid generation service or scroll hijacking is introduced.

## Compatibility and acceptance

Preserve every route, selector, form, action, test hook, feature, unofficial-project notice and accessibility setting. The emitted SDK/game documents, starter hashes, signing domains, storage keys, Solana handling, server screening and permanent $400 sponsored funding cap are outside this visual change.

Fitted panes and inner scrolling must keep all controls reachable at 390px, including the largest text size. Hidden labels remain contained by the Studio scroll area. Tall static panes and chart scroll regions retain keyboard access. The header Accessibility button has a permanent accessible name even when its visible text is hidden; the logo's natural accessible name includes whichever badge is visible.

Before release, review the first built desktop and phone screenshots with the owner for the requested visual direction. Then run all ten routes, both layouts, all themes, largest phone text, loaded and blocked fonts, native scene failure/reduced-motion/lifecycle checks, sponsored-funded/exhausted/offline creation, draft recovery and existing signing/game checks. Earlier workshop audit passes do not establish acceptance for this replacement design. No deployment is authorized by this file.
