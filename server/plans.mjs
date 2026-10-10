// Free and Pro plans for the AI studio.
//
// Free: every visitor gets a few new games a day (GP_MODEL_FREE_NEW, Sonnet 5.5) and more changes on a
// low-cost model (GP_MODEL_FREE, Haiku 5.5), counted per network address, with site-wide daily caps so a
// public link can't run up the owner's bill.
// Pro: a pass bought with SOL. The player's wallet pays the treasury directly with the memo
// "gameplay:<pro id>" (derived from their gallery key), the server checks that payment on Solana and
// unlocks the better models and more builds a day for GP_PRO_DAYS days. The server never holds funds.
//
// Counts and passes live in a small key-value store (`kv`): Upstash Redis or a file next to the
// gallery, so a restart (Render's free plan sleeps) does not reset anyone's daily count.
import { createHash } from 'node:crypto';

const DAY = 86400000;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

/* kv interface: incr(key, by, ttlSeconds) -> number, get(key), set(key, value), once(key) -> true the first time. */
export function memoryKv() {
  const m = new Map();
  const live = (k) => { const e = m.get(k); if (e && e.exp && e.exp < Date.now()) { m.delete(k); return null; } return e || null; };
  return {
    async incr(k, by, ttl) { const e = live(k); const v = (e ? Number(e.v) || 0 : 0) + by; m.set(k, { v, exp: e ? e.exp : ttl ? Date.now() + ttl * 1000 : 0 }); return v; },
    async get(k) { const e = live(k); return e ? e.v : null; },
    async set(k, v) { m.set(k, { v, exp: 0 }); },
    async once(k) { if (live(k)) return false; m.set(k, { v: 1, exp: 0 }); return true; },
  };
}

/* The memo id that ties a Pro payment to one gallery account. */
export const proId = (uid) => createHash('sha256').update('gameplay-pro:' + uid).digest('hex').slice(0, 16);

/* Daily build counts (in kv) and how many builds run at once (in memory). Counts are kept per bucket
   ('new' games and 'edit' changes), each with an optional site-wide cap. */
export function limiter({ maxActive = 4, kv = memoryKv() } = {}) {
  const busy = new Set();
  let active = 0;
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (who, bucket) => 'lim:' + today() + ':' + (bucket || 'new') + ':' + who;
  const site = (bucket) => 'lim:' + today() + ':' + (bucket || 'new') + ':*site';
  return {
    async used(who, bucket) { return Number(await kv.get(key(who, bucket))) || 0; },
    /* Reserves a build for `who` against `daily`. opts: bucket, total (site-wide cap, 0 = none), limitMessage. */
    async take(who, daily, opts = {}) {
      const total = opts.total || 0;
      if (busy.has(who)) return { ok: false, code: 'rate_limited', message: 'You already have a build running. Wait for it to finish.' };
      if (active >= maxActive) return { ok: false, code: 'rate_limited', message: 'The AI studio is busy right now. Try again in a minute.' };
      busy.add(who); active++;
      const release = () => { if (busy.delete(who)) active--; };
      try {
        const mine = key(who, opts.bucket), all = site(opts.bucket);
        const n = await kv.incr(mine, 1, 2 * 86400);
        if (n > daily) {
          await kv.incr(mine, -1, 2 * 86400); release();
          return { ok: false, code: 'daily_limit', message: opts.limitMessage || 'You have used today’s ' + daily + ' free AI builds. Come back tomorrow, or tune a kit meanwhile.' };
        }
        const counted = !!total;
        if (counted && (await kv.incr(all, 1, 2 * 86400)) > total) {
          await kv.incr(all, -1, 2 * 86400); await kv.incr(mine, -1, 2 * 86400); release();
          return { ok: false, code: 'daily_limit', message: 'The AI studio has reached today’s free build limit for this site. Come back tomorrow, or tune a kit meanwhile.' };
        }
        let refunded = false;
        return {
          ok: true, left: daily - n, release,
          async refund() {
            if (refunded) return; refunded = true;
            await kv.incr(mine, -1, 2 * 86400);
            if (counted) await kv.incr(all, -1, 2 * 86400);
          },
        };
      } catch (e) { release(); throw e; }
    },
  };
}

/* opts: { kv, chain (from openChain, or null: no Pro), price (lamports), days, daily (Pro new games a day), dailyEdits } */
export function openPlans(opts) {
  const { kv, chain } = opts;
  const pro = chain && opts.price > 0 ? { price: Math.round(opts.price), days: opts.days || 30, daily: opts.daily || 10, dailyEdits: opts.dailyEdits || 60, treasury: chain.site.treasury } : null;
  const err = (status, code, message) => ({ status, body: { code, message } });
  async function until(uid) {
    if (!uid) return 0;
    const r = await kv.get('pro:' + uid);
    return Number(r && r.until) || 0;
  }
  return {
    pro,
    /* 'pro' while the account's pass is current, else 'free'. */
    async planOf(uid) { return pro && (await until(uid)) > Date.now() ? 'pro' : 'free'; },
    until,
    /* What the page shows for an account: its pass and how to buy one. */
    async offer(uid) {
      return pro ? { price: pro.price, days: pro.days, daily: pro.daily, dailyEdits: pro.dailyEdits, treasury: pro.treasury, memo: uid ? 'gameplay:' + proId(uid) : null } : null;
    },
    /* Checks a Pro payment on Solana and extends the account's pass. */
    async claim(uid, sig) {
      if (!pro) return err(404, 'not_found', 'Pro is not offered on this site.');
      if (!uid) return err(401, 'unauthenticated', 'Missing gallery key.');
      if (typeof sig !== 'string' || !SIG.test(sig)) return err(400, 'bad_request', 'Bad payment signature.');
      let p;
      try { p = await chain.lookup(sig); } catch (e) { return err(502, 'chain_error', 'Solana did not answer. Try again.'); }
      if (!p) return err(409, 'pending', 'Solana has not confirmed the payment yet. Try again in a moment.');
      if (!p.ok) return err(400, 'bad_request', 'That payment failed on Solana.');
      if (!(p.memos || []).includes('gameplay:' + proId(uid))) return err(400, 'bad_request', 'That payment is not for this account’s Pro pass.');
      const paid = (p.transfers || []).filter((t) => t.from === p.signer && t.to === pro.treasury).reduce((a, t) => a + t.lamports, 0);
      if (paid < pro.price) return err(400, 'bad_request', 'That payment is short of the Pro price.');
      if (!(await kv.once('prosig:' + sig))) {
        const u = await until(uid);
        return u > Date.now() ? { status: 200, body: { until: u, repeated: true } } : err(409, 'used', 'That payment was already used.');
      }
      const u = Math.max(Date.now(), await until(uid)) + pro.days * DAY;
      await kv.set('pro:' + uid, { until: u, last: sig, payer: p.signer });
      return { status: 200, body: { until: u } };
    },
  };
}
