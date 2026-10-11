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
//   GP_MODEL_FREE_NEW    free plan: model for new games (claude-sonnet-5-5)
//   GP_MODEL_FREE        free plan: model for changes and bug fixes (claude-haiku-5-5)
//   GP_MODEL_NEW         Pro: model for new games and "best" builds (claude-sonnet-5-5)
//   GP_MODEL_EDIT        Pro: model for changes and bug fixes (claude-haiku-5-5)
//   GP_DAILY_BUILDS      free new games per visitor per day (2)
//   GP_DAILY_TOTAL       free new games per day across the whole site, to cap spend (0 = no cap)
//   GP_DAILY_EDITS       free AI changes and fixes per visitor per day (20)
//   GP_DAILY_EDIT_TOTAL  free AI changes per day across the whole site (0 = no cap)
//   GP_PRO_PRICE_SOL     price of a Pro pass in SOL, paid to GP_TREASURY (0.1; 0 = no Pro). Needs real
//                        Solana payments (GP_SOLANA_CLUSTER + GP_TREASURY); see plans.mjs
//   GP_PRO_DAYS          how long a Pro pass lasts (30)
//   GP_PRO_BUILDS        Pro new games per day (10)
//   GP_PRO_EDITS         Pro AI changes per day (60)
//   GP_MAX_ACTIVE        AI builds running at once across all visitors (4)
//   GP_DAILY_PLAYTESTS   play-test reviews (a small Claude Haiku call after each build) per day across
//                        the whole site (1000; 0 = no cap). Past it, builds still get the in-page checks
//   GP_ROOM_PLAYERS      players per multiplayer room (16, at most 32)
//   GP_ROOM_MB_DAY       megabytes the multiplayer relay may send per day (100; 0 = no limit). Render's
//                        free plan includes 5 GB of outbound traffic a month, and a full 16-player
//                        room sends about 0.7 GB an hour
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
import { openRooms, ROOM_CODE } from './rooms.mjs';
import { uidOf } from './gallery.mjs';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

await import('../src/harness.js');
const H = globalThis.PPHarness;

const here = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const MAX_BODY = 512 * 1024;
const MAX_TOKENS = 64000;
// Models that accept server-side refusal fallbacks ("default" routes by refusal category).
const FALLBACK_OK = /^claude-(sonnet-5-5|opus-5|fable-5)/;

/* Free: new games on models.freeNew, changes on models.free. Pro: Sonnet for new games and "best" builds. */
export function pickModel(req, models, plan = 'pro') {
  if (plan !== 'pro') return req.kind === 'new' ? models.freeNew || models.free : models.free;
  return req.kind === 'new' || req.tier === 'complex' ? models.new : models.edit;
}
const KEY_OK = /^[A-Za-z0-9_-]{32,128}$/;

/* The creator's text, after their pictures (if any) so Claude can see what each one shows. */
function userContent(req) {
  const pics = (req.pics || []).filter((p) => p.data);
  if (!pics.length) return H.harnessTask(req.kind, req);
  const out = [];
  for (const p of pics) out.push({ type: 'text', text: "Creator's picture '" + p.name + "':" }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: p.data } });
  out.push({ type: 'text', text: H.harnessTask(req.kind, req) });
  return out;
}

/* The Messages API request for one build. HARNESS is the system prompt, so it caches across builds. */
export function buildParams(req, model) {
  const params = {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: H.HARNESS, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userContent(req) }],
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
  const models = Object.assign({ freeNew: 'claude-sonnet-5-5', free: 'claude-haiku-5-5', new: 'claude-sonnet-5-5', edit: 'claude-haiku-5-5' }, pick(opts.models));
  const daily = opts.daily || 2, dailyEdits = opts.dailyEdits || 20;
  const kv = opts.kv || memoryKv();
  const limits = limiter({ maxActive: opts.maxActive || 4, kv });
  const log = opts.log || (() => {});
  const gallery = opts.gallery || null;
  const chain = opts.chain || null;
  const pro = opts.pro || {};
  const plans = openPlans({ kv, chain, price: pro.price, days: pro.days, daily: pro.daily, dailyEdits: pro.dailyEdits });
  const uidFrom = (req) => { const k = String(req.headers['x-gp-key'] || ''); return KEY_OK.test(k) ? uidOf(k) : null; };
  /* The caller's plan and daily allowances: new games ('new') and changes and fixes ('edit'). */
  async function planInfo(req) {
    const uid = uidFrom(req);
    const plan = await plans.planOf(uid);
    const pro = plan === 'pro';
    const who = pro ? 'u:' + uid : visitor(req);
    const caps = pro ? { new: plans.pro.daily, edit: plans.pro.dailyEdits } : { new: daily, edit: dailyEdits };
    const totals = pro ? { new: 0, edit: 0 } : { new: opts.total || 0, edit: opts.totalEdits || 0 };
    const left = {};
    for (const b of ['new', 'edit']) left[b] = Math.max(0, caps[b] - (await limits.used(who, b)));
    return { plan, who, uid, caps, totals, left };
  }
  const chainHits = new Map();
  // Multiplayer rooms need the shared gallery, since friends join through a published game's link.
  const roomMb = opts.roomMbDay === undefined ? 100 : opts.roomMbDay;
  const rooms = opts.rooms === false || !gallery ? null : opts.rooms || openRooms({ maxPlayers: opts.roomPlayers, kv, maxBytes: roomMb * 1e6 });
  const playtestCap = opts.playtestTotal === undefined ? 1000 : opts.playtestTotal;
  const roomHits = new Map(), streams = new Map(), screenHits = new Map(), testHits = new Map();
  /* Safety check: /api/screen reviews a game and returns a token for its hash; the gallery only stores
     game files that carry a valid token, so nothing reaches the public arcade unchecked. */
  const screenKey = opts.screenSecret || randomBytes(32);
  const screenToken = (hash) => createHmac('sha256', screenKey).update('gameplay-screen:' + hash).digest('hex');
  const tokenOk = (hash, t) => { const want = Buffer.from(screenToken(hash)); const got = Buffer.from(String(t || '')); return got.length === want.length && timingSafeEqual(got, want); };
  if (gallery && gallery.setBlobCheck && opts.screen !== false) gallery.setBlobCheck((hash, data) => (tokenOk(hash, data.screen) ? null : { status: 403, body: { code: 'blocked', message: 'Run the safety check before publishing (reload the page if this keeps happening).' } }));
  const hit = (map, who, limit, windowMs) => {
    const now = Date.now(), h = map.get(who);
    if (map.size > 100000) map.clear();
    if (!h || now - h.start > windowMs) { map.set(who, { start: now, n: 1 }); return true; }
    return ++h.n <= limit;
  };

  const visitor = (req) => {
    const fwd = opts.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.socket.remoteAddress || 'unknown';
  };
  const send = (res, status, body, type) => {
    res.writeHead(status, { 'content-type': type || 'application/json', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };

  const files = new Map();
  async function serveFile(req, res) {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    let info;
    try {
      info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
    } catch (e) { return send(res, 404, 'Not found', 'text/plain; charset=utf-8'); }
    const stamp = info.mtimeMs + ':' + info.size, cached = files.get(file);
    if (cached && cached.stamp === stamp) return sendFile(req, res, file, cached);
    let body = await readFile(file);
    if ((client || gallery || chain) && file === join(root, 'index.html')) {
      // Tell the page where to send AI builds, where the shared gallery lives and which Solana network pays.
      const extra = Object.assign(client ? { ai: 'api/build', playtest: 'api/playtest' } : {}, client && plans.pro ? { pro: true } : {}, gallery ? { gallery: 'api/db' } : {}, rooms ? { rooms: 'api/rooms' } : {}, gallery ? { screen: 'api/screen' } : {}, chain ? { chain: Object.assign({ api: 'api/chain' }, chain.site) } : {});
      body = body.toString('utf8').replace(/window\.GP_SITE = (\{.*?\});/, (m, json) => 'window.GP_SITE = ' + JSON.stringify(Object.assign(JSON.parse(json), extra)).replace(/</g, '\\u003c') + ';');
    }
    // A validator lets returning visitors get a 304 instead of the whole page and mascot again (free hosts
    // include only a few GB of traffic a month). Files are kept with their tag until they change on disk.
    const entry = { stamp, body, etag: '"' + createHash('sha256').update(body).digest('base64url').slice(0, 27) + '"' };
    if (files.size > 50) files.clear();
    files.set(file, entry);
    return sendFile(req, res, file, entry);
  }
  function sendFile(req, res, file, { body, etag }) {
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': 'no-cache' }); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-cache', etag });
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
      const bucket = r.kind === 'new' || (info.plan === 'pro' && r.tier === 'complex') ? 'new' : 'edit';
      const cap = info.caps[bucket], what = bucket === 'new' ? 'new games' : 'AI changes';
      slot = await limits.take(info.who, cap, info.plan === 'pro'
        ? { bucket, limitMessage: 'You have used today’s ' + cap + ' Pro ' + what + '. They reset tomorrow.' }
        : { bucket, total: info.totals[bucket], limitMessage: 'You have used today’s ' + cap + ' free ' + what + '. Come back tomorrow' + (plans.pro ? ', get Pro for more,' : '') + ' or tune a kit meanwhile.' });
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

  /* Multiplayer rooms: POST /api/rooms { gid } opens one; GET /api/rooms/<code>/events?gid=&name= streams
     it (Server-Sent Events); POST /api/rooms/<code>/send { id, token, msgs } relays a player's messages. */
  async function room(req, res, url) {
    const who = visitor(req);
    const parts = url.pathname.split('/').filter(Boolean); // api, rooms, code, action
    const reply = (r) => (r.status === 204 ? (res.writeHead(204, { 'cache-control': 'no-store' }), res.end()) : send(res, r.status, r.body));
    if (parts.length === 2 && req.method === 'POST') {
      if (!hit(roomHits, who, 30, 3600000)) return send(res, 429, { code: 'rate_limited', message: 'Too many rooms opened. Try again later.' });
      let body;
      try { body = JSON.parse(await readBody(req, 1024)); } catch (e) { return send(res, 400, { code: 'bad_request', message: 'The request was not valid JSON.' }); }
      const r = rooms.create(String(body && body.gid || ''));
      if (r.status === 200) log({ room: 'opened', players: 0 });
      return reply(r);
    }
    const code = parts[2] || '';
    if (parts.length !== 4 || !ROOM_CODE.test(code)) return send(res, 404, { code: 'not_found', message: 'Unknown room request.' });
    if (parts[3] === 'events' && req.method === 'GET') {
      const open = streams.get(who) || 0;
      if (open >= 12) return send(res, 429, { code: 'rate_limited', message: 'Too many open games on this network.' });
      const r = rooms.join(code, url.searchParams.get('gid') || '', url.searchParams.get('name') || '', res);
      if (r) return reply(r);
      streams.set(who, open + 1);
      res.on('close', () => { const n = (streams.get(who) || 1) - 1; if (n > 0) streams.set(who, n); else streams.delete(who); });
      return;
    }
    if (parts[3] === 'send' && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req, 32 * 1024)); } catch (e) { return send(res, e.tooBig ? 413 : 400, { code: 'bad_request', message: 'The request was not valid.' }); }
      return reply(rooms.send(code, body));
    }
    return send(res, 405, { code: 'bad_request', message: 'Method not allowed.' });
  }

  async function screen(req, res) {
    const who = visitor(req);
    if (!hit(screenHits, who, 60, 3600000)) return send(res, 429, { code: 'rate_limited', message: 'Too many safety checks. Try again later.' });
    let body;
    try { body = JSON.parse(await readBody(req, 400 * 1024)); } catch (e) { return send(res, e.tooBig ? 413 : 400, { code: 'bad_request', message: e.tooBig ? 'This game file is too large.' : 'The request was not valid JSON.' }); }
    const code = typeof body.code === 'string' ? body.code : '';
    if (!code || code.length > 320 * 1024) return send(res, 400, { code: 'bad_request', message: 'Send the game file to check.' });
    const title = String(body.title || '').slice(0, 60), desc = String(body.desc || '').slice(0, 240);
    const hash = createHash('sha256').update(code).digest('hex');
    const found = H.staticScreen(code);
    if (found.length) { log({ screen: 'blocked', why: 'patterns' }); return send(res, 200, { ok: false, reasons: found }); }
    if (client) {
      const content = [];
      for (const p of H.picturesOf(code)) content.push({ type: 'text', text: "Creator's picture '" + p.name + "':" }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: p.data } });
      content.push({ type: 'text', text: 'TITLE: ' + title + '\nDESCRIPTION: ' + desc + '\n\nGAME CODE:\n' + H.stripPictures(code) });
      let text = '';
      try {
        const stream = client.beta.messages.stream({ model: models.free, max_tokens: 400, system: [{ type: 'text', text: H.SCREEN_PROMPT, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] });
        for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text;
        const msg = await stream.finalMessage();
        if (msg.stop_reason === 'refusal') text = '{"verdict":"block","reasons":["The safety review declined this game."]}';
      } catch (e) {
        log({ screen: 'error', error: e && (e.status || e.message) });
        return send(res, 503, { code: 'unavailable', message: 'The safety check is not available right now. Try publishing again in a minute.' });
      }
      const v = H.parseScreen(text);
      log({ screen: v.ok ? 'allowed' : 'blocked' });
      if (!v.ok) return send(res, 200, { ok: false, reasons: v.reasons });
    }
    return send(res, 200, { ok: true, token: screenToken(hash), reviewed: !!client });
  }

  /* Play-test review: POST /api/playtest { title, request, shots, log } after each build; Claude looks at
     the screenshots and the run log and lists what a player would notice is broken. */
  async function playtest(req, res) {
    if (!client) return send(res, 503, { code: 'ai_off', message: 'The AI studio is not switched on for this server.' });
    if (!hit(testHits, visitor(req), 60, 3600000)) return send(res, 429, { code: 'rate_limited', message: 'Too many play-tests. Try again later.' });
    let body;
    try { body = JSON.parse(await readBody(req, 600 * 1024)); } catch (e) { return send(res, e.tooBig ? 413 : 400, { code: 'bad_request', message: 'The request was not valid.' }); }
    const checked = H.checkPlaytest(body);
    if (!checked.ok) return send(res, 400, { code: 'bad_request', message: 'The request was not valid: ' + checked.error + '.' });
    const today = 'lim:' + new Date().toISOString().slice(0, 10) + ':playtest:*site';
    if (playtestCap > 0 && (await kv.incr(today, 1, 2 * 86400)) > playtestCap) {
      await kv.incr(today, -1, 2 * 86400);
      return send(res, 429, { code: 'daily_limit', message: 'Play-test reviews have reached today’s limit for this site.' });
    }
    const r = checked.req, content = [];
    r.shots.forEach((data, i) => content.push({ type: 'text', text: ['Title screen:', 'During play:', 'Later in play:'][i] || 'Screenshot:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
    content.push({ type: 'text', text: H.playtestTask(r) });
    let text = '';
    try {
      const stream = client.beta.messages.stream({ model: models.free, max_tokens: 500, system: [{ type: 'text', text: H.PLAYTEST_PROMPT, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content }] });
      for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text;
      await stream.finalMessage();
    } catch (e) {
      log({ playtest: 'error', error: e && (e.status || e.message) });
      if (playtestCap > 0) await kv.incr(today, -1, 2 * 86400).catch(() => {});
      return send(res, 503, { code: 'unavailable', message: 'The play-test review is not available right now.' });
    }
    const v = H.parsePlaytest(text);
    log({ playtest: v.ok ? 'pass' : 'fix', problems: v.problems.length });
    return send(res, 200, { ok: v.ok, problems: v.problems });
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
      if (path === '/api/screen') return req.method === 'POST' ? (gallery ? await screen(req, res) : send(res, 404, { code: 'not_found', message: 'This server has no shared gallery.' })) : send(res, 405, { code: 'bad_request', message: 'Use POST.' });
      if (path.startsWith('/api/rooms')) return rooms ? await room(req, res, url) : send(res, 404, { code: 'not_found', message: 'This server has no multiplayer rooms.' });
      if (path === '/api/build') return req.method === 'POST' ? await build(req, res) : send(res, 405, { code: 'bad_request', message: 'Use POST.' });
      if (path === '/api/playtest') return req.method === 'POST' ? await playtest(req, res) : send(res, 405, { code: 'bad_request', message: 'Use POST.' });
      if (path === '/api/status') {
        // Also Render's health check: report the site as up even if the build-count store is briefly unreachable.
        const info = await planInfo(req).catch((e) => { log({ error: 'limits: ' + (e && e.message) }); return { plan: 'free', caps: { new: daily, edit: dailyEdits }, left: { new: 0, edit: 0 } }; });
        return send(res, 200, { ai: !!client, gallery: !!gallery, chain: chain ? chain.site.cluster : null, models: client ? models : null, plan: info.plan, daily: info.caps.new, left: info.left.new, edits: { daily: info.caps.edit, left: info.left.edit }, until: info.plan === 'pro' ? await plans.until(info.uid) : 0, pro: client ? await plans.offer(info.uid) : null });
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
    pro: { price: Math.round(proSol * 1e9), days: Number(env.GP_PRO_DAYS) || undefined, daily: Number(env.GP_PRO_BUILDS) || undefined, dailyEdits: Number(env.GP_PRO_EDITS) || undefined },
    models: { freeNew: env.GP_MODEL_FREE_NEW || undefined, free: env.GP_MODEL_FREE || undefined, new: env.GP_MODEL_NEW || undefined, edit: env.GP_MODEL_EDIT || undefined },
    daily: Number(env.GP_DAILY_BUILDS) || undefined,
    total: Number(env.GP_DAILY_TOTAL) || undefined,
    dailyEdits: Number(env.GP_DAILY_EDITS) || undefined,
    totalEdits: Number(env.GP_DAILY_EDIT_TOTAL) || undefined,
    maxActive: Number(env.GP_MAX_ACTIVE) || undefined,
    roomPlayers: Number(env.GP_ROOM_PLAYERS) || undefined,
    roomMbDay: env.GP_ROOM_MB_DAY ? Math.max(0, Number(env.GP_ROOM_MB_DAY) || 0) : undefined,
    playtestTotal: env.GP_DAILY_PLAYTESTS ? Math.max(0, Number(env.GP_DAILY_PLAYTESTS) || 0) : undefined,
    trustProxy: env.GP_TRUST_PROXY === '1',
    log: (o) => console.log(JSON.stringify(Object.assign({ ts: new Date().toISOString() }, o))),
  });
  const save = () => gallery.flush().then(() => process.exit(0));
  process.on('SIGTERM', save); process.on('SIGINT', save);
  server.listen(port, () => console.log('ClaudePlay is running on http://localhost:' + port + (client ? ' with the AI studio on' : '')));
}
