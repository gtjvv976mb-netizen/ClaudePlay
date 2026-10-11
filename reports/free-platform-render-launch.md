# Free platform: verified Render launch

Findings and launch progress recorded on 2026-10-11. The owner has explicitly approved deploying the reviewed [PR 17](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/17) release at **`fcfa4dc9ade51acb6fc2b23db1b670049b0ab1aa`**. Keep this approved SHA fixed even if subsequent documentation commits advance the PR head. **The guarded release is live with AI enabled.** See the verified launch evidence below. No pending PRs have been merged.

## Verified launch evidence

On October 11, the owner confirmed sign-in to the dedicated in-app Render Dashboard. Blueprint `exs-db53jq2jnfac7394bbf0` was confirmed to track main, and **Auto Sync → No** was saved and visibly verified. The root agent selected exactly `fcfa4dc9ade51acb6fc2b23db1b670049b0ab1aa` through **Manual Deploy → Deploy a specific commit**.

Deployment **`dep-db5pikvlk1mc73aqdud0`** became live at **14:13:17 UTC / 22:13:17 Manila**. MCP deployment details confirm the full approved SHA; the Dashboard confirms Live and service auto-deploy disabled. A screenshot of the overview was saved locally in ignored `reports/render-shots/guard-live.jpg`, with no private log content.

A public status read after that deployment reports AI off, models null, shared gallery on devnet, sponsored plan, no Pro offer and available allowances. Its durable budget reports **400 USD cap, 0 USD reserved, 400 USD remaining, available true**; new/edit/bestEdit/screen/playtest actions are available. Daily limits are 2 builds, 20 edits, 20 screens and 40 play-tests. No real API call was made.

The owner has been asked to privately enter `ANTHROPIC_API_KEY` using **Save only**, then confirm. Key entry was subsequently confirmed and activation verified below. Redeploy the same exact approved SHA after confirmation; preserve the retained store and disabled auto-deploy/Auto Sync. The newly requested game-world redesign is separate local work and is not included in this deployment.


The owner confirmed private key entry with **Save only**. The root redeployed the **same exact approved SHA**, producing `dep-db5pk1id0e5s7389dl9g`, live at **2026-10-11 14:16:18 UTC (22:16:18 Manila)**. Public status reports `ai: true`, sponsored plan, no Pro offer, devnet and the approved Sonnet/Haiku model routing. A single private, minimal safety-review smoke call returned HTTP 200 with `ok: true` and `reviewed: true`; no game was published. Its durable reservation settled to **0.000061 USD**, leaving **399.999939 USD**. No API key or screening token was printed or stored in Git. The approved free-platform launch is complete; the redesigned release is separate pending local review. Final Dashboard overview proof is saved in ignored `reports/render-shots/ai-live.jpg`.

## Original service inspection

- Workspace: **My Workspace**, `tea-d8m6m00js32c73drnobg`.
- Service: **gameplay**, `srv-db53jro473hc739om89g`; [Render dashboard](https://dashboard.render.com/web/srv-db53jro473hc739om89g).
- Repository: `gtjvv976mb-netizen/ClaudePlay`; linked branch: `main`.
- Node web service, free compute plan, Oregon, one instance, no attached disk.
- Build: `npm ci && node build.mjs`; start: `npm start`; health check: `/api/status`.
- Service auto-deploy: **On Commit** at inspection. The approved SHA has not replaced the linked `main` revision.
- Blueprint association discovered in the native Dashboard overview: `exs-db53jq2jnfac7394bbf0`. Its linked branch and current **Auto Sync setting remain unverified**.
- Earlier checks of [claudeplay.si status](https://claudeplay.si/api/status) and [Render hostname status](https://gameplay-kxs4.onrender.com/api/status) returned AI off on devnet. The root agent rechecked public `/api/status` after the configuration-triggered redeploy: `ai: false`, `models: null`, `plan: "free"`, `gallery: true`, `chain: "devnet"`, daily builds 2 and edits 20. The old deployed revision lacks the new lifetime funding guard.

## Approved configuration update and current blocker

After approval, the root agent applied **18 nonsecret sponsorship, model and limit defaults** with Render's environment-update tool and `replace: false`. Secret values were neither printed nor changed. The API key was not enabled.

Despite merge semantics, that MCP update **unexpectedly triggered a production redeploy of existing `main`**: `dep-db5pclnavr4c739k2u50`, trigger `api`, became live at old commit `7c68b8c1452d05ab5a734d9764d8a547928645ac` on October 11 at **14:00:31 UTC (22:00:31 Manila)**. This is not the guarded release. Treat this tool as capable of triggering a redeploy; do not use it as an environment-read probe or assume it saves without deployment.

At this earlier preparation stage, the dedicated in-app browser was signed out; this blocker is resolved by the verified launch above. An authenticated native Brave tab exists, but the owner is actively using Brave and its UI state diverged from the captured screenshot. Continue through the dedicated in-app browser after sign-in. The exposed MCP deploy tool cannot pin the approved commit. No further environment changes or key activation should precede the guarded deployment and budget verification below.

Use the **exact approved SHA above**, not an earlier local commit, a later documentation-only PR head or latest `main`. This record covers that reviewed release.

## Prerequisites and staged launch after approval

1. Inspect Blueprint `exs-db53jq2jnfac7394bbf0` in the Dashboard. If it tracks `main`, set its **Auto Sync → No** under the existing launch approval. Blueprint sync is separate from service auto-deploy and can overwrite Dashboard settings and redeploy affected resources. See [Blueprint configuration and Auto Sync](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync).
2. Keep AI off for the first guarded deployment: do not enter or enable the Anthropic key yet. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` privately in the Dashboard, using the same durable retained database. Confirm `GP_SPONSORED=1`, `GP_AI_BUDGET_USD=400`, `GP_PRO_PRICE_SOL=0`, `GP_SOLANA_CLUSTER=devnet` and `GP_DATA_PERSISTENT=0`. Use **Save only** for any necessary Dashboard environment changes. Daily account defaults are 2 builds, 20 edits, 20 safety reviews and 40 play-test reviews; the network multiplier defaults to 10.
3. On this existing service, choose **Manual Deploy → Deploy a specific commit**, paste **`fcfa4dc9ade51acb6fc2b23db1b670049b0ab1aa`** and choose **Deploy Commit**. This deploys that commit from the linked repository while leaving pending PRs unmerged. This Dashboard action automatically disables **service auto-deploy**, preventing a later ordinary `main` push from replacing it. See [exact-commit deployment and auto-deploy behavior](https://render.com/docs/deploys#deploying-a-specific-commit).
4. Wait for that exact guarded SHA to become live with AI still off. Verify `/api/status` reports `ai: false`, `sponsored: true`, `plan: "sponsored"`, `pro: null`, devnet and a readable durable budget: `capUsd: 400`, numeric `reservedUsd` / `remainingUsd`, and no budget-store unavailability. Preserve the database and any existing budget total/receipts; do not flush, expire or replace them to reset the allowance.
5. Only after that verification, the owner enters `ANTHROPIC_API_KEY` directly in this service's Dashboard and chooses **Save only**. Then repeat **Deploy a specific commit** with the **same guarded SHA**. Verify the resulting live deploy's commit and hosted AI/budget status. Never use a generic latest-commit or latest-`main` deployment for either stage. [Render environment save options](https://render.com/docs/configure-environment-variables#in-the-render-dashboard) distinguish Save only from operations that trigger a deploy.

Keep service auto-deploy and any applicable Blueprint Auto Sync disabled while this exact commit is pinned. Reenabling service auto-deploy resumes deployment from the linked branch.

## Tool limits and unverified readiness

The exposed Render MCP deploy tool cannot select a commit SHA. The official [CLI](https://render.com/docs/cli) supports `deploys create --commit`, and the API supports `commitId`, but neither automatically disables service auto-deploy. The CLI is not installed here; the Dashboard route avoids an additional installation or credential setup.

**The durable budget is now verified through the live guarded service; private API-key entry was confirmed, and the activated guarded release passed the live smoke check above.** No environment-read tool is exposed, and no private values were read. The nonsecret merge update preserved existing secrets but also caused the old-main redeploy recorded above. The original environment update alone did not establish guarded readiness; the exact-SHA Dashboard deployments and public budget checks above provide the later verification.
