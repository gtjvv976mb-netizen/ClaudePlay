import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../server/server.mjs';
import { fileStore, openGallery } from '../server/gallery.mjs';
import { memoryKv } from '../server/plans.mjs';
import { openBudget, reservationCost, BUDGET_KEY } from '../server/budget.mjs';

const H = globalThis.PPHarness;
const GAME = '<!doctype html><html><head><title>Game</title></head><body><canvas></canvas>' + 'x'.repeat(400) + '</body></html>';
const JPG = '/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(200);
const NEW = { kind: 'new', prompt: 'a platform game' };
const EDIT = { kind: 'edit', prompt: 'add a level', code: GAME };
const PT = { title: 'Game', request: 'x', shots: [JPG], log: {} };
const K1 = 'a'.repeat(40), K2 = 'b'.repeat(40), K3 = 'c'.repeat(40);
const priced = (model = 'claude-sonnet-5-5', max_tokens = 64000) => ({ model, max_tokens, service_tier: 'standard_only', inference_geo: 'global' });

function fakeClient(behavior = {}) {
  const calls = [];
  return { calls, client: { beta: { messages: { stream(params, options) {
    calls.push({ params, options });
    const answer = params.system[0].text === H.SCREEN_PROMPT ? '{"verdict":"allow"}' : params.system[0].text === H.PLAYTEST_PROMPT ? '{"verdict":"pass","problems":[]}' : GAME;
    return {
      async *[Symbol.asyncIterator]() {
        if (behavior.fail) throw new Error('upstream failure');
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: answer } };
        if (behavior.wait) await behavior.wait(options);
      },
      async finalMessage() { return { model: behavior.model || params.model, stop_reason: 'end_turn', usage: behavior.missingUsage ? {} : { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }; },
    };
  } } } } };
}

async function fixture(opts = {}, existing) {
  const dir = existing || await mkdtemp(join(tmpdir(), 'claudeplay-sponsored-'));
  const kv = opts.kv || fileStore(dir).kv;
  const fake = opts.fake || fakeClient();
  const server = createServer({ sponsored: true, kv, client: fake.client, gallery: await openGallery({}), trustProxy: true, ...opts });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    dir, kv, fake, server, base,
    request(path, body, key = K1, ip = '1.2.3.4', extra = {}) { return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(key ? { 'x-gp-key': key } : {}) }, body: JSON.stringify(body), ...extra }); },
    status(key = K1, ip = '1.2.3.4') { return fetch(base + '/api/status', { headers: { 'x-gp-key': key, 'x-forwarded-for': ip } }).then((r) => r.json()); },
    async close() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); if (!existing) await rm(dir, { recursive: true, force: true }); },
  };
}

test('pricing reservations reject unknown or unbounded pricing, and volatile funding', async () => {
  assert.equal(reservationCost(priced()), 4640000);
  assert.equal(reservationCost(priced('claude-haiku-5-5')), 1160000);
  for (const params of [priced('unknown'), priced('constructor'), priced('__proto__'), priced('toString'), { ...priced(), service_tier: 'auto' }, { ...priced(), inference_geo: 'us' }, { ...priced(), fallbacks: 'default' }, priced('claude-sonnet-5-5', 64001)]) assert.throws(() => reservationCost(params));
  await assert.rejects(openBudget({ kv: memoryKv() }).take(priced()));
  assert.throws(() => openBudget({ kv: memoryKv(), limitUsd: 401 }));
});

test('completed usage settles once, prices the whole Haiku input tier, and retains unclear reservations', async () => {
  const kv = Object.assign(memoryKv(), { persistent: true }), funding = openBudget({ kv });
  const params = priced('claude-haiku-5-5', 500);
  const a = await funding.take(params);
  await a.settle({ model: params.model, usage: { input_tokens: 90000, output_tokens: 100, cache_creation_input_tokens: 6000, cache_read_input_tokens: 5000 } });
  assert.equal(await kv.get(BUDGET_KEY), 53750);
  assert.equal(await a.settle({ model: params.model, usage: { input_tokens: 0, output_tokens: 0 } }), false);
  const b = await funding.take(params);
  await b.settle({ model: params.model, usage: { input_tokens: 100000, output_tokens: 100 } });
  assert.equal(await kv.get(BUDGET_KEY), 63800);
  const prior = await kv.get(BUDGET_KEY), c = await funding.take(params);
  assert.equal(await c.settle({ model: 'unknown', usage: { input_tokens: 1, output_tokens: 1 } }), false);
  assert.equal(await kv.get(BUDGET_KEY), prior + reservationCost(params));
  const d = await funding.take(params);
  assert.equal(await d.settle({ model: params.model, usage: { output_tokens: 1 } }), false);
});

test('all Claude endpoints reject exhausted funds before any model call or Pro payment', async () => {
  let paymentChecks = 0;
  const f = await fixture({ aiBudgetUsd: 0.01, chain: { site: { cluster: 'devnet', treasury: 'T' }, lookup() { paymentChecks++; } }, pro: { price: 100 } });
  try {
    for (const [path, body] of [['/api/build', NEW], ['/api/build', EDIT], ['/api/build', { ...EDIT, kind: 'fix', error: 'the start button is broken', tier: 'complex' }], ['/api/screen', { code: GAME }], ['/api/playtest', PT]]) {
      const r = await f.request(path, body); assert.equal(r.status, 429, path); assert.equal((await r.json()).code, 'budget_exhausted');
    }
    assert.equal((await f.request('/api/pro', { sig: 'x' })).status, 404);
    assert.equal(paymentChecks, 0); assert.equal(f.fake.calls.length, 0);
    const status = await f.status(); assert.equal(status.sponsored, true); assert.equal(status.plan, 'sponsored'); assert.equal(status.pro, null); assert.equal(status.budget.available, false); assert.equal(status.ai, false); assert.equal(status.left, 2);
  } finally { await f.close(); }
});

test('full creation and best edits are free, bucketed correctly, and do not retry or fall back', async () => {
  const f = await fixture({ daily: 2, dailyEdits: 2, dailyScreens: 2, dailyPlaytests: 2, pro: { price: 100 }, chain: { site: { cluster: 'devnet', treasury: 'T' } } });
  try {
    const first = await f.request('/api/build', NEW);
    const done = (await first.text()).trim().split('\n').map(JSON.parse).at(-1);
    assert.equal(done.plan, 'sponsored'); assert.equal(done.bucket, 'new');
    await (await f.request('/api/build', NEW)).text();
    assert.equal((await f.request('/api/build', NEW)).status, 429);
    assert.equal((await f.request('/api/build', NEW, K2)).status, 200, 'another household account has its own allowance');
    const edit = await f.request('/api/build', { ...EDIT, tier: 'complex' });
    const editDone = (await edit.text()).trim().split('\n').map(JSON.parse).at(-1);
    assert.equal(editDone.model, 'claude-sonnet-5-5'); assert.equal(editDone.bucket, 'edit'); assert.equal(editDone.left, 1);
    await (await f.request('/api/build', EDIT)).text();
    assert.equal((await f.request('/api/build', EDIT)).status, 429);
    for (const [path, body] of [['/api/screen', { code: GAME }], ['/api/playtest', PT]]) {
      assert.equal((await f.request(path, body)).status, 200); assert.equal((await f.request(path, body)).status, 200); assert.equal((await f.request(path, body)).status, 429);
    }
    assert.ok(f.fake.calls.every(({ params, options }) => options.maxRetries === 0 && params.service_tier === 'standard_only' && params.inference_geo === 'global' && !params.fallbacks && !params.betas));
    const status = await f.status(); assert.equal(status.left, 0); assert.equal(status.edits.left, 0); assert.equal(status.reviews.screen.left, 0); assert.equal(status.reviews.playtest.left, 0); assert.equal(status.pro, null); assert.ok(status.resetAt > Date.now()); assert.ok(status.budget.reservedUsd > 0 && status.budget.reservedUsd < 1);
  } finally { await f.close(); }
});

test('funding availability distinguishes Sonnet builds, Haiku edits, and each review', async () => {
  const f = await fixture({ aiBudgetUsd: 2 });
  try {
    const status = await f.status();
    assert.equal(status.ai, true); assert.equal(status.budget.available, true);
    assert.deepEqual(status.budget.actions, { new: false, edit: true, bestEdit: false, screen: true, playtest: true });
    assert.equal((await f.request('/api/build', NEW)).status, 429);
    assert.equal((await f.request('/api/build', { ...EDIT, tier: 'complex' })).status, 429);
    const fix = await f.request('/api/build', { ...EDIT, kind: 'fix', error: 'the start button is broken' });
    assert.equal(fix.status, 200); const done = (await fix.text()).trim().split('\n').map(JSON.parse).at(-1);
    assert.equal(done.bucket, 'edit'); assert.equal(done.model, 'claude-haiku-5-5'); assert.equal(f.fake.calls.length, 1);
  } finally { await f.close(); }
  const narrow = await fixture({ aiBudgetUsd: 1.0011 });
  try {
    assert.deepEqual((await narrow.status()).budget.actions, { new: false, edit: false, bestEdit: false, screen: true, playtest: false });
    assert.equal((await narrow.request('/api/playtest', PT)).status, 429);
    assert.equal((await narrow.request('/api/screen', { code: GAME })).status, 200);
    assert.equal(narrow.fake.calls.length, 1);
  } finally { await narrow.close(); }
});

test('builds and reviews share account and site concurrency gates', async () => {
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const f = await fixture({ maxActive: 1, fake: fakeClient({ wait: () => hold }) });
  try {
    const first = await f.request('/api/build', NEW);
    assert.equal(first.status, 200);
    for (const [path, body, key] of [['/api/screen', { code: GAME }, K1], ['/api/playtest', PT, K2]]) {
      const denied = await f.request(path, body, key); assert.equal(denied.status, 429);
      assert.equal((await denied.json()).code, 'rate_limited');
    }
    assert.equal(f.fake.calls.length, 1); release(); await first.text();
    assert.equal((await f.request('/api/playtest', PT, K2)).status, 200);
    assert.equal(f.fake.calls.length, 2);
  } finally { release(); await f.close(); }
});

test('account caps survive address changes and key rotation hits a separate network ceiling', async () => {
  const f = await fixture({ daily: 1, networkMultiplier: 2 });
  try {
    await (await f.request('/api/build', NEW)).text();
    assert.equal((await f.request('/api/build', NEW, K1, '2.3.4.5')).status, 429);
    await (await f.request('/api/build', NEW, K2)).text();
    const rotated = await f.request('/api/build', NEW, K3); assert.equal(rotated.status, 429); assert.equal((await rotated.json()).code, 'network_limit');
    assert.equal((await f.status(K3)).left, 0);
    await (await f.request('/api/build', NEW, null, '9.9.9.9')).text();
    assert.equal((await f.request('/api/build', NEW, null, '9.9.9.9')).status, 429);
  } finally { await f.close(); }
});

test('independent instances and restart cannot oversubscribe or reset the lifetime cap', async () => {
  const fake = fakeClient({ missingUsage: true });
  const a = await fixture({ aiBudgetUsd: 4.64, fake, daily: 50 });
  const b = await fixture({ aiBudgetUsd: 4.64, fake, daily: 50 }, a.dir);
  try {
    const results = await Promise.all([a.request('/api/build', NEW, K1, '1.1.1.1'), b.request('/api/build', NEW, K2, '2.2.2.2')]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]); await Promise.all(results.map((r) => r.text()));
    assert.equal(fake.calls.length, 1); assert.equal(await a.kv.get(BUDGET_KEY), 4640000);
    await b.close();
    const restarted = await fixture({ aiBudgetUsd: 4.64, daily: 50 }, a.dir);
    try { assert.equal((await restarted.request('/api/playtest', PT, K3, '3.3.3.3')).status, 429); assert.equal((await restarted.status()).budget.remainingUsd, 0); assert.equal(restarted.fake.calls.length, 0); } finally { await restarted.close(); }
  } finally { if (b.server.listening) await b.close(); await a.close(); }
});

test('failed calls keep their dollar reservation and count toward user limits', async () => {
  const f = await fixture({ fake: fakeClient({ fail: true }), daily: 1 });
  try {
    const r = await f.request('/api/build', NEW); assert.match(await r.text(), /"t":"error"/);
    assert.equal(await f.kv.get(BUDGET_KEY), 4640000); assert.equal((await f.status()).left, 0);
    assert.equal((await f.request('/api/build', NEW)).status, 429); assert.equal(f.fake.calls.length, 1);
  } finally { await f.close(); }
});

test('client cancellation retains reserved dollars without completing or retrying the call', async () => {
  let aborted;
  const stopped = new Promise((resolve) => { aborted = resolve; });
  const fake = fakeClient({ wait: ({ signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted(); reject(new Error('aborted')); }, { once: true })) });
  const f = await fixture({ fake, daily: 1 });
  try {
    const ctl = new AbortController(), r = await f.request('/api/build', NEW, K1, '1.2.3.4', { signal: ctl.signal });
    await r.body.getReader().read(); ctl.abort(); await stopped;
    assert.equal(await f.kv.get(BUDGET_KEY), 4640000); assert.equal((await f.status()).left, 0); assert.equal(fake.calls.length, 1);
  } finally { await f.close(); }
});

test('cancellation during durable admission starts no model call and retains its reservation', async () => {
  for (const [path, body, amount] of [['/api/build', NEW, 4640000], ['/api/screen', { code: GAME }, 1001000], ['/api/playtest', PT, 1001250]]) {
    let release, reserved;
    const hold = new Promise((resolve) => { release = resolve; });
    const admitted = new Promise((resolve) => { reserved = resolve; });
    const kv = Object.assign(memoryKv(), { persistent: true }), reserve = kv.reserve;
    kv.reserve = async (...args) => { const r = await reserve(...args); reserved(); await hold; return r; };
    const f = await fixture({ kv });
    try {
      const closed = new Promise((resolve) => f.server.once('request', (req, res) => res.once('close', resolve)));
      const ctl = new AbortController();
      const cancelled = assert.rejects(f.request(path, body, K1, '1.2.3.4', { signal: ctl.signal }), { name: 'AbortError' });
      await admitted; ctl.abort(); await cancelled; await closed; release(); await f.status();
      assert.equal(await kv.get(BUDGET_KEY), amount, path); assert.equal(f.fake.calls.length, 0, path);
      assert.equal((await f.request(path, body)).status, 200, 'the completed admission releases its concurrency slot');
    } finally { release(); await f.close(); }
  }
});

test('unknown pricing and store outages fail closed across every billable endpoint', async () => {
  for (const opts of [{ models: { freeNew: 'unknown', new: 'unknown', free: 'unknown' } }, { kv: Object.assign(memoryKv(), { persistent: true, reserve() { throw new Error('offline'); } }) }, { kv: Object.assign(memoryKv(), { persistent: true, get() { throw new Error('offline'); } }) }, { kv: memoryKv() }]) {
    const f = await fixture(opts);
    try {
      for (const [path, body] of [['/api/build', NEW], ['/api/screen', { code: GAME }], ['/api/playtest', PT]]) assert.equal((await f.request(path, body)).status, 503, path);
      assert.equal(f.fake.calls.length, 0);
      const status = await f.status(); if (opts.kv && opts.kv.get.toString().includes('offline')) assert.equal(status.allowancesUnavailable, true);
    } finally { await f.close(); }
  }
});

test('a failed settlement retains the reservation and never retries a refund', async () => {
  let attempts = 0;
  const kv = Object.assign(memoryKv(), { persistent: true, settle() { attempts++; throw new Error('offline'); } });
  const f = await fixture({ kv, aiBudgetUsd: 4.64 });
  try {
    const r = await f.request('/api/build', NEW); assert.equal(r.status, 200); await r.text();
    assert.equal(await kv.get(BUDGET_KEY), 4640000); assert.equal(attempts, 1);
    assert.equal((await f.request('/api/screen', { code: GAME })).status, 429); assert.equal(f.fake.calls.length, 1);
  } finally { await f.close(); }
});
