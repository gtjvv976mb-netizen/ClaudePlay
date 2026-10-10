/* GamePlay core: encoding, Ed25519, hashing, ledger rules and the world model.
   Everything here is pure logic so it can be tested outside the browser. */
(function (root) {
  'use strict';

  const enc = new TextEncoder();
  const utf8 = (s) => enc.encode(s);
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const concat = (...arrs) => {
    const n = arrs.reduce((s, a) => s + a.length, 0);
    const o = new Uint8Array(n);
    let k = 0;
    for (const a of arrs) { o.set(a, k); k += a.length; }
    return o;
  };
  const randBytes = (n) => { const b = new Uint8Array(n); root.crypto.getRandomValues(b); return b; };
  const randHex = (n) => hex(randBytes(n));
  const subtle = root.crypto && root.crypto.subtle;

  /* ---------- base58 (Solana / Bitcoin alphabet) ---------- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58enc(bytes) {
    let n = 0n;
    for (const b of bytes) n = n * 256n + BigInt(b);
    let s = '';
    while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
    return s;
  }
  function b58dec(str) {
    let n = 0n;
    for (const c of str) {
      const i = B58.indexOf(c);
      if (i < 0) throw new Error('Not a base58 string');
      n = n * 58n + BigInt(i);
    }
    const out = [];
    while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
    for (const c of str) { if (c === '1') out.unshift(0); else break; }
    return new Uint8Array(out);
  }

  /* ---------- hashing ---------- */
  async function sha256hex(data) {
    const b = typeof data === 'string' ? utf8(data) : data;
    return hex(new Uint8Array(await subtle.digest('SHA-256', b)));
  }
  async function sha512(b) { return new Uint8Array(await subtle.digest('SHA-512', b)); }

  /* ---------- Ed25519: native WebCrypto with a pure-JS fallback ---------- */
  const ed = (() => {
    let nativeP = null;
    function hasNative() {
      if (!nativeP) {
        nativeP = (async () => {
          try {
            const k = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
            const m = utf8('probe');
            const s = await subtle.sign({ name: 'Ed25519' }, k.privateKey, m);
            return await subtle.verify({ name: 'Ed25519' }, k.publicKey, s, m);
          } catch (e) { return false; }
        })();
      }
      return nativeP;
    }

    // Pure-JS fallback (RFC 8032). Not constant-time; fine for a devnet prototype.
    const P = 2n ** 255n - 19n;
    const N = 2n ** 252n + 27742317777372353535851937790883648493n;
    const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
    const pow = (b, e, m = P) => { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = mod(r * b, m); b = mod(b * b, m); e >>= 1n; } return r; };
    const inv = (a) => pow(a, P - 2n);
    const D = mod(-121665n * inv(121666n));
    const SQRT_M1 = pow(2n, (P - 1n) / 4n);
    const leToNum = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
    const numToLE = (n, len) => { const o = new Uint8Array(len); for (let i = 0; i < len; i++) { o[i] = Number(n & 255n); n >>= 8n; } return o; };
    class Pt {
      constructor(X, Y, Z, T) { this.X = X; this.Y = Y; this.Z = Z; this.T = T; }
      static aff(x, y) { return new Pt(x, y, 1n, mod(x * y)); }
      add(o) {
        const A = mod((this.Y - this.X) * (o.Y - o.X));
        const B = mod((this.Y + this.X) * (o.Y + o.X));
        const C = mod(this.T * 2n * D * o.T);
        const DD = mod(this.Z * 2n * o.Z);
        const E = B - A, F = DD - C, G = DD + C, H = B + A;
        return new Pt(mod(E * F), mod(G * H), mod(F * G), mod(E * H));
      }
      mul(n) { let R = Pt.ZERO, Q = this; while (n > 0n) { if (n & 1n) R = R.add(Q); Q = Q.add(Q); n >>= 1n; } return R; }
      eq(o) { return mod(this.X * o.Z) === mod(o.X * this.Z) && mod(this.Y * o.Z) === mod(o.Y * this.Z); }
      bytes() {
        const zi = inv(this.Z), x = mod(this.X * zi), y = mod(this.Y * zi);
        const b = numToLE(y, 32);
        if (x & 1n) b[31] |= 0x80;
        return b;
      }
      static from(bytes) {
        const b = bytes.slice();
        const odd = (b[31] & 0x80) !== 0;
        b[31] &= 0x7f;
        const y = leToNum(b);
        if (y >= P) throw new Error('bad point');
        const y2 = mod(y * y), u = mod(y2 - 1n), v = mod(D * y2 + 1n);
        const v3 = mod(v * v * v), v7 = mod(v3 * v3 * v);
        let x = mod(u * v3 * pow(mod(u * v7), (P - 5n) / 8n));
        const vx2 = mod(v * x * x);
        if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
        else if (vx2 !== mod(u)) throw new Error('bad point');
        if ((x & 1n) !== (odd ? 1n : 0n)) x = mod(-x);
        return Pt.aff(x, y);
      }
    }
    Pt.ZERO = new Pt(0n, 1n, 1n, 0n);
    Pt.BASE = Pt.aff(
      15112221349535400772501151409588531511454012693041857206046113283949847762202n,
      46316835694926478169428394003475163141307993866256225615783033603165251855960n
    );
    async function jsKeyFromSeed(seed) {
      const h = await sha512(seed);
      const a = h.slice(0, 32);
      a[0] &= 248; a[31] &= 127; a[31] |= 64;
      const s = leToNum(a);
      return { s, prefix: h.slice(32), pub: Pt.BASE.mul(s).bytes() };
    }
    async function jsSign(seed, msg) {
      const k = await jsKeyFromSeed(seed);
      const r = mod(leToNum(await sha512(concat(k.prefix, msg))), N);
      const R = Pt.BASE.mul(r).bytes();
      const h = mod(leToNum(await sha512(concat(R, k.pub, msg))), N);
      const S = mod(r + h * k.s, N);
      return concat(R, numToLE(S, 32));
    }
    async function jsVerify(pub, msg, sig) {
      try {
        if (sig.length !== 64 || pub.length !== 32) return false;
        const R = Pt.from(sig.slice(0, 32)), A = Pt.from(pub);
        const S = leToNum(sig.slice(32));
        if (S >= N) return false;
        const h = mod(leToNum(await sha512(concat(sig.slice(0, 32), pub, msg))), N);
        return Pt.BASE.mul(S).eq(R.add(A.mul(h)));
      } catch (e) { return false; }
    }

    const PKCS8_PREFIX = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
    const pubKeyCache = new Map();

    async function generate() {
      if (await hasNative()) {
        const k = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
        const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', k.privateKey));
        const seed = pkcs8.slice(pkcs8.length - 32);
        const pub = new Uint8Array(await subtle.exportKey('raw', k.publicKey));
        return { seed, pub, secret64: concat(seed, pub) };
      }
      const seed = randBytes(32);
      const pub = (await jsKeyFromSeed(seed)).pub;
      return { seed, pub, secret64: concat(seed, pub) };
    }
    async function pubFromSeed(seed) { return (await jsKeyFromSeed(seed)).pub; }

    /* A signer from a 64-byte Solana-style secret key (seed || pubkey). */
    async function signer(secret64) {
      const seed = secret64.slice(0, 32);
      const pub = secret64.slice(32, 64);
      const pk = b58enc(pub);
      let key = null;
      if (await hasNative()) {
        key = await subtle.importKey('pkcs8', concat(PKCS8_PREFIX, seed), { name: 'Ed25519' }, false, ['sign']);
      }
      return {
        pk,
        async sign(msg) {
          const sig = key ? new Uint8Array(await subtle.sign({ name: 'Ed25519' }, key, msg)) : await jsSign(seed, msg);
          return b58enc(sig);
        },
      };
    }
    async function verify(pkB58, msg, sigB58) {
      let pub, sig;
      try { pub = b58dec(pkB58); sig = b58dec(sigB58); } catch (e) { return false; }
      if (pub.length !== 32 || sig.length !== 64) return false;
      if (await hasNative()) {
        try {
          let key = pubKeyCache.get(pkB58);
          if (!key) {
            key = await subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
            pubKeyCache.set(pkB58, key);
          }
          return await subtle.verify({ name: 'Ed25519' }, key, sig, msg);
        } catch (e) { /* fall through to JS */ }
      }
      return jsVerify(pub, msg, sig);
    }
    return { generate, signer, verify, hasNative, pubFromSeed, _js: { jsSign, jsVerify, jsKeyFromSeed } };
  })();

  /* ---------- canonical messages ---------- */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  const DOMAIN = 'GAMEPLAY/v1';
  function txMessage(tx) {
    const { sig, ...rest } = tx;
    return utf8(DOMAIN + '\n' + canon(rest));
  }
  function delegationMessage(main, session, exp) {
    return DOMAIN + ' SESSION\nmain:' + main + '\nsession:' + session + '\nexp:' + exp;
  }
  function epochMessage(ep) {
    const { sig, ...rest } = ep;
    return utf8(DOMAIN + ' EPOCH\n' + canon(rest));
  }

  /* ---------- economy rules ---------- */
  const LAMPORTS = 1e9;
  const RULES = Object.freeze({
    AIRDROP_LAMPORTS: 2 * LAMPORTS,
    AIRDROP_EVERY_MS: 24 * 3600 * 1000,
    WEEKLY_SPARKS: 150,
    GEN_COST: { new: 12, edit: 4, fix: 0 },
    SPARK_PACK: { lamports: 0.02 * LAMPORTS, sparks: 100 },
    SPARKS_PER_PLAYER: 3,
    SPARKS_PLAYER_CAP: 100,
    FEE_BPS: 500,
    PARENT_BPS: 1000,
    GRAND_BPS: 500,
    CONVERT: { park: 20, sparks: 10 },
    EPOCH_BASE: 100000,
    EPOCH_DECAY: 0.9,
    CREATOR_SHARE: 0.7,
    PLAYER_SHARE: 0.3,
    SOL_REV_SHARE: 0.4,
    MAX_SUPPLY: 1000000000,
    MAX_SCORE: 1e9,
    MAX_PRICE_LAMPORTS: 100 * LAMPORTS,
  });
  const emissionFor = (n) => Math.floor(RULES.EPOCH_BASE * Math.pow(RULES.EPOCH_DECAY, Math.max(0, n - 1)));
  const TREASURY = 'TREASURY';
  const STARTER = 'STARTER';

  function weekKey(ts) {
    const d = new Date(ts);
    const day = (d.getUTCDay() + 6) % 7;
    const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return thursday.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  /* Split a collect payment: protocol fee, then lineage royalties, rest to creator. */
  function collectSplits(price, game, games) {
    const out = [];
    const fee = Math.floor(price * RULES.FEE_BPS / 10000);
    out.push({ to: TREASURY, amt: fee, role: 'protocol' });
    let rest = price - fee;
    const parent = game.parent && games.get(game.parent);
    if (parent && parent.creator !== STARTER) {
      const p = Math.floor(price * RULES.PARENT_BPS / 10000);
      out.push({ to: parent.creator, amt: p, role: 'parent' });
      rest -= p;
      const grand = parent.parent && games.get(parent.parent);
      if (grand && grand.creator !== STARTER) {
        const g = Math.floor(price * RULES.GRAND_BPS / 10000);
        out.push({ to: grand.creator, amt: g, role: 'grandparent' });
        rest -= g;
      }
    }
    out.unshift({ to: game.creator, amt: rest, role: 'creator' });
    return out;
  }

  /* ---------- verification with a cache ---------- */
  const sigCache = new Map();
  async function verifyTx(tx) {
    const key = tx.id + ':' + tx.sig;
    if (sigCache.has(key)) return sigCache.get(key);
    let ok = false, why = 'Bad signature';
    try {
      if (!tx.sig || !tx.pk || !tx.from) { why = 'Missing signature fields'; }
      else if (tx.pk === tx.from && !tx.del) {
        ok = await ed.verify(tx.pk, txMessage(tx), tx.sig);
      } else if (tx.del && tx.del.m === tx.from && tx.del.s === tx.pk) {
        const dOk = await ed.verify(tx.del.m, utf8(delegationMessage(tx.del.m, tx.del.s, tx.del.exp)), tx.del.sig);
        if (!dOk) why = 'Bad session delegation';
        else if (tx.ts > tx.del.exp) why = 'Session key expired';
        else ok = await ed.verify(tx.pk, txMessage(tx), tx.sig);
      } else { why = 'Signer is not the account owner'; }
    } catch (e) { ok = false; }
    const res = ok ? { ok: true } : { ok: false, why };
    sigCache.set(key, res);
    return res;
  }
  async function verifyEpoch(ep, config) {
    const list = config ? (config.authorities || (config.authority ? [config.authority] : [])) : [];
    if (!list.includes(ep.pk)) return { ok: false, why: 'Not signed by the protocol authority' };
    const key = 'ep:' + ep.n + ':' + ep.sig;
    if (sigCache.has(key)) return sigCache.get(key);
    const ok = await ed.verify(ep.pk, epochMessage(ep), ep.sig);
    const res = ok ? { ok: true } : { ok: false, why: 'Bad epoch signature' };
    sigCache.set(key, res);
    return res;
  }

  /* ---------- the world: replay every signed transaction in order ---------- */
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : NaN);
  const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

  async function buildWorld(input) {
    const { accounts = [], protocol = {}, starters = [] } = input;
    const now = input.now || Date.now();
    const config = protocol.config || null;
    const delisted = (protocol.moderation && protocol.moderation.delisted) || {};

    const entries = [];
    const seen = new Set();
    for (const acc of accounts) {
      for (const tx of (acc.doc && acc.doc.txs) || []) {
        if (!tx || !tx.id || seen.has(tx.id)) continue;
        seen.add(tx.id);
        entries.push({ kind: 'tx', tx, uid: acc.uid, local: !!acc.local });
      }
    }
    for (const ep of protocol.epochs || []) entries.push({ kind: 'epoch', tx: ep, uid: '@protocol' });
    await Promise.all(entries.map(async (e) => {
      e.v = e.kind === 'epoch' ? await verifyEpoch(e.tx, config) : await verifyTx(e.tx);
    }));
    entries.sort((a, b) => (a.tx.ts - b.tx.ts) || (String(a.tx.id || a.tx.n) < String(b.tx.id || b.tx.n) ? -1 : 1));

    const wallets = new Map();
    const W = (pk) => {
      let w = wallets.get(pk);
      if (!w) {
        w = { pk, sol: 0, sparks: 0, park: 0, handle: null, lastAirdrop: 0, weeks: new Set(), sparksEarned: 0, sparksSpent: 0, earnedSol: 0, earnedPark: 0, uids: new Set(), txs: [], created: Infinity };
        wallets.set(pk, w);
      }
      return w;
    };
    const treasury = { sol: 0, feesTotal: 0, packsTotal: 0, paidOut: 0 };
    const supply = { emitted: 0, burned: 0 };
    const games = new Map();
    for (const s of starters) {
      games.set(s.gid, { ...s, creator: STARTER, ts: 0, collects: [], tips: [], scores: new Map(), reports: [], remixes: [], revenue: 0, boost: 0, players: new Set(), plays: 0, starter: true });
    }
    const log = [];
    const epochs = [];

    for (const e of entries) {
      const tx = e.tx;
      const rec = { tx, uid: e.uid, local: e.local, kind: e.kind, ok: false, why: '', moves: [] };
      log.push(rec);
      if (!e.v.ok) { rec.why = e.v.why; continue; }

      if (e.kind === 'epoch') {
        let solTotal = 0, parkTotal = 0;
        for (const r of tx.rewards || []) { solTotal += Math.max(0, r.sol || 0); parkTotal += Math.max(0, r.park || 0); }
        if (parkTotal > emissionFor(tx.n) + 1) { rec.why = 'Emission above schedule'; continue; }
        if (solTotal > treasury.sol) { rec.why = 'Treasury cannot cover SOL rewards'; continue; }
        for (const r of tx.rewards || []) {
          const w = W(r.to);
          if (r.park > 0) { w.park += r.park; w.earnedPark += r.park; rec.moves.push({ from: '@mint', to: r.to, amt: r.park, unit: 'GPLY' }); }
          if (r.sol > 0) { w.sol += r.sol; w.earnedSol += r.sol; rec.moves.push({ from: TREASURY, to: r.to, amt: r.sol, unit: 'SOL' }); }
        }
        treasury.sol -= solTotal; treasury.paidOut += solTotal; supply.emitted += parkTotal;
        epochs.push(tx);
        rec.ok = true;
        continue;
      }

      const w = W(tx.from);
      w.uids.add(e.uid);
      w.created = Math.min(w.created, tx.ts);
      const b = tx.b || {};
      const fail = (why) => { rec.why = why; };
      switch (tx.t) {
        case 'airdrop': {
          if (tx.ts - w.lastAirdrop < RULES.AIRDROP_EVERY_MS) { fail('Faucet used in the last 24 hours'); break; }
          w.lastAirdrop = tx.ts; w.sol += RULES.AIRDROP_LAMPORTS;
          rec.moves.push({ from: '@faucet', to: tx.from, amt: RULES.AIRDROP_LAMPORTS, unit: 'SOL' });
          rec.ok = true; break;
        }
        case 'spark_claim': {
          const wk = weekKey(tx.ts);
          if (w.weeks.has(wk)) { fail('Weekly Sparks already claimed'); break; }
          w.weeks.add(wk); w.sparks += RULES.WEEKLY_SPARKS;
          rec.moves.push({ from: '@weekly', to: tx.from, amt: RULES.WEEKLY_SPARKS, unit: 'SPARK' });
          rec.ok = true; break;
        }
        case 'handle': {
          const h = cleanText(b.name, 20).toLowerCase().replace(/[^a-z0-9_.-]/g, '');
          if (h.length < 2) { fail('Handle too short'); break; }
          w.handle = h; rec.ok = true; break;
        }
        case 'gen': {
          const cost = RULES.GEN_COST[b.kind];
          if (cost === undefined) { fail('Unknown generation type'); break; }
          if (w.sparks < cost) { fail('Not enough Sparks'); break; }
          w.sparks -= cost; w.sparksSpent += cost;
          if (cost) rec.moves.push({ from: tx.from, to: '@compute', amt: cost, unit: 'SPARK' });
          rec.ok = true; break;
        }
        case 'publish': {
          const gid = String(b.gid || '');
          if (!/^g[0-9a-f]{12,32}$/.test(gid)) { fail('Bad game id'); break; }
          if (games.has(gid)) { fail('Game id already taken'); break; }
          if (!/^[0-9a-f]{64}$/.test(String(b.hash))) { fail('Bad content hash'); break; }
          const price = Math.floor(num(b.price));
          if (!(price >= 0 && price <= RULES.MAX_PRICE_LAMPORTS)) { fail('Bad price'); break; }
          const cap = Math.floor(num(b.cap));
          if (!(cap >= 0 && cap <= 100000)) { fail('Bad edition cap'); break; }
          if (b.parent && !games.has(b.parent)) { fail('Parent game not found'); break; }
          const g = {
            gid, creator: tx.from, creatorUid: e.uid, ts: tx.ts, txId: tx.id, sig: tx.sig,
            title: cleanText(b.title, 40) || 'Untitled', genre: cleanText(b.genre, 24) || 'Arcade',
            desc: cleanText(b.desc, 200), prompt: cleanText(b.prompt, 600), hash: b.hash, size: Math.floor(num(b.size)) || 0,
            parent: b.parent || null, price, cap, kit: cleanText(b.kit, 20) || 'ai', params: b.params && typeof b.params === 'object' ? b.params : null,
            collects: [], tips: [], scores: new Map(), reports: [], remixes: [], revenue: 0, boost: 0, players: new Set(), plays: 0, local: e.local,
          };
          games.set(gid, g);
          if (g.parent) games.get(g.parent).remixes.push(gid);
          rec.ok = true; break;
        }
        case 'collect': {
          const g = games.get(b.gid);
          if (!g || g.starter) { fail('Game not collectible'); break; }
          if (delisted[g.gid]) { fail('Game delisted'); break; }
          if (g.cap && g.collects.length >= g.cap) { fail('Sold out'); break; }
          if (Math.floor(num(b.price)) !== g.price) { fail('Price mismatch'); break; }
          if (w.sol < g.price) { fail('Not enough SOL'); break; }
          const splits = collectSplits(g.price, g, games);
          w.sol -= g.price;
          for (const s of splits) {
            if (s.to === TREASURY) { treasury.sol += s.amt; treasury.feesTotal += s.amt; }
            else { const r = W(s.to); r.sol += s.amt; r.earnedSol += s.amt; }
            if (s.amt) rec.moves.push({ from: tx.from, to: s.to, amt: s.amt, unit: 'SOL', role: s.role });
            const tg = s.role === 'creator' ? g : null;
            if (tg) tg.revenue += s.amt;
          }
          for (const s of splits) if (s.role === 'parent' || s.role === 'grandparent') { const anc = s.role === 'parent' ? games.get(g.parent) : games.get(games.get(g.parent).parent); if (anc) anc.revenue += s.amt; }
          g.collects.push({ pk: tx.from, ts: tx.ts, edition: g.collects.length + 1, txId: tx.id });
          rec.ok = true; break;
        }
        case 'tip': {
          const g = games.get(b.gid);
          const amt = Math.floor(num(b.amt));
          if (!g || g.starter) { fail('Game not found'); break; }
          if (!(amt > 0)) { fail('Bad amount'); break; }
          if (w.sol < amt) { fail('Not enough SOL'); break; }
          w.sol -= amt; const r = W(g.creator); r.sol += amt; r.earnedSol += amt; g.revenue += amt;
          g.tips.push({ pk: tx.from, amt, ts: tx.ts });
          rec.moves.push({ from: tx.from, to: g.creator, amt, unit: 'SOL', role: 'tip' });
          rec.ok = true; break;
        }
        case 'score': {
          const g = games.get(b.gid);
          const sc = Math.floor(num(b.score));
          if (!g) { fail('Game not found'); break; }
          if (b.hash !== g.hash) { fail('Score is for a different version'); break; }
          if (!(sc >= 0 && sc <= RULES.MAX_SCORE)) { fail('Bad score'); break; }
          const prev = g.scores.get(tx.from);
          if (!prev || sc > prev.score) g.scores.set(tx.from, { pk: tx.from, score: sc, ts: tx.ts, txId: tx.id, sig: tx.sig, seed: b.seed, ih: b.ih, inputs: b.inputs, dur: b.dur });
          rec.ok = true; break;
        }
        case 'spark_buy': {
          const packs = Math.floor(num(b.packs));
          if (!(packs >= 1 && packs <= 20)) { fail('Bad pack count'); break; }
          const cost = packs * RULES.SPARK_PACK.lamports;
          if (w.sol < cost) { fail('Not enough SOL'); break; }
          w.sol -= cost; w.sparks += packs * RULES.SPARK_PACK.sparks; treasury.sol += cost; treasury.packsTotal += cost;
          rec.moves.push({ from: tx.from, to: TREASURY, amt: cost, unit: 'SOL', role: 'spark pack' });
          rec.moves.push({ from: '@compute', to: tx.from, amt: packs * RULES.SPARK_PACK.sparks, unit: 'SPARK' });
          rec.ok = true; break;
        }
        case 'boost': {
          const g = games.get(b.gid);
          const amt = Math.floor(num(b.amt));
          if (!g) { fail('Game not found'); break; }
          if (!(amt > 0)) { fail('Bad amount'); break; }
          if (w.park < amt) { fail('Not enough GPLY'); break; }
          w.park -= amt; supply.burned += amt; g.boost += amt;
          rec.moves.push({ from: tx.from, to: '@burn', amt, unit: 'GPLY', role: 'boost' });
          rec.ok = true; break;
        }
        case 'convert': {
          const lots = Math.floor(num(b.lots));
          if (!(lots >= 1 && lots <= 1000)) { fail('Bad amount'); break; }
          const cost = lots * RULES.CONVERT.park;
          if (w.park < cost) { fail('Not enough GPLY'); break; }
          w.park -= cost; supply.burned += cost; w.sparks += lots * RULES.CONVERT.sparks;
          rec.moves.push({ from: tx.from, to: '@burn', amt: cost, unit: 'GPLY', role: 'convert' });
          rec.moves.push({ from: '@compute', to: tx.from, amt: lots * RULES.CONVERT.sparks, unit: 'SPARK' });
          rec.ok = true; break;
        }
        case 'report': {
          const g = games.get(b.gid);
          if (!g) { fail('Game not found'); break; }
          g.reports.push({ pk: tx.from, reason: cleanText(b.reason, 120), ts: tx.ts });
          rec.ok = true; break;
        }
        default: fail('Unknown transaction type');
      }
      if (rec.ok) w.txs.push(rec);
    }

    // Plays: one unique player per signed-in account per game (the prototype's stand-in for proof of personhood).
    const creatorUids = new Map();
    for (const g of games.values()) if (!g.starter) creatorUids.set(g.gid, g.creatorUid);
    const playersByAccount = [];
    for (const acc of accounts) {
      const plays = (acc.doc && acc.doc.plays) || {};
      const primary = acc.doc && acc.doc.primary;
      for (const gid of Object.keys(plays)) {
        const g = games.get(gid);
        const p = plays[gid];
        if (!g || !p) continue;
        g.plays += Math.max(0, Math.floor(p.n || 0));
        if (creatorUids.get(gid) !== acc.uid) {
          g.players.add(acc.uid);
          playersByAccount.push({ uid: acc.uid, primary, gid, f: p.f || 0, l: p.l || 0 });
        }
      }
    }
    for (const g of games.values()) {
      if (g.starter || !wallets.has(g.creator)) continue;
      const earned = Math.min(g.players.size, RULES.SPARKS_PLAYER_CAP) * RULES.SPARKS_PER_PLAYER;
      const cw = wallets.get(g.creator);
      cw.sparks += earned; cw.sparksEarned += earned;
    }
    for (const [gid, reason] of Object.entries(delisted)) { const g = games.get(gid); if (g) g.delisted = reason || 'Delisted'; }

    return { wallets, games, treasury, supply, log, epochs, playersByAccount, config, now, delisted };
  }

  /* Rewards for the next epoch, computed from activity since the last one. */
  function computeEpoch(world, now) {
    const last = world.epochs[world.epochs.length - 1];
    const from = last ? last.to : 0;
    const n = (last ? last.n : 0) + 1;
    const emission = emissionFor(n);
    const creatorW = new Map(), playerW = new Map(), why = new Map();
    const bump = (m, pk, v, reason) => { if (!pk || pk === STARTER || v <= 0) return; m.set(pk, (m.get(pk) || 0) + v); const k = (m === creatorW ? 'c:' : 'p:') + pk; why.set(k, (why.get(k) || []).concat(reason)); };
    let feesInWindow = 0;
    for (const rec of world.log) {
      if (!rec.ok || rec.kind !== 'tx' || rec.tx.ts < from || rec.tx.ts >= now) continue;
      const tx = rec.tx, g = tx.b && world.games.get(tx.b.gid);
      if (tx.t === 'collect' && g) {
        bump(creatorW, g.creator, 5, 'collect');
        for (const m of rec.moves) if (m.to === TREASURY) feesInWindow += m.amt;
      }
      if (tx.t === 'tip' && g) bump(creatorW, g.creator, 2, 'tip');
      if (tx.t === 'publish' && tx.b.parent) { const p = world.games.get(tx.b.parent); if (p) bump(creatorW, p.creator, 3, 'remixed'); }
    }
    const accountsWallet = new Map();
    for (const w of world.wallets.values()) for (const u of w.uids) accountsWallet.set(u, w.pk);
    for (const p of world.playersByAccount) {
      if (p.l < from || p.f >= now) continue;
      const g = world.games.get(p.gid);
      if (g && !g.starter) bump(creatorW, g.creator, 1, 'player');
      const pk = accountsWallet.get(p.uid);
      if (pk) bump(playerW, pk, 0.5, 'explorer');
    }
    for (const g of world.games.values()) {
      const rows = [...g.scores.values()].filter((s) => s.ts >= from && s.ts < now).sort((a, b) => b.score - a.score).slice(0, 3);
      rows.forEach((s, i) => bump(playerW, s.pk, 3 - i, 'podium'));
    }
    const split = (m, pool) => {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const out = new Map();
      if (!total) return out;
      for (const [pk, v] of m) out.set(pk, Math.floor(pool * v / total));
      return out;
    };
    const cPool = Math.floor(emission * RULES.CREATOR_SHARE), pPool = Math.floor(emission * RULES.PLAYER_SHARE);
    const solPool = Math.min(world.treasury.sol, Math.floor(feesInWindow * RULES.SOL_REV_SHARE));
    const cPark = split(creatorW, cPool), pPark = split(playerW, pPool), cSol = split(creatorW, solPool);
    const rewards = new Map();
    const add = (pk, k, v, role) => { if (!v) return; const r = rewards.get(pk) || { to: pk, park: 0, sol: 0, roles: [] }; r[k] += v; if (!r.roles.includes(role)) r.roles.push(role); rewards.set(pk, r); };
    for (const [pk, v] of cPark) add(pk, 'park', v, 'creator');
    for (const [pk, v] of pPark) add(pk, 'park', v, 'player');
    for (const [pk, v] of cSol) add(pk, 'sol', v, 'creator');
    const list = [...rewards.values()].sort((a, b) => (b.park - a.park) || (b.sol - a.sol));
    return { n, from, to: now, emission, cPool, pPool, solPool, feesInWindow, rewards: list, creatorWeights: creatorW, playerWeights: playerW };
  }

  root.PPCore = {
    utf8, hex, concat, randBytes, randHex, b58enc, b58dec, sha256hex, ed, canon,
    txMessage, delegationMessage, epochMessage, RULES, LAMPORTS, TREASURY, STARTER,
    emissionFor, weekKey, collectSplits, verifyTx, verifyEpoch, buildWorld, computeEpoch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
