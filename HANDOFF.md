# ClaudePlay recovery handoff — 11 October 2026

This is the selected ClaudePlay project, shown as **GamePlay** in Claude. Repository: [gtjvv976mb-netizen/ClaudePlay](https://github.com/gtjvv976mb-netizen/ClaudePlay). Read `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md` and `SECURITY.md` before continuing.

## Recovered source

The continuation uses an isolated checkout in this folder. The references recovered on October 11 are:

| Reference | Commit | Meaning |
| --- | --- | --- |
| `origin/main` | `7c68b8c1452d05ab5a734d9764d8a547928645ac` | Pushed calm/professional redesign, every page fitting one screen, merged as PR 13. |
| [PR 14](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/14) head | `249bcbb69ebfea2ad5213a9bc0229b2b7609d12f` | Graphics/front-page fix: keeps the background game out of the fitted page parts. This is not the later pixel-art overhaul. |
| [PR 15](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/15) head | `3ba1f87b00d5a1d2fd2021cbef167e543890a296` | Feature update recovered for continuation. Its final recorded commit waits for the studio play-test before the next browser-test build. |
| `codex/claudeplay-continuation` | Based on PR 15 head above | Continuation fixes for a separate draft PR against the pending feature branch. See implementation and validation below. |

These are recovered references, not a perpetual statement of GitHub status. Verify current remote state before later actions that depend on it.

The continuation fixes are published for review in [draft PR 16](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/16), stacked on PR 15's feature branch. The tested implementation commit is `6963f3e3408174c3d1e32f40f46fc8bbfb58ef22`. No production deployment or merge was performed in this continuation.

## Incomplete design recovery

Claude's `claude/site-design-overhaul-417dam` thread reported a completed pixel-art title screen, menus, game cards and starter-game reskins at approximately **15:47 Asia/Manila on October 11**. The thread said the result was saved as an unpushed patch and awaited the owner's shipping choice.

**That original unpushed design patch is not recovered.** It remains cloud-only in the inspected evidence. Its screenshots are unavailable locally. Searches of the existing continuation workspace, local Claude transcripts/scratch folders, temporary scratch roots and likely source folders did not find the patch. No recreation is being labelled as the original design.

The pushed design branch and this source's `DESIGN.md` still describe the October 10 calm silver-grey/graphite design with a muted slate-blue accent, Geist type and quiet 3D background. They cannot establish the contents of the later pixel-art patch. Recover the original patch and screenshots from that Claude session before applying its design work or claiming recovery complete.

Original mascot media remains unchanged outside this project at:

`~/Downloads/claudeplay-mascot/`

- `hf_20261010_153716_d709d62b-c34f-43ea-9767-dee0bb01a3f7.png` — 1024×1024 image.
- `hf_20261010_155516_b01111f4-7bb4-45db-b838-2f6d6ca9171c.mp4` — source motion media.

The unrelated I&I presentation in that folder is not ClaudePlay design evidence. Recovered website mascot assets already exist in `src/assets/`.

## Implemented continuation

The continuation fixes the following recovered issues:

- Studio drafts retain uploaded pictures, unpublished edits to live games, tuned kit settings and the selected version when history is trimmed. Editing and both remix paths recover embedded pictures. Studio replacement controls are guarded while a build runs.
- A game iframe that starts with a zero-sized viewport recovers when it becomes visible. The recovery lives in the injected SDK; the hashed starter files stay unchanged.
- Republished files clear scores belonging to the previous file and update kit/genre metadata. Metadata-only updates preserve current scores.
- Multiplayer traffic limits count UTF-8 bytes, proxy padding and heartbeats. HTTP admission waits for persisted daily usage, including UTC rollover, and active streams close beyond the allowance. Store failures during initialization return an unavailable response.
- Leaving a room cancels overlapping sends and clears queued work before closing the event stream. Player unmounting clears pending score timers. This prevents delayed sends from racing the server's removal of the player token.
- The graphics/front-page fix from PR 14 is included, so the background game cannot be mistaken for a fitted page part.
- The browser runner exits with status 1 when checks or scenarios fail; the server test's static fixture resolves paths containing spaces correctly.

Validation on October 11: `npm test` passes **289 checks** and `node build.mjs` succeeds. All **300 browser checks across 13 scenarios pass**, with all three runner processes exiting 0. `git diff --check` and the changed JavaScript/Python syntax checks pass.

The deterministic zero-viewport regression fails against the pre-fix build. Holding a real room send across Leave room also reproduced the original HTTP 403; the final regression held two overlapping sends and verified both were canceled without HTTP responses. An independent comparison found all 30 named kit/palette documents and all five starter documents byte-identical to the recovered feature branch.

The complete browser suite ran in three independent groups with installed Google Chrome, against the rebuilt local page and fake service/payment fixtures. Evidence is in ignored local files `reports/unit-tests.log`, `reports/browser-creator-final.log` (102 checks), `reports/browser-platform-final.log` (156 checks) and `reports/browser-server-final.log` (42 checks), with screenshots in the corresponding `reports/verified-*-shots/` folders. Two runner processes took several minutes to finish browser cleanup after their last check; both finished naturally without signals or edits. Relevant commands and prerequisites remain in `CLAUDE.md` and `test/e2e.py`; regenerate the checked-in build after later source edits.

## Free hosted platform continuation

The owner requested full free access for game creators using $400 of Claude API credits and explicitly selected **free creation with per-user limits and a $400 total cap**. The work is on `codex/claudeplay-free-platform`, stacked on the prior continuation branch. It has not been deployed or merged.

Hosted sponsorship removes new Spark charges and paid Pro gates for standard/best builds, picture uploads, edits, fixes and remixes. Publishing keeps its signed content hash, attribution and safety checks. Existing ledgers, signing formats and starter documents are preserved. Static pages and Claude artifacts retain their existing compatibility behavior.

Server allowances default to 2 new games, 20 edits/fixes, 20 publishing reviews and 40 play-test reviews per account per UTC day. Network ceilings are ten times higher for creators sharing an address, while anonymous calls retain the smaller visitor ceiling. Every Claude call reserves a conservative maximum against one permanent $400 counter before contacting the provider. Verified completed usage settles once; unknown/aborted calls keep their reservation. Durable file and Redis adapters have atomic receipt operations, and sponsorship refuses unverified ephemeral storage. A gallery-only migration refuses a previously funded source rather than silently resetting the allowance. See README for required secrets and deployment settings.

The live `https://claudeplay.si/api/status` was checked during this continuation and reported shared gallery on devnet, AI off and legacy daily limits. It does not yet contain this sponsorship release. The user confirmed Render workspace **My Workspace** and chose to enter the Claude API key directly in its dashboard. Key readiness and the existing durable store remain unverified. No key was requested in chat, no paid API calls were made for tests, and no external service configuration changed. Deploy the funded release before enabling the API key so the first public request is guarded.

The implementation is published in [draft PR 17](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/17), stacked on PR 16. The tested implementation commit is `15d10d5af0db44a1ac9368d52ae854964a7acbbc`. On October 11, `npm test` passed 289 existing checks and 27 new budget/store/integration tests. All **335 browser checks across 15 scenarios passed**, and every final runner exited 0. The regenerated build, JavaScript/Python syntax, Blueprint YAML, whitespace and staged secret-pattern checks passed. The protected starter, protocol and harness source files were unchanged from the prior continuation.

Browser evidence is retained in ignored local logs `reports/browser-free-general.log` (98 checks), `reports/browser-free-layout.log` (132), `reports/browser-free-recovery.log` (18), `reports/browser-sponsored-fit.log` (7), `reports/browser-free-server.log` (52) and `reports/browser-sponsored.log` (28), with corresponding `reports/free-platform-*-shots/` folders. The first combined run encountered a local static-server outage; the affected recovery and server/chain scenarios were rerun successfully after the fixture was restored. One sponsored runner waited in browser shutdown because test-launched crashpad/updater helpers retained Chrome's stderr socket. Their launch times and exact inherited socket proved ownership; only those helpers received SIGTERM. Python and Playwright were untouched, and the runner printed its normal ALL PASSED footer and exited 0. See `reports/browser-sponsored-shutdown.txt` for cleanup evidence. The test-owned static server was stopped after validation.

Actual Redis Lua concurrency, integer-dollar arithmetic, permanent receipts, idempotence and AOF restart checks also passed against an isolated local Redis process. The reproducible harness is `test/redis-budget-check.mjs`; source hashes and results are in `reports/ai-budget-redis-review.md`. Browser and API fixtures did not contact Claude or consume credits.

Render workspace **My Workspace** (`tea-d8m6m00js32c73drnobg`) contains the existing `gameplay` service (`srv-db53jro473hc739om89g`), at [the dashboard](https://dashboard.render.com/web/srv-db53jro473hc739om89g), `https://gameplay-kxs4.onrender.com` and `https://claudeplay.si`. Read-only inspection found the free Node service still serving main commit `7c68b8c1452d05ab5a734d9764d8a547928645ac`, with auto-deploy enabled for main, one instance and no persistent disk. Both public status endpoints reported AI disabled and devnet. Existing secrets cannot be inspected through the available Render tools. Use the retained durable Upstash database, deploy the guarded release first, and verify its budget status before enabling the privately entered API key. Deployment and merge approval are pending; no external settings were changed. The unpushed pixel-art design recovery gap above remains incomplete.

## Compatibility and authorization

Preserve starter hashes, signing formats, the `GAMEPLAY/v1` domain, `gameplay` protocol names/payment memos and existing `pp.` storage keys. Starter hash changes invalidate existing signed scores; signing changes require a migration.

Keep work on devnet and preserve the server's no-private-key design. Current authorization covers local continuation and review. Production deployment, merging, mainnet configuration, real-money transactions and new paid services need explicit current authorization. `SECURITY.md` retains the owner's mainnet checklist and open security issues. Historical handoff text does not authorize those actions.

Original repositories, Claude scratch state and source media outside this workspace remain preserved. Recovery documentation is local to this project; the root coordination reports and project registry have not been changed by this handoff task.
