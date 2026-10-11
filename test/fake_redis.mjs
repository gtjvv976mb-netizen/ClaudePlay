// A tiny stand-in for Upstash Redis's REST API (POST /pipeline), enough for the gallery's store.
import { createServer } from 'node:http';

export async function fakeRedis(token = 'test-token') {
  const kv = new Map(), hashes = new Map(), sets = new Map(), commands = [];
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
      case 'EVAL': {
        // Model each receipt operation as one atomic Redis command, never a GET/SET pipeline.
        const [count, totalKey, receiptKey, amountArg, capArg] = a;
        if (count !== '2') return { error: 'Invalid budget keys' };
        const used = Number(kv.get(totalKey) || 0), amount = Number(amountArg);
        if (!Number.isSafeInteger(used) || used < 0) return { error: 'Invalid stored budget' };
        if (key.startsWith('-- budget-reserve-v1')) {
          if (kv.has(receiptKey) || amount > Number(capArg) - used) return [0, used];
          kv.set(totalKey, String(used + amount)); kv.set(receiptKey, JSON.stringify({ reserved: amount }));
          return [1, used + amount];
        }
        if (key.startsWith('-- budget-settle-v1')) {
          if (!kv.has(receiptKey)) return [0, used];
          const receipt = JSON.parse(kv.get(receiptKey));
          if (!receipt.reserved || amount > receipt.reserved) return [0, used];
          if (Object.hasOwn(receipt, 'actual')) return [receipt.actual === amount ? 1 : 0, used];
          const next = used - receipt.reserved + amount;
          if (next < 0) return { error: 'Invalid stored budget' };
          kv.set(totalKey, String(next)); kv.set(receiptKey, JSON.stringify({ ...receipt, actual: amount }));
          return [1, next];
        }
        return { error: 'Unknown script' };
      }
      default: return { error: 'ERR unknown command ' + cmd };
    }
  };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (down) { res.writeHead(500); return res.end('down'); }
      if (req.headers.authorization !== 'Bearer ' + token || req.url !== '/pipeline') { res.writeHead(401); return res.end('{"error":"Unauthorized"}'); }
      const out = JSON.parse(body).map((c) => { commands.push(c); const r = run(c); return r && r.error ? r : { result: r }; });
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port, token, commands, close: () => server.close(), setDown: (v) => { down = v; } };
}
