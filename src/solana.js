/* GamePlay on Solana: builds and reads the one kind of transaction GamePlay sends, a payment made of
   System Program transfers plus a memo that ties it to a GamePlay ledger entry. No libraries: the
   legacy transaction format is small enough to write by hand, and test/solana.test.mjs checks it
   against @solana/web3.js. Shared by the page (window.PPSolana) and the server. Needs PPCore. */
(function (root) {
  'use strict';
  const C = root.PPCore;
  const SYSTEM = '11111111111111111111111111111111';
  const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  // Wallet apps may add a priority fee before signing; that only spends the payer's own fee.
  const COMPUTE = 'ComputeBudget111111111111111111111111111111';
  const CLUSTERS = ['devnet', 'testnet', 'mainnet-beta'];
  const MAX_TX = 1232;

  function isAddress(s) {
    if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
    try { return C.b58dec(s).length === 32; } catch (e) { return false; }
  }
  function shortvec(n) {
    const out = [];
    do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n);
    return out;
  }
  function readShortvec(bytes, at) {
    let n = 0, shift = 0, b;
    do { b = bytes[at.i++]; if (b === undefined) throw new Error('truncated'); n |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    return n;
  }
  function u64le(v) {
    let x = BigInt(v);
    if (x < 0n || x >= 1n << 64n) throw new Error('lamports out of range');
    const out = new Uint8Array(8);
    for (let i = 0; i < 8; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
    return out;
  }

  /* Payment message: payer signs; transfers go to each destination; the memo names the ledger entry.
     transfers: [{ to, lamports }] (same destination may repeat; amounts are summed). */
  function buildPayment({ payer, transfers, memo, blockhash }) {
    if (!isAddress(payer)) throw new Error('Bad payer address');
    if (!isAddress(blockhash)) throw new Error('Bad blockhash');
    const sums = new Map();
    for (const t of transfers || []) {
      if (!isAddress(t.to)) throw new Error('Bad destination address');
      const l = Math.floor(Number(t.lamports));
      if (!(l > 0) || !Number.isSafeInteger(l)) continue;
      sums.set(t.to, (sums.get(t.to) || 0) + l);
    }
    if (!sums.size) throw new Error('Nothing to pay');
    // Account order: the signer, writable destinations, then the read-only programs.
    const writable = [...sums.keys()].filter((k) => k !== payer);
    const keys = [payer, ...writable, SYSTEM].concat(memo ? [MEMO] : []);
    const idx = (k) => keys.indexOf(k);
    const ix = [];
    for (const [to, lamports] of sums) {
      ix.push([idx(SYSTEM), ...shortvec(2), 0, idx(to), ...shortvec(12), 2, 0, 0, 0, ...u64le(lamports)]);
    }
    if (memo) {
      const data = C.utf8(String(memo));
      if (data.length > 256) throw new Error('Memo too long');
      ix.push([idx(MEMO), ...shortvec(0), ...shortvec(data.length), ...data]);
    }
    const parts = [1, 0, memo ? 2 : 1, ...shortvec(keys.length)];
    for (const k of keys) parts.push(...C.b58dec(k));
    parts.push(...C.b58dec(blockhash), ...shortvec(ix.length));
    for (const i of ix) parts.push(...i);
    const message = Uint8Array.from(parts);
    if (message.length + 65 > MAX_TX) throw new Error('Payment too large for one transaction');
    return message;
  }
  /* A signed (or, with no signature, unsigned) transaction ready to send. */
  function serializeTx(message, signature) {
    const sig = signature ? (typeof signature === 'string' ? C.b58dec(signature) : signature) : new Uint8Array(64);
    if (sig.length !== 64) throw new Error('Bad signature');
    return C.concat(Uint8Array.from([1]), sig, message);
  }

  /* Decodes a legacy transaction and checks it is a GamePlay payment: only System transfers,
     memos and priority-fee settings, one signer. Returns { payer, signature, transfers, memos, message } or throws. */
  function parsePayment(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_TX) throw new Error('Bad transaction size');
    const at = { i: 0 };
    const nSig = readShortvec(bytes, at);
    if (nSig !== 1) throw new Error('A payment has exactly one signer');
    const signature = bytes.slice(at.i, at.i + 64); at.i += 64;
    const msgStart = at.i;
    if (bytes[at.i] & 0x80) throw new Error('Versioned transactions are not accepted');
    const [reqSig, roSigned, roUnsigned] = [bytes[at.i++], bytes[at.i++], bytes[at.i++]];
    if (reqSig !== 1 || roSigned !== 0) throw new Error('A payment has exactly one signer');
    const nKeys = readShortvec(bytes, at);
    const keys = [];
    for (let k = 0; k < nKeys; k++) { keys.push(C.b58enc(bytes.slice(at.i, at.i + 32))); at.i += 32; }
    at.i += 32; // recent blockhash
    const nIx = readShortvec(bytes, at);
    if (nIx < 1 || nIx > 10) throw new Error('Unexpected instruction count');
    const transfers = [], memos = [];
    for (let n = 0; n < nIx; n++) {
      const prog = keys[bytes[at.i++]];
      const nAcc = readShortvec(bytes, at);
      const accs = [];
      for (let a = 0; a < nAcc; a++) accs.push(keys[bytes[at.i++]]);
      const len = readShortvec(bytes, at);
      const data = bytes.slice(at.i, at.i + len); at.i += len;
      if (data.length !== len) throw new Error('truncated');
      if (prog === SYSTEM) {
        if (len !== 12 || data[0] !== 2 || data[1] || data[2] || data[3] || nAcc !== 2) throw new Error('Only System transfers are accepted');
        if (accs[0] !== keys[0]) throw new Error('Transfers must come from the signer');
        let l = 0n; for (let b = 11; b >= 4; b--) l = (l << 8n) | BigInt(data[b]);
        transfers.push({ from: accs[0], to: accs[1], lamports: Number(l) });
      } else if (prog === MEMO) {
        memos.push(new TextDecoder().decode(data));
      } else if (prog === COMPUTE) {
        if (nAcc !== 0 || (data[0] !== 2 && data[0] !== 3)) throw new Error('Only compute limits and priority fees are accepted');
      } else throw new Error('Only System transfers and memos are accepted');
    }
    if (at.i !== bytes.length) throw new Error('Trailing bytes');
    if (roUnsigned < 1 || roUnsigned >= nKeys) throw new Error('Bad header');
    return { payer: keys[0], signature: C.b58enc(signature), transfers, memos, message: bytes.slice(msgStart) };
  }

  /* Normalizes a getTransaction(jsonParsed) result into what the ledger checks. */
  function readParsedTx(sig, r) {
    if (!r || !r.transaction || !r.meta) return null;
    const keys = (r.transaction.message.accountKeys || []).map((k) => (typeof k === 'string' ? { pubkey: k, signer: false } : k));
    const signer = (keys.find((k) => k.signer) || keys[0] || {}).pubkey || null;
    const transfers = [], memos = [];
    const scan = (ix) => {
      if (!ix) return;
      if (ix.programId === SYSTEM && ix.parsed && ix.parsed.type === 'transfer') {
        const i = ix.parsed.info || {};
        transfers.push({ from: i.source, to: i.destination, lamports: Number(i.lamports) });
      } else if (ix.programId === MEMO) {
        memos.push(typeof ix.parsed === 'string' ? ix.parsed : String(ix.parsed || ''));
      }
    };
    for (const ix of r.transaction.message.instructions || []) scan(ix);
    return { sig, ok: r.meta.err == null, slot: r.slot, blockTime: r.blockTime || null, signer, transfers, memos };
  }

  root.PPSolana = { SYSTEM, MEMO, COMPUTE, CLUSTERS, MAX_TX, isAddress, buildPayment, serializeTx, parsePayment, readParsedTx };
})(typeof window !== 'undefined' ? window : globalThis);
