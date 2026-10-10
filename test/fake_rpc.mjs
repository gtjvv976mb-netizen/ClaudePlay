// A tiny in-memory Solana JSON-RPC for tests: enough of getLatestBlockhash, getBalance,
// sendTransaction, getSignatureStatuses, getTransaction (jsonParsed) and requestAirdrop to run
// GamePlay payments end to end without a network. Signatures are really verified.
await import('../src/core.js');
await import('../src/solana.js');
const C = globalThis.PPCore, S = globalThis.PPSolana;

export function fakeRpc() {
  const balances = new Map(), txs = new Map(), calls = [];
  let slot = 100;
  const blockhash = C.b58enc(C.randBytes(32));
  const fail = (message) => { throw Object.assign(new Error(message), { rpc: { code: -32002, message } }); };
  const rpc = async (method, params) => {
    calls.push(method);
    switch (method) {
      case 'getLatestBlockhash': return { context: { slot }, value: { blockhash, lastValidBlockHeight: slot + 150 } };
      case 'getBalance': return { context: { slot }, value: balances.get(params[0]) || 0 };
      case 'requestAirdrop': {
        const sig = C.b58enc(C.randBytes(64));
        balances.set(params[0], (balances.get(params[0]) || 0) + params[1]);
        txs.set(sig, { slot: ++slot, airdrop: true });
        return sig;
      }
      case 'sendTransaction': {
        const bytes = Uint8Array.from(Buffer.from(params[0], 'base64'));
        const p = S.parsePayment(bytes);
        if (!(await C.ed.verify(p.payer, p.message, p.signature))) fail('Transaction signature verification failure');
        const total = p.transfers.reduce((a, t) => a + t.lamports, 0) + 5000;
        if ((balances.get(p.payer) || 0) < total) fail('Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.');
        for (const t of p.transfers) if (!balances.get(t.to) && t.to !== p.payer && t.lamports < 890880) fail('Transaction simulation failed: insufficient funds for rent');
        balances.set(p.payer, balances.get(p.payer) - total);
        for (const t of p.transfers) balances.set(t.to, (balances.get(t.to) || 0) + t.lamports);
        txs.set(p.signature, { slot: ++slot, p });
        return p.signature;
      }
      case 'getSignatureStatuses': return { context: { slot }, value: params[0].map((s) => (txs.has(s) ? { slot: txs.get(s).slot, confirmations: null, err: null, confirmationStatus: 'finalized' } : null)) };
      case 'getTransaction': {
        const t = txs.get(params[0]);
        if (!t || !t.p) return null;
        const { p } = t;
        const keys = [p.payer, ...new Set(p.transfers.map((x) => x.to).filter((k) => k !== p.payer))];
        return {
          slot: t.slot, blockTime: Math.floor(Date.now() / 1000), meta: { err: null, fee: 5000 },
          transaction: { signatures: [p.signature], message: {
            accountKeys: keys.map((k, i) => ({ pubkey: k, signer: i === 0, writable: true, source: 'transaction' })),
            instructions: [
              ...p.transfers.map((x) => ({ program: 'system', programId: S.SYSTEM, parsed: { type: 'transfer', info: { source: x.from, destination: x.to, lamports: x.lamports } } })),
              ...p.memos.map((m) => ({ program: 'spl-memo', programId: S.MEMO, parsed: m })),
            ],
          } },
        };
      }
      default: fail('Method not found: ' + method);
    }
  };
  return { rpc, balances, txs, calls };
}
