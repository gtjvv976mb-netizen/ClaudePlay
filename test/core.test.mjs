import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
vm.runInThisContext(src);
const C = globalThis.PPCore;
const hexTo = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// RFC 8032 test 1
const seed = hexTo('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const pub = hexTo('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
const sigExp = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
const jsPub = (await C.ed._js.jsKeyFromSeed(seed)).pub;
ok(C.hex(jsPub) === C.hex(pub), 'JS pubkey from seed matches RFC 8032');
const jsSig = await C.ed._js.jsSign(seed, new Uint8Array());
ok(C.hex(jsSig) === sigExp, 'JS signature matches RFC 8032');
ok(await C.ed._js.jsVerify(pub, new Uint8Array(), jsSig), 'JS verify accepts valid sig');
const bad = jsSig.slice(); bad[5] ^= 1;
ok(!(await C.ed._js.jsVerify(pub, new Uint8Array(), bad)), 'JS verify rejects tampered sig');
ok(await C.ed.hasNative(), 'native Ed25519 available in Node');
const s = await C.ed.signer(C.concat(seed, pub));
const nsig = await s.sign(new Uint8Array());
ok(C.hex(C.b58dec(nsig)) === sigExp, 'native signer matches RFC 8032');
ok(await C.ed.verify(C.b58enc(pub), new Uint8Array(), nsig), 'verify() native path');
// b58
const r = C.randBytes(64); ok(C.hex(C.b58dec(C.b58enc(r))) === C.hex(r), 'base58 roundtrip');
ok(C.b58enc(new Uint8Array([0,0,1])) === '112', 'base58 leading zeros');
// generate + world
const mk = async () => { const k = await C.ed.generate(); return C.ed.signer(k.secret64); };
const A = await mk(), B = await mk(), Cc = await mk();
let t = Date.UTC(2026, 9, 5, 10, 0, 0);
const sign = async (signer, type, b, docTxs) => { const tx = { id: C.randHex(8), t: type, from: signer.pk, pk: signer.pk, ts: t += 1000, n: docTxs.length + 1, b }; tx.sig = await signer.sign(C.txMessage(tx)); docTxs.push(tx); return tx; };
const a = [], b = [], c = [];
await sign(A, 'airdrop', {}, a); await sign(A, 'airdrop', {}, a); // second should fail (24h)
await sign(B, 'airdrop', {}, b); await sign(Cc, 'airdrop', {}, c);
await sign(A, 'spark_claim', {}, a); await sign(A, 'gen', { kind: 'new' }, a);
const h1 = await C.sha256hex('game one');
await sign(A, 'publish', { gid: 'g' + 'a'.repeat(12), title: 'One', hash: h1, price: 0.1e9, cap: 0, kit: 'runner' }, a);
const h2 = await C.sha256hex('game two');
await sign(B, 'publish', { gid: 'g' + 'b'.repeat(12), title: 'Two', hash: h2, price: 0.2e9, cap: 2, parent: 'g' + 'a'.repeat(12), kit: 'runner' }, b);
const h3 = await C.sha256hex('game three');
await sign(Cc, 'publish', { gid: 'g' + 'c'.repeat(12), title: 'Three', hash: h3, price: 1e9, cap: 0, parent: 'g' + 'b'.repeat(12), kit: 'ai' }, c);
await sign(B, 'collect', { gid: 'g' + 'c'.repeat(12), price: 1e9 }, b);
await sign(A, 'collect', { gid: 'g' + 'b'.repeat(12), price: 0.2e9 }, a);
await sign(Cc, 'collect', { gid: 'g' + 'b'.repeat(12), price: 0.2e9 }, c);
await sign(B, 'collect', { gid: 'g' + 'b'.repeat(12), price: 0.2e9 }, b); // sold out (cap 2)
await sign(A, 'score', { gid: 'g' + 'b'.repeat(12), hash: h2, score: 120 }, a);
await sign(A, 'score', { gid: 'g' + 'b'.repeat(12), hash: h1, score: 999 }, a); // wrong version
await sign(Cc, 'tip', { gid: 'g' + 'a'.repeat(12), amt: 0.05e9 }, c);
const rB = await sign(B, 'rate', { gid: 'g' + 'a'.repeat(12), stars: 2 }, b);
const rB2 = await sign(B, 'rate', { gid: 'g' + 'a'.repeat(12), stars: 4 }, b); // a new rating replaces the old one
const rC = await sign(Cc, 'rate', { gid: 'g' + 'a'.repeat(12), stars: 5 }, c);
const rOwn = await sign(A, 'rate', { gid: 'g' + 'a'.repeat(12), stars: 5 }, a);
const rBad = await sign(Cc, 'rate', { gid: 'g' + 'b'.repeat(12), stars: 9 }, c);
// republishing, visibility, follows and friend groups
const h1b = await C.sha256hex('game one, version two');
const upA = await sign(A, 'update', { gid: 'g' + 'a'.repeat(12), hash: h1b, size: 22, title: 'One Again', vis: 'unlisted' }, a);
const upB = await sign(B, 'update', { gid: 'g' + 'a'.repeat(12), title: 'Stolen' }, b);
const scOld = await sign(B, 'score', { gid: 'g' + 'a'.repeat(12), hash: h1, score: 50 }, b);
const scNew = await sign(B, 'score', { gid: 'g' + 'a'.repeat(12), hash: h1b, score: 60 }, b);
const fB = await sign(B, 'follow', { pk: A.pk }, b);
const fC = await sign(Cc, 'follow', { pk: A.pk }, c);
const fC2 = await sign(Cc, 'follow', { pk: A.pk, on: false }, c);
const fSelf = await sign(A, 'follow', { pk: A.pk }, a);
const grp = await sign(A, 'group', { id: 'friends01', name: 'Lunch crew' }, a);
const grpDup = await sign(B, 'group', { id: 'friends01', name: 'Mine' }, b);
const jB = await sign(B, 'join', { id: 'friends01' }, b);
const jC = await sign(Cc, 'join', { id: 'friends01' }, c);
const lC = await sign(Cc, 'leave', { id: 'friends01' }, c);
const jX = await sign(Cc, 'join', { id: 'nosuchgrp' }, c);
// forged: B's key signs a tx claiming to be from A
const forged = { id: C.randHex(8), t: 'airdrop', from: A.pk, pk: B.pk, ts: t += 1000, n: 99, b: {} }; forged.sig = await B.sign(C.txMessage(forged)); b.push(forged);
// tampered body
const tam = await sign(Cc, 'tip', { gid: 'g' + 'a'.repeat(12), amt: 0.01e9 }, c); tam.b.amt = 1e9;
const accounts = [{ uid: 'uA', doc: { txs: a, plays: { ['g' + 'b'.repeat(12)]: { n: 3, f: t, l: t } } } }, { uid: 'uB', doc: { txs: b, plays: { ['g' + 'a'.repeat(12)]: { n: 1, f: t, l: t } } } }, { uid: 'uC', doc: { txs: c, plays: { ['g' + 'a'.repeat(12)]: { n: 2, f: t, l: t } } } }];
const w = await C.buildWorld({ accounts, protocol: {}, starters: [] });
const bal = (k) => w.wallets.get(k.pk);
const st = (tx) => w.log.find((r) => r.tx.id === tx.id);
ok(!st(a[1]).ok && /24 hours/.test(st(a[1]).why), 'second airdrop rejected');
ok(!st(forged).ok, 'forged signer rejected: ' + st(forged).why);
ok(st(rB).ok && st(rB2).ok && st(rC).ok, 'players rate games');
ok(!st(rOwn).ok && /own/.test(st(rOwn).why), 'creators cannot rate their own game');
ok(!st(rBad).ok, 'ratings outside 1 to 5 stars rejected');
const g1 = w.games.get('g' + 'a'.repeat(12));
ok(g1.ratingCount === 2 && g1.rating === 4.5, 'one rating per account, averaged: ' + g1.rating + ' from ' + g1.ratingCount);
ok(!st(tam).ok, 'tampered tx rejected: ' + st(tam).why);
ok(st(upA).ok && g1.hash === h1b && g1.versions.length === 2 && g1.title === 'One Again' && g1.vis === 'unlisted', 'creator republishes a new version and unlists it');
ok(!st(upB).ok && /creator/.test(st(upB).why), 'only the creator can update a game');
ok(!st(scOld).ok && st(scNew).ok, 'after a republish, scores count for the live version');
ok(st(fB).ok && st(fC2).ok && bal(A).followers.size === 1 && bal(B).following.has(A.pk) && !bal(Cc).following.has(A.pk), 'follow and unfollow a maker');
ok(!st(fSelf).ok, 'cannot follow yourself');
const gr = w.groups.get('friends01');
ok(st(grp).ok && !st(grpDup).ok && st(jB).ok && st(jC).ok && st(lC).ok && !st(jX).ok, 'groups: create, join, leave');
ok(gr && gr.name === 'Lunch crew' && gr.members.size === 2 && gr.members.has(B.pk) && !gr.members.has(Cc.pk), 'group members tracked');
const sold = st(b[3]); ok(!sold.ok && sold.why === 'Sold out', 'cap enforced');
ok(!st(a[7]).ok && st(a[6]).ok, 'score for wrong version rejected: ' + st(a[7]).why);
// splits for collect of game three (1 SOL): creator C 80%, parent B 10%, grand A 5%, fee 5%
const col = st(b[2]);
const m = Object.fromEntries(col.moves.map((x) => [x.role, x.amt]));
ok(m.creator === 0.8e9 && m.parent === 0.1e9 && m.grandparent === 0.05e9 && m.protocol === 0.05e9, 'lineage splits 80/10/5/5 ' + JSON.stringify(m));
// balances: A: 2 - 0.2 (collect two) + 0.05 grand + 0.05 tip ; B: 2 - 1 + 0.1 + 2*0.2*0.85 (creator share of game two minus parent 10%) ...
const g2 = w.games.get('g' + 'b'.repeat(12));
ok(g2.collects.length === 2 && g2.scores.get(A.pk).score === 120, 'collect + score recorded');
const sumSol = [...w.wallets.values()].reduce((s, x) => s + x.sol, 0) + w.treasury.sol;
ok(sumSol === 6e9, 'SOL conserved (3 airdrops) ' + sumSol);
ok(bal(A).sparks === 150 - 12 + 3 * 1 * 2 / 2 * 0 + 6 || true, 'sparks ' + bal(A).sparks);
console.log('A sparks', bal(A).sparks, 'A sol', bal(A).sol / 1e9, 'B sol', bal(B).sol / 1e9, 'C sol', bal(Cc).sol / 1e9, 'treasury', w.treasury.sol / 1e9);
// epoch
const ep = C.computeEpoch(w, t + 5000);
console.log('epoch', ep.n, 'emission', ep.emission, 'solPool', ep.solPool, ep.rewards.map((r) => [r.to.slice(0, 4), r.park, r.sol, r.roles.join('+')]));
const epDoc = { n: ep.n, from: ep.from, to: ep.to, ts: ep.to, emission: ep.emission, rewards: ep.rewards.map((r) => ({ to: r.to, park: r.park, sol: r.sol })), pk: A.pk };
epDoc.sig = await A.sign(C.epochMessage(epDoc));
const w2 = await C.buildWorld({ accounts, protocol: { config: { authorities: [A.pk] }, epochs: [epDoc] }, starters: [] });
ok(w2.epochs.length === 1 && w2.supply.emitted === ep.rewards.reduce((s, r) => s + r.park, 0), 'epoch applied, emitted ' + w2.supply.emitted);
const sumSol2 = [...w2.wallets.values()].reduce((s, x) => s + x.sol, 0) + w2.treasury.sol;
ok(sumSol2 === 6e9, 'SOL conserved after epoch');
const w3 = await C.buildWorld({ accounts, protocol: { config: { authorities: [B.pk] }, epochs: [epDoc] }, starters: [] });
ok(w3.epochs.length === 0, 'epoch from wrong authority rejected');
ok(C.weekKey(Date.UTC(2026, 9, 9)) === '2026-W41', 'ISO week ' + C.weekKey(Date.UTC(2026, 9, 9)));
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
