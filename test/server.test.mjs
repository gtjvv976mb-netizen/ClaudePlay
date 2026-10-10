// Tests for server/server.mjs with a fake Anthropic client. Run `node build.mjs` first.
import { createServer, buildParams, pickModel, limiter } from '../server/server.mjs';

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

console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
