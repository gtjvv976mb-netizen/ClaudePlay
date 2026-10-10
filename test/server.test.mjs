// Tests for server/server.mjs with a fake Anthropic client. Run `node build.mjs` first.
import { createServer, buildParams, pickModel, limiter } from '../server/server.mjs';
import { openGallery, uidOf } from '../server/gallery.mjs';
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
ok(pickModel({ kind: 'new' }, { new: 'N', edit: 'E' }) === 'N', 'new games use the new-game model');
ok(pickModel({ kind: 'edit' }, { new: 'N', edit: 'E' }) === 'E', 'changes use the edit model');
ok(pickModel({ kind: 'fix', tier: 'complex' }, { new: 'N', edit: 'E' }) === 'N', 'the complex tier uses the new-game model for edits');
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
const L = limiter({ daily: 2, maxActive: 1 });
const s1 = L.take('a');
ok(s1.ok && !L.take('a').ok, 'one running build per visitor');
ok(!L.take('b').ok, 'global concurrency cap');
s1.release();
const s2 = L.take('a'); s2.release();
const s3 = L.take('a');
ok(!s3.ok && s3.code === 'daily_limit', 'daily build limit');
L.refund('a');
ok(L.left('a') === 1, 'refund gives a build back');
const T = limiter({ daily: 5, maxActive: 5, total: 2 });
T.take('x').release(); T.take('y').release();
const t3 = T.take('z');
ok(!t3.ok && t3.code === 'daily_limit' && t3.message.includes('this site'), 'site-wide daily cap');
T.refund('y');
ok(T.take('z').ok, 'refund frees a site-wide build');

// --- HTTP: without a key
{
  const { server, base } = await start({ client: null });
  const html = await (await fetch(base + '/')).text();
  ok(html.includes('<title>GamePlay</title>') && !html.includes('"ai":'), 'serves the site with the AI studio off when there is no key');
  const r = await post(base, { kind: 'new', prompt: 'x' });
  ok(r.status === 503, 'build returns 503 without a key');
  const st = await (await fetch(base + '/api/status')).json();
  ok(st.ai === false, 'status reports AI off');
  server.close();
}

// --- HTTP: with a fake client
{
  const { client, calls } = fakeClient();
  const { server, base } = await start({ client, daily: 3, trustProxy: true });
  const viaProxy = await (await fetch(base + '/api/status', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })).json();
  ok(viaProxy.left === 3, 'behind a proxy each visitor is counted by the first forwarded address');
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
  ok(done && done.truncated === false && done.model === 'claude-sonnet-5-5' && done.left === 2, 'done line reports model and builds left');
  ok(calls[0].params.model === 'claude-sonnet-5-5' && calls[0].params.messages[0].content.includes('Block Miner'), 'new build sent to Sonnet 5.5 with the idea');

  const r2 = await post(base, { kind: 'edit', prompt: 'add a double jump', code: GAME });
  await readLines(r2);
  ok(calls[1].params.model === 'claude-haiku-5-5', 'edit sent to Haiku 5.5');

  const bad = await post(base, { kind: 'edit', prompt: 'x' });
  ok(bad.status === 400 && (await bad.json()).code === 'bad_request', 'invalid build request is 400');
  const notJson = await post(base, '{nope');
  ok(notJson.status === 400, 'non-JSON body is 400');
  const huge = await post(base, { kind: 'edit', prompt: 'x', code: '<html>' + 'y'.repeat(120000) });
  ok(huge.status === 413, 'oversized body is 413');

  const r3 = await post(base, { kind: 'new', prompt: 'third' }); await readLines(r3);
  const r4 = await post(base, { kind: 'new', prompt: 'fourth' });
  const j4 = await r4.json();
  ok(r4.status === 429 && j4.code === 'daily_limit', 'fourth build of the day is refused: ' + j4.message);
  const st = await (await fetch(base + '/api/status')).json();
  ok(st.ai === true && st.left === 0 && st.models.new === 'claude-sonnet-5-5', 'status reports AI on and builds left');
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
  ok(st.left === 12, 'a cancelled build is not counted');
  server.close();
}

// --- shared gallery
{
  const dir = mkdtempSync(join(tmpdir(), 'gp-gallery-'));
  const ADMIN = 'admin_' + 'k'.repeat(40), A = 'a'.repeat(48), B = 'b'.repeat(48);
  let gallery = await openGallery({ dir, adminKey: ADMIN });
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

  gallery = await openGallery({ dir, adminKey: ADMIN });
  ({ server, base } = await start({ client: null, gallery }));
  const s3 = await (await db('GET', 'snapshot')).json();
  ok(s3.accounts[meA.uid] && s3.protocol.e1, 'gallery survives a restart');
  const blob = await (await db('GET', 'blobs/' + hash)).json();
  ok(blob.code === code, 'game files survive a restart');
  ok((await db('GET', 'blobs/' + 'f'.repeat(64))).status === 404, 'missing game file is 404');
  server.close();
  rmSync(dir, { recursive: true, force: true });

  const small = await openGallery({ limits: { newPerDay: 1 } });
  const r1 = await small.put('accounts/' + uidOf(A), { v: 1 }, A, '1.2.3.4');
  const r2 = await small.put('accounts/' + uidOf(B), { v: 1 }, B, '1.2.3.4');
  ok(r1.status === 200 && r2.status === 429, 'new accounts per address are limited');
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

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
