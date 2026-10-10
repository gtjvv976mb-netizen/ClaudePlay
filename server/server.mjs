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
//   GP_MODEL_NEW         model for new games (claude-sonnet-5-5)
//   GP_MODEL_EDIT        model for changes and bug fixes (claude-haiku-5-5)
//   GP_DAILY_BUILDS      AI builds per visitor per day (12)
//   GP_DAILY_TOTAL       AI builds per day across the whole site, to cap spend (0 = no cap)
//   GP_MAX_ACTIVE        AI builds running at once across all visitors (4)
//   GP_TRUST_PROXY=1     read the visitor address from the first X-Forwarded-For entry (set this
//                        behind a proxy that overwrites that entry, as Render does)
import { createServer as httpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../src/harness.js');
const H = globalThis.PPHarness;

const here = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const MAX_BODY = 96 * 1024;
const MAX_TOKENS = 64000;
// Models that accept server-side refusal fallbacks ("default" routes by refusal category).
const FALLBACK_OK = /^claude-(sonnet-5-5|opus-5|fable-5)/;

/* Per-visitor daily build counts and concurrency, kept in memory. */
export function limiter({ daily, maxActive, total }) {
  const days = new Map();
  const site = { day: '', n: 0 };
  const busy = new Set();
  let active = 0;
  const today = () => new Date().toISOString().slice(0, 10);
  return {
    left(who) { const d = days.get(who); return Math.max(0, daily - (d && d.day === today() ? d.n : 0)); },
    take(who) {
      if (busy.has(who)) return { ok: false, code: 'rate_limited', message: 'You already have a build running. Wait for it to finish.' };
      if (active >= maxActive) return { ok: false, code: 'rate_limited', message: 'The AI studio is busy right now. Try again in a minute.' };
      const day = today();
      const d = days.get(who);
      const n = d && d.day === day ? d.n : 0;
      if (n >= daily) return { ok: false, code: 'daily_limit', message: 'You have used today’s ' + daily + ' free AI builds. Come back tomorrow, or tune a kit meanwhile.' };
      if (site.day !== day) { site.day = day; site.n = 0; }
      if (total && site.n >= total) return { ok: false, code: 'daily_limit', message: 'The AI studio has reached today’s build limit for this site. Come back tomorrow, or tune a kit meanwhile.' };
      site.n++;
      if (days.size > 50000) for (const [k, v] of days) if (v.day !== day) days.delete(k);
      days.set(who, { day, n: n + 1 });
      busy.add(who); active++;
      return { ok: true, release() { busy.delete(who); active--; } };
    },
    refund(who) { const d = days.get(who); if (d && d.n > 0) d.n--; if (site.n > 0) site.n--; },
  };
}

export function pickModel(req, models) {
  return req.kind === 'new' || req.tier === 'complex' ? models.new : models.edit;
}

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
   daily, total, maxActive, trustProxy, log. */
export function createServer(opts = {}) {
  const root = resolve(opts.root || join(here, '..', 'dist', 'site'));
  const client = opts.client || null;
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v));
  const models = Object.assign({ new: 'claude-sonnet-5-5', edit: 'claude-haiku-5-5' }, pick(opts.models));
  const daily = opts.daily || 12;
  const limits = limiter({ daily, total: opts.total || 0, maxActive: opts.maxActive || 4 });
  const log = opts.log || (() => {});

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
    if (client && file === join(root, 'index.html')) {
      // Tell the page where to send AI builds.
      body = body.toString('utf8').replace(/window\.GP_SITE = (\{.*?\});/, (m, json) => 'window.GP_SITE = ' + JSON.stringify(Object.assign(JSON.parse(json), { ai: 'api/build' })).replace(/</g, '\\u003c') + ';');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function readBody(req) {
    return new Promise((ok, fail) => {
      let size = 0; const parts = [];
      // Past the limit, keep draining (so the client can read the 413) but stop storing.
      req.on('data', (c) => { size += c.length; if (size <= MAX_BODY) parts.push(c); else if (size > 8 * MAX_BODY) req.destroy(); });
      req.on('end', () => (size > MAX_BODY ? fail(Object.assign(new Error('too big'), { tooBig: true })) : ok(Buffer.concat(parts).toString('utf8'))));
      req.on('error', fail);
    });
  }

  async function build(req, res) {
    if (!client) return send(res, 503, { code: 'ai_off', message: 'The AI studio is not switched on for this server.' });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.tooBig ? 413 : 400, { code: e.tooBig ? 'prompt_too_large' : 'bad_request', message: e.tooBig ? 'The game is too large to change in one request. Start a new build.' : 'The request was not valid JSON.' }); }
    const checked = H.checkRequest(body);
    if (!checked.ok) return send(res, 400, { code: 'bad_request', message: 'The request was not valid: ' + checked.error + '.' });
    const who = visitor(req);
    const slot = limits.take(who);
    if (!slot.ok) return send(res, 429, { code: slot.code, message: slot.message });

    const r = checked.req;
    const model = pickModel(r, models);
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
        limits.refund(who);
        line({ t: 'error', code: 'refused', message: 'Claude declined this request. Rephrase the idea and try again.' });
      } else {
        line({ t: 'done', truncated: msg.stop_reason === 'max_tokens', model: msg.model || model, left: limits.left(who) });
      }
      log({ kind: r.kind, model, ms: Date.now() - started, stop: msg.stop_reason, out: msg.usage && msg.usage.output_tokens });
    } catch (err) {
      if (ctl.signal.aborted) { limits.refund(who); log({ kind: r.kind, model, cancelled: true }); }
      else {
        if (!sentText) limits.refund(who);
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

  return httpServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      if (path === '/api/build') return req.method === 'POST' ? await build(req, res) : send(res, 405, { code: 'bad_request', message: 'Use POST.' });
      if (path === '/api/status') return send(res, 200, { ai: !!client, models: client ? models : null, daily, left: limits.left(visitor(req)) });
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
  const server = createServer({
    root: env.GP_ROOT,
    client,
    models: { new: env.GP_MODEL_NEW || undefined, edit: env.GP_MODEL_EDIT || undefined },
    daily: Number(env.GP_DAILY_BUILDS) || undefined,
    total: Number(env.GP_DAILY_TOTAL) || undefined,
    maxActive: Number(env.GP_MAX_ACTIVE) || undefined,
    trustProxy: env.GP_TRUST_PROXY === '1',
    log: (o) => console.log(JSON.stringify(Object.assign({ ts: new Date().toISOString() }, o))),
  });
  server.listen(port, () => console.log('GamePlay is running on http://localhost:' + port + (client ? ' with the AI studio on' : '')));
}
