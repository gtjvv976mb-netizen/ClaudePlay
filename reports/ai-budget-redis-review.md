# AI budget: actual Redis Lua validation

Validated on 2026-10-11 with Node v24.21.0, Darwin arm64, Apple clang 21.0.0 and Redis 7.4.0 built from the [official source archive](https://download.redis.io/releases/redis-7.4.0.tar.gz). Archive SHA-256: `57b47c2c6682636d697dbf5d66d8d495b4e653afc9cd32b7adf9da3e433b8aaf`.

The reproducible harness is [test/redis-budget-check.mjs](../test/redis-budget-check.mjs). It starts a fresh Redis with TCP disabled, a private Unix socket and `appendonly yes` / `appendfsync always`. A loopback HTTP bridge translates the production `redisStore` adapter's REST pipeline into real Redis commands using `redis-cli --json`. The adapter supplies the Lua unchanged; the bridge does not emulate it. The harness restarts Redis against the same temporary AOF directory, then stops it and removes its temporary data. No hosted database, API key or added npm dependency is used.

From the project directory, use an existing local Redis installation:

```bash
REDIS_SERVER_PATH=/absolute/path/to/redis-server node test/redis-budget-check.mjs
```

`redis-cli` must be beside `redis-server`, or set `REDIS_CLI_PATH` too. POSIX sockets and a Redis CLI supporting `--json` are required. This is a manual check, separate from `npm test`.

To repeat with the same Redis source version without installing it globally:

```bash
set -e
task_redis_review_dir=$(mktemp -d /tmp/claudeplay-redis-review.XXXXXX)
curl --fail --location https://download.redis.io/releases/redis-7.4.0.tar.gz --output "$task_redis_review_dir/redis.tar.gz"
shasum -a 256 "$task_redis_review_dir/redis.tar.gz"
tar -xzf "$task_redis_review_dir/redis.tar.gz" -C "$task_redis_review_dir"
make -C "$task_redis_review_dir/redis-7.4.0" MALLOC=libc -j4 redis-server redis-cli
REDIS_SERVER_PATH="$task_redis_review_dir/redis-7.4.0/src/redis-server" node test/redis-budget-check.mjs
rm -rf "$task_redis_review_dir"
```

Result, exit status **0**:

```text
PASS: actual Redis Lua; zero cap; concurrent admissions and settlements; exact $400 arithmetic; permanent receipts; duplicate protection; 300 mixed operations; AOF restart persistence.
```

Checks include 32 concurrent admissions with exactly ten accepted at the chosen ceiling; duplicate reservation rejection; 32 identical settlement retries without a second refund; mismatched settlement rejection; no expiry on the total or receipt; concurrent settlement and new reservations sharing the total; 300 operations checked against an independent integer balance; and restart preservation of the total and settlement receipt.

Validated Lua body SHA-256 values from `server/gallery.mjs`:

- `RESERVE_BUDGET`: `285c828935e5755cdabfac0a611a2ca04657bd530cb7a27290c3178f67ed6656`
- `SETTLE_BUDGET`: `e4b50392921823d5940cf08459d9a75049af17fc57e2a5181a22fb41c8b75e2f`

The accompanying `node --test test/budget-store.test.mjs` run passed all **14** tests, including independent file-store processes, outage/lock failures and refusing automatic migration of a funded source. This evidence validates local Lua execution and adapter behavior; production Upstash persistence, configuration and Anthropic billing still require their own deployment checks.
