// Tests for server/server.mjs with a fake Anthropic client. Run `node build.mjs` first.
import { createServer, buildParams, pickModel } from '../server/server.mjs';
import { limiter, memoryKv, proId } from '../server/plans.mjs';
import { openGallery, uidOf, fileStore, redisStore, copyGallery } from '../server/gallery.mjs';
import { fakeRedis } from './fake_redis.mjs';
import { chainConfig, openChain } from '../server/chain.mjs';
import { fakeRpc } from './fake_rpc.mjs';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const H = globalThis.PPHarness;
const GAME = '<!doctype html><html><head><title>Block Miner</title></head><body><canvas></canvas>' + 'x'.repeat(400) + '</body></html>';

/* A stand-in for client.beta.messages.stream: replays GAME as text deltas. */
function fakeClient(behave = {}) {
  const calls = [];
  const client = { beta: { messages: { stream(params, options) {
    calls.push({ params, options });
    const chunks = behave.chunks || GAME.match(/.{1,50}/gs);
    return {
      async *[Symbol.asyncIterator]() {
        if (behave.throwBefore) throw behave.throwBefore;
        yield { type: 'message_start', message: {} };
        for (const c of chunks) {
          if (options.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
          if (behave.delay) await new Promise((r) => setTimeout(r, behave.delay));
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: c } };
        }
      },
      async finalMessage() { return { model: params.model, stop_reason: behave.stop || 'end_turn', usage: { output_tokens: 99 } }; },
    };
  } } } };
  return { client, calls };
}

async function start(opts) {
  const server = createServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  return { server, base };
}
async function readLines(res) {
  const text = await res.text();
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
const post = (base, body, headers) => fetch(base + '/api/build', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: typeof body === 'string' ? body : JSON.stringify(body) });

// --- pure helpers
const M = { free: 'F', new: 'N', edit: 'E' };
ok(pickModel({ kind: 'new' }, M, 'pro') === 'N', 'Pro: new games use the new-game model');
ok(pickModel({ kind: 'edit' }, M, 'pro') === 'E', 'Pro: changes use the edit model');
ok(pickModel({ kind: 'fix', tier: 'complex' }, M, 'pro') === 'N', 'Pro: the best tier uses the new-game model for edits');
ok(pickModel({ kind: 'new', tier: 'complex' }, M, 'free') === 'F', 'free builds all use the free model');
const pS = buildParams({ kind: 'new', prompt: 'Block Miner', style: 'Pixel art' }, 'claude-sonnet-5-5');
ok(pS.system[0].text === H.HARNESS && pS.system[0].cache_control, 'harness is a cached system prompt');
ok(pS.messages[0].content.includes('Block Miner') && pS.messages[0].content.includes('Art style: Pixel art'), 'idea and style go in the user turn');
ok(pS.fallbacks === 'default' && pS.betas[0] === 'server-side-fallback-2026-07-01', 'Sonnet 5.5 builds opt into refusal fallbacks');
const pH = buildParams({ kind: 'edit', prompt: 'faster', code: GAME }, 'claude-haiku-5-5');
ok(!pH.fallbacks && !pH.betas && pH.messages[0].content.includes(GAME), 'Haiku edits carry the game and no fallback');
ok(H.harnessPrompt('new', { prompt: 'p' }) === H.HARNESS + '\n\n' + H.harnessTask('new', { prompt: 'p' }), 'in-Claude prompt is harness + task');
ok(H.HARNESS.includes('seed phrase'), 'harness keeps crypto games make-believe');
ok(!H.checkRequest({ kind: 'drop' }).ok, 'unknown kind rejected');
ok(!H.checkRequest({ kind: 'new', prompt: '' }).ok, 'empty idea rejected');
ok(!H.checkRequest({ kind: 'new', prompt: 'x'.repeat(2001) }).ok, 'over-long idea rejected');
ok(!H.checkRequest({ kind: 'edit', prompt: 'faster', code: 'hello' }).ok, 'edit without a game rejected');
ok(H.checkRequest({ kind: 'new', prompt: 'hi', code: GAME }).req.code === '', 'new builds drop any code sent');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const withPic = H.checkRequest({ kind: 'new', prompt: 'my cat is the hero', pics: [{ name: 'cat', w: 1, h: 1, data: PNG }] });
ok(withPic.ok && withPic.req.pics.length === 1 && withPic.req.pics[0].data === PNG, 'a picture passes the request check');
ok(!H.checkRequest({ kind: 'new', prompt: 'x', pics: [{ name: 'Cat!', w: 1, h: 1, data: PNG }] }).ok, 'bad picture name rejected');
ok(!H.checkRequest({ kind: 'new', prompt: 'x', pics: [{ name: 'a', w: 1, h: 1 }, { name: 'a', w: 1, h: 1 }] }).ok, 'duplicate picture names rejected');
ok(!H.checkRequest({ kind: 'new', prompt: 'x', pics: [1, 2, 3, 4, 5].map((i) => ({ name: 'p' + i, w: 1, h: 1 })) }).ok, 'more than four pictures rejected');
ok(!H.checkRequest({ kind: 'new', prompt: 'x', pics: [{ name: 'a', w: 1, h: 1, data: '/9j/4AAQ' }] }).ok, 'non-PNG picture data rejected');
ok(!H.checkRequest({ kind: 'new', prompt: 'x', pics: [{ name: 'a', w: 999, h: 1, data: PNG }] }).ok, 'oversized picture rejected');
ok(!H.checkRequest({ kind: 'new', prompt: 'x', pics: [{ name: 'a', w: 1, h: 1, data: PNG.slice(0, 11) + 'A'.repeat(48000) }] }).ok, 'picture data over the size limit rejected');
const pPic = buildParams(withPic.req, 'claude-sonnet-5-5');
const parts = pPic.messages[0].content;
ok(Array.isArray(parts) && parts[1].type === 'image' && parts[1].source.media_type === 'image/png' && parts[1].source.data === PNG && /CREATOR'S PICTURES[\s\S]*'cat': 1x1 px/.test(parts[2].text), 'pictures go to Claude as images before the idea');
const doc = H.withPictures(GAME, [{ name: 'cat', w: 1, h: 1, data: PNG }]);
ok(doc.includes('window.SP_PICTURES={"cat":"data:image/png;base64,' + PNG + '"}') && H.stripPictures(doc) === GAME && H.withPictures(doc, []) === GAME, 'the pictures block goes into the game file and comes out again');
const L = limiter({ maxActive: 1 });
const s1 = await L.take('a', 2);
ok(s1.ok && !(await L.take('a', 2)).ok, 'one running build per visitor');
ok(!(await L.take('b', 2)).ok, 'global concurrency cap');
s1.release();
const s2 = await L.take('a', 2); s2.release();
const s3 = await L.take('a', 2);
ok(!s3.ok && s3.code === 'daily_limit', 'daily build limit');
await s2.refund(); await s2.refund();
ok((await L.used('a')) === 1, 'refund gives a build back, once');
const T = limiter({ maxActive: 5 });
const cap2 = { total: 2 };
(await T.take('x', 5, cap2)).release(); const ty = await T.take('y', 5, cap2); ty.release();
const t3 = await T.take('z', 5, cap2);
ok(!t3.ok && t3.code === 'daily_limit' && t3.message.includes('this site'), 'site-wide daily cap');
const tp = await T.take('p', 5); tp.release();
ok(tp.ok, 'Pro builds do not count toward the free site-wide cap');
const te = await T.take('z', 5, { bucket: 'edit', total: 2 }); te.release();
ok(te.ok && (await T.used('z', 'edit')) === 1 && (await T.used('z')) === 0, 'changes are counted apart from new games');
await ty.refund();
ok((await T.take('z', 5, cap2)).ok, 'refund frees a site-wide build');

// --- HTTP: without a key
{
  const { server, base } = await start({ client: null });
  const html = await (await fetch(base + '/')).text();
  ok(html.includes('<title>ClaudePlay</title>') && !html.includes('"ai":'), 'serves the site with the AI studio off when there is no key');
  const r = await post(base, { kind: 'new', prompt: 'x' });
  ok(r.status === 503, 'build returns 503 without a key');
  const st = await (await fetch(base + '/api/status')).json();
  ok(st.ai === false, 'status reports AI off');
  server.close();
}

// --- HTTP: with a fake client
{
  const { client, calls } = fakeClient();
  const { server, base } = await start({ client, daily: 2, trustProxy: true, models: { free: 'claude-sonnet-5-5' } });
  const viaProxy = await (await fetch(base + '/api/status', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })).json();
  ok(viaProxy.left === 2 && viaProxy.edits.left === 20, 'behind a proxy each visitor is counted by the first forwarded address');
  const html = await (await fetch(base + '/')).text();
  ok(html.includes('"ai":"api/build"'), 'index.html tells the page where to build');
  ok((await fetch(base + '/README.md')).status === 200, 'serves other site files');
  ok((await fetch(base + '/..%2fpackage.json')).status === 404 && (await fetch(base + '/%2e%2e/%2e%2e/package.json')).status === 404, 'blocks paths outside the site folder');
  ok((await fetch(base + '/nope.html')).status === 404, 'missing files are 404');

  const res = await post(base, { kind: 'new', prompt: 'Block Miner: stack blocks before gas runs out', style: 'Pixel art' });
  ok(res.status === 200 && res.headers.get('content-type').startsWith('application/x-ndjson'), 'build streams ndjson');
  const lines = await readLines(res);
  const text = lines.filter((l) => l.t === 'text').map((l) => l.d).join('');
  const done = lines.find((l) => l.t === 'done');
  ok(text === GAME, 'streamed text is the whole game');
  ok(done && done.truncated === false && done.model === 'claude-sonnet-5-5' && done.left === 1, 'done line reports model and builds left');
  ok(calls[0].params.model === 'claude-sonnet-5-5' && calls[0].params.messages[0].content.includes('Block Miner'), 'new build sent to the free model with the idea');

  const r2 = await post(base, { kind: 'edit', prompt: 'add a double jump', code: GAME });
  await readLines(r2);
  ok(calls[1].params.model === 'claude-sonnet-5-5', 'the free model is used for every free build (GP_MODEL_FREE)');

  const bad = await post(base, { kind: 'edit', prompt: 'x' });
  ok(bad.status === 400 && (await bad.json()).code === 'bad_request', 'invalid build request is 400');
  const notJson = await post(base, '{nope');
  ok(notJson.status === 400, 'non-JSON body is 400');
  const huge = await post(base, { kind: 'edit', prompt: 'x', code: '<html>' + 'y'.repeat(600000) });
  ok(huge.status === 413, 'oversized body is 413');

  const r3 = await post(base, { kind: 'new', prompt: 'third' }); await readLines(r3);
  const r4 = await post(base, { kind: 'new', prompt: 'fourth' });
  const j4 = await r4.json();
  ok(r4.status === 429 && j4.code === 'daily_limit', 'third new game of the day is refused (changes count apart): ' + j4.message);
  const st = await (await fetch(base + '/api/status')).json();
  ok(st.ai === true && st.left === 0 && st.plan === 'free' && st.pro === null && st.models.new === 'claude-sonnet-5-5', 'status reports AI on, the free plan and builds left');
  server.close();
}

// --- refusals, upstream errors and cancelling
{
  const refuse = fakeClient({ stop: 'refusal', chunks: [] });
  let { server, base } = await start({ client: refuse.client, daily: 1 });
  let lines = await readLines(await post(base, { kind: 'new', prompt: 'something' }));
  ok(lines.some((l) => l.t === 'error' && l.code === 'refused'), 'refusal becomes a refused error');
  lines = await readLines(await post(base, { kind: 'new', prompt: 'again' }));
  ok(lines.some((l) => l.code === 'refused'), 'a refused build does not use up the daily allowance');
  server.close();

  const busy = fakeClient({ throwBefore: Object.assign(new Error('overloaded'), { status: 429 }) });
  ({ server, base } = await start({ client: busy.client }));
  lines = await readLines(await post(base, { kind: 'new', prompt: 'x' }));
  ok(lines.some((l) => l.t === 'error' && l.code === 'rate_limited'), 'upstream 429 becomes rate_limited');
  server.close();

  const slow = fakeClient({ delay: 30, chunks: Array(40).fill('abc') });
  ({ server, base } = await start({ client: slow.client }));
  const ctl = new AbortController();
  const r = await post(base, { kind: 'new', prompt: 'slow' }, {});
  const reader = r.body.getReader();
  await reader.read();
  await reader.cancel();
  ctl.abort();
  await new Promise((res) => setTimeout(res, 200));
  ok(slow.calls[0].options.signal.aborted, 'closing the page cancels the Claude request');
  const st = await (await fetch(base + '/api/status')).json();
  ok(st.left === 2, 'a cancelled build is not counted');
  server.close();
}

// --- shared gallery, on a folder and on (fake) Upstash Redis
const redis = await fakeRedis();
const okAll = ok;
for (const kind of ['folder', 'redis']) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-gallery-'));
  const mkStore = () => (kind === 'folder' ? fileStore(dir) : redisStore(redis.url, redis.token));
  const ok = (c, m) => okAll(c, kind + ': ' + m);
  const ADMIN = 'admin_' + 'k'.repeat(40), A = 'a'.repeat(48), B = 'b'.repeat(48);
  let gallery = await openGallery({ store: mkStore(), adminKey: ADMIN });
  let { server, base } = await start({ client: null, gallery });
  const html = await (await fetch(base + '/')).text();
  ok(html.includes('"gallery":"api/db"') && !html.includes('"ai":'), 'index.html points at the shared gallery even without an AI key');
  const db = (method, path, body, key) => fetch(base + '/api/db/' + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, key ? { 'x-gp-key': key } : {}), body: body ? JSON.stringify(body) : undefined });
  ok((await db('GET', 'me')).status === 401, 'gallery needs a key');
  const meA = await (await db('GET', 'me', null, A)).json();
  ok(meA.uid === uidOf(A) && meA.isOwner === false, 'uid comes from the key');
  ok((await (await db('GET', 'me', null, ADMIN)).json()).isOwner === true, 'admin key is the owner');
  const doc = { v: 1, txs: [{ t: 'airdrop' }], plays: {} };
  ok((await db('PUT', 'accounts/' + meA.uid, doc, A)).status === 200, 'visitor saves their own account');
  ok((await db('PUT', 'accounts/' + meA.uid, { v: 1, txs: [] }, B)).status === 403, "another visitor can't overwrite it");
  const code = '<!doctype html><html><body>game</body></html>';
  const hash = createHash('sha256').update(code).digest('hex');
  ok((await db('PUT', 'blobs/' + hash, { code: code + 'x' }, A)).status === 400, 'game file must match its fingerprint');
  ok((await db('PUT', 'blobs/' + hash, { code, ts: 1 }, A)).status === 200, 'game file stored under its fingerprint');
  ok((await db('PUT', 'protocol/e1', { n: 1 }, A)).status === 403, "visitors can't settle epochs");
  ok((await db('PUT', 'protocol/e1', { n: 1 }, ADMIN)).status === 200, 'owner can settle epochs');
  ok((await db('PUT', 'protocol/../x', { n: 1 }, ADMIN)).status === 404, 'unknown documents rejected');
  const s1 = await (await db('GET', 'snapshot')).json();
  ok(s1.accounts[meA.uid].txs.length === 1 && s1.protocol.e1.n === 1, 'snapshot returns every document');
  const s2 = await (await db('GET', 'snapshot?since=' + s1.ver)).json();
  ok(!Object.keys(s2.accounts).length && !Object.keys(s2.protocol).length, 'snapshot since the last version is empty');
  await gallery.flush(); server.close();

  gallery = await openGallery({ store: mkStore(), adminKey: ADMIN });
  ({ server, base } = await start({ client: null, gallery }));
  const s3 = await (await db('GET', 'snapshot')).json();
  ok(s3.accounts[meA.uid] && s3.protocol.e1, 'gallery survives a restart');
  ok(s3.ver >= s1.ver, 'version keeps counting up after a restart');
  const s4 = await (await db('GET', 'snapshot?since=' + (s3.ver + 50))).json();
  ok(s4.accounts[meA.uid], 'a page ahead of the server after a restart gets everything again');
  const blob = await (await db('GET', 'blobs/' + hash)).json();
  ok(blob.code === code, 'game files survive a restart');
  ok((await db('GET', 'blobs/' + 'f'.repeat(64))).status === 404, 'missing game file is 404');
  if (kind === 'redis') {
    redis.setDown(true);
    const r = await db('PUT', 'accounts/' + meA.uid, { v: 2, txs: [] }, A);
    ok(r.status === 503, 'a save the database refuses is reported, not acknowledged');
    redis.setDown(false);
    const s5 = await (await db('GET', 'snapshot')).json();
    ok(s5.accounts[meA.uid].txs.length === 1, 'the refused save did not change the gallery');
  }
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
{
  // Moving a disk gallery to Redis copies everything once, then never again.
  const dir = mkdtempSync(join(tmpdir(), 'gp-move-'));
  const A = 'a'.repeat(48);
  const g = await openGallery({ store: fileStore(dir) });
  const code = '<!doctype html><p>moved</p>';
  const hash = createHash('sha256').update(code).digest('hex');
  await g.put('accounts/' + uidOf(A), { v: 1, txs: [1, 2] }, A, 'x');
  await g.put('blobs/' + hash, { code }, A, 'x');
  await g.flush();
  const fresh = await fakeRedis();
  const moved = await copyGallery(fileStore(dir), redisStore(fresh.url, fresh.token));
  okAll(moved && moved.docs === 1 && moved.blobs === 1, 'a disk gallery moves to Redis: ' + JSON.stringify(moved));
  const r = await openGallery({ store: redisStore(fresh.url, fresh.token) });
  okAll(r.snapshot(0).body.accounts[uidOf(A)].txs.length === 2 && (await r.getBlob(hash)).body.code === code, 'moved games and accounts are all there');
  okAll((await copyGallery(fileStore(dir), redisStore(fresh.url, fresh.token))) === null, 'it never copies over a gallery that already has data');
  fresh.close(); rmSync(dir, { recursive: true, force: true });
}
redis.close();
{
  const A = 'a'.repeat(48), B = 'b'.repeat(48);
  const small = await openGallery({ limits: { newPerDay: 1 } });
  const r1 = await small.put('accounts/' + uidOf(A), { v: 1 }, A, '1.2.3.4');
  const r2 = await small.put('accounts/' + uidOf(B), { v: 1 }, B, '1.2.3.4');
  ok(r1.status === 200 && r2.status === 429, 'new accounts per address are limited');
}

// ---- Free and Pro plans ----
{
  const C = globalThis.PPCore, SOL = globalThis.PPSolana;
  const T = C.b58enc(C.randBytes(32));
  const fake = fakeRpc();
  const chain = openChain({ cluster: 'devnet', treasury: T, rpc: fake.rpc });
  const { client, calls } = fakeClient();
  const kv = memoryKv();
  const A = 'a'.repeat(48), B = 'b'.repeat(48);
  let { server, base } = await start({ client, chain, kv, daily: 1, pro: { price: 1e8, days: 30, daily: 2 } });
  const status = async (key) => (await fetch(base + '/api/status', { headers: key ? { 'x-gp-key': key } : {} })).json();
  const claim = async (key, sig) => fetch(base + '/api/pro', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gp-key': key }, body: JSON.stringify({ sig }) });
  ok((await (await fetch(base + '/')).text()).includes('"pro":true'), 'the page is told Pro is offered');
  let st = await status(A);
  ok(st.plan === 'free' && st.daily === 1 && st.pro.price === 1e8 && st.pro.treasury === T && st.pro.memo === 'gameplay:' + proId(uidOf(A)), 'status offers Pro with this account’s memo');
  let lines = await readLines(await post(base, { kind: 'new', prompt: 'free one' }, { 'x-gp-key': A }));
  ok(calls[0].params.model === 'claude-sonnet-5-5' && lines.find((l) => l.t === 'done').plan === 'free', 'free new games use Sonnet 5.5');
  await readLines(await post(base, { kind: 'edit', prompt: 'free edit', code: GAME }, { 'x-gp-key': A }));
  ok(calls[1].params.model === 'claude-haiku-5-5', 'free changes use Haiku 5.5');
  const best = await post(base, { kind: 'new', prompt: 'best', tier: 'complex' }, { 'x-gp-key': B });
  ok(best.status === 402 && (await best.json()).code === 'pro_required', 'best builds need Pro when Pro is offered');
  const over = await post(base, { kind: 'new', prompt: 'second' }, { 'x-gp-key': A });
  ok(over.status === 429 && /get Pro/.test((await over.json()).message), 'the free limit points at Pro');

  // Pay for Pro on the fake devnet.
  const k = await C.ed.generate(); const payer = await C.ed.signer(k.secret64);
  fake.balances.set(payer.pk, 1e9); fake.balances.set(T, 1e9);
  const pay = async (memo, lamports, to = T) => {
    const { blockhash } = await (await fetch(base + '/api/chain/blockhash')).json();
    const msg = SOL.buildPayment({ payer: payer.pk, transfers: [{ to, lamports }], memo, blockhash });
    const tx = Buffer.from(SOL.serializeTx(msg, await payer.sign(msg))).toString('base64');
    return (await (await fetch(base + '/api/chain/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx }) })).json()).signature;
  };
  const shortSig = await pay(st.pro.memo, 5e7);
  ok((await claim(A, shortSig)).status === 400, 'a payment short of the price does not unlock Pro');
  const otherSig = await pay('gameplay:' + proId(uidOf(B)), 1e8);
  ok((await claim(A, otherSig)).status === 400, 'a payment for another account does not unlock Pro for this one');
  ok((await claim(A, C.b58enc(C.randBytes(64)))).status === 409, 'an unknown payment is reported as not confirmed yet');
  const sig = await pay(st.pro.memo, 1e8);
  const c1 = await claim(A, sig); const j1 = await c1.json();
  ok(c1.status === 200 && j1.until > Date.now() + 29 * 86400000, 'a full payment unlocks Pro for 30 days');
  const c2 = await (await claim(A, sig)).json();
  ok(c2.until === j1.until && c2.repeated, 'claiming the same payment again changes nothing');
  st = await status(A);
  ok(st.plan === 'pro' && st.daily === 2 && st.left === 2 && st.until === j1.until, 'status shows the Pro pass and its own daily allowance');
  lines = await readLines(await post(base, { kind: 'new', prompt: 'pro one', tier: 'complex' }, { 'x-gp-key': A }));
  ok(calls[calls.length - 1].params.model === 'claude-sonnet-5-5' && lines.find((l) => l.t === 'done').plan === 'pro', 'Pro builds use Sonnet 5.5, past the free limit');
  await readLines(await post(base, { kind: 'edit', prompt: 'pro edit', code: GAME }, { 'x-gp-key': A }));
  ok(calls[calls.length - 1].params.model === 'claude-haiku-5-5', 'Pro changes use the edit model');
  await readLines(await post(base, { kind: 'new', prompt: 'pro two' }, { 'x-gp-key': A }));
  ok((await post(base, { kind: 'new', prompt: 'pro three' }, { 'x-gp-key': A })).status === 429, 'Pro has its own daily limit');
  const sig2 = await pay(st.pro.memo, 1e8 + 1);
  const j3 = await (await claim(A, sig2)).json();
  ok(Math.abs(j3.until - j1.until - 30 * 86400000) < 5000, 'a second payment adds 30 more days');
  server.close();

  // Counts and passes survive a restart when kept in a store.
  ({ server, base } = await start({ client, chain, kv, daily: 1, pro: { price: 1e8 } }));
  ok((await status(A)).plan === 'pro' && (await status(B)).left === 0, 'passes and daily counts survive a restart (free builds count per address)');
  server.close();
  ({ server, base } = await start({ client, chain: null, kv, daily: 1 }));
  st = await status(A);
  ok(st.plan === 'free' && st.pro === null && (await claim(A, sig)).status === 404, 'without Solana payments there is no Pro');
  server.close();

  // A store outage refuses builds clearly but keeps the health check up.
  const down = { incr: async () => { throw new Error('down'); }, get: async () => { throw new Error('down'); }, set: async () => {}, once: async () => true };
  ({ server, base } = await start({ client, kv: down }));
  const hs = await fetch(base + '/api/status');
  const bd = await post(base, { kind: 'new', prompt: 'x' });
  ok(hs.status === 200 && bd.status === 503 && (await bd.json()).code === 'unavailable', 'a store outage refuses builds but keeps /api/status up');
  server.close();

  // The same counters on a folder and on Redis.
  const dir = mkdtempSync(join(tmpdir(), 'gp-kv-'));
  const r2 = await fakeRedis();
  for (const [name, make] of [['folder', () => fileStore(dir).kv], ['redis', () => redisStore(r2.url, r2.token).kv]]) {
    const one = make();
    await one.incr('n', 1, 60); await one.incr('n', 1, 60); await one.set('pro:x', { until: 5 });
    ok(await one.once('sig:1') && !(await one.once('sig:1')), name + ': a payment is used once');
    if (one.flush) await one.flush();
    const two = make();
    ok((await two.get('n')) === 2 && (await two.get('pro:x')).until === 5 && !(await two.once('sig:1')), name + ': counts, passes and used payments are kept');
  }
  r2.close(); rmSync(dir, { recursive: true, force: true });
}

// ---- Solana network: settings, the RPC proxy and its payment filter ----
{
  const C = globalThis.PPCore, SOL = globalThis.PPSolana;
  const T = C.b58enc(C.randBytes(32));
  ok(chainConfig({}) === null, 'no cluster: simulated ledger');
  const thrown = (env) => { try { chainConfig(env); return null; } catch (e) { return e.message; } };
  ok(/devnet, testnet or mainnet-beta/.test(thrown({ GP_SOLANA_CLUSTER: 'localnet', GP_TREASURY: T })), 'unknown cluster refused');
  ok(/GP_TREASURY/.test(thrown({ GP_SOLANA_CLUSTER: 'devnet', GP_TREASURY: 'not-an-address' })), 'treasury must be an address');
  ok(/GP_TREASURY/.test(thrown({ GP_SOLANA_CLUSTER: 'devnet', GP_TREASURY: C.b58enc(C.randBytes(64)) })), 'a secret key is not accepted as the treasury');
  ok(/real money/.test(thrown({ GP_SOLANA_CLUSTER: 'mainnet-beta', GP_TREASURY: T })), 'mainnet refused without GP_ALLOW_MAINNET=yes');
  let warned = ''; ok(chainConfig({ GP_SOLANA_CLUSTER: 'devnet' }, (m) => { warned = m; }) === null && /GP_TREASURY/.test(warned), 'devnet with no treasury yet starts on the simulated ledger');
  ok(/GP_TREASURY/.test(thrown({ GP_SOLANA_CLUSTER: 'mainnet-beta', GP_ALLOW_MAINNET: 'yes' })), 'mainnet never starts without a treasury');
  ok(/GP_SOLANA_RPC/.test(thrown({ GP_SOLANA_CLUSTER: 'mainnet-beta', GP_TREASURY: T, GP_ALLOW_MAINNET: 'yes' })), 'mainnet needs its own RPC endpoint');
  ok(chainConfig({ GP_SOLANA_CLUSTER: 'mainnet-beta', GP_TREASURY: T, GP_ALLOW_MAINNET: 'yes', GP_SOLANA_RPC: 'https://rpc.example' }).rpcUrl === 'https://rpc.example', 'mainnet starts only when explicitly allowed');
  ok(chainConfig({ GP_SOLANA_CLUSTER: 'devnet', GP_TREASURY: T }).rpcUrl === 'https://api.devnet.solana.com', 'devnet uses the public RPC by default');

  const fake = fakeRpc();
  const chain = openChain({ cluster: 'devnet', treasury: T, rpc: fake.rpc });
  const { server, base } = await start({ client: null, chain, root: new URL('../dist/site', import.meta.url).pathname });
  const api = (m, path, body) => fetch(base + '/api/chain/' + path, body ? { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { method: m });
  const page = await (await fetch(base + '/')).text();
  ok(page.includes('"chain":{"api":"api/chain","cluster":"devnet","treasury":"' + T + '"}'), 'page is told the network and treasury');
  ok((await (await fetch(base + '/api/status')).json()).chain === 'devnet', 'status reports the network');
  const k = await C.ed.generate(); const payer = await C.ed.signer(k.secret64);
  const creator = C.b58enc(C.randBytes(32));
  const drop = await api('POST', 'airdrop', { to: payer.pk });
  ok(drop.status === 200 && fake.balances.get(payer.pk) === 1e9, 'faucet drops devnet SOL');
  await api('POST', 'airdrop', { to: payer.pk });
  ok((await api('POST', 'airdrop', { to: payer.pk })).status === 429, 'faucet is limited to two drops a day');
  ok((await (await api('GET', 'balance/' + payer.pk)).json()).lamports === 2e9, 'balance');
  const { blockhash } = await (await api('GET', 'blockhash')).json();
  const id = C.randHex(8);
  const msg = SOL.buildPayment({ payer: payer.pk, transfers: [{ to: creator, lamports: 1e9 }, { to: T, lamports: 1e6 }], memo: 'gameplay:' + id, blockhash });
  const tx = SOL.serializeTx(msg, await payer.sign(msg));
  const sent = await (await api('POST', 'send', { tx: Buffer.from(tx).toString('base64') })).json();
  ok(sent.signature && fake.balances.get(creator) === 1e9, 'a GamePlay payment is relayed');
  const st = await (await api('GET', 'status/' + sent.signature)).json();
  ok(st.status === 'finalized' && !st.err, 'payment status');
  const look = await (await api('POST', 'txs', { sigs: [sent.signature, C.b58enc(C.randBytes(64)), 'junk'] })).json();
  const got = look.txs[sent.signature];
  ok(got && got.ok && got.signer === payer.pk && got.memos[0] === 'gameplay:' + id && got.transfers.length === 2 && Object.keys(look.txs).length === 2, 'payments are read back for every page to check');
  const before = fake.calls.filter((c) => c === 'getTransaction').length;
  await api('POST', 'txs', { sigs: [sent.signature] });
  ok(fake.calls.filter((c) => c === 'getTransaction').length === before, 'finalized payments are cached');
  const noMemo = SOL.buildPayment({ payer: payer.pk, transfers: [{ to: creator, lamports: 5 }], blockhash });
  const r1 = await api('POST', 'send', { tx: Buffer.from(SOL.serializeTx(noMemo, await payer.sign(noMemo))).toString('base64') });
  ok(r1.status === 400, 'payments without a GamePlay memo are not relayed');
  ok((await api('POST', 'send', { tx: 'AAAA' })).status === 400, 'junk transactions are not relayed');
  const small = SOL.buildPayment({ payer: payer.pk, transfers: [{ to: C.b58enc(C.randBytes(32)), lamports: 5 }], memo: 'gameplay:' + C.randHex(8), blockhash });
  const r2 = await api('POST', 'send', { tx: Buffer.from(SOL.serializeTx(small, await payer.sign(small))).toString('base64') });
  ok(r2.status === 502 && /rent/.test((await r2.json()).message), 'Solana errors come back readable');
  ok((await api('GET', 'balance/xyz')).status === 400 && (await api('GET', 'nope')).status === 404, 'bad chain requests are refused');
  server.close();
  const main = openChain({ cluster: 'mainnet-beta', treasury: T, rpc: fake.rpc });
  ok((await main.handle('POST', 'airdrop', { to: payer.pk }, 'x')).status === 404, 'no faucet on mainnet');
  const plain = await start({ client: null });
  ok((await fetch(plain.base + '/api/chain/blockhash')).status === 404, 'chain API is off without a cluster');
  plain.server.close();
}

// Multiplayer rooms: open, join over Server-Sent Events, relay, leave, host hand-over, limits.
{
  const { openRooms, cleanName } = await import('../server/rooms.mjs');
  ok(cleanName('<scr' + 'ipt>Ken!') === 'scriptKen' && cleanName('') === 'Player', 'room names are cleaned');
  const { server, base } = await start({ gallery: await openGallery({}), rooms: openRooms({ perSecond: 5 }) });
  const st = await (await fetch(base + '/api/status')).json();
  ok(st.gallery, 'server with a gallery');
  const made = await (await fetch(base + '/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gid: 'g123' }) })).json();
  ok(/^[A-HJ-NP-Z2-9]{6}$/.test(made.code) && Number.isInteger(made.seed), 'a room opens with a code and a seed: ' + made.code);
  // A tiny SSE reader: collects events from a stream until closed.
  function listen(url) {
    const ctl = new AbortController(), events = [];
    const ready = fetch(url, { signal: ctl.signal }).then(async (res) => {
      if (res.status !== 200) { events.push({ status: res.status, body: await res.json() }); return; }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      try { for (;;) { const c = await reader.read(); if (c.done) break; buf += dec.decode(c.value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const line = chunk.split('\n').find((l) => l.startsWith('data: ')); if (line) events.push(JSON.parse(line.slice(6))); } } } catch (e) { /* aborted */ }
    }).catch(() => {});
    return { events, close: () => ctl.abort(), ready };
  }
  const wait = async (fn, ms = 2000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 20)); return fn(); };
  const A = listen(base + '/api/rooms/' + made.code + '/events?gid=g123&name=Ann');
  await wait(() => A.events.length);
  const ha = A.events[0];
  ok(ha.t === 'hello' && ha.host === ha.you && ha.seed === made.seed && ha.players.length === 1 && ha.players[0].name === 'Ann', 'the first player gets a hello and is the host');
  const B = listen(base + '/api/rooms/' + made.code + '/events?gid=g123&name=Bo');
  await wait(() => B.events.length && A.events.length > 1);
  const hb = B.events[0];
  ok(hb.t === 'hello' && hb.host === ha.you && hb.players.length === 2, 'the second player sees both players');
  ok(A.events[1].t === 'join' && A.events[1].id === hb.you && A.events[1].name === 'Bo', 'the host hears the join');
  const wrongGame = listen(base + '/api/rooms/' + made.code + '/events?gid=other&name=X');
  await wait(() => wrongGame.events.length);
  ok(wrongGame.events[0].status === 404, 'a room only opens for its own game');
  const sendR = (body) => fetch(base + '/api/rooms/' + made.code + '/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  ok((await sendR({ id: ha.you, token: 'nope', msgs: [{ d: 1 }] })).status === 403, 'sending needs the player token');
  ok((await sendR({ id: ha.you, token: ha.token, msgs: [{ d: { x: 5 } }, { d: 'to bo', to: hb.you }] })).status === 204, 'a player sends messages');
  await wait(() => B.events.length >= 3);
  ok(B.events[1].t === 'msg' && B.events[1].from === ha.you && B.events[1].d.x === 5 && B.events[2].d === 'to bo', 'messages reach the other player');
  ok(!A.events.some((e) => e.t === 'msg'), 'senders do not hear their own messages');
  ok((await sendR({ id: ha.you, token: ha.token, msgs: [{ d: 'x'.repeat(3000) }] })).status === 413, 'over-large messages are refused');
  ok((await sendR({ id: ha.you, token: ha.token, msgs: Array.from({ length: 30 }, () => ({ d: 1 })) })).status === 429, 'players are rate limited');
  A.close();
  await wait(() => B.events.some((e) => e.t === 'host'));
  ok(B.events.some((e) => e.t === 'leave' && e.id === ha.you) && B.events.some((e) => e.t === 'host' && e.id === hb.you), 'when the host leaves, the others hear it and the next player hosts');
  const bad = await fetch(base + '/api/rooms/abc/events');
  ok(bad.status === 404, 'malformed room codes are refused');
  B.close(); wrongGame.close();
  server.close();
  const solo = await start({});
  ok((await fetch(solo.base + '/api/rooms', { method: 'POST', body: '{}' })).status === 404, 'no rooms without a shared gallery');
  solo.server.close();
}

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
