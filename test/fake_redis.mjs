// A tiny stand-in for Upstash Redis's REST API (POST /pipeline), enough for the gallery's store.
import { createServer } from 'node:http';

export async function fakeRedis(token = 'test-token') {
  const kv = new Map(), hashes = new Map(), sets = new Map();
  let down = false;
  const run = ([cmd, key, ...a]) => {
    switch (cmd) {
      case 'GET': return kv.has(key) ? kv.get(key) : null;
      case 'SET': if (a[1] === 'NX' && kv.has(key)) return null; kv.set(key, a[0]); return 'OK';
      case 'INCRBY': { const v = (Number(kv.get(key)) || 0) + Number(a[0]); kv.set(key, String(v)); return v; }
      case 'EXPIRE': return kv.has(key) ? 1 : 0;
      case 'HSET': { const h = hashes.get(key) || new Map(); hashes.set(key, h); h.set(a[0], a[1]); return 1; }
      case 'HGETALL': return [...(hashes.get(key) || new Map())].flat();
      case 'SADD': { const s = sets.get(key) || new Set(); sets.set(key, s); s.add(a[0]); return 1; }
      case 'SMEMBERS': return [...(sets.get(key) || [])];
      default: return { error: 'ERR unknown command ' + cmd };
    }
  };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (down) { res.writeHead(500); return res.end('down'); }
      if (req.headers.authorization !== 'Bearer ' + token || req.url !== '/pipeline') { res.writeHead(401); return res.end('{"error":"Unauthorized"}'); }
      const out = JSON.parse(body).map((c) => { const r = run(c); return r && r.error ? r : { result: r }; });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port, token, close: () => server.close(), setDown: (v) => { down = v; } };
}
