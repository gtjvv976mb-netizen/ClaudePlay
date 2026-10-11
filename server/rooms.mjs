// Multiplayer rooms: a small relay that lets the players of one game send each other messages.
//
// A room belongs to one published game and has a short code that goes in the share link. Each player
// opens an event stream (GET /api/rooms/<code>/events) and gets a player id plus a secret token; they
// send with POST /api/rooms/<code>/send. The server only relays: it never reads what games send, and
// the page passes messages into the sandboxed game frame. Rooms live in memory on one instance.
import { randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const GID = /^[A-Za-z0-9_-]{1,80}$/;

/* A display name a game and page can show safely: letters, digits, spaces, _ and -, at most 20 characters. */
export function cleanName(s) { return String(s || '').replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player'; }

/* opts: { maxRooms, maxPlayers, maxMsg (bytes per message), perSecond (messages per player), idleMs, now,
   maxBytes (bytes the relay may send per day, 0 = no limit), kv (keeps that day's count across restarts) } */
export function openRooms(opts = {}) {
  const maxRooms = opts.maxRooms || 500, maxPlayers = Math.max(2, Math.min(32, Math.floor(opts.maxPlayers) || 16)), maxMsg = opts.maxMsg || 2048, perSecond = opts.perSecond || 40;
  const idleMs = opts.idleMs || 10 * 60000, now = opts.now || Date.now;
  const rooms = new Map();
  const err = (status, code, message) => ({ status, body: { code, message } });
  /* Daily traffic budget: hosts like Render's free plan include only a few GB of outbound traffic a month,
     and a full room sends every message to every other player. Past the budget no new rooms open or
     fill until the next day (UTC); a fifth past it, rooms still running close. */
  const budget = Math.max(0, Number(opts.maxBytes) || 0), kv = opts.kv || null;
  let day = '', used = 0, pending = 0, loaded = '';
  const today = () => new Date(now()).toISOString().slice(0, 10);
  function count(n) { const d = today(); if (d !== day) { day = d; used = 0; pending = 0; } used += n; pending += n; }
  const over = (times) => budget > 0 && today() === day && used >= budget * times;
  const tired = () => err(503, 'unavailable', 'Multiplayer rooms have used today’s traffic allowance on this site. Play solo, or try again tomorrow.');
  let queue = Promise.resolve();
  const sync = () => (queue = queue.then(store, store)); // one store call at a time
  async function store() {
    count(0);
    if (!kv || !budget || (!pending && loaded === day)) return; // no store calls while rooms are quiet
    const d = day, n = pending; pending = 0;
    try { const total = Number(await kv.incr('rooms:bytes:' + d, n, 2 * 86400)) || 0; loaded = d; if (d === day && total > used) used = total; } catch (e) { if (d === day) pending += n; }
  }
  const code6 = () => { const b = randomBytes(6); let s = ''; for (let i = 0; i < 6; i++) s += CODE_CHARS[b[i] % 32]; return s; };

  function sweep() {
    const t = now();
    for (const [code, r] of rooms) if (!r.players.size && t - r.touched > idleMs) rooms.delete(code);
  }
  function write(p, msg) { try { if (!p.res.writableEnded) { const s = 'data: ' + JSON.stringify(msg) + '\n\n'; count(s.length); p.res.write(s); } } catch (e) { /* the stream closed */ } }
  function broadcast(r, msg, except) { for (const p of r.players.values()) if (p.id !== except) write(p, msg); }
  const roster = (r) => [...r.players.values()].map((p) => ({ id: p.id, name: p.name }));

  const heart = setInterval(() => { for (const r of rooms.values()) for (const p of r.players.values()) { try { p.res.write(': ping\n\n'); } catch (e) { /* closed */ } } sweep(); sync(); }, 20000);
  if (heart.unref) heart.unref();
  sync();

  return {
    get size() { return rooms.size; },
    /* Bytes sent today, and adds this instance's count to the shared one in kv. */
    async traffic() { await sync(); return used; },
    /* Opens a room for a game. Returns { code, seed }. */
    create(gid) {
      if (!GID.test(String(gid || ''))) return err(400, 'bad_request', 'Unknown game.');
      if (over(1)) return tired();
      sweep();
      if (rooms.size >= maxRooms) return err(503, 'unavailable', 'Too many rooms are open right now. Try again in a few minutes.');
      let code;
      do code = code6(); while (rooms.has(code));
      const seed = randomBytes(4).readUInt32BE(0);
      rooms.set(code, { code, gid, seed, players: new Map(), host: null, touched: now() });
      return { status: 200, body: { code, seed } };
    },
    /* Streams a room's events to one player until the connection closes. */
    join(code, gid, name, res) {
      const r = rooms.get(code);
      if (!r || r.gid !== gid) return err(404, 'not_found', 'That room has closed. Start a new one with Play with friends.');
      if (r.players.size >= maxPlayers) return err(409, 'room_full', 'This room is full (' + maxPlayers + ' players).');
      if (over(1)) return tired();
      const p = { id: 'p' + randomBytes(4).toString('hex'), token: randomBytes(16).toString('hex'), name: cleanName(name), res, tokens: perSecond, refill: now() };
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff', connection: 'keep-alive' });
      res.write(': ' + ' '.repeat(2048) + '\n\n'); // gets the stream past proxies that buffer the first bytes
      count(2054);
      r.players.set(p.id, p);
      if (!r.host) r.host = p.id;
      r.touched = now();
      write(p, { t: 'hello', you: p.id, token: p.token, host: r.host, seed: r.seed, players: roster(r) });
      broadcast(r, { t: 'join', id: p.id, name: p.name }, p.id);
      res.on('close', () => {
        if (!r.players.delete(p.id)) return;
        r.touched = now();
        broadcast(r, { t: 'leave', id: p.id });
        if (r.host === p.id) { r.host = r.players.size ? r.players.keys().next().value : null; if (r.host) broadcast(r, { t: 'host', id: r.host }); }
      });
      return null;
    },
    /* Relays a player's messages: body { id, token, msgs: [{ d, to }] }. */
    send(code, body) {
      const r = rooms.get(code);
      if (!r) return err(404, 'not_found', 'That room has closed.');
      const p = body && r.players.get(body.id);
      if (!p || typeof body.token !== 'string' || body.token !== p.token) return err(403, 'forbidden', 'Not a player in this room.');
      if (over(1.2)) { rooms.delete(code); for (const q of r.players.values()) { try { q.res.end(); } catch (e) { /* closed */ } } return tired(); }
      const msgs = Array.isArray(body.msgs) ? body.msgs : [];
      const t = now();
      p.tokens = Math.min(perSecond * 2, p.tokens + (t - p.refill) / 1000 * perSecond); p.refill = t;
      if (msgs.length > p.tokens) return err(429, 'rate_limited', 'Sending too fast.');
      p.tokens -= msgs.length;
      for (const m of msgs) {
        if (!m || JSON.stringify(m.d === undefined ? null : m.d).length > maxMsg) return err(413, 'too_large', 'A message is too large.');
      }
      for (const m of msgs) {
        const msg = { t: 'msg', from: p.id, d: m.d === undefined ? null : m.d };
        if (typeof m.to === 'string' && m.to) { const q = r.players.get(m.to); if (q) write(q, msg); }
        else broadcast(r, msg, p.id);
      }
      r.touched = t;
      return { status: 204, body: null };
    },
    close() { clearInterval(heart); for (const r of rooms.values()) for (const p of r.players.values()) { try { p.res.end(); } catch (e) { /* closed */ } } rooms.clear(); },
  };
}
