# Playful pixel-world portal

The owner's latest direction replaces the kinetic workshop proposal with a game-first pixel-world interface, informed by the official Google Labs Playground reference at https://labs.google/playground. This is a new ClaudePlay design, not a recovered Claude patch or a copy of Google's assets, branding or product.

ClaudePlay should make its purpose immediate: create a game, play a game, remix it and share it. Original floating-world art, pixel display lettering, real game previews and useful creation controls carry that purpose across all ten routes. The owner approved the illustrated world and its animation, then clarified that the world must be the interface itself: remove the top navigation tabs, place the title and destination lettering in the scene, and integrate translucent tools into the world. This newer direction supersedes the opaque-card/header composition of deployed commit `5d8b34e`.

## Visual language

- Light mode uses translucent cream glass with navy text. Dark mode uses translucent slate/navy glass and readable pale text. Scene titles use pixel lettering with a defined edge against the moving art. High contrast keeps its explicit black, white, yellow and cyan choices and opaque surfaces.
- Silkscreen provides the pixel identity for the logo and major headings. Space Grotesk keeps forms, instructions and body text readable. Geist Mono identifies genuine addresses, signatures and numeric records. All have local fallbacks.
- The optional Google Fonts stylesheet begins with a nonmatching media condition, switches on its native load event, and uses font-display swap. Fonts never gate first paint or essential interaction. Loaded-font verification waits for the optional stylesheet before checking font faces.
- Cyan, orange and lime are gameplay accents. Required small text uses the contrast-tested theme tokens; accent color alone never communicates selection or status.
- Game cards lead with real game art, readable names and maker information. Mechanical grooves, barcodes, cartridge-shell decoration and condensed editorial typography have been removed.
- Tools stay plain enough to use: generous inputs, clear tabs, rounded panels, distinct buttons, genuine data and recognizable game previews. Pixel type does not replace body text or reduce caption sizes.

## Home composition

The first pane opens onto the persistent floating pixel world using original `src/assets/play-world-v1.webp` artwork. The brand and Make a game lettering stand in the scene; the large opaque hero card and top navigation strip are removed. A compact translucent creation prompt occupies the left side while destinations are placed at the islands: Make a game on the forest, Play games on the castle, Your wallet on the race/coast and World ledger on the city. Economy and business remain accessible. Four general ideas cover a runner, tower defense, racing and a cozy puzzle. The home does not lead with crypto-only prompts.

An accessible navigation layer lives beside the decorative world, outside its `aria-hidden` tree and outside fitted page content. Destination links use the existing routes and trigger the same persistent camera journey. Other pages and narrow/short viewports offer a compact Visit island map and World map return, preserving every destination without a header tab row. Later Home panes and scrolling beyond the invitation also park the island lettering in that map, keeping game controls clear. Accessibility and wallet controls remain available as small floating world tools.

`PLAY_WORLD_STILL` is the build placeholder for this decorative art. Website builds use the compressed asset; self-contained builds embed it. A companion sky plate supports moving the isolated island regions without exposing an empty cutout. Art cannot intercept input and carries no essential information.

The decorative `#site-world` host lives outside `#view`, so the page fitter cannot treat it as a content pane. One persistent camera contains the 16:9 world atlas. Each route chooses an island and eases toward it; the home view returns to the wide world. Camera and decorative motion remain independent of creation and gameplay.

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

The page shell and title wrappers are transparent. Creation forms, Studio columns, player controls, financial data and footer notices use bounded translucent glass with backdrop filtering and strengthened small-text colors. The moving world remains visible through and around those surfaces. Required text contrast must be reviewed against the composite glass, including extreme light/dark backdrops; blur alone is not a contrast guarantee. Scene lettering uses complete opaque outlines, while dialog lettering keeps ordinary theme colors. High contrast, forced colors and reduced-transparency preferences use opaque surfaces and clear controls.

## Motion and reliability

The whole-site world uses native CSS transforms and the original illustrated assets. Individual island layers float gently, clouds drift at separate depths, flying vehicles cross the sky, and small local effects bring the island activities to life. The background is fixed to the viewport, ignores pointer input, stays outside the accessibility tree and never participates in fitted content measurements.

Route changes select a curated view of an individual island. The camera transition uses bounded translate/scale motion rather than scroll hijacking, then settles while the selected island continues its gentle local animation. Match my device honors reduced-motion preferences; Reduce motion always shows the destination immediately and parks decorative movement. Full motion is an explicit opt-in that overrides device reduction for the moving world and page entrances. High contrast and forced colors keep a plain theme background and solid controls even with Full motion selected. Hidden pages, dialogs, game focus and text-input focus pause decoration. Lifecycle cleanup removes the background's owned listeners, observers and animation work.

The retained `src/workshop-scene.js` and `window.PPWorkshop` native 3D scene remain a separate compatibility module. The new full-site background does not depend on WebGL or third-party runtime libraries; its static view remains available if animation is unavailable.

Brief route/dialog entrances, game-card lifts and button feedback support interaction. Calm motion removes decorative travel and entrance effects. Game controls, assist preferences and sound remain independent of decoration. No external runtime library, external script, paid generation service or scroll hijacking is introduced.

## Compatibility and acceptance

Preserve every route, selector, form, action, test hook, feature, unofficial-project notice and accessibility setting. The emitted SDK/game documents, starter hashes, signing domains, storage keys, Solana handling, server screening and permanent $400 sponsored funding cap are outside this visual change.

Fitted panes and inner scrolling must keep all controls reachable at 390px, including the largest text size. World navigation and floating tools must not cover form, game or pager hit targets. Hidden labels remain contained by the Studio scroll area. Tall static panes and chart scroll regions retain keyboard access. The floating Accessibility button has a permanent accessible name even when its visible text is hidden; the logo's natural accessible name includes whichever badge is visible.

Before release, review the first built desktop and phone screenshots with the owner for the requested visual direction. Then run all ten routes, both layouts, all themes, largest phone text, loaded and blocked fonts, native scene failure/reduced-motion/lifecycle checks, sponsored-funded/exhausted/offline creation, draft recovery and existing signing/game checks. Earlier workshop audit passes do not establish acceptance for this replacement design. No deployment is authorized by this file.
