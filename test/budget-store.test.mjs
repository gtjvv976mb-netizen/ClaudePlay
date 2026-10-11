// Budget receipts must survive restart and serialize independent instances before any API call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileStore, redisStore, copyGallery } from '../server/gallery.mjs';
import { fakeRedis } from './fake_redis.mjs';

const KEY = 'ai:budget:v1';
const fixtures = {
  async file() {
    const dir = await mkdtemp(join(tmpdir(), 'claudeplay-budget-'));
    return { kv: fileStore(dir).kv, fresh: () => fileStore(dir).kv, dir, close: () => rm(dir, { recursive: true, force: true }) };
  },
  async redis() {
    const redis = await fakeRedis();
    return { kv: redisStore(redis.url, redis.token).kv, fresh: () => redisStore(redis.url, redis.token).kv, redis, close: () => redis.close() };
  },
};

for (const [name, create] of Object.entries(fixtures)) {
  test(name + ': permanent reservation is visible to a new instance before flush', async () => {
    const f = await create();
    try {
      const id = randomUUID();
      assert.equal(f.kv.persistent, true);
      assert.deepEqual(await f.kv.reserve(KEY, 400, 1000, id), { ok: true, used: 400 });
      assert.equal(await f.fresh().get(KEY), 400);
      if (f.dir) assert.equal(JSON.parse(await readFile(join(f.dir, 'kv.json'), 'utf8'))[KEY].exp, 0);
      if (f.redis) assert.equal(f.redis.commands.some(([cmd]) => cmd === 'EXPIRE'), false);
    } finally { await f.close(); }
  });
  test(name + ': concurrent admission never exceeds the cap', async () => {
    const f = await create();
    try {
      const results = await Promise.all(Array.from({ length: 20 }, () => f.fresh().reserve(KEY, 100, 500, randomUUID())));
      assert.equal(results.filter((r) => r.ok).length, 5);
      assert.equal(await f.fresh().get(KEY), 500);
      assert.ok(results.every((r) => r.used <= 500));
    } finally { await f.close(); }
  });
  test(name + ': receipts forbid duplicate admission and double refunds across instances', async () => {
    const f = await create();
    try {
      const id = randomUUID();
      assert.deepEqual(await f.kv.reserve(KEY, 1, 0, randomUUID()), { ok: false, used: 0 });
      await f.kv.reserve(KEY, 400, 1000, id);
      assert.deepEqual(await f.fresh().reserve(KEY, 400, 1000, id), { ok: false, used: 400 });
      assert.deepEqual(await f.fresh().settle(KEY, id, 50), { ok: true, used: 50 });
      await Promise.all(Array.from({ length: 10 }, () => f.fresh().settle(KEY, id, 50)));
      assert.equal(await f.fresh().get(KEY), 50);
      assert.deepEqual(await f.fresh().settle(KEY, id, 0), { ok: false, used: 50 });
      assert.deepEqual(await f.fresh().reserve(KEY, 400, 1000, id), { ok: false, used: 50 });
    } finally { await f.close(); }
  });
  test(name + ': invalid and missing receipts cannot release funds', async () => {
    const f = await create();
    try {
      const id = randomUUID();
      await f.kv.reserve(KEY, 400, 1000, id);
      assert.deepEqual(await f.kv.settle(KEY, randomUUID(), 0), { ok: false, used: 400 });
      assert.deepEqual(await f.kv.settle(KEY, id, 401), { ok: false, used: 400 });
      for (const bad of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(async () => f.kv.reserve(KEY, bad, 1000, randomUUID()));
        await assert.rejects(async () => f.kv.settle(KEY, id, bad));
      }
      assert.equal(await f.kv.get(KEY), 400);
      assert.deepEqual(await f.kv.settle(KEY, id, 0), { ok: true, used: 0 });
    } finally { await f.close(); }
  });
  test(name + ': settlement and new reservations share the same atomic total', async () => {
    const f = await create();
    try {
      const id = randomUUID();
      await f.kv.reserve(KEY, 400, 500, id);
      const results = await Promise.all([
        f.fresh().settle(KEY, id, 100),
        ...Array.from({ length: 10 }, () => f.fresh().reserve(KEY, 100, 500, randomUUID())),
      ]);
      assert.ok(results.every((r) => r.used >= 0 && r.used <= 500));
      assert.ok((await f.fresh().get(KEY)) <= 500);
    } finally { await f.close(); }
  });
}

test('file: independent processes cannot reset or overbook the budget', async () => {
  const f = await fixtures.file();
  const moduleUrl = new URL('../server/gallery.mjs', import.meta.url).href;
  const code = `import {fileStore} from ${JSON.stringify(moduleUrl)}; import {randomUUID} from 'node:crypto'; const r=await fileStore(process.argv[1]).kv.reserve('ai:budget:v1',100,500,randomUUID()); process.stdout.write(JSON.stringify(r));`;
  const worker = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, f.dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (v) => { out += v; }); child.stderr.on('data', (v) => { err += v; });
    child.on('error', reject);
    child.on('exit', (status) => { if (status) reject(new Error(err)); else { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } } });
  });
  try {
    const results = await Promise.all(Array.from({ length: 12 }, worker));
    assert.equal(results.filter((r) => r.ok).length, 5);
    assert.equal(await f.fresh().get(KEY), 500);
  } finally { await f.close(); }
});

test('file: corrupt state and abandoned locks fail closed', async () => {
  const f = await fixtures.file();
  try {
    await writeFile(join(f.dir, 'kv.json'), '{broken');
    await assert.rejects(f.kv.reserve(KEY, 100, 500, randomUUID()));
    await writeFile(join(f.dir, 'kv.json'), '{}');
    await mkdir(join(f.dir, 'kv.lock'));
    await assert.rejects(f.kv.reserve(KEY, 100, 500, randomUUID()), /locked/);
    assert.equal(await readFile(join(f.dir, 'kv.json'), 'utf8'), '{}');
  } finally { await f.close(); }
});

test('redis: outage cannot admit a request or clear its reservation', async () => {
  const f = await fixtures.redis();
  try {
    const id = randomUUID();
    await f.kv.reserve(KEY, 400, 500, id);
    f.redis.setDown(true);
    await assert.rejects(f.kv.reserve(KEY, 100, 500, randomUUID()));
    await assert.rejects(f.kv.settle(KEY, id, 0));
    f.redis.setDown(false);
    assert.equal(await f.fresh().get(KEY), 400);
    const budgetCommands = f.redis.commands.filter(([cmd]) => cmd === 'EVAL');
    assert.ok(budgetCommands.length && budgetCommands.every((cmd) => cmd[2] === '2'));
  } finally { await f.close(); }
});

test('migration: adding Redis cannot silently reset a previously funded file store', async () => {
  const source = await fixtures.file(), target = await fixtures.redis();
  try {
    const id = randomUUID();
    await source.kv.reserve(KEY, 400, 1000, id);
    await source.kv.settle(KEY, id, 50);
    const from = fileStore(source.dir), to = redisStore(target.redis.url, target.redis.token);
    await assert.rejects(copyGallery(from, to), /Cannot automatically migrate a funded AI store/);
    assert.equal(await source.fresh().get(KEY), 50);
    assert.equal(await target.fresh().get(KEY), null);
    // An existing gallery in the target must not skip the budget migration guard either.
    await to.saveDoc('accounts', 'existing', { ver: 1, data: {} }, 1);
    await assert.rejects(copyGallery(from, to), /Cannot automatically migrate/);
  } finally { await source.close(); await target.close(); }
});
