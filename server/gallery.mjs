// Shared gallery for the self-hosted website: the same documents the page keeps in Claude's `db`
// inside an artifact (accounts/<uid>, blobs/<hash>, protocol/<id>), stored on the server so every
// visitor sees every published game. Data lives in GP_DATA_DIR and survives restarts.
//
// Identity: each browser keeps a random gallery key and sends it as X-GP-Key. Its uid is derived
// from the key, so only that browser can rewrite its own account. Everything in an account is
// signed by the visitor's wallet and re-verified by every page (buildWorld), so the server never
// has to trust its contents. The site owner is whoever holds GP_ADMIN_KEY: they can settle
// epochs and delist games.
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_ACCOUNT = 256 * 1024;
const MAX_BLOB = 200 * 1024;
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
export const uidOf = (key) => 'w_' + sha256('gameplay-gallery:' + key).slice(0, 32);
const KEY_OK = /^[A-Za-z0-9_-]{32,128}$/;
const PROTOCOL_ID = /^(config|moderation|e\d{1,6})$/;
const HASH = /^[0-9a-f]{64}$/;

export async function openGallery(opts = {}) {
  const dir = opts.dir;
  const limits = Object.assign({ accounts: 20000, blobs: 20000, newPerDay: 20, writesPerMinute: 60 }, opts.limits || {});
  const adminUid = opts.adminKey ? uidOf(opts.adminKey) : null;
  const state = { ver: 0, accounts: {}, protocol: {} };
  const blobIndex = new Set();
  if (dir) {
    await mkdir(join(dir, 'blobs'), { recursive: true });
    try { Object.assign(state, JSON.parse(await readFile(join(dir, 'gallery.json'), 'utf8'))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const f of await readdir(join(dir, 'blobs'))) if (/^[0-9a-f]{64}\.json$/.test(f)) blobIndex.add(f.slice(0, 64));
  }
  const memBlobs = new Map();

  // Writes are batched: the whole index is rewritten atomically at most every 250 ms.
  let flushTimer = null, flushing = Promise.resolve();
  const flush = () => {
    clearTimeout(flushTimer); flushTimer = null;
    if (!dir) return flushing;
    const data = JSON.stringify(state);
    flushing = flushing.then(async () => {
      const tmp = join(dir, 'gallery.json.tmp');
      await writeFile(tmp, data);
      await rename(tmp, join(dir, 'gallery.json'));
    }).catch((e) => console.error('gallery save failed', e));
    return flushing;
  };
  const touch = () => { state.ver++; if (!flushTimer) flushTimer = setTimeout(flush, 250); return state.ver; };

  const rates = new Map();
  const allow = (key, max, windowMs) => {
    const now = Date.now();
    let r = rates.get(key);
    if (!r || now - r.start > windowMs) { r = { start: now, n: 0 }; rates.set(key, r); }
    if (rates.size > 100000) for (const [k, v] of rates) if (now - v.start > windowMs) rates.delete(k);
    return ++r.n <= max;
  };
  const err = (status, code, message) => ({ status, body: { code, message } });

  return {
    me(key) {
      if (!KEY_OK.test(key || '')) return err(401, 'unauthenticated', 'Missing gallery key.');
      const uid = uidOf(key);
      return { status: 200, body: { uid, isOwner: !!adminUid && safeEq(uid, adminUid) } };
    },
    /* Documents changed after `since` (all of them for since=0). */
    snapshot(since) {
      const pick = (col) => Object.fromEntries(Object.entries(col).filter(([, d]) => d.ver > since).map(([id, d]) => [id, d.data]));
      return { status: 200, body: { ver: state.ver, accounts: pick(state.accounts), protocol: pick(state.protocol) } };
    },
    async getBlob(hash) {
      if (!HASH.test(hash)) return err(404, 'not_found', 'No such game file.');
      if (memBlobs.has(hash)) return { status: 200, body: memBlobs.get(hash) };
      if (!dir || !blobIndex.has(hash)) return err(404, 'not_found', 'No such game file.');
      return { status: 200, body: JSON.parse(await readFile(join(dir, 'blobs', hash + '.json'), 'utf8')) };
    },
    /* PUT accounts/<uid> | blobs/<hash> | protocol/<id>. */
    async put(path, data, key, who) {
      if (!KEY_OK.test(key || '')) return err(401, 'unauthenticated', 'Missing gallery key.');
      const uid = uidOf(key);
      const owner = !!adminUid && safeEq(uid, adminUid);
      if (!allow('w:' + uid, limits.writesPerMinute, 60000)) return err(429, 'rate_limited', 'Too many changes at once. Wait a moment.');
      if (!data || typeof data !== 'object' || Array.isArray(data)) return err(400, 'invalid_argument', 'A document must be a JSON object.');
      const [col, id, extra] = String(path).split('/');
      if (extra !== undefined) return err(404, 'not_found', 'Unknown document.');
      const size = JSON.stringify(data).length;
      if (col === 'accounts') {
        if (id !== uid) return err(403, 'invalid_argument', 'You can only change your own account.');
        if (size > MAX_ACCOUNT) return err(413, 'invalid_argument', 'This account is too large to save.');
        if (!state.accounts[id]) {
          if (Object.keys(state.accounts).length >= limits.accounts) return err(507, 'quota_exceeded', 'The shared gallery is full.');
          if (!allow('n:' + who, limits.newPerDay, 86400000)) return err(429, 'rate_limited', 'Too many new accounts from this address today.');
        }
        state.accounts[id] = { ver: touch(), data };
        return { status: 200, body: { ver: state.ver } };
      }
      if (col === 'blobs') {
        if (!HASH.test(id) || typeof data.code !== 'string' || sha256(data.code) !== id) return err(400, 'invalid_argument', 'The game file does not match its fingerprint.');
        if (data.code.length > MAX_BLOB) return err(413, 'invalid_argument', 'This game file is too large.');
        if (memBlobs.has(id) || blobIndex.has(id)) return { status: 200, body: { ver: state.ver } };
        if (memBlobs.size + blobIndex.size >= limits.blobs) return err(507, 'quota_exceeded', 'The shared gallery is full.');
        const doc = { code: data.code, size: data.code.length, ts: Number(data.ts) || Date.now() };
        if (dir) {
          const tmp = join(dir, 'blobs', id + '.tmp');
          await writeFile(tmp, JSON.stringify(doc));
          await rename(tmp, join(dir, 'blobs', id + '.json'));
          blobIndex.add(id);
        } else memBlobs.set(id, doc);
        return { status: 200, body: { ver: state.ver } };
      }
      if (col === 'protocol') {
        if (!PROTOCOL_ID.test(id || '')) return err(404, 'not_found', 'Unknown document.');
        if (!owner) return err(403, 'invalid_argument', 'Only the site owner can change protocol settings.');
        if (size > MAX_ACCOUNT) return err(413, 'invalid_argument', 'This document is too large to save.');
        state.protocol[id] = { ver: touch(), data };
        return { status: 200, body: { ver: state.ver } };
      }
      return err(404, 'not_found', 'Unknown document.');
    },
    flush,
    get ver() { return state.ver; },
  };
}

function safeEq(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
