// Optional manual check of the real Lua scripts, without a hosted Redis or a runtime dependency.
// REDIS_SERVER_PATH=/path/to/redis-server node test/redis-budget-check.mjs
// redis-cli must be beside redis-server, or supplied with REDIS_CLI_PATH. POSIX sockets required.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { redisStore } from '../server/gallery.mjs';

if (!process.env.REDIS_SERVER_PATH) {
  console.error('Set REDIS_SERVER_PATH to a local redis-server; REDIS_CLI_PATH is optional. This manual check never connects to an existing database.');
  process.exit(2);
}
const binary = resolve(process.env.REDIS_SERVER_PATH);
const cli = process.env.REDIS_CLI_PATH ? resolve(process.env.REDIS_CLI_PATH) : join(dirname(binary), 'redis-cli');
const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), 'cp-redis-'));
const socket = join(dir, 'redis.sock');
let redis, bridge, logs = '';
const command = async (args) => {
  const { stdout } = await run(cli, ['-s', socket, '--json', ...args.map(String)], { timeout: 3000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
};
async function start() {
  logs = '';
  redis = spawn(binary, ['--port', '0', '--unixsocket', socket, '--unixsocketperm', '700', '--save', '', '--appendonly', 'yes', '--appendfsync', 'always', '--dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  const collect = (chunk) => { logs = (logs + chunk).slice(-8000); };
  redis.stdout.on('data', collect); redis.stderr.on('data', collect);
  await once(redis, 'spawn');
  for (let i = 0; i < 100; i++) {
    if (redis.exitCode !== null) throw new Error('Redis exited: ' + logs);
    try { if (await command(['PING']) === 'PONG') return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Local Redis failed to become ready: ' + logs);
}
async function stop() {
  const child = redis; redis = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

try {
  await start();
  // Upstash-shaped REST response, executing each command against the real local Redis engine.
  // The production adapter sends its own Lua unchanged; the bridge contains no Lua emulation.
  bridge = createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const output = [];
      for (const args of JSON.parse(body)) {
        try { output.push({ result: await command(args) }); } catch (e) { output.push({ error: e.message }); }
      }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(output));
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
  });
  bridge.listen(0, '127.0.0.1'); await once(bridge, 'listening');
  const url = 'http://127.0.0.1:' + bridge.address().port;
  const fresh = () => redisStore(url, 'local-review-only').kv;
  const kv = fresh(), key = 'ai:budget:v1', cap = 400000000;
  assert.deepEqual(await kv.reserve(key, 1, 0, randomUUID()), { ok: false, used: 0 });
  const admissions = await Promise.all(Array.from({ length: 32 }, () => fresh().reserve(key, 10000000, 100000000, randomUUID())));
  assert.equal(admissions.filter((r) => r.ok).length, 10);
  assert.equal(await kv.get(key), 100000000);
  const id = randomUUID();
  assert.deepEqual(await kv.reserve(key, 200000000, cap, id), { ok: true, used: 300000000 });
  assert.deepEqual(await fresh().reserve(key, 200000000, cap, id), { ok: false, used: 300000000 });
  assert.deepEqual(await fresh().settle(key, id, 17000001), { ok: true, used: 117000001 });
  const retries = await Promise.all(Array.from({ length: 32 }, () => fresh().settle(key, id, 17000001)));
  assert.ok(retries.every((r) => r.ok && r.used === 117000001));
  assert.deepEqual(await kv.settle(key, id, 0), { ok: false, used: 117000001 });
  assert.equal(await command(['PTTL', 'gp:' + key]), -1);
  assert.equal(await command(['PTTL', 'gp:' + key + ':reservation:' + id]), -1);

  const pending = randomUUID();
  await kv.reserve(key, 100000000, cap, pending);
  const mixed = await Promise.all([
    fresh().settle(key, pending, 50000000),
    ...Array.from({ length: 32 }, () => fresh().reserve(key, 10000000, cap, randomUUID())),
  ]);
  let expected = 167000001 + mixed.slice(1).filter((r) => r.ok).length * 10000000;
  assert.ok(mixed.every((r) => r.used >= 0 && r.used <= cap));
  assert.equal(await kv.get(key), expected);
  const receipts = [];
  for (let i = 0; i < 300; i++) {
    if (i % 3 === 0 && receipts.length) {
      const receipt = receipts.shift(), actual = Math.floor(receipt.amount / 7);
      expected -= receipt.amount - actual;
      assert.deepEqual(await fresh().settle(key, receipt.id, actual), { ok: true, used: expected });
    } else {
      const amount = (i * 997) % 10000000 + 1, rid = randomUUID(), ok = amount <= cap - expected;
      if (ok) { expected += amount; receipts.push({ id: rid, amount }); }
      assert.deepEqual(await fresh().reserve(key, amount, cap, rid), { ok, used: expected });
    }
  }
  assert.equal(await kv.get(key), expected);
  await stop(); await start();
  assert.equal(await fresh().get(key), expected);
  assert.deepEqual(await fresh().settle(key, id, 17000001), { ok: true, used: expected });
  console.log('PASS: actual Redis Lua; zero cap; concurrent admissions and settlements; exact $400 arithmetic; permanent receipts; duplicate protection; 300 mixed operations; AOF restart persistence.');
} finally {
  if (bridge) { const closed = once(bridge, 'close'); bridge.close(); bridge.closeAllConnections(); await closed; }
  await stop();
  await rm(dir, { recursive: true, force: true });
}
