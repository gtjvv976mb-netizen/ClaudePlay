// Solana for the GamePlay server: a narrow RPC proxy for the page. It never holds a private key.
// Players pay from their own wallets; the server only fetches blockhashes, relays signed payments,
// reports their status and reads them back so every page can check them before they count.
//
//   GP_SOLANA_CLUSTER    devnet | testnet | mainnet-beta (unset: the simulated play-money ledger)
//   GP_SOLANA_RPC        RPC URL (defaults to the public endpoint for the cluster; required on mainnet)
//   GP_TREASURY          public address that receives the 5% protocol fee (never a private key)
//   GP_ALLOW_MAINNET     must be "yes" before mainnet-beta starts: real money moves
await import('../src/core.js');
await import('../src/solana.js');
const SOL = globalThis.PPSolana;

const PUBLIC_RPC = { devnet: 'https://api.devnet.solana.com', testnet: 'https://api.testnet.solana.com', 'mainnet-beta': 'https://api.mainnet-beta.solana.com' };
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

/* Reads and checks the chain settings. Returns null for the simulated ledger; throws on a bad setup.
   A devnet or testnet cluster with no treasury yet falls back to the simulated ledger (with a warning),
   so a fresh deploy always starts. */
export function chainConfig(env, warn = () => {}) {
  const cluster = env.GP_SOLANA_CLUSTER;
  if (!cluster) return null;
  if (!SOL.CLUSTERS.includes(cluster)) throw new Error('GP_SOLANA_CLUSTER must be devnet, testnet or mainnet-beta');
  if (!env.GP_TREASURY && cluster !== 'mainnet-beta') { warn('GP_TREASURY is not set, so payments use the simulated ledger. Set it to a wallet address you control to turn on real ' + cluster + ' payments.'); return null; }
  if (!SOL.isAddress(env.GP_TREASURY || '')) throw new Error('GP_TREASURY must be the public address of a wallet you control (it receives the protocol fee)');
  if (cluster === 'mainnet-beta' && env.GP_ALLOW_MAINNET !== 'yes') throw new Error('Mainnet moves real money. Set GP_ALLOW_MAINNET=yes only after the security review, legal check and owner sign-off in SECURITY.md');
  // The public mainnet endpoint rate-limits and often refuses to relay transactions from servers.
  if (cluster === 'mainnet-beta' && !env.GP_SOLANA_RPC) throw new Error('Mainnet needs your own RPC endpoint in GP_SOLANA_RPC (a free Helius, QuickNode or Alchemy plan works); the public one is too limited for payments');
  return { cluster, treasury: env.GP_TREASURY, rpcUrl: env.GP_SOLANA_RPC || PUBLIC_RPC[cluster] };
}

export function makeRpc(url) {
  let id = 0;
  return async (method, params) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const j = await res.json();
    if (j.error) throw Object.assign(new Error(j.error.message || 'RPC error'), { rpc: j.error });
    return j.result;
  };
}

/* opts: { cluster, treasury, rpc(method, params) } */
export function openChain(opts) {
  const { cluster, treasury, rpc } = opts;
  const cache = new Map(); // sig -> { at, value, final }
  const airdrops = new Map();
  const err = (status, code, message) => ({ status, body: { code, message } });

  async function lookup(sig) {
    const c = cache.get(sig);
    if (c && (c.final || Date.now() - c.at < (c.value ? 30000 : 3000))) return c.value;
    const r = await rpc('getTransaction', [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    const value = SOL.readParsedTx(sig, r);
    let final = false;
    if (value) {
      const st = await rpc('getSignatureStatuses', [[sig]]).catch(() => null);
      final = !!(st && st.value && st.value[0] && st.value[0].confirmationStatus === 'finalized');
    }
    if (cache.size > 50000) cache.clear();
    cache.set(sig, { at: Date.now(), value, final });
    return value;
  }

  return {
    site: { cluster, treasury },
    async handle(method, rest, body, who) {
      try {
        if (method === 'GET' && rest === 'blockhash') {
          const r = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
          return { status: 200, body: { blockhash: r.value.blockhash, lastValidBlockHeight: r.value.lastValidBlockHeight } };
        }
        if (method === 'GET' && rest.startsWith('balance/')) {
          const pk = rest.slice(8);
          if (!SOL.isAddress(pk)) return err(400, 'bad_request', 'Bad address.');
          const r = await rpc('getBalance', [pk, { commitment: 'confirmed' }]);
          return { status: 200, body: { lamports: r.value } };
        }
        if (method === 'GET' && rest.startsWith('status/')) {
          const sig = rest.slice(7);
          if (!SIG.test(sig)) return err(400, 'bad_request', 'Bad signature.');
          const r = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]);
          const s = r && r.value && r.value[0];
          return { status: 200, body: s ? { status: s.confirmationStatus || 'processed', err: s.err || null } : { status: null, err: null } };
        }
        if (method === 'POST' && rest === 'txs') {
          const sigs = Array.isArray(body && body.sigs) ? body.sigs.filter((x) => typeof x === 'string' && SIG.test(x)).slice(0, 100) : [];
          const out = {};
          await Promise.all(sigs.map(async (sig) => { out[sig] = await lookup(sig).catch(() => null); }));
          return { status: 200, body: { txs: out } };
        }
        if (method === 'POST' && rest === 'send') {
          // Relays only GamePlay payments: one signer, System transfers and a memo.
          let bytes, p;
          try { bytes = Uint8Array.from(Buffer.from(String(body && body.tx), 'base64')); p = SOL.parsePayment(bytes); } catch (e) { return err(400, 'bad_request', 'Not a GamePlay payment: ' + e.message); }
          if (!p.memos.some((m) => /^gameplay:[0-9a-f]{16}$/.test(m))) return err(400, 'bad_request', 'Not a GamePlay payment: missing memo.');
          const sig = await rpc('sendTransaction', [Buffer.from(bytes).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
          return { status: 200, body: { signature: sig } };
        }
        if (method === 'POST' && rest === 'airdrop') {
          if (cluster === 'mainnet-beta') return err(404, 'not_found', 'There is no faucet on mainnet.');
          const to = body && body.to;
          if (!SOL.isAddress(to || '')) return err(400, 'bad_request', 'Bad address.');
          const day = new Date().toISOString().slice(0, 10);
          for (const k of [who, to]) { const a = airdrops.get(k); if (a && a.day === day && a.n >= 2) return err(429, 'rate_limited', 'The faucet allows two drops a day. Try faucet.solana.com.'); }
          for (const k of [who, to]) { const a = airdrops.get(k); airdrops.set(k, { day, n: a && a.day === day ? a.n + 1 : 1 }); }
          const sig = await rpc('requestAirdrop', [to, 1e9]);
          return { status: 200, body: { signature: sig } };
        }
        return err(404, 'not_found', 'Unknown chain request.');
      } catch (e) {
        const msg = e && e.rpc && e.rpc.message ? String(e.rpc.message).slice(0, 200) : 'Solana did not answer. Try again.';
        return err(502, 'chain_error', msg);
      }
    },
  };
}
