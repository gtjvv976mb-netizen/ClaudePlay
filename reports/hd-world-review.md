# Standalone illustrated world and rounded typography

The owner requested complete independent images instead of enlarged panorama fragments, detailed flying cars and clouds, and smooth lettering that fits the illustrated game world. The previous interface candidate and its pending deployment question are superseded by this revision. No new deployment is authorized by those design requests.

## Delivered composition

Four complete island images retain the accepted forest, castle, race/coast and neon-city identities. Their transparent exterior, complete terrain undersides and independent layers replace panorama masks. Five clouds and three flying cars use their own high-detail alpha images, independently drifting/flying across the viewport. A smooth CSS sky replaces the old raster sky. Waterfall details are baked into each island image; floating islands, vehicles, clouds and camera journeys animate through native CSS. There is no external runtime script, WebGL requirement or new dependency.

The renderer uses whole-image contain sizing, viewport-relative geometry and bounded zoom. Selected route frames fit their entire island within the available window; native-detail limits avoid inventing additional detail on large screens. The navigation reads the same geometry. At 4K, later Home content can share the first pane with the invitation, so scenery labels park in Visit island whenever another Home pane is visible. This prevents the secondary Economy marker from intercepting the featured game's iframe. Actual click, keyboard destinations, resize focus restoration and teardown are covered by the new regression.

Outfit replaces Silkscreen for the logo and headings, with Trebuchet/Segoe UI fallbacks. Space Grotesk remains the readable body type and Geist Mono identifies genuine records. Title tracking and hard outlines are softened to suit the rounded illustration. Fonts load optionally and never gate interaction. Existing glass, opaque high-contrast fallbacks, accessibility controls, all routes, creation and gameplay remain available.

## Native assets and prompts

Built-in image generation/editing used the original world as an identity reference. The four islands are native **1254×1254**, and cloud/car assets are native **1536×1024**. The requested 2048-pixel targets were not returned by the tool; these are not claimed as 2K/4K sources. No resizing, upscaling, cropping, programmatic cutout or creative pixel manipulation was performed. Six selected native PNGs remain in `src/assets/world-hd/` alongside their production WebPs. Sharp 0.35.5 only encoded the same-size PNGs with quality 94, alpha quality 100, effort 6.

| Runtime file | Native dimensions | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `cloud.webp` | 1536×1024 | 181,604 | `8b3689f44da3a04a23cdac4edee3b81b18dfd48a2db025148d2151b76d5fcff1` |
| `flying-car.webp` | 1536×1024 | 227,086 | `3c384a97c771ce22dc1178f505df72760bd539f95d2cfb8af862ed7bc98bccd9` |
| `island-forest.webp` | 1254×1254 | 438,956 | `950d44ef401ec474c25f0066315c9547dc56a77a9b2eb0bbae7127d984fd76ef` |
| `island-castle.webp` | 1254×1254 | 372,308 | `e712e3d9fc98974523d54c7e74f69217206c41ee1b9911f997da1579f83a75c0` |
| `island-race.webp` | 1254×1254 | 415,032 | `4fd2abe4d34ebd950a2118bb252a056ebe7f45f08d0c968d69b76d40b9e86987` |
| `island-city.webp` | 1254×1254 | 351,168 | `009c0ec10d198e64121236b1b71d2f9fbc85aa62108259851970e67966bf18b6` |

Runtime WebPs total 1,986,154 bytes; native PNGs total 9,672,796 bytes. All six static copies in `dist/site/world-hd/` match source bytes. Source PNGs are retained for future asset work rather than shipped by the website. Sparse generated alpha=1 specks remain outside the islands' visible silhouettes; meaningful subjects have inset transparent margins and complete shapes. Exact tool paths, prompts, retries, mode and alpha measurements are retained in [forest/castle provenance](hd-islands-nature-castle.md), [race/city provenance](hd-islands-race-city.md) and [cloud/car provenance](hd-air-assets.md). The original reference images remain unchanged.

## Frozen build and validation

Final website HTML SHA-256: **`222181ce1c454486310d2af0c758ea7af8eb07061bf2fecb5191140d483c4dca`**. Website HTML is 579,930 bytes; the self-contained artifact is 3,226,962 bytes, with all six images embedded. World source is `7659c2376533e86057a83eb7459d7ad67c91624c0d5b5ceb56fb3f7725352b8d`; navigation is `a0e513b87c03ac8d9368460ffaef53527e25e80805287432c5fc427ee104d1b1`. No new Lighthouse measurement was made; old performance numbers do not describe these larger assets.

- **14/14 native world tests**, exit 0, Chromium 155.0.8059.40, final HTML before/served/after hashes identical. Real alpha assets, all-route complete-frame bounds across seven windows from 320×568 through 3840×2160, motion, route journeys, focus/visibility/reduction, lifecycle cleanup and offline embedded-image decoding pass. Log: ignored `hd-world-final-native.log`.
- **13/13 native navigation tests**, exit 0, same browser and final hash. Phone XL, all destinations, shared image anchors, actual 4K game click hitboxes, secondary keyboard routes, focused resize, native map scrolling and cleanup pass. Log: ignored `hd-world-nav-final.log`.
- **165/165 affected E2E checks**, exit 0, exact final build. Website, sponsored fitted creation, all-route fitted layout and accessibility scenarios include seven positive/negative hard-outline fixtures. Log: ignored `hd-world-final-e2e.log`. This is fresh affected coverage, not a new full 335-check run or a repeated 317-check unit suite. Protected unit/store behavior was not modified by this revision.
- The all-ten-route audit passed **582 rendered states in 36 configurations**, zero blocking findings, on `46870c2b…`, October 11 **16:55:54–16:59:32 UTC**. That candidate has the final assets, fonts, glass and world renderer. It covers both layouts, light/dark/high contrast, loaded/blocked fonts, desktop/default text, phone/XL text, fitted panes, settings and fresh guest visits.
- The only subsequent product change parks labels when another Home pane is visible. Its final Home/settings/guest audit passed **108 states in 36 configurations**, zero blocking findings, on `222181ce…`, **17:01:05–17:02:05 UTC**. Every runner exited naturally 0. Loaded-font checks confirm visible Outfit weights, Space Grotesk and Geist Mono; blocked-font fallback checks pass. Both audits report zero context/font/image errors.

Commands use the existing local server, `node --test test/world-background.test.mjs`, `node --test test/world-navigation.test.mjs`, `python3 test/e2e.py` with scenarios `site,sponsored_fit,fit,a11y`, and `node test/design-audit.mjs --workers=3` (final rerun adds `--routes=home`). Set `CHROME_PATH` to installed Chrome when reproducing the browser checks. Full commands/logs and audit JSON/screenshots remain in ignored `reports/hd-world-*-shots/` and `reports/hd-world-*.log`.

The full audit retains 582 inconclusive contrast-rule results / 13,128 node occurrences / 1,624 grouped selector-rule-theme-font cases; final Home retains 108 / 1,932 / 272. Gradients and composed-image glass prevent automated background determination. Representative manual review covers final Home/Wallet/Explore, desktop dark Studio, phone XL Wallet, high-contrast Studio, and decoded 4K Home. Hard-outline tests and existing extreme-background glass checks remain applicable, but this does not certify every composed pixel or WCAG compliance. The advisory landmark warning for floating World tools remains. Physical phones, Safari and real GPU performance were not tested.

## Compatibility and release boundary

Relative to the previous reviewed interface commit `435863f`, `src/app.js`, core/kits/harness/Solana/QR, every server file, Blueprint and dependency lock remain unchanged. Core/kits/harness/Solana/QR, server, Blueprint and lock also match deployed `5d8b34e`; the earlier interface revision contains the already-reviewed app navigation/visual hooks. No starter hashes, SDK output, signing domains, storage keys, payment checks, sponsorship counters or model routing changed. Syntax, generated asset equality and `git diff --check` pass.

At **17:03 UTC October 11 / 01:03 October 12 Manila**, read-only public status returns sponsored AI/gallery enabled on devnet, cap $400, reserved $0.000061, remaining $399.999939. Read-only Render metadata confirms the latest live deployment is still `dep-db5r882jnfac73bf7jsg` at exact **`5d8b34e3cd8d7a5610e291292603af6b3b13704d`**, auto-deploy off/free/one instance. No paid Claude call, live game publish, store write/reset, funds transfer, secret change or deployment occurred.

Draft [PR 18](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/18) remains unmerged. Any launch needs new exact-commit approval under `AGENTS.md`; earlier deployment approvals apply to their named revisions. Do not deploy latest main, enable auto-deploy/Blueprint sync, reset the durable store, switch mainnet or start paid infrastructure. The original unpushed Claude design recovery remains incomplete.

The root preview server remains `http://127.0.0.1:8765/site/#home` (session 74258). Actual current-window Home/Wallet/Explore screenshots are saved in ignored `reports/hd-world-preview-shots/`; they are 813×787 in-app captures, not the separate 1440px/4K test screenshots. Temporary browser viewport overrides were reset. The original historical images and workspaces are preserved.
