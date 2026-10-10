// GamePlay server: serves the website in dist/site and runs AI builds on your own Claude API key,
// so anyone visiting the site can describe a game in plain words and play it.
//
//   ANTHROPIC_API_KEY=... node server/server.mjs      # then open http://localhost:8787
//
// The key never reaches the browser. The page asks POST /api/build with the creator's idea, the
// server wraps it in the shared harness (src/harness.js) and streams the game file back as
// newline-delimited JSON. Without a key the site still works, with the AI studio switched off.
//
// Settings (environment variables):
//   PORT                 port to listen on (8787)
//   GP_ROOT              folder to serve (dist/site)
//   GP_MODEL_FREE        model for every build on the free plan (claude-haiku-5-5)
//   GP_MODEL_NEW         Pro: model for new games and "best" builds (claude-sonnet-5-5)
//   GP_MODEL_EDIT        Pro: model for changes and bug fixes (claude-haiku-5-5)
//   GP_DAILY_BUILDS      free AI builds per visitor per day (3)
//   GP_DAILY_TOTAL       free AI builds per day across the whole site, to cap spend (0 = no cap)
//   GP_PRO_PRICE_SOL     price of a Pro pass in SOL, paid to GP_TREASURY (0.1; 0 = no Pro). Needs real
//                        Solana payments (GP_SOLANA_CLUSTER + GP_TREASURY); see plans.mjs
//   GP_PRO_DAYS          how long a Pro pass lasts (30)
//   GP_PRO_BUILDS        Pro AI builds per day (10)
//   GP_MAX_ACTIVE        AI builds running at once across all visitors (4)
//   GP_TRUST_PROXY=1     read the visitor address from the first X-Forwarded-For entry (set this
//                        behind a proxy that overwrites that entry, as Render does)
//   GP_DATA_DIR          folder for the shared gallery (./data); put it on a persistent disk
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN: keep the gallery in a free Upstash Redis database
//                        instead (for hosts without a disk, like Render's free plan)
//   GP_SOLANA_CLUSTER, GP_SOLANA_RPC, GP_TREASURY, GP_ALLOW_MAINNET: real Solana payments, see chain.mjs
//   GP_ADMIN_KEY         any long secret; the server prints an owner link at startup. Open it once
//                        to settle reward epochs and delist games from that browser
import { createServer as httpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGallery, fileStore, redisStore, copyGallery } from './gallery.mjs';
import { chainConfig, makeRpc, openChain } from './chain.mjs';
import { limiter, memoryKv, openPlans } from './plans.mjs';
import { uidOf } from './gallery.mjs';
import { createHash } from 'node:crypto';

await import('../src/harness.js');
const H = globalThis.PPHarness;

const here = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const MAX_BODY = 96 * 1024;
const MAX_TOKENS = 64000;
// Models that accept server-side refusal fallbacks ("default" routes by refusal category).
const FALLBACK_OK = /^claude-(sonnet-5-5|opus-5|fable-5)/;

/* Free builds all use the free model; Pro uses Sonnet for new games and "best" builds. */
export function pickModel(req, models, plan = 'pro') {
  if (plan !== 'pro') return models.free;
  return req.kind === 'new' || req.tier === 'complex' ? models.new : models.edit;
}
const KEY_OK = /^[A-Za-z0-9_-]{32,128}$/;

/* The Messages API request for one build. HARNESS is the system prompt, so it caches across builds. */
export function buildParams(req, model) {
  const params = {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: H.HARNESS, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: H.harnessTask(req.kind, req) }],
  };
  if (FALLBACK_OK.test(model)) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
  return params;
}

function apiError(err) {
  const status = err && err.status;
  if (status === 429 || status === 529) return { code: 'rate_limited', message: 'The AI studio is busy right now. Try again in a minute.' };
  if (status === 401 || status === 403) return { code: 'failed', message: 'The AI studio is not set up correctly on this server.' };
  if (status === 400 || status === 413) return { code: 'prompt_too_large', message: 'The game is too large to change in one request. Start a new build.' };
  return { code: 'failed', message: 'The build failed. Try again.' };
}

/* Creates the server. Options: root, client (an Anthropic client, or null for no AI), models,
   daily, total, maxActive, trustProxy, log, gallery (from openGallery(), or null for none),
   chain (from openChain()), kv (build counts and Pro passes; in memory if omitted),
   pro ({ price (lamports), days, daily }, used when chain is set). */
export function createServer(opts = {}) {
  const root = resolve(opts.root || join(here, '..', 'dist', 'site'));
  const client = opts.client || null;
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v));
  const models = Object.assign({ free: 'claude-haiku-5-5', new: 'claude-sonnet-5-5', edit: 'claude-haiku-5-5' }, pick(opts.models));
  const daily = opts.daily || 3;
  const kv = opts.kv || memoryKv();
  const limits = limiter({ total: opts.total || 0, maxActive: opts.maxActive || 4, kv });
  const log = opts.log || (() => {});
  const gallery = opts.gallery || null;
  const chain = opts.chain || null;
  const pro = opts.pro || {};
  const plans = openPlans({ kv, chain, price: pro.price, days: pro.days, daily: pro.daily });
  const uidFrom = (req) => { const k = String(req.headers['x-gp-key'] || ''); return KEY_OK.test(k) ? uidOf(k) : null; };
  /* The caller's plan, daily allowance and builds left today. */
  async function planInfo(req) {
    const uid = uidFrom(req);
    const plan = await plans.planOf(uid);
    const who = plan === 'pro' ? 'u:' + uid : visitor(req);
    const cap = plan === 'pro' ? plans.pro.daily : daily;
    return { plan, who, uid, cap, left: Math.max(0, cap - (await limits.used(who))) };
  }
  const chainHits = new Map();

  const visitor = (req) => {
    const fwd = opts.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.socket.remoteAddress || 'unknown';
  };
  const send = (res, status, body, type) => {
    res.writeHead(status, { 'content-type': type || 'application/json', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  async function serveFile(req, res) {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
    } catch (e) { return send(res, 404, 'Not found', 'text/plain; charset=utf-8'); }
    let body = await readFile(file);
    if ((client || gallery || chain) && file === join(root, 'index.html')) {
      // Tell the page where to send AI builds, where the shared gallery lives and which Solana network pays.
      const extra = Object.assign(client ? { ai: 'api/build' } : {}, client && plans.pro ? { pro: true } : {}, gallery ? { gallery: 'api/db' } : {}, chain ? { chain: Object.assign({ api: 'api/chain' }, chain.site) } : {});
      body = body.toString('utf8').replace(/window\.GP_SITE = (\{.*?\});/, (m, json) => 'window.GP_SITE = ' + JSON.stringify(Object.assign(JSON.parse(json), extra)).replace(/</g, '\\u003c') + ';');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function readBody(req, max = MAX_BODY) {
    return new Promise((ok, fail) => {
      let size = 0; const parts = [];
      // Past the limit, keep draining (so the client can read the 413) but stop storing.
      req.on('data', (c) => { size += c.length; if (size <= max) parts.push(c); else if (size > 8 * max) req.destroy(); });
      req.on('end', () => (size > max ? fail(Object.assign(new Error('too big'), { tooBig: true })) : ok(Buffer.concat(parts).toString('utf8'))));
      req.on('error', fail);
    });
  }

  async function build(req, res) {
    if (!client) return send(res, 503, { code: 'ai_off', message: 'The AI studio is not switched on for this server.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.tooBig ? 413 : 400, { code: e.tooBig ? 'prompt_too_large' : 'bad_request', message: e.tooBig ? 'The game is too large to change in one request. Start a new build.' : 'The request was not valid JSON.' }); }
    const checked = H.checkRequest(body);
    if (!checked.ok) return send(res, 400, { code: 'bad_request', message: 'The request was not valid: ' + checked.error + '.' });
    const r = checked.req;
    let info, slot;
    try {
      info = await planInfo(req);
      if (info.plan !== 'pro' && r.tier === 'complex' && plans.pro) return send(res, 402, { code: 'pro_required', message: 'Best builds use Claude Sonnet 5.5 and are part of Pro. Switch to a standard build, or get Pro.' });
      slot = await limits.take(info.who, info.cap, info.plan === 'pro'
        ? { site: false, limitMessage: 'You have used today’s ' + info.cap + ' Pro builds. They reset tomorrow.' }
        : { limitMessage: 'You have used today’s ' + info.cap + ' free AI builds. Come back tomorrow' + (plans.pro ? ', get Pro for more,' : '') + ' or tune a kit meanwhile.' });
    } catch (e) {
      log({ error: 'limits: ' + (e && e.message) });
      return send(res, 503, { code: 'unavailable', message: 'The AI studio cannot check your build allowance right now. Try again in a minute.' });
    }
    if (!slot.ok) return send(res, 429, { code: slot.code, message: slot.message });
    const refund = () => slot.refund().catch((e) => log({ error: 'refund: ' + (e && e.message) }));
    const model = pickModel(r, models, info.plan);
    const ctl = new AbortController();
    let finished = false, sentText = false;
    res.on('close', () => { if (!finished) ctl.abort(); });
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-accel-buffering': 'no' });
    const line = (o) => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
    const started = Date.now();
    try {
      const stream = client.beta.messages.stream(buildParams(r, model), { signal: ctl.signal });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta' && ev.delta.text) { sentText = true; line({ t: 'text', d: ev.delta.text }); }
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') {
        await refund();
        line({ t: 'error', code: 'refused', message: 'Claude declined this request. Rephrase the idea and try again.' });
      } else {
        line({ t: 'done', truncated: msg.stop_reason === 'max_tokens', model: msg.model || model, plan: info.plan, left: slot.left });
      }
      log({ kind: r.kind, plan: info.plan, model, ms: Date.now() - started, stop: msg.stop_reason, out: msg.usage && msg.usage.output_tokens });
    } catch (err) {
      if (ctl.signal.aborted) { await refund(); log({ kind: r.kind, model, cancelled: true }); }
      else {
        if (!sentText) await refund();
        const e = apiError(err);
        log({ kind: r.kind, model, error: err && (err.status || err.message) });
        line({ t: 'error', code: e.code, message: e.message });
      }
    } finally {
      finished = true;
      slot.release();
      if (!res.writableEnded) res.end();
    }
  }

  async function db(req, res, url) {
    const key = String(req.headers['x-gp-key'] || '');
    const reply = (r) => send(res, r.status, r.body);
    const rest = url.pathname.slice('/api/db/'.length);
    if (req.method === 'GET' && rest === 'me') return reply(gallery.me(key));
    if (req.method === 'GET' && rest === 'snapshot') return reply(gallery.snapshot(Number(url.searchParams.get('since')) || 0));
    if (req.method === 'GET' && rest.startsWith('blobs/')) return reply(await gallery.getBlob(rest.slice(6)));
    if (req.method === 'PUT') {
      let data;
      try { data = JSON.parse(await readBody(req, 300 * 1024)); } catch (e) { return send(res, e.tooBig ? 413 : 400, { code: 'invalid_argument', message: e.tooBig ? 'This document is too large to save.' : 'The request was not valid JSON.' }); }
      return reply(await gallery.put(rest, data, key, visitor(req)));
    }
    return send(res, 404, { code: 'not_found', message: 'Unknown gallery request.' });
  }

  return httpServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;
      if (path.startsWith('/api/chain/')) {
        if (!chain) return send(res, 404, { code: 'not_found', message: 'This server uses the simulated ledger.' });
        const who = visitor(req), now = Date.now();
        const h = chainHits.get(who);
        if (!h || now - h.start > 60000) chainHits.set(who, { start: now, n: 1 }); else if (++h.n > 120) return send(res, 429, { code: 'rate_limited', message: 'Too many requests. Wait a moment.' });
        if (chainHits.size > 100000) chainHits.clear();
        let body = null;
        if (req.method === 'POST') { try { body = JSON.parse(await readBody(req, 16 * 1024)); } catch (e) { return send(res, 400, { code: 'bad_request', message: 'The request was not valid JSON.' }); } }
        const r = await chain.handle(req.method, path.slice('/api/chain/'.length), body, who);
        return send(res, r.status, r.body);
      }
      if (path.startsWith('/api/db/')) return gallery ? await db(req, res, url) : send(res, 404, { code: 'not_found', message: 'This server has no shared gallery.' });
      if (path === '/api/build') return req.method === 'POST' ? await build(req, res) : send(res, 405, { code: 'bad_request', message: 'Use POST.' });
      if (path === '/api/status') {
        // Also Render's health check: report the site as up even if the build-count store is briefly unreachable.
        const info = await planInfo(req).catch((e) => { log({ error: 'limits: ' + (e && e.message) }); return { plan: 'free', cap: daily, left: 0 }; });
        return send(res, 200, { ai: !!client, gallery: !!gallery, chain: chain ? chain.site.cluster : null, models: client ? models : null, plan: info.plan, daily: info.cap, left: info.left, until: info.plan === 'pro' ? await plans.until(info.uid) : 0, pro: client ? await plans.offer(info.uid) : null });
      }
      if (path === '/api/pro') {
        if (req.method !== 'POST') return send(res, 405, { code: 'bad_request', message: 'Use POST.' });
        let body;
        try { body = JSON.parse(await readBody(req, 4096)); } catch (e) { return send(res, 400, { code: 'bad_request', message: 'The request was not valid JSON.' }); }
        const r = await plans.claim(uidFrom(req), body && body.sig);
        if (r.status === 200) log({ pro: 'claimed', until: new Date(r.body.until).toISOString() });
        return send(res, r.status, r.body);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { code: 'bad_request', message: 'Method not allowed.' });
      return await serveFile(req, res);
    } catch (e) {
      log({ error: String(e && e.message) });
      if (!res.headersSent) send(res, 500, { code: 'failed', message: 'Server error.' }); else res.end();
    }
  });
}

/* Run directly: node server/server.mjs */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  let client = null;
  if (env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic();
  } else {
    console.warn('ANTHROPIC_API_KEY is not set, so the AI studio is off. Kits, publishing and scores still work.');
  }
  const port = Number(env.PORT) || 8787;
  // The owner's gallery key is derived from GP_ADMIN_KEY so it is URL-safe whatever the secret looks like.
  const ownerKey = env.GP_ADMIN_KEY && env.GP_ADMIN_KEY.length >= 16 ? 'owner' + createHash('sha256').update('gameplay-owner:' + env.GP_ADMIN_KEY).digest('hex').slice(0, 40) : null;
  if (env.GP_ADMIN_KEY && !ownerKey) console.warn('GP_ADMIN_KEY must be at least 16 characters; ignoring it.');
  // The gallery lives in Upstash Redis when it is configured (hosts without a disk, like Render's free
  // plan), otherwise in GP_DATA_DIR. On the first start with Redis, games already in GP_DATA_DIR move over.
  const dataDir = resolve(env.GP_DATA_DIR || join(here, '..', 'data'));
  let store = fileStore(dataDir);
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = redisStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
    const moved = await copyGallery(fileStore(dataDir), redis);
    if (moved && (moved.docs || moved.blobs)) console.log('Moved ' + moved.docs + ' gallery documents and ' + moved.blobs + ' game files from ' + dataDir + ' to Redis');
    store = redis;
    console.log('The shared gallery is saved in Upstash Redis');
  } else if (env.RENDER && !env.GP_DATA_DIR) {
    console.warn('No UPSTASH_REDIS_REST_URL/TOKEN and no disk: published games will be lost on every restart. See the README.');
  }
  const gallery = await openGallery({ store, adminKey: ownerKey });
  if (ownerKey) console.log('Owner link (keep it private): <your site address>/?admin=' + ownerKey);
  const cc = chainConfig(env, (m) => console.warn(m)); // throws on a bad or unconfirmed mainnet setup, so the server never starts half-configured
  const chain = cc ? openChain({ cluster: cc.cluster, treasury: cc.treasury, rpc: makeRpc(cc.rpcUrl) }) : null;
  if (cc) console.log('Payments run on Solana ' + cc.cluster + '; protocol fees go to ' + cc.treasury);
  const proSol = env.GP_PRO_PRICE_SOL === undefined || env.GP_PRO_PRICE_SOL === '' ? 0.1 : Number(env.GP_PRO_PRICE_SOL);
  if (!(proSol >= 0 && proSol <= 1000)) throw new Error('GP_PRO_PRICE_SOL must be a number of SOL, like 0.1 (0 turns Pro off)');
  if (chain && client && proSol > 0) console.log('Pro passes cost ' + proSol + ' SOL for ' + (Number(env.GP_PRO_DAYS) || 30) + ' days, paid to ' + cc.treasury);
  const server = createServer({
    gallery,
    chain,
    root: env.GP_ROOT,
    client,
    kv: store.kv,
    pro: { price: Math.round(proSol * 1e9), days: Number(env.GP_PRO_DAYS) || undefined, daily: Number(env.GP_PRO_BUILDS) || undefined },
    models: { free: env.GP_MODEL_FREE || undefined, new: env.GP_MODEL_NEW || undefined, edit: env.GP_MODEL_EDIT || undefined },
    daily: Number(env.GP_DAILY_BUILDS) || undefined,
    total: Number(env.GP_DAILY_TOTAL) || undefined,
    maxActive: Number(env.GP_MAX_ACTIVE) || undefined,
    trustProxy: env.GP_TRUST_PROXY === '1',
    log: (o) => console.log(JSON.stringify(Object.assign({ ts: new Date().toISOString() }, o))),
  });
  const save = () => gallery.flush().then(() => process.exit(0));
  process.on('SIGTERM', save); process.on('SIGINT', save);
  server.listen(port, () => console.log('ClaudePlay is running on http://localhost:' + port + (client ? ' with the AI studio on' : '')));
}
