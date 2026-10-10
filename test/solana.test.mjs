// Real-network payments: the hand-written Solana transactions (checked against @solana/web3.js),
// the server-side payment filter, and the ledger's payment checks in chain mode.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
vm.runInThisContext(readFileSync(new URL('../src/core.js', import.meta.url), 'utf8'));
vm.runInThisContext(readFileSync(new URL('../src/solana.js', import.meta.url), 'utf8'));
const C = globalThis.PPCore, S = globalThis.PPSolana;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

let web3 = null;
try { web3 = createRequire(import.meta.url)('@solana/web3.js'); } catch (e) { console.log('skip  @solana/web3.js not installed (npm install) — cross-checks skipped'); }

const mk = async () => { const k = await C.ed.generate(); return C.ed.signer(k.secret64); };
const addr = async () => (await mk()).pk;
const payer = await mk(), creator = await addr(), parent = await addr(), treasury = await addr();
const blockhash = await addr();

// ---- building and reading payments ----
const msg = S.buildPayment({ payer: payer.pk, transfers: [{ to: creator, lamports: 900000 }, { to: treasury, lamports: 50000 }, { to: creator, lamports: 1 }, { to: parent, lamports: 0 }], memo: 'gameplay:0123456789abcdef', blockhash });
const raw = S.serializeTx(msg, await payer.sign(msg));
const p = S.parsePayment(raw);
ok(p.payer === payer.pk && p.transfers.length === 2, 'payment: one transfer per destination, zero amounts dropped');
ok(p.transfers.find((t) => t.to === creator).lamports === 900001, 'payment: repeated destinations are summed');
ok(p.memos[0] === 'gameplay:0123456789abcdef', 'payment: memo round-trips');
if (web3) {
  const tx = web3.Transaction.from(Buffer.from(raw));
  ok(tx.verifySignatures(), 'web3.js: signature verifies');
  ok(tx.feePayer.toBase58() === payer.pk && tx.recentBlockhash === blockhash, 'web3.js: fee payer and blockhash');
  const tr = tx.instructions.filter((ix) => ix.programId.equals(web3.SystemProgram.programId)).map((ix) => web3.SystemInstruction.decodeTransfer(ix));
  ok(tr.length === 2 && tr.every((d) => d.fromPubkey.toBase58() === payer.pk) && Number(tr.find((d) => d.toPubkey.toBase58() === treasury).lamports) === 50000, 'web3.js: transfers decode');
  const memo = tx.instructions.find((ix) => ix.programId.toBase58() === S.MEMO);
  ok(memo && memo.data.toString() === 'gameplay:0123456789abcdef' && memo.keys.length === 0, 'web3.js: memo decodes');
  // A transaction built by web3.js (with a priority fee, as wallet apps add) passes our filter.
  const kp = web3.Keypair.generate();
  const w3 = new web3.Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash })
    .add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }))
    .add(web3.SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new web3.PublicKey(creator), lamports: 12345 }))
    .add(new web3.TransactionInstruction({ programId: new web3.PublicKey(S.MEMO), keys: [], data: Buffer.from('gameplay:00000000000000ff') }));
  w3.sign(kp);
  const q = S.parsePayment(Uint8Array.from(w3.serialize()));
  ok(q.payer === kp.publicKey.toBase58() && q.transfers[0].lamports === 12345 && q.memos[0] === 'gameplay:00000000000000ff', 'filter accepts a web3.js payment with a priority fee');
  // Anything else is refused: another program, a second signer.
  const evil = new web3.Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash })
    .add(web3.SystemProgram.assign({ accountPubkey: kp.publicKey, programId: new web3.PublicKey(treasury) }));
  evil.sign(kp);
  let threw = null; try { S.parsePayment(Uint8Array.from(evil.serialize())); } catch (e) { threw = e.message; }
  ok(threw && /System transfers/.test(threw), 'filter refuses other System instructions: ' + threw);
  const kp2 = web3.Keypair.generate();
  const two = new web3.Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash })
    .add(web3.SystemProgram.transfer({ fromPubkey: kp2.publicKey, toPubkey: kp.publicKey, lamports: 1 }));
  two.sign(kp, kp2);
  threw = null; try { S.parsePayment(Uint8Array.from(two.serialize())); } catch (e) { threw = e.message; }
  ok(threw && /one signer/.test(threw), 'filter refuses a second signer: ' + threw);
  const tok = new web3.Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash })
    .add(new web3.TransactionInstruction({ programId: new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }], data: Buffer.from([3]) }));
  tok.sign(kp);
  threw = null; try { S.parsePayment(Uint8Array.from(tok.serialize())); } catch (e) { threw = e.message; }
  ok(threw && /Only System transfers and memos/.test(threw), 'filter refuses other programs: ' + threw);
}
let threw = null; try { S.parsePayment(C.concat(raw, Uint8Array.from([0]))); } catch (e) { threw = e.message; }
ok(threw === 'Trailing bytes', 'filter refuses trailing bytes');
threw = null; try { S.buildPayment({ payer: payer.pk, transfers: [], blockhash }); } catch (e) { threw = e.message; }
ok(threw === 'Nothing to pay', 'nothing to pay');
ok(S.isAddress(creator) && !S.isAddress('TREASURY') && !S.isAddress(creator + 'x'), 'isAddress');

// readParsedTx on a getTransaction(jsonParsed) shape
const parsed = S.readParsedTx('sig', { slot: 5, blockTime: 9, meta: { err: null }, transaction: { message: { accountKeys: [{ pubkey: payer.pk, signer: true }, { pubkey: creator, signer: false }], instructions: [
  { programId: S.SYSTEM, parsed: { type: 'transfer', info: { source: payer.pk, destination: creator, lamports: 7 } } },
  { programId: S.MEMO, parsed: 'gameplay:x' },
  { programId: S.SYSTEM, parsed: { type: 'createAccount', info: {} } },
] } } });
ok(parsed.ok && parsed.signer === payer.pk && parsed.transfers.length === 1 && parsed.transfers[0].lamports === 7 && parsed.memos[0] === 'gameplay:x', 'readParsedTx');

// ---- ledger in chain mode ----
let t = Date.UTC(2026, 9, 10, 10, 0, 0);
const A = payer, B = await mk(), P = await mk();
const sign = async (signer, type, b, docTxs, id) => { const tx = { id: id || C.randHex(8), t: type, from: signer.pk, pk: signer.pk, ts: t += 1000, n: docTxs.length + 1, b }; tx.sig = await signer.sign(C.txMessage(tx)); docTxs.push(tx); return tx; };
const a = [], b = [], pp = [];
const gidP = 'g' + 'c'.repeat(12), gidB = 'g' + 'b'.repeat(12);
await sign(P, 'publish', { gid: gidP, title: 'Parent', hash: await C.sha256hex('p'), price: 0, cap: 0, kit: 'runner' }, pp);
await sign(B, 'publish', { gid: gidB, title: 'Child', hash: await C.sha256hex('b'), price: 0.1e9, cap: 3, parent: gidP, kit: 'runner' }, b);
const fakeSig = () => C.b58enc(C.randBytes(64));
const chainTxs = new Map();
const pay = (sig, from, transfers, memo, extra) => chainTxs.set(sig, Object.assign({ sig, ok: true, signer: from, transfers: transfers.map(([to, lamports]) => ({ from, to, lamports })), memos: [memo] }, extra || {}));
const splits = C.collectSplits(0.1e9, { price: 0.1e9, parent: gidP, creator: B.pk }, new Map([[gidP, { gid: gidP, creator: P.pk }]]));
const asPaid = (s) => s.map((x) => [x.to === C.TREASURY ? treasury : x.to, x.amt]);
const cases = [];
const add = async (name, expectOk, build) => { const id = C.randHex(8); const sig = fakeSig(); const body = await build(id, sig); const tx = await sign(A, body.t, body.b, a, id); cases.push({ name, expectOk, tx }); };
await add('collect paid in full', true, (id, sig) => { pay(sig, A.pk, asPaid(splits), 'gameplay:' + id); return { t: 'collect', b: { gid: gidB, price: 0.1e9, chain: sig } }; });
await add('collect with no payment', false, () => ({ t: 'collect', b: { gid: gidB, price: 0.1e9 } }));
await add('collect paid short', false, (id, sig) => { pay(sig, A.pk, asPaid(splits).map(([to, l]) => [to, to === treasury ? l - 1 : l]), 'gameplay:' + id); return { t: 'collect', b: { gid: gidB, price: 0.1e9, chain: sig } }; });
await add('collect paid by someone else', false, (id, sig) => { pay(sig, B.pk, asPaid(splits), 'gameplay:' + id); return { t: 'collect', b: { gid: gidB, price: 0.1e9, chain: sig } }; });
await add('collect with another entry\'s memo', false, (id, sig) => { pay(sig, A.pk, asPaid(splits), 'gameplay:ffffffffffffffff'); return { t: 'collect', b: { gid: gidB, price: 0.1e9, chain: sig } }; });
await add('collect whose payment failed', false, (id, sig) => { pay(sig, A.pk, asPaid(splits), 'gameplay:' + id, { ok: false }); return { t: 'collect', b: { gid: gidB, price: 0.1e9, chain: sig } }; });
await add('collect whose payment is not on Solana', false, (id, sig) => ({ t: 'collect', b: { gid: gidB, price: 0.1e9, chain: sig } }));
const reuseSig = fakeSig();
await add('tip paid', true, (id) => { pay(reuseSig, A.pk, [[B.pk, 0.05e9]], 'gameplay:' + id); return { t: 'tip', b: { gid: gidB, amt: 0.05e9, chain: reuseSig } }; });
await add('tip reusing a payment', false, () => ({ t: 'tip', b: { gid: gidB, amt: 0.05e9, chain: reuseSig } }));
await add('tip paid to the wrong wallet', false, (id, sig) => { pay(sig, A.pk, [[P.pk, 0.05e9]], 'gameplay:' + id); return { t: 'tip', b: { gid: gidB, amt: 0.05e9, chain: sig } }; });
await add('tip over the cap', false, (id, sig) => { pay(sig, A.pk, [[B.pk, 1e12]], 'gameplay:' + id); return { t: 'tip', b: { gid: gidB, amt: 1e12, chain: sig } }; });
await add('free collect needs no payment', true, () => ({ t: 'collect', b: { gid: gidP, price: 0 } }));
await add('faucet entry', false, () => ({ t: 'airdrop', b: {} }));
await add('spark pack', false, () => ({ t: 'spark_buy', b: { packs: 1 } }));
let asked = [];
const lookup = async (sigs) => { asked = sigs; return new Map(sigs.filter((s) => chainTxs.has(s)).map((s) => [s, chainTxs.get(s)])); };
const accounts = [{ uid: 'uA', doc: { txs: a } }, { uid: 'uB', doc: { txs: b } }, { uid: 'uP', doc: { txs: pp } }];
const w = await C.buildWorld({ accounts, protocol: {}, starters: [], chain: { treasury, lookup } });
for (const c of cases) { const r = w.log.find((x) => x.tx.id === c.tx.id); ok(r.ok === c.expectOk, c.name + (r.ok ? '' : ': ' + r.why)); }
ok(new Set(asked).size === asked.length, 'payment lookups are batched and de-duplicated');
ok(w.wallets.get(A.pk).sol === 0 && w.treasury.sol === 0, 'chain mode never invents balances');
ok(w.wallets.get(B.pk).earnedSol === splits.find((s) => s.role === 'creator').amt + 0.05e9, 'earnings follow verified payments');
ok(w.treasury.feesTotal === splits.find((s) => s.role === 'protocol').amt, 'protocol fee recorded');
// checkPayment directly
ok(C.checkPayment(null, A.pk, [], 'm') === 'Payment not found on Solana yet', 'checkPayment: missing');

console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
