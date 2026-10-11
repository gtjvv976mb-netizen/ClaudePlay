# Whole-site redesign review

Prepared 2026-10-11 from the local source and browser scenarios. The criteria below are proposed gates; the measured automated results are recorded separately at the end. Passing the automated checks does not establish every proposed gate or WCAG compliance. The reviewer initially changed only the report and audit script, then implemented the specifically authorized emission-chart readability fix in `emissionChart()` and its two CSS selectors. No external service or original media was changed by the reviewer. The original unpushed Claude pixel-art patch remains incompletely recovered.

**Current status:** the user rejected the cartridge visual direction and requested a game-purpose design resembling Google Playground. The parent paused the final rebuild/matrix workflow while clarifying that reference. This document preserves historical measurements and useful accessibility fixes; it does not establish acceptance or readiness to ship the rejected visual direction.

## Direction and scope

The implementation team selected a **kinetic cartridge workshop**: warm paper and charcoal surfaces, restrained coral and cobalt, tactile hardware controls, editorial headings, physical cartridge shelves, and a decorative native WebGL stage alongside the real playable console. Use this same visual language across all ten routes, with distinct functional surfaces. Acceptance requires screenshots and interaction evidence for the complete product, including empty, loading, failure, and allowance-exhausted states.

The latest user request authorizes a new visual direction; historical silver-grey preferences are context. Preserve the product and source invariants in `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, and `SECURITY.md`. The separately approved guarded deployment is a different release; this report does not extend its authorization to shipping an unreviewed redesign.

## Whole-site coverage

| Surface | Concrete visual and UX acceptance | Existing regression coverage |
| --- | --- | --- |
| Home | An asymmetrical prompt/workshop composition, real playable Neon Dash console, and physical cartridge rail. Build/open Studio, 2D/3D selection, example ideas, gameplay, leaderboard, and navigation remain immediate. Decorative depth never covers copy or intercepts the iframe, text input, or touch scrolling. | `local`, `site`, `fit`, `a11y`, `sponsored_fit` |
| Explore | Raised cartridges share the home vocabulary; title, maker, free/collect price, provenance and rating stay readable without hover. All eight sort choices, following-empty and community-empty states remain useful. Shelves expose an obvious next item on phones. | `local`, `mock`, `social`, `fit`, `a11y` |
| Game | A playable console and coherent information drawer: Leaderboard, Cartridge, Splits, Remixes. Preserve ratings, follow, remix, verify, phone QR/link, fullscreen, download, reporting and owner edit/list controls. Community and starter games need separate examples. Multiplayer joining, live room, disconnected/error and solo recovery fit the design. | `local`, `server`, `social`, `chain`, `engines`, `fit`, `a11y` |
| Create / Studio | A readable workbench in guided start, full AI form and kit mode. Preserve genre/dimension/players, pictures, palettes/knobs, versions, undo, before/after, checklist, stop, play-test, drafts, visibility and publish/republish. Busy, failed, restored-draft and funding/limit states have clear text and keep manual editing usable. Motion must not remount previews or discard current input. | `mock`, `server`, `studio_recovery`, `sponsored`, `sponsored_fit`, `fit`, `a11y` |
| Business | The same workshop identity, a live branded console, three actual offers and clear next actions. Preserve realistic prototype/contact claims and useful mobile layout. | `site`, `mock`, `fit`, `a11y` |
| Maker profile | A community identity surface with real name/address, follow state, counts, owned games and useful empty state. Long handles and address strings wrap. Owner-only unlisted visibility stays intact. | `social` exercises follow and profile links; add explicit fit/contrast route checks |
| Friends board | An invite/scoreboard surface with readable members, join/leave, invitation copy, linked games and empty/missing/full states. Names and scores remain plain DOM/table content. | `social`; add explicit fit/contrast route checks |
| Wallet | A receipt/identity design for both no-wallet and connected-wallet states; balances, session/key handling, collection and activity remain clear. Devnet and storage explanations stay visible. Sponsored mode does not introduce a purchase/Pro/credit step. | `local`, `sponsored`, `chain`, `mainnet`, `fit`, `a11y` |
| Ledger | A precise receipt/log surface. Filters, rejected rows, signature details, proof status, amounts and empty state remain readable and selectable. Keep data planar; decoration must not suggest unverified transactions are verified. Dense tables can have their own labeled scroll region. | `local`, `chain`, `fit`, `a11y` |
| Economy | Coherent reward charts/tables, actual supply/epoch figures, value flow and sponsored-creation explanations. Preserve owner settlement gating, optional collects/tips, finite funding and truthful devnet/GPLY status. | `local`, `sponsored`, `fit`, `a11y` |
| Shared UI | Header/footer, pane pager, dialogs, settings, toast/error banners, phone QR, wallet import/export, report and source-code dialogs all receive matching surfaces. Focus, close actions, selected tabs, validation, copy feedback and unofficial Anthropic notice stay legible. | `site`, `social`, `a11y`, `fit`; manual populated-dialog review required |

## Native technical options

These three options fit the self-contained HTML/no external JavaScript invariant. A runtime animation or 3D library is unnecessary for the selected scope.

1. **CSS perspective and 3D transforms** for cartridges, console casing and workbench depth. Keep text, inputs and hit targets in semantic DOM. Use static depth on coarse pointers and optional fine-pointer tilt; selection and focus must work without hover. Separate the 3D wrapper from scrolling/opacity/filter layers: several grouping properties flatten `preserve-3d` descendants. [MDN transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-style).

2. **Web Animations API** for short route/pane reveals, drawer changes and press feedback. Animate transform/opacity, establish the final usable DOM state first, then animate from the prior state. Cancel detached/replaced animations and handle cancellation; avoid indefinitely accumulating `fill: forwards` effects. Native playback control supports explicit cancellation and calm motion without an animation dependency. [MDN Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API).

3. **Raw WebGL**, already used by the project, for one decorative workshop scene with procedural geometry and restrained camera movement. Do not put required navigation or information into the canvas. Bound the backing-buffer resolution and resource count, batch draw calls, avoid synchronous GPU queries inside the frame loop, dispose resources, and tolerate context loss. A static CSS/inline-vector composition must retain the same information and layout when graphics are unavailable. [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Prefer CSS depth throughout the product and the native scene where it helps the composition. Forms, receipts, charts and tables benefit from tactile framing and brief state feedback without a continuous moving background.

## Mobile, accessibility and motion acceptance

- Retain the default fitted layout and the Scrolling pages preference. Existing sizes are 1440×900, 1366×768, 1280×720, 390×844 and 360×640. Add maker/group to that matrix and include a 320 CSS-pixel reflow check in scrolling mode. On phones, every primary action must be reachable with one-handed touch; shelves, pane changes and internal scrolling must not consume gameplay gestures. Check keyboard-open Studio and landscape as well as portrait. [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Review light, dark and high-contrast themes at all three text sizes. Existing contrast/name/label/image/frame/heading/target audits must continue passing. Patterned backgrounds, gradients and translucent controls also need visual review because the current computed-color audit is not a complete test of composed pixels. The condensed headline font must have readable fallback metrics; prevent clipping with fonts loaded and blocked.
- Use a 44 CSS-pixel project target for primary phone controls. Preserve at least the existing 24 CSS-pixel target/spacing audit for other controls, with intentional treatment of inline links. Tilt must not reduce the effective touch area or hide focus outlines. [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Keyboard users can reach the game iframe, all controls, page/pane actions and every dialog. Escape closes dialogs, focus remains trapped while open and returns to the initiating control. Active-page/tab state is conveyed semantically; color and depth alone convey no essential state. Screen-reader order follows the visible functional order.
- Calm motion and OS reduced motion disable decorative scene travel, pointer parallax/tilt, entrance sweeps and mascot animation. Content is immediately visible and controls still work. Test both a reduced-motion preference before loading and a live settings change after the scene starts. Game assist/sound preferences still reach the player SDK, and assisted runs remain excluded from signed ranked scores. The interaction-motion requirement is an intentional project criterion consistent with WCAG's AAA guidance. [W3C Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).
- A decorative automatic animation lasting over five seconds must have an available stop/pause mechanism; expose the existing calm control clearly. Pause the decorative scene while a player, text field or dialog needs attention, when offscreen/hidden, and when calm/contrast mode requests it. Avoid flashing, repeated attention pulses and camera motion during reading. [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

## Reliability and performance gates

These are proposed measurable project gates, not measured results:

- No new external script, library, remote model or texture request. Google Fonts CSS may remain optional; offline fonts and a failed mascot-loop request must not block the page. Required content renders before graphics initialization succeeds.
- At most one decorative WebGL canvas/context and one active decorative frame loop. Repeating all routes twenty times must not grow retained canvas contexts, animations or route listeners. Hidden/offscreen/calm decorative scenes schedule no continuous rendering.
- Start with a scene resolution cap of DPR 1 on phones and 1.5 on desktops; increase only with measured headroom. On documented reference hardware, target the 95th-percentile decorative frame interval at or below 33 ms on mobile and 20 ms on desktop. Compare with the scene disabled; typing, pane changes and live gameplay must remain responsive, with no repeated scene-caused tasks over 50 ms.
- Force `getContext` failure, shader failure and context loss; the page stays visible, fitted and usable, with no uncaught errors or retry loop. The native scene must never become a fitted content pane. Canvas resizing must not remount the game or change its viewport to zero.
- Preserve hashes and signatures: `ENGINE`, `KIT_*`, named-palette `kitDoc` outputs, `normalizeParams` ordering, signed message formats, protocol tags and storage keys remain unchanged. Compare all protected starter/palette outputs with the approved pre-redesign release. Game sandboxes and server payment/screen/funding checks receive no redesign changes.
- Build after source changes, retain generated HTML checks, and run the existing unit and browser suites. Do not remove checks or swallow scenario failures to make a redesign pass; `test/e2e.py` currently exits nonzero if any collected check/scenario fails.

## Evidence still needed

The existing Python browser runner uses Chromium with software graphics support and aborts Google Fonts requests. Its original `fit`/`a11y` route lists cover eight routes and omit maker/group. The new design audit below adds maker/group and loaded-font checks. Neither runner establishes real GPU performance, native Safari behavior or physical phone performance.

Review requires screenshots for all ten routes at desktop and 390-pixel phone widths, plus populated Studio, game information tabs, key dialogs, dark/contrast and calm states. The automated screenshot artifacts below cover the ten-route matrix and settings; they do not exercise every dialog, game tab or dynamic hosted state. Retain the existing sponsored-funded/exhausted/offline and draft/picture recovery tests. The parent reports a separate nine-check scene suite passed, including five repeated home/Explore cycles. Real GPU/phone measurements and Safari verification remain unverified; the proposed frame-interval/long-task budgets above have not been measured by this audit.

## Rendered audit implementation and initial result

`test/design-audit.mjs` uses the installed Playwright and axe packages against the separately built/served static site. It creates a real locally signed wallet, kit cartridge and friends board through the UI; generated keys/storage remain in browser memory. It refuses hosted fixtures and blocks network writes. The default matrix covers all ten routes in both layouts, desktop 1440×900/default text and phone 390×844/xl text, all three themes, loaded and deliberately blocked fonts, each fitted pane, and settings. Serious/critical axe rules, contrast, accessible names, overflow, missing coverage, console/runtime errors and unsuccessful requested fonts fail the process. Inconclusive axe results remain explicit manual-review items. The served HTML hash is checked per configuration to reject builds changing mid-run.

Run `node test/design-audit.mjs --help` for filters. With the existing static server at port 8765, the initial command was:

```sh
CHROME_PATH='/Users/michaelkennethbrillantes/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' node test/design-audit.mjs --layouts=fit --themes=light --fonts=offline --out=reports/redesign-quick-shots
```

The historical initial 2026-10-11 14:18–14:19 UTC pass used Chromium 153.0.8010.12 and served HTML SHA-256 `4f871a6a50b516bb0bd3d3c8caca04261ae38365323867b21aec757348719cd9`. It checked 65 states across desktop/phone and exited 1 with 33 blocking rule findings and seven inconclusive rule results. The following initial findings were subsequently corrected before the pre-final matrix:

- Coral text in the desktop Accessibility control and game remix chip measured 4.42:1 on the sheet; the cartridge remix chip measured 3.94:1. Muted serial labels measured 4.00:1 on the cartridge, selected kit description 4.46:1, and Studio status 4.48:1. These small-text targets require 4.5:1.
- Phone Business offer/reasons fitted sections and Economy's diagram/rules sections lacked keyboard access to scrollable content.
- No horizontal/fitted overflow, unnamed control, console/runtime, blocked-write or context error was found in this initial matrix. This does not cover loaded fonts, other themes, scrolling layout, all dialogs or real-device performance.

Historical detailed JSON and screenshots are ignored artifacts under `reports/redesign-quick-shots/`. The current cached browser can be selected with `CHROME_PATH` as above; the newly installed Node Playwright default browser revision was not present locally. `--workers=1` is the default; `--workers=3` runs at most three isolated contexts with the same gates and matrix coverage.

## Measured pre-final matrix

The complete sequential matrix on 2026-10-11 14:22:17–14:28:10 UTC exited **0**, checking **522 states across all 24 configurations**. This includes all ten routes, every fitted pane and settings. It found **zero blocking serious/critical axe, accessible-name, contrast or overflow findings**, zero console/context errors, zero failed requested fonts, and no network writes. All 12 loaded-font contexts reported six loaded font faces. The served HTML remained identical throughout the matrix.

- Tested served HTML SHA-256: `24a92b69460d59ed8446b870782fb3c0512710d4ccd52723b4f13f7c9703b813`.
- Tested source snapshot SHA-256: `81edcc3a51481c0a585eef8dfc1d303f3357f031a10f136e386eaaf21fa10cb2`. This is SHA-256 of each lexically sorted path, NUL, raw file bytes, NUL, concatenated over `build.mjs`, `site-README.md`, all `src/*.js`, `src/index.html` and both `src/assets/mascot*.webp` files. The working-tree source was uncommitted on Git base `fd0f6f16912bca24667959baceb1e901f5a1103c`; that base alone is not the tested release.
- Browser: cached Chromium headless shell 153.0.8010.12, software graphics enabled; desktop 1440×900/md and phone 390×844/xl; both layouts; light/dark/contrast; loaded/offline fonts.
- Preserved artifacts: `reports/redesign-prefinal-shots/audit-results.json`, `audit-summary.md` and the 522 screenshots. The directory was moved from the original `reports/redesign-shots/` after completion so the final rerun can retain its own evidence.

This is explicitly a **pre-final static/local fixture result**. Separate feature/review checks later found an 8-pixel overflow in sponsored phone Studio after guided/status changes and a hidden Accessibility name at the 901–1150-pixel breakpoint, which this 1440/390 local-mode matrix does not exercise. The implementation team corrected these before the final rebuild and matrix below; verification of those dynamic and intermediate-width states belongs to the separate feature checks. Exit 0 here is not a complete WCAG or production-readiness pass.

### Pre-final inconclusive contrast review

Axe returned **126 incomplete color-contrast rule instances**, containing **844 node observations**, grouped into **247 exact selector × theme × font groups**. These are inconclusive observations, not verified failures or verified passes. The representative types below account for all observations; repeated nodes across routes/panes are counted repeatedly. The final runner also retains check messages and writes `audit-manual-review.json` grouped by selector, element type, theme and font mode.

| Representative selector/type | Themes and font modes | Node observations | Manual review needed |
| --- | --- | --- | --- |
| `.stage-note` / scene caption | Light and dark; loaded/offline | 7 per combination, 28 total | Read text against the actual composed stage background. |
| Rating `span[aria-hidden="true"]` containing `★` / decorative symbol | All themes; loaded/offline | 2 per combination, 12 total | Check visibility on the game surface; adjacent rating text supplies meaning. |
| Emission chart `text[y="201.5"]`, other axis/epoch labels / SVG text | All themes; loaded/offline | 44 per combination, 264 total | Check muted labels at their rendered scale against the panel. |
| Value-flow `text[x="100"][y="41"]`, `text[x="238"][y="37"]`, other labels / SVG text | All themes; loaded/offline | 70 per combination, 420 total | Check labels and painted text strokes over arrows and node surfaces. |
| `.modal .muted`, `fieldset:nth-child(6) > .hint` / dialog copy | All themes; loaded/offline | 4 loaded and 2 offline per theme, 18 total | Check actual dialog layering and motion hint without obscuring text. |
| `.nav a[data-nav="business"]` / horizontal navigation | All themes; loaded/offline | 11 per combination, 66 total | Scroll/focus the phone navigation item into view before judging it. |
| `[data-act="home-idea"]:nth-child(5..7)` / horizontal idea controls | All themes; loaded/offline | 6 per combination, 36 total | Scroll/focus offscreen examples into view and check their labels. |

Representative pre-final screenshots reviewed by the reviewer show the desktop home console/caption separated from the shelf and the phone maker profile wrapping the long handle/title clearly. This limited visual check does not resolve every grouped observation. The following second pre-final run has its own evidence and representative visual review.

## Measured second pre-final matrix

The second pre-final rebuild was audited on 2026-10-11 **14:33:51.914–14:35:56.814 UTC** with three isolated workers. It exited **0**: **522 states across all 24 configurations**, with **zero blocking findings**, zero console/context errors, zero unsuccessful requested fonts and zero network writes. Every configuration served the same HTML. All 12 loaded-font contexts loaded six font faces. This covers the same ten routes, fitted panes and settings as the first pre-final matrix, with the same gates; parallel execution changed no acceptance criteria. The parent separately reported **335 original E2E checks passed on this `d6ba…` build**, before the later font/logo/chart-only changes; that result is not assigned to a later build hash.

```sh
CHROME_PATH='/Users/michaelkennethbrillantes/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' node test/design-audit.mjs --workers=3
```

- Second pre-final served HTML SHA-256: `d6ba3faf23698034576638cc9526cc21e68d03ff30611de00f5b80b5974aaf18`.
- Second pre-final source snapshot SHA-256: `0fd0aa0ad945903994e1815af5bebd50a9e79131d994bd318cc03b95d2519e59`, using the same path/bytes recipe as the first pre-final snapshot. Source was uncommitted on base `fd0f6f16912bca24667959baceb1e901f5a1103c` at measurement; these hashes identify the tested content independently of later commits.
- Browser and matrix: Chromium headless shell 153.0.8010.12 with software graphics enabled; desktop 1440×900/default text and phone 390×844/xl text; scroll/fit; light/dark/contrast; loaded/offline fonts.
- Second pre-final artifacts: `reports/redesign-prefinal2-shots/audit-results.json`, `audit-summary.md`, `audit-manual-review.json` and 522 matrix screenshots. First pre-final artifacts remain under `reports/redesign-prefinal-shots/`.

### Second pre-final inconclusive and visual review

The second pre-final run retains **126 incomplete color-contrast rule instances**, **844 node observations** and **247 selector × theme × font groups**. Their representative selectors/types/themes/fonts and counts match the table above. `audit-manual-review.json` preserves exact selectors, theme/font, state IDs, example markup and axe check messages. Axe's reasons are: image/composed ancestor background (376 observations), only non-text characters (12), text too short to classify (48), overlapping elements (288), partial overlap (18), and partial obscuring (102). These are not numeric contrast passes or confirmed failures.

The reviewer inspected second pre-final light/dark desktop home, the light phone console, light/dark settings, the light game rating, light desktop/phone emission charts and dark/contrast value-flow surfaces. The caption was above the scene and clear of the console; settings copy and the motion hint were unobscured; the decorative star had adjacent rating text; diagram labels were visually distinct, with phone diagram scrolling preserving its wider content. This visual sampling does not establish composed-pixel contrast across every animation frame or resolve every SVG label. The phone emission-axis labels were a readability limitation: their 10-pixel SVG font scaled to **5.97 CSS pixels** in the 390-pixel phone layout, measured from the SVG screen transform. Trend information was also supplied by the adjacent prose and chart accessible name. The later targeted fix and validation are recorded below.

A separate local read-only check scrolled/focused the phone **Business navigation link** and **last example-idea button** into view in all three themes with loaded/offline fonts. All **12 focused checks** returned zero contrast/name violations and zero inconclusive results for those targets. Representative focused screenshots confirm visible text and focus treatment. The check preserved the second pre-final HTML hash and blocked external writes. Its diagnostics and screenshots are under `reports/redesign-prefinal2-shots/manual-focused-review.json` and `manual-*-focused.png`; it supplements that 522-state matrix and does not erase its original incomplete findings. Other SVG and composed-background observations remain unresolved numeric contrast measurements.

## Targeted chart and audit refinements

The emission chart now has a labeled, keyboard-focusable horizontal scroll region and a 600-pixel minimum SVG width. Axis/epoch text is 14 SVG pixels, preserving the original 600-pixel viewBox, all plotted coordinates, all 20 emission values and tooltips, the image accessible name and the adjacent plain-text summary. Only `emissionChart()` and two chart-specific CSS selectors changed for this fix.

Direct browser checks against rebuilt HTML SHA-256 `b8d2aff0b98185d4469eb5ffdf8abc4335dbea668fc51536685d7c033583cee3` passed **all six light/dark/contrast × scroll/fit cases** at 390×844/xl with blocked optional fonts. Every label rendered at **14 CSS pixels**, with no SVG label clipping; all 20 tooltip values matched `PPCore.emissionFor()`. The wrapper's viewport was 358 pixels, scroll content 600 pixels, and ArrowRight moved its focused scroll position by 40 pixels. There was zero document horizontal overflow and zero fitted vertical overflow. The original textual summary remained present. Axe reported no violations for the chart region, while SVG contrast still requires manual pixel review. Diagnostics and fresh screenshots are in `reports/redesign-chart-check-shots/checks.json` and `*-rebuilt.png`. An earlier injected preview check was superseded by this direct rebuilt verification.

The audit now enables experimental `label-content-name-mismatch` through an axe rules options map, extending default rules without `runOnly`/`withRules`. A synthetic contract fixture detected both default `button-name` (critical) and the explicitly enabled mismatch rule (serious). Diagnostics are in `reports/redesign-chart-check-shots/axe-rule-contract.json`. Loaded-font configurations wait for the nonblocking `#optional-fonts` link to switch to `media="all"` before awaiting font readiness; offline cases skip this deliberate blocked stylesheet wait. Failed requested fonts or stylesheet readiness still fail the audit. These additional checks apply to the third pre-final matrix below, not the preceding preserved runs.

The static/local matrix does not independently establish the hosted sponsored Studio sequence, the 901–1150-pixel compact-header name fix, every game tab/populated dialog, 320-pixel reflow, keyboard-open/landscape phone behavior, real GPU/frame timing, physical-phone usability or Safari. The proposed frame/long-task budgets remain unmeasured. The parent's feature and scene suites are separate evidence. **Exit 0 is a scoped automated result, not a complete WCAG pass.**

## Measured third pre-final matrix

The rebuilt font/logo/chart-label source was audited on **2026-10-11 14:43:26.684–14:45:42.135 UTC**. The enhanced audit, including the stylesheet-ready gate and experimental naming rule, exited **0**: **522 states, 24 configurations, zero blocking findings**, zero console/context errors, zero failed requested fonts and zero network writes. Loaded contexts reported five or six loaded faces; unused face declarations are not required downloads. This result used served HTML SHA-256 `b8d2aff0b98185d4469eb5ffdf8abc4335dbea668fc51536685d7c033583cee3` and source snapshot SHA-256 `0468a5c76541d59f53348a5ecd2ef53cdc1de2d22f689d012092d51ae2a4f2ac`.

The **126 inconclusive color-contrast rule instances** contain **826 node observations**, grouped into **247 selector × theme × font groups**. Representative totals are stage caption 28, decorative rating star 12, emission SVG labels 246, value-flow SVG labels 420, settings copy/hint 18, offscreen Business navigation 66 and offscreen example buttons 36. Axe reasons are image/composed ancestor background 358, non-text-only 12, text too short to classify 48, overlapping elements 288, partial overlap 18 and partial obscuring 102. Full diagnostics and 522 screenshots are preserved under `reports/redesign-prefinal3-shots/`; the numeric contrast of these incomplete observations remains unverified.

The parent reported these separate checks on the same `b8d2…` build:

- Unit/integration suite: **317 checks**, exit 0.
- Decorative scene suite: **9/9 checks**, including **20 home/Explore cycles**, exit 0.
- Affected `site`, `fit`, `a11y`, `sponsored_fit` browser scenarios: **158 checks**, exit 0. The broader original **335 checks** passed on the preceding `d6ba…` build.
- Local simulated Lighthouse: desktop performance/accessibility/best-practices/SEO **100/100/100/100**, FCP and LCP **651.6 ms**, TBT **0 ms**, CLS **0.000819**; mobile **85/100/100/100**, FCP **3370.4 ms**, LCP **3381.4 ms**, TBT **35 ms**, CLS **0.000109**. These are uncompressed localhost runs with simulated throttling, not physical-phone or hosted measurements. The desktop logo mismatch rule passed; mobile was not applicable because the preview badge is hidden.

Despite the automated pass, manual chart review found future bars were black on the black high-contrast plot. The pending chart-only correction adds a **1.5-pixel `--ink-2` outline to future bars**, preserving current/past styles, every fill, plotted geometry and value. Six 390×844/xl preview checks measured outline/background contrast at **7.42:1 light**, **10.37:1 dark** and **21:1 high contrast** in both layouts. Start/end screenshots visibly expose the decaying future bars and readable labels. Preview diagnostics are in `reports/redesign-chart-contrast-shots/preview-checks.json`; this preview does not establish a rebuilt-release result. The three preserved matrix runs remain historical evidence.

## Paused working-tree state

At pause, branch `codex/claudeplay-kinetic-redesign` contains the chart wrapper, 14-pixel labels, and pending future-bar outline. Source snapshot SHA-256 is `c94ea37248c5ad8eca661260eedcdf46c060112e1061617404e29286b9d5ccda`; checked-in/local `dist/site/index.html` remains the tested `b8d2aff0b98185d4469eb5ffdf8abc4335dbea668fc51536685d7c033583cee3` build and does **not** include the new outline. The outline has syntax and six-case preview verification, but no rebuilt full matrix. Rebuild/full validation was intentionally paused at the user's change of direction; no final outline-build pass is claimed. No build, source edits or further full matrix were performed by this reviewer after the pause.
