# Pixel-world game portal review

Prepared 2026-10-11 for the user's replacement direction on branch `codex/claudeplay-playground-redesign`. The user rejected the cartridge-workshop visual draft and requested a design that communicates making and playing games, using Google Playground as the reference. This report separates the proposed gates from measured checks of that fresh direction. The parent reviewed the illustrated first preview before validation; final user acceptance and readiness to ship are not established by that preview.

**Current reviewed candidate:** HTML `1b5f9021ca864879850946f18e590c1e8190ab3e8e239e7d0eab8698e42831c3` passed the strengthened **561-state/36-context audit** and the focused six-configuration composed-hero review. No material issue remains in that measured scope. Unreviewed inconclusive families and browser/device/performance limits remain explicit below; this is not WCAG certification or a deployment record.

The rejected draft's complete measurements, source/build hashes and limitations are archived in [cartridge-redesign-review.md](cartridge-redesign-review.md). Its screenshot/log directories remain preserved. The original unpushed Claude design recovery is still incomplete; this new design does not reconstruct that patch.

## Reference and intended experience

The verified primary reference is [Google Labs Playground](https://labs.google/playground), inspected 2026-10-11. Its public page presents an experimental game-making platform, prompt-based creation, playable discovery, and Create/Play/Share paths. The parent also inspected its floating pixel-landscape hero screenshot. These observations guide purpose and composition; Google's artwork, name, product claims and access terms are not ClaudePlay assets or features.

The implementation team's new direction is an original pixel-world game portal: a floating landscape and native 3D islands invite play, a plain idea field makes creation obvious, and actual playable games provide immediate evidence of the product. Pixel headings may establish the game identity, while forms, instructions, budgets and signed records keep readable body type. The parent generated original local pixel-world artwork, `src/assets/play-world-v1.webp`; the page must work with that asset, a static graphics fallback and blocked optional fonts.

First-preview review should answer concrete questions: does the first screen immediately communicate **make a game / play a game / share a game**; can the prompt and primary action be read without interpreting decoration; does the real player remain visually distinct and usable; and do discovery and the remaining product pages feel part of the same game portal? Visual direction confirmation is not acceptance of an unseen implementation.

## Complete product coverage

| Surface | Review requirement |
| --- | --- |
| Home | Original pixel-world invitation, obvious idea input and creation action, useful example prompts, actual live starter game and discoverable game shelf. Islands/art never cover instructions, capture gameplay gestures or intercept form focus. |
| Explore | Real game art, titles, maker/provenance, free/collect status and usable sort/filter choices. Long titles and empty following/community lists remain understandable on phones. |
| Game | The actual player is primary. Ratings, leaderboard, friends board, details/splits/remixes, owner actions, phone sharing, fullscreen, download/report and room join/disconnect/solo recovery remain available. |
| Studio | Guided creation, direct AI form, kits, palettes/knobs, pictures, drafts, preview/versions/undo, stop, play-test and publish all remain useful. Sponsored daily/funding limits, busy/failure and restored-draft states keep input and manual editing intact. |
| Business | A game-purpose page with its playable demo and truthful prototype/service/contact actions, using the new visual system. |
| Maker | A readable community identity, long handle/address wrapping, follow controls, actual counts and their real games. Owner-only unlisted visibility is preserved. |
| Friends board | Invite/join/leave controls, readable members and real linked game scores, with useful empty/missing/full states. |
| Wallet | Clear identity, local/devnet explanation, key handling, balances, optional collects/tips and activity. Sponsored creation does not require a credit/Pro purchase. |
| Ledger | Planar, selectable signed records, filters, rejected rows, real proof/signature states and useful empty content. Decoration cannot imply verification that did not occur. |
| Economy | Truthful epoch/reward data, readable emission chart and explanatory value flow. Retain the new labeled chart scroll region, 14px minimum axis text and future-bar outline, then recheck their contrast in the new palette. |
| Shared UI | Header/footer, fitted pager, settings, toasts, source/report/phone/wallet dialogs, focus treatment and unofficial-project notice receive consistent, readable styling. |

The preserved route/event/form/storage and protected starter/signature requirements in `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md` and `SECURITY.md` still apply. Root owns application/build integration and broader regression/scene tests; this reviewer owns only the audit script and review reports for the new direction.

## Proposed review gates

- Cover all ten routes and every fitted pane in desktop 1440×900/default text and phone 390×844/xl text, fitted/scrolling layouts, light/dark/high contrast, and loaded/offline fonts. Inspect 320px reflow, landscape/keyboard-open phone behavior and intermediate-header widths separately when those surfaces change.
- No horizontal document overflow, inaccessible scroll content, clipped actionable content, unnamed controls or hidden visible-label/name mismatch. Settings closes with Escape and returns focus. Primary phone actions remain reachable without hover.
- Keep required content visible without WebGL, when an asset/font fails, and under calm/system-reduced motion. Native decorative graphics pause when hidden/offscreen or when a dialog, text field or player needs focus; repeated route cycles release canvas/listener/frame resources. Root's scene suite must be rerun for the new islands.
- Review contrast over composed pixels, pixel-art backgrounds and SVG/chart surfaces manually wherever axe is inconclusive. Future-bar outline contrast must remain at least 3:1 against the actual plot; axis text remains at least 14 CSS pixels at the minimum chart width. Dense data and long game names need readable type rather than compressed pixel headings.
- Preserve self-contained artifacts and no external runtime JavaScript/models/textures. Optional Google Fonts CSS is permitted; the static site serves the original local hero asset, while the artifact/local standalone build embeds it. Missing required local image responses fail the audit and must also be reviewed visually.
- Compare protected starter/palette hashes and retain gameplay, multiplayer, draft/picture recovery, sponsored funding/allowances and signing/payment regressions. The rejected draft's pass counts do not prove the new source.
- Record browser/build/source identifiers, actual configuration/state counts, font families/weights loaded, local image responses and explicit inconclusive findings. Local Chromium automation and simulated Lighthouse do not establish real GPU performance, physical-phone usability, Safari behavior or complete WCAG compliance.

## Audit preparation and staged commands

`test/design-audit.mjs` reaches routes through the real app hash state, follows every fitted pager pane, checks shared settings, and creates locally signed maker/game/group fixtures through preserved wallet/remix/publish/group hooks. It also checks Home placeholders and a genuine fresh guest's fitted Home before any interaction that could hide a missed font refit. Generated keys and storage remain in ephemeral browser memory; hosted fixtures and external writes are refused.

The script retains all axe defaults and explicitly enables serious experimental `label-content-name-mismatch`. Loaded-font checks wait for `#optional-fonts` to switch from print to all before font readiness. They inspect declared families from the optional stylesheet and verify visible primary-family styles with `FontFaceSet.load`, including a Latin probe for symbol-only controls; this detects Silkscreen loading without assuming the old six-face count. Font records include family, weight, style and status. This verifies available primary font styles, not every international or symbol glyph. Requested-font failures and missing local image responses remain blocking findings. Local image GET statuses are retained in context diagnostics.

Matrix runs use a parent-built, visually reviewed, frozen local build. The cached Chromium binary can be selected as follows; the script never builds or starts a server.

```sh
# First quick pass: two fit/light/offline configurations, all routes and settings.
CHROME_PATH='/Users/michaelkennethbrillantes/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' node test/design-audit.mjs --layouts=fit --themes=light --fonts=offline --workers=2 --out=reports/playground-quick-shots

# After preview review and corrections: 24 signed-fixture configurations plus 12 guest fitted contexts.
CHROME_PATH='/Users/michaelkennethbrillantes/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' node test/design-audit.mjs --workers=3 --out=reports/playground-final-shots
```

Served HTML is hashed before fixtures and per configuration; changing builds during a run fails rather than mixing releases. Detailed JSON, grouped manual-review JSON and screenshots are ignored artifacts. The tracked report will preserve the measured outcomes once runs complete, including any failed preview and limitations.

## Measured new-direction results

### First illustrated build — historical failed pass

The quick fit/light/offline pass ran 2026-10-11 15:00:20–15:00:43 UTC: **65 rendered states in two configurations, exit 0, no blocking findings**, eight inconclusive rule results. Its artifacts are in `reports/playground-quick-shots/`.

The subsequent complete matrix ran 15:01:45–15:03:55 UTC with three isolated workers: **525 rendered states across all 24 configurations, exit 1, 16 blocking findings**. Every blocker was the high-contrast Home `span.hl` (“game.”), also present beneath settings: foreground `#14334b` on black, **1.60:1**, below the large-text 3:1 requirement. The eight high-contrast configurations each reported it on Home and settings. Structured results and screenshots are preserved in `reports/playground-prefinal-shots/`; the directory name records that this is failed pre-fix evidence, not the final release.

A separate settled computed-style review found the Home placeholder `#476375` on black at **3.31:1**, below its 4.5:1 requirement; axe did not report that placeholder. The audit now also records and blocks insufficient computed placeholder contrast against the actual solid field, while leaving non-solid backgrounds for explicit manual review. A focused pre-fix proof in `reports/playground-placeholder-prefinal-shots/` verified the new gate at both 390px/xl and 1440px/default: light and dark were **6.21:1**; contrast was **3.31:1**, correctly blocked. Its six configurations traversed 24 Home/settings states and exited 1 with the two heading and two placeholder failures on the first contrast panes. The UI agent corrected these two narrow source rules before the second build. No application, CSS or build source was changed by this reviewer during this validation phase.

Both runs used Chromium **153.0.8010.12** and served HTML SHA-256 **`cd38d8ebebf2c02828c2dc83cc578afb4bc5b5d3235f6d39d376191fc4a7952c`**. The pre-fix source snapshot was **`5638903c857cd8532ba6b03e6fa8cf06860289ec24cc923d0379e76cb1f08003`**, computed as SHA-256 of each lexically sorted path, NUL, raw bytes, NUL for `build.mjs`, `site-README.md`, all top-level `src/*.js`, `src/index.html`, and the three `src/assets/*.webp` files. The generated `play-world-v1.webp` and retained `mascot-wave.webp` each returned **HTTP 200 in every one of the 24 contexts**; no local-image, requested-font, setup/runtime or blocked-network error was recorded. All loaded-font contexts declared Silkscreen, Space Grotesk and Geist Mono, and every visible primary-family style checked by the audit loaded successfully. Unused script/language subsets may legitimately remain unloaded.

The failed full run retained **124 inconclusive rule results, 1,195 node occurrences grouped into 287 selector/theme/font records**. The grouped JSON preserves every selector, element type, theme, font mode and reason. Hero pseudo-element backgrounds, SVG emission/value-flow text, sticky-header overlaps on scrolling phones, and a few settings hints require manual review. Those are neither passes nor confirmed violations. Earlier cartridge measurements remain historical and do not prove this source.

### Second illustrated build — signed-fixture pass, guest defect

HTML **`7923ac8e505f2e330414aae3aa0f51d1f7a1819bd82bfeabef09b8fc5abb7f45`**, source snapshot **`fa58c74b7784593441bf724c87c56a54837d62e8de5dc11a5e00493629c279db`**: 2026-10-11 15:08:53–15:11:06 UTC, 525 signed-fixture states/24 configurations, exit 0, no blocking findings, 124 inconclusive rules/1,195 node occurrences/287 groups. Artifacts: `reports/playground-prefinal2-shots/`.

Manual first-visit review then found a loaded-font guest/calm-motion defect at 390px/xl: the header grew to 159px, the hero retained its earlier 648px height, and the pager ended at **869px in an 844px viewport**. Hidden body overflow kept document-scroll measurements at zero. A new guest test reproduced it before any wallet creation, hash transition, synthetic resize or rerender; its first pane failed two geometry checks, while later guest panes and signed-fixture panes passed (`reports/playground-guest-prefinal-shots/`). The audit now adds 12 isolated fresh-guest fitted contexts, checks every Home pane and explicitly records pager bounds. The UI agent added a header ResizeObserver and font `loadingdone` refit using the existing coalesced fitter. Manual chart/placeholder evidence for this superseded build remains in `reports/playground-prefinal2-manual-shots/`.

### Third illustrated build — automated pass, manually blocked

HTML **`c8157621be7b26d9f25d1ecdb6203aa4a46acbd21765eb2a1046b1b6d4c79bdb`**, source snapshot **`53552d843da16013bfa855942f4baf8e11e55dd69a81db5068d137e2574f10af`**: 2026-10-11 15:14:59–15:17:37 UTC, **561 states in 36 isolated contexts, exit 0, no blocking automated findings**. This includes the unchanged 525 signed-fixture states across the 24 full configurations plus 36 Home-pane states in 12 fresh-guest/calm-motion fitted contexts. All loaded/offline, theme, layout and device checks completed; no runtime/setup, requested-font, missing-image or blocked-network error occurred. The generated hero returned HTTP 200 in all 36 contexts. Artifacts: `reports/playground-prefinal3-shots/`.

The six manual theme/width checks confirmed placeholder contrast **6.21/6.21/17.14:1** in light/dark/contrast, with guest phone pager bottom **834px** in the 844px viewport and desktop bottom **888px** in 900px. At 390px/xl in both fitted and scrolling layouts, emission-chart future outlines were **8.51/10.20/21:1** against the actual light/dark/contrast panel; text was **6.21/7.37/17.14:1**, all axes were 14px at a 600px rendered width, keyboard ArrowRight scrolled the named region 40px, all 20 displayed epoch values matched `PPCore.emissionFor`, and document horizontal overflow was zero. Start/end chart screenshots show clear future-bar boundaries in every theme. Artifacts and a reproducible local script: `reports/playground-prefinal3-manual-shots/`.

**This historical build was manually blocked.** Paired loaded-font/calm-motion screenshots at 390px/xl and 1440px/default measured the illustration beneath painted text glyphs. At phone size in light/dark, `.page-kicker` (“Create · Play · Remix”), 15px/500, had glyph-background minima **Create 3.77:1, Play 4.13–4.25:1, Remix 4.28–4.34:1**, below 4.5:1. Desktop kicker was at least 11.38:1; sampled hero-title glyphs at least 6.35:1 and body invitation glyphs at least 10.15:1. The paired captures temporarily make only these text nodes transparent and remove their text shadow, then compare normal/background pixels to select painted foreground glyph positions. This is representative screenshot sampling, not a general WCAG verifier or a test of every animated frame. Scripts, original/underlying-background captures and exact coordinates are in `hero-composed-*` under that manual evidence directory. The UI agent added a narrow mobile kicker backing before the final fourth build; no source was edited by this reviewer during validation.

The third matrix retained **132 inconclusive rules, 1,301 node occurrences in 287 selector/theme/font groups**. Their complete records remain in `audit-manual-review.json`. Representative unresolved categories are hero pseudo-element backgrounds (`.page-kicker`, `.lede`, maker controls), emission/value-flow SVG `text` nodes, scrolling-phone Business navigation partly outside the horizontal menu, settings hints that partially overlap their scroll boundary, and decorative non-text symbols. Numeric chart and placeholder checks resolve the specified sampled surfaces; they do not silently turn every grouped item into a pass. Real GPU behavior, physical-phone/keyboard usability, Safari, arbitrary glyph coverage and full WCAG conformance remain unverified by this Chromium matrix.

### Final fourth build — measured result

HTML **`1b5f9021ca864879850946f18e590c1e8190ab3e8e239e7d0eab8698e42831c3`**, source snapshot **`d2614f29d68f395da1d05480448271efd70eb28ba7e8372f1178be0deefe9dad`**, Chromium **153.0.8010.12**. The final full audit completed with **561 states/36 isolated contexts, exit 0, zero blocking findings**: all ten routes and settings across 24 signed-fixture configurations, plus all three guest Home panes in each of the 12 fitted guest contexts. Loaded/offline font modes, all three themes, 1440×900/default and 390×844/xl, scrolling/fitted layouts, standard axe defaults plus the explicit experimental naming rule, field contrast and pager bounds remain enabled. No runtime/setup, requested-font, failed-image, blocked-network or fatal error occurred. Artifacts: `reports/playground-final-shots/`.

The final six composed captures use **light/dark/contrast × 390px/xl/1440px/default**, loaded fonts, calm motion and fitted layout. They check the actual hero pixels under painted glyph locations and retain the final HTML hash in `hero-composed-metadata.json`:

| Captured state | Kicker minimum | Title minimum | Invitation minimum |
| --- | ---: | ---: | ---: |
| Phone, light/dark | 12.81:1 | 7.38:1 | 10.56:1 |
| Desktop, light/dark | 11.38:1 | 11.36:1 | 10.15:1 |
| Both sizes, high contrast | 21:1 | 21:1 | 21:1 |

The phone opaque cream backing is compact, the primary maker action and pager remain visible, and the original world art still leads the invitation. Normal/background screenshots, sampling scripts and coordinates are in `reports/playground-manual-check-shots/`. The final automated matrix also repeats the solid-field placeholder and actual pager checks; the chart's six-layout numeric/value/keyboard evidence above is deliberately scoped to c815, whose chart source is unchanged by the final kicker-only CSS repair.

**Review conclusion:** the identified heading, placeholder, guest font-refit and composed mobile-kicker defects are resolved in the measured candidate. No new material concern remains in the automated and focused manual scope. The final audit retains inconclusive findings for explicit human review; grouped items are not silently accepted as passes. The representative boundaries below describe what was and was not resolved:

| Inconclusive family / representative selector | Manual coverage and remaining limit |
| --- | --- |
| Hero pseudo elements: `.page-kicker`, `.hero-title`, `.lede` | Six composed captures now meet the relevant text thresholds at sampled glyph positions. Calm fitted views do not cover every animated frame or every viewport. |
| Maker input/buttons and idea chips beneath pseudo-element ancestor | Solid placeholder contrast is blocked and rechecked by the final matrix; representative maker screenshots are readable. Every button/idea-chip composed pixel was not separately sampled. |
| Emission axes and short SVG labels, e.g. `text[y="201.5"]`, `text[x="69.3"]` | Actual panel contrast, 14px axes, future outlines, keyboard scroll and all 20 values measured in six c815 chart views; chart bytes unchanged in final CSS repair. |
| Value-flow SVG text, e.g. `text[y="41"][x="100"]` | Retained as unreviewed composed-overlap/contrast nodes; chart checks do not certify this separate diagram. |
| Scrolling-phone Business navigation outside horizontal menu | Retained as unreviewed overlap items; document reflow and route reachability passed, which does not certify every partly obscured pixel. |
| Settings hints, e.g. `fieldset:nth-child(6) > .hint` | Representative loaded-font dialog screenshots reviewed; all hints at all scroll offsets were not individually sampled. Escape/focus return and default/experimental naming rules passed. |
| Decorative non-text characters, `span[aria-hidden="true"]` | Explicit incompletes remain in grouped JSON; not promoted into text-contrast passes. |

Root validation is recorded with its actual build scope: **317 unit checks, all 335 browser regressions, nine scene checks and 32 additional native-Chrome site checks passed on c815** before the final small kicker backing. The final 1b5f candidate then passed the **131 affected site/fit/sponsored-fit checks** and **nine scene checks** (`reports/playground-kicker-final.log`, `reports/playground-kicker-scene.log`). The previous full-regression/native evidence is in `reports/playground-release-{creator,hosted,layout,unit,scene}.log` and `reports/playground-release-native-site.log`; it is not relabeled as a new full 335-check run on 1b5f.

Performance evidence also keeps its scope: a gzip-enabled **local** c815 fixture scored **mobile Lighthouse 99/100/100/100**, FCP 1,575.5ms, LCP 1,599ms, TBT 27ms, CLS 0; the 535.8KB HTML compressed to about 167KB. Evidence: `reports/playground-performance-shots/release-gzip-mobile.report.{json,html}` and metadata. Earlier uncompressed 7923 measurements used different browser/fixture conditions (uncompressed 7923 mobile 62, desktop 97) and are historical. These results do not establish Render compression, network delivery or production performance.

Real GPU performance, physical-phone/keyboard/landscape behavior, Safari, arbitrary language/symbol glyphs, every inconclusive node and complete WCAG conformance remain outside the measured conclusion. User acceptance and deployment require their own current context. The rejected cartridge report and all pre-fix evidence remain preserved.
