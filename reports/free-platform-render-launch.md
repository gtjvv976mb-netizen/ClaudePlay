# Free platform: Render launch preparation

Read-only findings recorded on 2026-10-11. No service settings, secrets or deployments were changed. Production deployment still requires explicit current approval.

## Confirmed existing service

- Workspace: **My Workspace**, `tea-d8m6m00js32c73drnobg`.
- Service: **gameplay**, `srv-db53jro473hc739om89g`; [Render dashboard](https://dashboard.render.com/web/srv-db53jro473hc739om89g).
- Repository: `gtjvv976mb-netizen/ClaudePlay`; linked branch: `main`.
- Node web service, free compute plan, Oregon, one instance, no attached disk.
- Build: `npm ci && node build.mjs`; start: `npm start`; health check: `/api/status`.
- Service auto-deploy: **On Commit**. Latest deploy `dep-db5i6u95efls73ama2f0` was live at `7c68b8c1452d05ab5a734d9764d8a547928645ac`, completed October 11 at 05:50:26 UTC.
- Both [claudeplay.si status](https://claudeplay.si/api/status) and [Render hostname status](https://gameplay-kxs4.onrender.com/api/status) returned AI off, `plan: "free"`, gallery enabled and `chain: "devnet"`. That deployed revision lacks the new lifetime funding guard.

Verify current state again immediately before launch. Use the **final tested and pushed [PR 17](https://github.com/gtjvv976mb-netizen/ClaudePlay/pull/17) head SHA**. Do not substitute an earlier local commit or the latest `main` commit.

## Prerequisites and staged launch after approval

1. Inspect this service's Blueprint association in the Dashboard. Prior deploy history includes `blueprint_sync`, but the actual association and its current Auto Sync setting are **unverified**. If the associated Blueprint tracks `main`, set that Blueprint's **Auto Sync → No** after approval. Blueprint sync is separate from service auto-deploy and can overwrite Dashboard settings and redeploy affected resources. See [Blueprint configuration and Auto Sync](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync).
2. Keep AI off for the first guarded deployment: do not enter or enable the Anthropic key yet. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` privately in the Dashboard, using the same durable retained database. Configure `GP_SPONSORED=1`, `GP_AI_BUDGET_USD=400`, `GP_PRO_PRICE_SOL=0`, `GP_SOLANA_CLUSTER=devnet` and `GP_DATA_PERSISTENT=0`. Use **Save only** for any environment changes. Daily account defaults are 2 builds, 20 edits, 20 safety reviews and 40 play-test reviews; the network multiplier defaults to 10.
3. On this existing service, choose **Manual Deploy → Deploy a specific commit**, paste the final tested/pushed PR 17 head SHA and choose **Deploy Commit**. This deploys that commit from the linked repository while leaving pending PRs unmerged. This Dashboard action automatically disables **service auto-deploy**, preventing a later ordinary `main` push from replacing it. See [exact-commit deployment and auto-deploy behavior](https://render.com/docs/deploys#deploying-a-specific-commit).
4. Wait for that exact guarded SHA to become live with AI still off. Verify `/api/status` reports `ai: false`, `sponsored: true`, `plan: "sponsored"`, `pro: null`, devnet and a readable durable budget: `capUsd: 400`, numeric `reservedUsd` / `remainingUsd`, and no budget-store unavailability. Preserve the database and any existing budget total/receipts; do not flush, expire or replace them to reset the allowance.
5. Only after that verification, the owner enters `ANTHROPIC_API_KEY` directly in this service's Dashboard and chooses **Save only**. Then repeat **Deploy a specific commit** with the **same guarded SHA**. Verify the resulting live deploy's commit and hosted AI/budget status. Never use a generic latest-commit or latest-`main` deployment for either stage. [Render environment save options](https://render.com/docs/configure-environment-variables#in-the-render-dashboard) distinguish Save only from operations that trigger a deploy.

Keep service auto-deploy and any applicable Blueprint Auto Sync disabled while this exact commit is pinned. Reenabling service auto-deploy resumes deployment from the linked branch.

## Tool limits and unverified readiness

The exposed Render MCP deploy tool cannot select a commit SHA. The official [CLI](https://render.com/docs/cli) supports `deploys create --commit`, and the API supports `commitId`, but neither automatically disables service auto-deploy. The CLI is not installed here; the Dashboard route avoids an additional installation or credential setup.

**Private durable-store configuration and API-key readiness remain unverified.** No environment-read tool is exposed, and no private values were read. The environment-update tool can merge nonsecret defaults with `replace: false` after approval without retrieving existing secrets. This report authorizes no such changes.
