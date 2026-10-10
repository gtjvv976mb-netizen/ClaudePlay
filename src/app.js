/* GamePlay app: views, wallet, storage, players and the AI build harness. */
(function () {
  'use strict';
  const C = window.PPCore, K = window.PPKits, R = C.RULES;
  const BLUEPRINT_URL = 'https://claude.ai/artifact/1q6BrR26CTdLVg4AaMZCVg';
  /* Where this copy runs: inside Claude (artifact viewer) or as a plain website anyone hosts. */
  const ENV = window.claude && typeof window.claude.use === 'function' ? 'claude' : 'web';
  /* Site settings a host can fill in: where business inquiries go (an email address or a https:// link). */
  const SITE = Object.assign({ contact: '' }, window.GP_SITE || {});

  /* ---------------- small helpers ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const short = (s, a, b) => { a = a || 4; b = b || 4; s = String(s || ''); return s.length > a + b + 1 ? s.slice(0, a) + '…' + s.slice(-b) : s; };
  const fmtSOL = (l) => ((l || 0) / C.LAMPORTS).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtInt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const pct = (bps) => (bps / 100).toFixed(0) + '%';
  const plural = (n, one, many) => fmtInt(n) + ' ' + (Math.round(n) === 1 ? one : many || one + 's');
  const ago = (ts) => {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };
  const when = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const serial = (h) => (h ? 'PP·' + h.slice(0, 4).toUpperCase() + '·' + h.slice(4, 8).toUpperCase() + '·' + h.slice(-4).toUpperCase() : '');
  const slug = (s) => String(s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'game';
  const refocus = (sel) => { const el = document.querySelector(sel); if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } };

  const I = {
    spark: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 1 3.2 9.1h4.1L6.4 15l6.4-8.1H8.7z" fill="currentColor"/></svg>',
    park: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 6.2A2.8 2.8 0 1 0 10.8 9H8.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    sol: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 13.6 4.8v6.4L8 14.4 2.4 11.2V4.8z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8" cy="8" r="1.9" fill="currentColor"/></svg>',
    play: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8l8.6-5.4z" fill="currentColor"/></svg>',
    ok: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.4 3.1 3.1L13 4.6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    no: '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  };

  const KEY = { wallet: 'pp.wallet.v1', session: 'pp.session.v1', account: 'pp.account.v1', protocol: 'pp.protocol.v1', studio: 'pp.studio.v1', blob: 'pp.blob.', prefs: 'gp.prefs.v1' };
  const PREF_DEFAULTS = { theme: 'system', text: 'md', motion: 'system', speed: 1, sound: true };
  const ADJ = ['brisk', 'quiet', 'lucky', 'neon', 'sunny', 'swift', 'cosmic', 'mellow', 'bold', 'tiny', 'jolly', 'pixel', 'rapid', 'calm', 'wild', 'zesty'];
  const NOUN = ['lynx', 'otter', 'comet', 'falcon', 'gecko', 'panda', 'koi', 'badger', 'heron', 'moth', 'yak', 'wombat', 'raven', 'ibis', 'tapir', 'newt'];
  const autoName = (pk) => { let h = 0; for (const c of String(pk)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return ADJ[h % 16] + '-' + NOUN[(h >>> 4) % 16]; };

  /* ---------------- state ---------------- */
  const S = {
    route: 'home', arg: null,
    prefs: Object.assign({}, PREF_DEFAULTS, LS.get(KEY.prefs) || {}),
    caps: { db: null, user: null, sample: null, downloads: null },
    hasDb: false, uid: null, isOwner: false, mode: 'local',
    accounts: new Map(),
    localAccount: LS.get(KEY.account),
    sharedProtocol: { config: null, epochs: [], moderation: { delisted: {} } },
    localProtocol: LS.get(KEY.protocol) || { config: null, epochs: [], moderation: { delisted: {} } },
    world: null, starters: [], wallet: null, storageOk: true,
    blobs: new Map(), ui: { sort: 'new', ledger: 'all', tab: 'board', openTx: null, deferred: false, verify: {} },
    studio: null, ctl: null, players: new Map(), ready: false,
  };

  const nameOf = (pk) => {
    if (pk === C.STARTER) return 'GamePlay kit';
    if (pk === C.TREASURY) return 'Treasury';
    if (!pk) return 'nobody';
    const w = S.world && S.world.wallets.get(pk);
    return (w && w.handle) || autoName(pk);
  };
  const protocol = () => (S.hasDb ? S.sharedProtocol : S.localProtocol);
  const canSettle = () => (S.hasDb ? S.mode === 'shared' && S.isOwner : true);
  const canModerate = canSettle;
  const myWallet = () => (S.wallet && S.world ? S.world.wallets.get(S.wallet.from) : null);
  const blankDoc = () => ({ v: 1, primary: null, wallets: {}, txs: [], plays: {} });
  const myUid = () => (S.mode === 'shared' ? S.uid : 'local:' + (S.uid || 'device'));
  function myDoc() {
    const d = S.mode === 'shared' ? S.accounts.get(S.uid) : S.localAccount;
    const out = JSON.parse(JSON.stringify(d || blankDoc()));
    out.wallets = out.wallets || {}; out.txs = out.txs || []; out.plays = out.plays || {};
    return out;
  }
  function worldAccounts(override) {
    const list = [];
    for (const [uid, doc] of S.accounts) {
      if (override && S.mode === 'shared' && uid === S.uid) continue;
      list.push({ uid, doc });
    }
    if (S.mode === 'shared' && override) list.push({ uid: S.uid, doc: override });
    if (S.mode === 'local') {
      const d = override || S.localAccount;
      if (d) list.push({ uid: myUid(), doc: d, local: true });
    }
    return list;
  }

  /* ---------------- toasts & modal ---------------- */
  function toast(text, kind, detail) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.innerHTML = '<span>' + esc(text) + (detail ? ' <span class="mono">' + esc(detail) + '</span>' : '') + '</span>';
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 4500);
  }
  let modalKeyHandler = null, modalOpener = null;
  function modal(html) {
    if (!modalKeyHandler) modalOpener = document.activeElement;
    $('#modal-root').innerHTML = '<div class="modal-back" data-act="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    const box = $('#modal-root .modal');
    const h = $('h2', box);
    if (h) { h.id = 'modal-title'; box.setAttribute('aria-labelledby', 'modal-title'); }
    const first = $('[autofocus]', box) || $('button, input, textarea, select', box);
    if (first) first.focus();
    if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler);
    modalKeyHandler = (e) => {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
      const items = $$('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])', box).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', modalKeyHandler);
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler);
    modalKeyHandler = null;
    const back = modalOpener; modalOpener = null;
    if (back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  /* Screen-reader announcements for things that have no toast (game results, settings). */
  let announceTimer = null;
  function announce(text) {
    const el = $('#sr-live'); if (!el) return;
    el.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { el.textContent = text; }, 60);
  }

  /* ---------------- display & assist preferences ---------------- */
  const reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calmNow = () => S.prefs.motion === 'reduce' || (S.prefs.motion === 'system' && !!(reducedMotionQuery && reducedMotionQuery.matches));
  function gameOpts() { return { speed: Number(S.prefs.speed) || 1, calm: calmNow(), mute: !S.prefs.sound }; }
  function applyPrefs() {
    const r = document.documentElement, p = S.prefs;
    if (p.theme && p.theme !== 'system') r.setAttribute('data-gp-theme', p.theme); else r.removeAttribute('data-gp-theme');
    if (p.text && p.text !== 'md') r.setAttribute('data-gp-text', p.text); else r.removeAttribute('data-gp-text');
    if (p.motion === 'reduce') r.setAttribute('data-gp-motion', 'reduce'); else r.removeAttribute('data-gp-motion');
    const b = $('#a11y-btn');
    if (b) b.classList.toggle('on', Number(p.speed) < 1 || p.theme === 'contrast' || p.text !== 'md' || p.motion === 'reduce' || !p.sound);
  }
  const PREF_GROUPS = [
    { key: 'theme', label: 'Theme', opts: [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark'], ['contrast', 'High contrast']] },
    { key: 'text', label: 'Text size', opts: [['md', 'Default'], ['lg', 'Large'], ['xl', 'Larger']] },
    { key: 'motion', label: 'Motion', opts: [['system', 'Match my device'], ['reduce', 'Reduce motion']], hint: 'Reduce motion turns off page animations and screen shake in kit games.' },
    { key: 'speed', label: 'Game speed (assist mode)', opts: [['1', '100%'], ['0.75', '75%'], ['0.5', '50%']], hint: 'Slows every game. Assisted runs are kept as personal results and stay off ranked leaderboards.' },
    { key: 'sound', label: 'Game sound', opts: [['on', 'On'], ['off', 'Off']] },
  ];
  function prefValue(key) { const v = S.prefs[key]; return key === 'sound' ? (v ? 'on' : 'off') : String(v); }
  function openSettings() {
    modal('<h2>Accessibility &amp; display</h2><p class="muted">Changes apply right away, across the site and inside every game. They are saved in this browser.</p>'
      + PREF_GROUPS.map((g) => '<fieldset class="prefs"><legend>' + esc(g.label) + '</legend><div class="opts">'
        + g.opts.map(([v, l]) => '<label class="opt"><input type="radio" name="pref-' + g.key + '" value="' + esc(v) + '"' + (prefValue(g.key) === v ? ' checked' : '') + '><span>' + esc(l) + '</span></label>').join('')
        + '</div>' + (g.hint ? '<p class="hint">' + esc(g.hint) + '</p>' : '') + '</fieldset>').join('')
      + '<div class="row"><button class="btn primary" type="button" data-act="modal-close">Done</button><button class="btn ghost" type="button" data-act="prefs-reset">Reset to defaults</button></div>');
  }
  function setPref(key, raw) {
    const before = gameOpts();
    S.prefs[key] = key === 'speed' ? Number(raw) : key === 'sound' ? raw === 'on' : raw;
    LS.set(KEY.prefs, S.prefs);
    applyPrefs();
    const after = gameOpts();
    if (before.speed !== after.speed || before.calm !== after.calm || before.mute !== after.mute) renderView(true);
    const g = PREF_GROUPS.find((x) => x.key === key), o = g && g.opts.find(([v]) => v === raw);
    if (g && o) announce(g.label + ': ' + o[1] + '.');
  }
  async function copyText(text, label) {
    try { await navigator.clipboard.writeText(text); toast((label || 'Text') + ' copied.'); }
    catch (e) {
      modal('<h2>Copy</h2><p class="muted">Your browser blocked the clipboard. Select the text below and copy it.</p><textarea id="copy-fallback" readonly>' + esc(text) + '</textarea><div class="row"><button class="btn" data-act="modal-close">Done</button></div>');
      const t = $('#copy-fallback'); if (t) { t.focus(); t.select(); }
    }
  }

  /* ---------------- storage ---------------- */
  let writeChain = Promise.resolve();
  function saveMyDoc(doc) {
    doc.v = 1;
    if (S.mode === 'shared') {
      S.accounts.set(S.uid, doc);
      const p = writeChain.then(() => S.caps.db.doc('accounts/' + S.uid).set(doc));
      writeChain = p.catch(() => {});
      p.catch((e) => {
        if (e && e.code === 'invalid_argument') goLocal(doc);
        else if (e && e.code === 'quota_exceeded') toast('The shared gallery is full, so this change was not saved.', 'bad');
        else toast('Could not save to the shared gallery. Your change may be lost if you reload.', 'bad', e && (e.code || e.message));
      });
      scheduleRefresh();
      return Promise.resolve();
    }
    S.localAccount = doc;
    if (!LS.set(KEY.account, doc) && S.storageOk) { S.storageOk = false; toast('This browser blocks storage, so your activity lasts until you close the page.', 'bad'); }
    scheduleRefresh();
    return Promise.resolve();
  }
  function goLocal(doc) {
    S.mode = 'local';
    S.accounts.delete(S.uid);
    S.localAccount = doc;
    LS.set(KEY.account, doc);
    toast('You can view the shared gallery but not write to it, so your activity is saved on this device.');
    scheduleRefresh();
  }
  async function putBlob(hash, code) {
    S.blobs.set(hash, code);
    if (S.mode === 'shared') {
      try { await S.caps.db.doc('blobs/' + hash).set({ code, size: code.length, ts: Date.now() }); return; }
      catch (e) { if (e && e.code === 'invalid_argument') goLocal(myDoc()); else throw new Error('Could not store the game file (' + (e.code || 'error') + ').'); }
    }
    if (!LS.set(KEY.blob + hash, code)) toast('Storage is full on this device; the game file is kept only until you close the page.', 'bad');
  }
  async function getBlob(hash) {
    if (!hash) return null;
    if (S.blobs.has(hash)) return S.blobs.get(hash);
    const st = S.starters.find((s) => s.hash === hash);
    if (st) return st.code;
    const local = LS.get(KEY.blob + hash);
    if (local) { S.blobs.set(hash, local); return local; }
    if (S.caps.db) {
      try {
        const snap = await S.caps.db.doc('blobs/' + hash).get();
        if (snap.exists) { const code = snap.data().code; S.blobs.set(hash, code); return code; }
      } catch (e) { /* fall through */ }
    }
    return null;
  }

  /* ---------------- world ---------------- */
  let refreshTimer = null, refreshing = false, refreshAgain = false;
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 30); }
  async function refresh() {
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    try {
      S.world = await C.buildWorld({ accounts: worldAccounts(), protocol: protocol(), starters: S.starters });
      renderHeader();
      renderView(false);
    } catch (e) { console.error(e); }
    refreshing = false;
    if (refreshAgain) { refreshAgain = false; scheduleRefresh(); }
  }

  /* ---------------- wallet ---------------- */
  async function useEmbedded(v) {
    const s = await C.ed.signer(C.b58dec(v.sk));
    S.wallet = { kind: 'embedded', label: 'GamePlay wallet', from: s.pk, pk: s.pk, sign: s.sign, secret: v.sk };
  }
  async function useSession(sess) {
    const s = await C.ed.signer(C.b58dec(sess.sk));
    S.wallet = { kind: 'injected', label: sess.label + ' · session key', from: sess.main, pk: s.pk, sign: s.sign, del: { m: sess.main, s: s.pk, exp: sess.exp, sig: sess.sig }, exp: sess.exp };
  }
  async function loadWallet() {
    const sess = LS.get(KEY.session);
    if (sess && sess.exp > Date.now() + 60000) { try { await useSession(sess); return; } catch (e) { /* ignore */ } }
    const v = LS.get(KEY.wallet);
    if (v && v.sk) { try { await useEmbedded(v); } catch (e) { /* ignore */ } }
  }
  async function registerWallet() {
    const doc = myDoc();
    doc.primary = S.wallet.from;
    doc.wallets[S.wallet.from] = doc.wallets[S.wallet.from] || { kind: S.wallet.kind, created: Date.now() };
    await saveMyDoc(doc);
  }
  async function createWallet(quiet) {
    const k = await C.ed.generate();
    const v = { sk: C.b58enc(k.secret64), created: Date.now() };
    if (!LS.set(KEY.wallet, v) && S.storageOk) { S.storageOk = false; }
    await useEmbedded(v);
    await registerWallet();
    toast(quiet ? 'Created a wallet for you: ' + short(S.wallet.from) + '. Your keys stay in this browser.' : 'Wallet created: ' + short(S.wallet.from) + '.');
    renderHeader();
  }
  async function ensureWallet() { if (!S.wallet) await createWallet(true); }
  function injectedProvider() {
    const w = window;
    if (w.phantom && w.phantom.solana) return { p: w.phantom.solana, name: 'Phantom' };
    if (w.solflare && w.solflare.isSolflare) return { p: w.solflare, name: 'Solflare' };
    if (w.backpack && w.backpack.solana) return { p: w.backpack.solana, name: 'Backpack' };
    if (w.solana && w.solana.signMessage) return { p: w.solana, name: 'Solana wallet' };
    return null;
  }
  async function connectInjected() {
    const inj = injectedProvider();
    if (!inj) { toast('No Solana wallet extension can reach this page. Use the GamePlay wallet instead.', 'bad'); return; }
    const res = await inj.p.connect();
    const pub = (res && res.publicKey) || inj.p.publicKey;
    const main = pub && (pub.toBase58 ? pub.toBase58() : String(pub));
    if (!main) throw new Error('The wallet did not share an address.');
    const k = await C.ed.generate();
    const sessionPk = C.b58enc(k.pub);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const out = await inj.p.signMessage(C.utf8(C.delegationMessage(main, sessionPk, exp)), 'utf8');
    const sigBytes = out && out.signature ? out.signature : out;
    const sess = { main, sk: C.b58enc(k.secret64), exp, sig: C.b58enc(new Uint8Array(sigBytes)), label: inj.name };
    LS.set(KEY.session, sess);
    await useSession(sess);
    await registerWallet();
    toast(inj.name + ' connected. A 7-day session key signs your game actions.');
    renderView(true);
  }
  async function importWallet(text) {
    const raw = String(text || '').trim();
    let bytes;
    if (raw.startsWith('[')) bytes = Uint8Array.from(JSON.parse(raw));
    else bytes = C.b58dec(raw);
    if (bytes.length !== 64) throw new Error('A Solana secret key is 64 bytes (base58 or a JSON byte array).');
    const pub = await C.ed.pubFromSeed(bytes.slice(0, 32));
    if (C.b58enc(pub) !== C.b58enc(bytes.slice(32))) throw new Error('That secret key does not match its public key.');
    const v = { sk: C.b58enc(bytes), created: Date.now() };
    LS.set(KEY.wallet, v); LS.del(KEY.session);
    await useEmbedded(v);
    await registerWallet();
    toast('Wallet imported: ' + short(S.wallet.from) + '.');
  }

  /* ---------------- transactions ---------------- */
  let lastTs = 0;
  async function signAndAppend(type, body) {
    if (!S.wallet) throw new Error('Create a wallet first.');
    const doc = myDoc();
    const n = doc.txs.filter((t) => t.from === S.wallet.from).length + 1;
    lastTs = Math.max(Date.now(), lastTs + 1);
    const tx = { id: C.randHex(8), t: type, from: S.wallet.from, pk: S.wallet.pk, ts: lastTs, n, b: body };
    if (S.wallet.del) tx.del = S.wallet.del;
    tx.sig = await S.wallet.sign(C.txMessage(tx));
    doc.txs.push(tx);
    doc.primary = S.wallet.from;
    doc.wallets[S.wallet.from] = doc.wallets[S.wallet.from] || { kind: S.wallet.kind, created: Date.now() };
    const w = await C.buildWorld({ accounts: worldAccounts(doc), protocol: protocol(), starters: S.starters });
    const rec = w.log.find((r) => r.tx.id === tx.id);
    if (!rec || !rec.ok) throw new Error(rec ? rec.why : 'Transaction rejected.');
    if (doc.txs.length > 600) toast('Your account is close to the prototype limit of 600 transactions.', 'bad');
    S.world = w;
    await saveMyDoc(doc);
    renderHeader();
    return { tx, rec };
  }
  async function ensureSparks(cost) {
    if (!cost) return;
    let w = myWallet();
    if (w && w.sparks >= cost) return;
    if (!w || !w.weeks.has(C.weekKey(Date.now()))) {
      await signAndAppend('spark_claim', {});
      toast('Claimed your ' + R.WEEKLY_SPARKS + ' free Sparks for this week.');
      w = myWallet();
      if (w && w.sparks >= cost) return;
    }
    throw new Error('You need ' + cost + ' Sparks. Buy a pack or convert GPLY in Wallet.');
  }
  const playThrottle = new Map();
  async function recordPlay(gid) {
    const now = Date.now();
    if ((playThrottle.get(gid) || 0) > now - 4000) return;
    playThrottle.set(gid, now);
    if (S.mode === 'shared' && !S.uid) return;
    const doc = myDoc();
    const p = doc.plays[gid] || { n: 0, f: now, l: now };
    p.n = (p.n || 0) + 1; p.l = now; p.f = p.f || now;
    doc.plays[gid] = p;
    await saveMyDoc(doc);
  }

  /* ---------------- players (sandboxed iframes) ---------------- */
  function mountPlayer(host, code, opts) {
    unmountPlayer(host.id);
    const seed = (C.randBytes(4).reduce((a, b) => a * 256 + b, 0)) >>> 0;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    frame.setAttribute('title', opts.title || 'Game');
    frame.setAttribute('allow', 'autoplay');
    frame.srcdoc = K.withSDK(code, seed, gameOpts());
    host.querySelectorAll('iframe').forEach((f) => f.remove());
    host.appendChild(frame);
    const player = { id: host.id, frame, seed, opts, running: false };
    S.players.set(host.id, player);
    return player;
  }
  function unmountPlayer(id) {
    const p = S.players.get(id);
    if (p) { try { p.frame.remove(); } catch (e) { /* ignore */ } S.players.delete(id); }
  }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__pp !== 1) return;
    for (const p of S.players.values()) {
      if (p.frame.contentWindow !== e.source) continue;
      if (d.t === 'score' && !p.running) { p.running = true; if (p.opts.onStart) p.opts.onStart(); }
      if (d.t === 'over') { if (!p.running && p.opts.onStart) p.opts.onStart(); p.running = false; }
      if (p.opts.onMessage) p.opts.onMessage(d, p);
    }
  });
  function fullscreen(id) {
    const el = $('#' + id);
    if (!el) return;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { toast('Fullscreen is not available here.'); return; }
    Promise.resolve(req.call(el)).catch(() => toast('Fullscreen is not available here.'));
  }

  /* ---------------- AI harness ---------------- */
  const H = window.PPHarness;
  /* Where AI builds run: inside Claude, the viewer's own account (`sample`); on a website served
     by server/server.mjs, that server (GP_SITE.ai is its build endpoint). */
  const aiReady = () => (ENV === 'claude' ? !!S.caps.sample : !!SITE.ai);
  function aiBuild(req, opts) {
    if (ENV === 'claude') return S.caps.sample(H.harnessPrompt(req.kind, req), Object.assign({ cache: false, modelTier: req.tier }, opts));
    return serverBuild(req, opts);
  }
  /* Streams a build from the GamePlay server: one JSON object per line ({t:'text'|'done'|'error'}). */
  async function serverBuild(req, opts) {
    const aborted = () => !!(opts.signal && opts.signal.aborted);
    let res;
    try {
      res = await fetch(SITE.ai, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal: opts.signal });
    } catch (e) {
      throw aborted() ? { code: 'cancelled' } : { code: 'offline', message: 'Could not reach the GamePlay server. Check your connection and try again.' };
    }
    if (!res.ok || !res.body) {
      let j = {};
      try { j = await res.json(); } catch (e) { /* not JSON */ }
      throw { code: j.code || (res.status === 429 ? 'rate_limited' : 'failed'), message: j.message || 'The build failed (' + res.status + '). Try again.' };
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', text = '', done = null;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const m = JSON.parse(line);
          if (m.t === 'text') { text += m.d; if (opts.onText) opts.onText({ text, delta: m.d }); }
          else if (m.t === 'done') done = m;
          else if (m.t === 'error') throw { code: m.code || 'failed', message: m.message };
        }
      }
    } catch (e) {
      if (aborted()) throw { code: 'cancelled' };
      throw e;
    }
    if (!done) throw { code: 'failed', message: 'The build stopped early. Try again.' };
    return { text, truncated: !!done.truncated };
  }
  function extractHTML(text) {
    let t = String(text || '').trim();
    const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fence && /<html|<!doctype/i.test(fence[1])) t = fence[1].trim();
    const i = t.search(/<!doctype html|<html/i);
    if (i > 0) t = t.slice(i);
    const j = t.toLowerCase().lastIndexOf('</html>');
    if (j > -1) t = t.slice(0, j + 7);
    if (!/<html|<!doctype/i.test(t) || t.length < 200) throw new Error('The reply did not contain a game file. Try again or simplify the idea.');
    t = t.replace(/\x3Cscript\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*\x3C\/script>/gi, '');
    return t;
  }
  function readMeta(code) {
    try {
      const d = new DOMParser().parseFromString(code, 'text/html');
      const m = (n) => { const el = d.querySelector('meta[name="' + n + '"]'); return el ? (el.getAttribute('content') || '').trim() : ''; };
      return { title: (d.title || '').trim().slice(0, 40), desc: m('description').slice(0, 200), genre: m('gameplay-genre').slice(0, 24), controls: m('gameplay-controls').slice(0, 140) };
    } catch (e) { return {}; }
  }
  const STYLES = H.STYLES, IDEAS = H.IDEAS, CRYPTO_IDEAS = H.CRYPTO_IDEAS;
  const ideaName = (t) => t.split(':')[0];

  /* ---------------- studio state ---------------- */
  function newStudio() {
    return {
      mode: aiReady() ? 'ai' : 'kit', kit: 'runner', params: K.normalizeParams('runner', { title: 'My Runner', palette: 'neon', shape: 'block' }),
      versions: [], vi: -1, chat: [], prompt: '', style: '', quality: 'default', brand: null,
      parent: null, title: '', desc: '', price: 0.05, cap: 0, busy: false, stream: null, error: null, lastRun: null,
    };
  }
  function loadStudio() {
    const st = LS.get(KEY.studio);
    S.studio = Object.assign(newStudio(), st || {}, { busy: false, stream: null });
    if (!aiReady() && S.studio.mode === 'ai' && !S.studio.versions.length) S.studio.mode = 'kit';
    S.studio.params = K.normalizeParams(S.studio.kit, S.studio.params);
  }
  let studioSaveTimer = null;
  function saveStudio() {
    clearTimeout(studioSaveTimer);
    studioSaveTimer = setTimeout(() => {
      const st = S.studio;
      const keep = { mode: st.mode, kit: st.kit, params: st.params, brand: st.brand, versions: st.versions.slice(-6), vi: Math.min(st.vi, 5), chat: st.chat.slice(-20), prompt: st.prompt, style: st.style, quality: st.quality, parent: st.parent, title: st.title, desc: st.desc, price: st.price, cap: st.cap };
      if (st.versions.length > 6) keep.vi = Math.max(-1, st.vi - (st.versions.length - 6));
      LS.set(KEY.studio, keep);
    }, 300);
  }
  function studioCode() {
    const st = S.studio;
    if (st.mode === 'kit') return K.kitDoc(st.kit, st.params);
    const v = st.versions[st.vi];
    return v ? v.code : null;
  }

  /* ---------------- rendering ---------------- */
  function renderHeader() {
    $$('.nav a').forEach((a) => { if (a.dataset.nav === S.route || (S.route === 'game' && a.dataset.nav === 'explore')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const chip = $('#wchip');
    if (!S.wallet) { chip.innerHTML = '<span class="dot off"></span><span>Get a wallet</span>'; return; }
    const w = myWallet();
    chip.innerHTML = '<span class="dot"></span><span class="addr">' + esc(short(S.wallet.from)) + '</span><span class="bal"><span title="devSOL">' + I.sol + fmtSOL(w ? w.sol : 0) + '</span><span title="Sparks">' + I.spark + fmtInt(w ? w.sparks : 0) + '</span><span title="GPLY">' + I.park + fmtInt(w ? w.park : 0) + '</span></span>';
  }
  function footHTML() {
    const where = S.mode === 'shared' ? 'Connected to the shared gallery'
      : S.hasDb ? 'View-only on the shared gallery; your activity stays on this device'
      : 'Running on this device only: your key, games and scores stay in this browser';
    return '<footer class="foot"><div class="foot-main"><b class="foot-mark">GAMEPLAY</b>'
      + '<p>An independent game maker on Solana. Not affiliated with Google or Google Labs Playground.</p>'
      + '<p>Devnet preview: transactions use real Ed25519 signatures on a simulated Solana ledger, and no real funds move. GPLY is a working name and is not for sale.</p></div>'
      + '<nav class="foot-links" aria-label="Footer"><a href="#explore" data-nav="explore">Play</a><a href="#create" data-nav="create">Make</a><a href="#business" data-nav="business">For business</a><a href="#economy" data-nav="economy">Economy</a>'
      + (BLUEPRINT_URL && ENV === 'claude' ? '<a href="' + esc(BLUEPRINT_URL) + '" target="_blank" rel="noopener">Read the blueprint</a>' : '')
      + '<button class="linkish" type="button" data-act="settings">Accessibility settings</button></nav>'
      + '<p class="foot-status">' + esc(where) + '</p></footer>';
  }
  function renderView(full) {
    const v = $('#view');
    const active = document.activeElement;
    const typing = active && v.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName);
    switch (S.route) {
      case 'game': {
        const g = S.world && S.world.games.get(S.arg);
        if (full || !$('#gp-screen') || (g && $('#gp-screen').dataset.gid !== g.gid)) mountGame();
        else if (g) updateGame(g);
        break;
      }
      case 'create':
        if (full || !$('#st-screen')) mountStudio(); else updateStudio();
        break;
      case 'home':
        if (full || !$('#home-screen')) mountHome(); else updateHome();
        break;
      case 'business':
        if (full || !$('#biz-screen')) mountBusiness();
        break;
      default:
        if (!full && typing) { S.ui.deferred = true; return; }
        v.innerHTML = S.route === 'wallet' ? viewWallet() : S.route === 'ledger' ? viewLedger() : S.route === 'economy' ? viewEconomy() : viewExplore();
    }
  }

  /* ---------- explore ---------- */
  function cartHTML(g) {
    const players = g.players ? g.players.size : 0;
    const tags = [];
    if (g.starter) tags.push('<span class="chip">Starter kit</span>');
    if (g.parent) tags.push('<span class="chip accent">Remix</span>');
    if (g.kit === 'ai') tags.push('<span class="chip">AI-built</span>');
    if (g.boost) tags.push('<span class="chip gold">' + I.park + ' ' + fmtInt(g.boost) + ' boost</span>');
    if (g.local) tags.push('<span class="chip">This device</span>');
    const price = g.starter ? 'Free' : g.price ? fmtSOL(g.price) + ' SOL' : 'Free collect';
    return '<a class="cart" href="#game-' + esc(g.gid) + '" data-act="open-game" data-gid="' + esc(g.gid) + '">'
      + '<div class="cart-body"><div class="cart-label">'
      + '<img src="' + K.cover(g) + '" alt="" width="480" height="300">'
      + '<div class="cart-title">' + esc(g.title) + '</div>'
      + '<div class="cart-by"><span>by <b>' + esc(nameOf(g.creator)) + '</b></span><span>' + esc(price) + '</span></div>'
      + '<div class="cart-tags">' + tags.join('') + '</div>'
      + '<div class="cart-serial"><span>' + serial(g.hash) + '</span><span>' + plural(players, 'player') + '</span></div>'
      + '</div><div class="cart-grip"></div></div></a>';
  }
  const SORTS = [['new', 'Newest'], ['played', 'Most played'], ['earning', 'Top earning'], ['remixed', 'Most remixed'], ['boosted', 'Boosted']];
  function viewExplore() {
    const w = S.world;
    const starters = S.starters.map((s) => (w && w.games.get(s.gid)) || Object.assign({ creator: C.STARTER, starter: true, players: new Set(), collects: [] }, s));
    let community = w ? [...w.games.values()].filter((g) => !g.starter && !g.delisted) : [];
    const by = {
      new: (a, b) => b.ts - a.ts,
      played: (a, b) => (b.players.size - a.players.size) || (b.plays - a.plays),
      earning: (a, b) => (b.revenue - a.revenue) || (b.collects.length - a.collects.length),
      remixed: (a, b) => (b.remixes.length - a.remixes.length) || (b.ts - a.ts),
      boosted: (a, b) => (b.boost - a.boost) || (b.ts - a.ts),
    }[S.ui.sort];
    community = community.sort(by);
    const totalPlayers = w ? new Set([].concat(...[...w.games.values()].map((g) => [...g.players]))).size : 0;
    const sigs = w ? w.log.filter((r) => r.ok).length : 0;
    return '<section class="page-head"><div class="stack">'
      + '<p class="eyebrow">Arcade</p><h1>Play any game free</h1>'
      + '<p class="lede">Open a cartridge and play in your browser. Your best runs are signed to the leaderboard. Slower game speed, sound and contrast are in <button class="linkish" type="button" data-act="settings">Accessibility settings</button>.</p></div>'
      + '<div class="facts"><div class="fact"><b>' + fmtInt(w ? [...w.games.values()].filter((g) => !g.starter).length : 0) + '</b><span>community cartridges</span></div><div class="fact"><b>' + fmtInt(totalPlayers) + '</b><span>' + (totalPlayers === 1 ? 'unique player' : 'unique players') + '</span></div><div class="fact"><b>' + fmtInt(sigs) + '</b><span>signed transactions</span></div></div>'
      + '</section>'
      + '<section class="section"><div class="section-head"><h2>Starter cartridges</h2><p class="muted">Free to play. Open one and press Remix to tune it.</p></div>'
      + '<div class="shelf">' + starters.map(cartHTML).join('') + '</div></section>'
      + '<section class="section"><div class="section-head"><h2>Community cartridges</h2><div class="row" role="group" aria-label="Sort community cartridges">'
      + SORTS.map(([k, l]) => '<button class="chip" type="button" data-act="sort" data-sort="' + k + '" aria-pressed="' + (S.ui.sort === k) + '">' + l + '</button>').join('')
      + '</div></div>'
      + (community.length ? '<div class="shelf">' + community.map(cartHTML).join('') + '</div>'
        : '<div class="empty"><h3>No community cartridges yet</h3><p>Publish the first one: describe a game or tune a starter kit, then sign it with your wallet.</p><a class="btn primary" href="#create" data-nav="create">Open Create</a></div>')
      + '</section>' + footHTML();
  }

  /* ---------- home: the public front door ---------- */
  const PLAYGROUND_SOURCES = [
    ['Gizmodo', 'https://gizmodo.com/googles-new-playground-aims-to-make-it-easy-to-vibe-code-a-game-right-in-your-browser-2000822955'],
    ['Nerdzap', 'https://nerdzap.com/news/google-playground-ai-game-maker-uk-roblox-build/'],
  ];
  const ROADMAP = [
    { name: 'Validate', now: true, what: 'This preview, creator interviews and tuning the AI studio', gate: '40% of testers publish a game' },
    { name: 'Devnet alpha', what: 'Solana programs and passkey wallets, still with no real money', gate: 'Security audit passed and reports handled within 24 hours' },
    { name: 'Mainnet beta', what: 'USDC collects, royalties and tips, plus free tournaments', gate: 'A legal opinion on GPLY' },
    { name: 'Economy', what: 'Points convert to GPLY, weekly rewards and human checks against bots', gate: 'Fees cover rewards four weeks running' },
    { name: 'Scale', what: 'A developer SDK and export, a mobile app and a multiplayer kit' },
  ];
  const FAQ = [
    ['Is GamePlay free?', 'Yes. Playing, making and publishing are free. Every week you get ' + R.WEEKLY_SPARKS + ' Sparks for AI builds, and you earn ' + R.SPARKS_PER_PLAYER + ' more for each new player who tries one of your games.'],
    ['Do I need a crypto wallet?', 'No. The first time you score or publish, GamePlay creates a wallet key in your browser. You can connect Phantom, Solflare or Backpack later, or export the key from Wallet.'],
    ['Is this real money?', 'Not yet. This preview runs on Solana devnet, so SOL balances are test tokens. GPLY is the working name of a future reward token. Nothing is for sale and there is no presale.'],
    ['Who can use it?', 'Anyone with a modern browser, in any country. When real-money features arrive they will follow local rules, including age checks where the law requires them.'],
    ['Is GamePlay made by Google?', 'No. GamePlay is an independent project. It is not affiliated with Google or with Google Labs Playground.'],
    ['Can I keep my game?', 'Yes. Every game is one HTML file. Download it from its page and it plays offline in any browser, with no GamePlay account.'],
    ['How are leaderboards kept fair?', 'Each score is signed by the player’s key and tied to the exact game file, with a seed and an input log so a suspicious run can be checked. Runs in assist mode stay off ranked boards.'],
    ['Where is my data stored?', 'In this preview your wallet key, games and scores stay in your browser on this device. Clearing site data removes them, so export your key from Wallet if you want to keep it.'],
    ['How do I report a game?', 'Open the game and press Report. Moderators can delist it, and the signed record stays on the ledger.'],
  ];
  function specTable() {
    const rows = [
      ['Who can use it', 'US only, 18+, with a Google sign-in', 'Anyone, anywhere, with no sign-up to play or make'],
      ['Cost of making', 'Weekly token allowance; more with Google One', R.WEEKLY_SPARKS + ' free Sparks a week, plus ' + R.SPARKS_PER_PLAYER + ' for every new player you bring'],
      ['Ownership', 'Hosted on Google’s platform', 'A signed game file you can download and host anywhere'],
      ['Creator earnings', 'None announced', 'Collects, tips, remix royalties and weekly rewards'],
      ['Leaderboards', 'Play Games profile, in select genres', 'Wallet-signed scores tied to the exact game file'],
      ['Sharing', 'No outside links; built-in Social Links only', 'Share a link anywhere or download the file'],
    ];
    return '<div class="spec"><table><caption class="sr">GamePlay compared with Google Labs Playground</caption><thead><tr><th scope="col"><span class="sr">Feature</span></th><th scope="col">Google Labs Playground</th><th scope="col">GamePlay</th></tr></thead><tbody>'
      + rows.map(([k, a, b]) => '<tr><th scope="row">' + esc(k) + '</th><td class="them">' + esc(a) + '</td><td class="us">' + esc(b) + '</td></tr>').join('')
      + '</tbody></table></div>';
  }
  function startersList() {
    const w = S.world;
    return S.starters.map((s) => (w && w.games.get(s.gid)) || Object.assign({ creator: C.STARTER, starter: true, players: new Set(), collects: [] }, s));
  }
  function homeShelf() {
    const w = S.world;
    const community = w ? [...w.games.values()].filter((g) => !g.starter && !g.delisted).sort((a, b) => (b.players.size - a.players.size) || (b.ts - a.ts)).slice(0, 3) : [];
    return community.concat(startersList()).slice(0, 8).map(cartHTML).join('');
  }
  function homeHTML() {
    const hero = S.starters.find((s) => s.gid === 'kit-neon-dash');
    const creatorBps = 10000 - R.FEE_BPS - R.PARENT_BPS - R.GRAND_BPS;
    const seg = [['you', 'You, the remixer', creatorBps], ['parent', 'Creator of the game you remixed', R.PARENT_BPS], ['grand', 'Creator one step further back', R.GRAND_BPS], ['fee', 'GamePlay protocol fee', R.FEE_BPS]];
    const solOf = (bps) => (bps / 10000).toFixed(2);
    return '<section class="hero" aria-labelledby="hero-title"><div class="hero-copy">'
      + '<p class="eyebrow">Free game maker · Built on Solana</p>'
      + '<h1 class="hero-title" id="hero-title"><span>Make it.</span> <span>Play it.</span> <span class="hl">Own it.</span></h1>'
      + '<p class="lede">GamePlay lets anyone make a browser game in minutes, share it with a link, and earn when people play, collect or remix it. There is nothing to install, no sign-up, and it runs on any phone.</p>'
      + '<div class="row cta"><a class="btn primary big" href="#explore" data-nav="explore">' + I.play + ' Play a game</a><a class="btn big" href="#create" data-nav="create">Make a game</a></div>'
      + '<ul class="ticks"><li>Free to play and make</li><li>No sign-up or wallet needed</li><li>Phone, tablet or computer</li><li>Keyboard, touch and assist mode</li></ul>'
      + '<p class="fine">Preview on Solana devnet: balances are test tokens and nothing is for sale.</p></div>'
      + '<figure class="console"><div class="console-bar"><span class="led" aria-hidden="true"></span><span>Now playing</span><span class="serial">' + serial(hero ? hero.hash : '') + '</span></div>'
      + '<div class="screen" id="home-screen" data-gid="kit-neon-dash"' + (hero ? ' style="background:#05070a url(' + K.cover(Object.assign({ creator: C.STARTER }, hero)) + ') center/cover"' : '') + '></div>'
      + '<figcaption class="console-cap"><span><b>Neon Dash</b> · Tap the game, or press Tab to reach it and Space to jump.</span><a href="#game-kit-neon-dash" data-act="open-game" data-gid="kit-neon-dash">Leaderboard</a></figcaption></figure></section>'

      + '<section class="strip" aria-label="GamePlay at a glance">'
      + '<div><b>' + Object.keys(K.KITS).length + '</b><span>game kits to start from</span></div>'
      + '<div><b>' + R.WEEKLY_SPARKS + '</b><span>free Sparks for AI builds every week</span></div>'
      + '<div><b>' + pct(10000 - R.FEE_BPS) + '</b><span>of every collect goes to the creator of an original game</span></div>'
      + '<div><b>1 file</b><span>is a whole game, so you can keep it forever</span></div></section>'

      + '<section class="section" aria-labelledby="h-crypto"><div class="section-head"><h2 id="h-crypto">Make a crypto game from one sentence</h2><a href="#create" data-nav="create">Open the AI studio</a></div>'
      + '<p class="muted">Describe it in plain words and Claude builds the whole game, ready to play, publish on Solana devnet and share. Start from one of these:</p>'
      + '<div class="row">' + CRYPTO_IDEAS.map((t) => '<button class="btn small" type="button" data-act="home-idea" data-idea="' + esc(t) + '" title="' + esc(t) + '">' + esc(ideaName(t)) + '</button>').join('') + '</div></section>'

      + '<section class="section" aria-labelledby="h-carts"><div class="section-head"><h2 id="h-carts">Pick a cartridge</h2><a href="#explore" data-nav="explore">See the whole arcade</a></div>'
      + '<p class="muted">Every game here is free to play and free to remix.</p><div class="shelf" id="home-shelf">' + homeShelf() + '</div></section>'

      + '<section class="section" aria-labelledby="h-ways"><div class="section-head"><h2 id="h-ways">Three ways in</h2></div><div class="ways">'
      + '<article class="way"><p class="eyebrow">Players</p><h3>Play</h3><p>Play any game free. Your best scores are signed to a public leaderboard, and top players share the weekly reward pool.</p><a class="btn" href="#explore" data-nav="explore">Browse the arcade</a></article>'
      + '<article class="way"><p class="eyebrow">Creators</p><h3>Make</h3><p>Tune one of five game kits in a minute, or describe a new game to the AI studio. Publishing is free, and the result is one file you own.</p><a class="btn" href="#create" data-nav="create">Open the maker</a></article>'
      + '<article class="way"><p class="eyebrow">Brands, communities, schools</p><h3>Bring it to your crowd</h3><p>Branded mini-games, playable quests with checkable winners, and game-making workshops.</p><a class="btn" href="#business" data-nav="business">GamePlay for business</a></article>'
      + '</div></section>'

      + '<section class="section" aria-labelledby="h-steps"><div class="section-head"><h2 id="h-steps">From idea to published game</h2></div><ol class="steps">'
      + '<li><b>Start from a kit or a sentence</b><p>Pick Runner, Flapper, Shooter, Breaker or Dodger and tune speed, gravity and colors. Or describe a new game to the AI studio.</p></li>'
      + '<li><b>Play-test as you go</b><p>The preview restarts with every change. Each game works with touch, mouse and keyboard.</p></li>'
      + '<li><b>Publish and sign</b><p>Your wallet signs the game’s fingerprint, so anyone can check it was not changed. You set the collect price and the number of editions.</p></li>'
      + '<li><b>Earn as it spreads</b><p>New players bring you Sparks, collectors pay you SOL, and every remix of your game pays you a share.</p></li>'
      + '</ol></section>'

      + '<section class="section" aria-labelledby="h-earn"><div class="section-head"><h2 id="h-earn">How creators earn</h2><a href="#economy" data-nav="economy">Full economy</a></div><div class="earn">'
      + '<div class="panel stack"><p class="eyebrow">Someone collects a remix of a remix for 1 SOL</p>'
      + '<div class="splitbar" role="img" aria-label="' + esc(seg.map(([, l, b]) => l + ' ' + pct(b)).join(', ')) + '">' + seg.map(([k, , b]) => '<i class="seg-' + k + '" style="flex:' + b + '"></i>').join('') + '</div>'
      + '<ul class="legend">' + seg.map(([k, l, b]) => '<li><i class="seg-' + k + '" aria-hidden="true"></i><span>' + esc(l) + '</span><b class="num">' + solOf(b) + ' SOL</b></li>').join('') + '</ul>'
      + '<p class="muted">An original game keeps ' + pct(10000 - R.FEE_BPS) + '. Tips go 100% to the creator.</p></div>'
      + '<ul class="earn-list">'
      + '<li><b>Collects</b><span>Fans pay to own a numbered edition. The game stays free to play for everyone.</span></li>'
      + '<li><b>Tips</b><span>Players can tip any creator, and the whole tip goes to them.</span></li>'
      + '<li><b>Remix royalties</b><span>' + pct(R.PARENT_BPS) + ' of a remix’s collects goes to the original creator and ' + pct(R.GRAND_BPS) + ' to the one before.</span></li>'
      + '<li><b>Weekly rewards</b><span>' + Math.round(R.CREATOR_SHARE * 100) + '% of each week’s GPLY goes to creators, by unique players. ' + Math.round(R.PLAYER_SHARE * 100) + '% goes to players, by leaderboard places.</span></li>'
      + '<li><b>Sparks</b><span>' + R.SPARKS_PER_PLAYER + ' Sparks for each new player of your game, up to ' + R.SPARKS_PLAYER_CAP + ' players per game.</span></li>'
      + '</ul></div><p class="fine">On devnet these are test balances. Real payouts start at mainnet beta, after a security audit.</p></section>'

      + '<section class="section" aria-labelledby="h-compare"><div class="section-head"><h2 id="h-compare">GamePlay and Google Labs Playground</h2></div>'
      + '<p class="muted">Google Labs launched Playground on October 7, 2026. Here is how the two compare.</p>'
      + '<div class="table-scroll">' + specTable() + '</div>'
      + '<p class="fine">Playground details as reported in October 2026: ' + PLAYGROUND_SOURCES.map(([n, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(n) + '</a>').join(', ') + '.</p></section>'

      + '<section class="section access" aria-labelledby="h-access"><div class="section-head"><h2 id="h-access">Built for every player</h2><button class="btn" type="button" data-act="settings">Open accessibility settings</button></div>'
      + '<p class="muted">These settings work across the site and inside every game.</p><ul class="feature-grid">'
      + '<li><b>Assist mode</b><span>Slow any game to 75% or 50% speed. Assisted runs count as personal results and stay off ranked leaderboards.</span></li>'
      + '<li><b>One-button friendly</b><span>Runner and Flapper play with a single key or tap. Every kit works with keyboard, touch or mouse.</span></li>'
      + '<li><b>Calm motion</b><span>Turn off screen shake and page animations, or follow your device’s reduced-motion setting.</span></li>'
      + '<li><b>High contrast, larger text</b><span>A black-and-yellow high-contrast theme and three text sizes.</span></li>'
      + '<li><b>Screen reader support</b><span>Labeled controls, focus that moves to each new page, and a spoken score when a run ends.</span></li>'
      + '<li><b>Light on data</b><span>One small page with no tracking scripts. Games are single files you can download and play offline.</span></li>'
      + '</ul></section>'

      + '<section class="section" aria-labelledby="h-road"><div class="section-head"><h2 id="h-road">Roadmap</h2></div>'
      + '<p class="muted">Fun first, money second, the token last. Each stage opens when the checkpoint before it is met, not on a date.</p><ol class="road">'
      + ROADMAP.map((s, i) => '<li class="stage' + (s.now ? ' now' : '') + '"><div class="stage-top"><span class="stage-n">Stage ' + (i + 1) + '</span>' + (s.now ? '<span class="chip accent">We are here</span>' : '') + '</div><b>' + esc(s.name) + '</b><p>' + esc(s.what) + '</p>' + (s.gate ? '<p class="gate"><span>Checkpoint</span>' + esc(s.gate) + '</p>' : '') + '</li>').join('')
      + '</ol></section>'

      + '<section class="section" aria-labelledby="h-faq"><div class="section-head"><h2 id="h-faq">Questions</h2></div><div class="faq">'
      + FAQ.map(([q, a]) => '<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>').join('')
      + '</div></section>';
  }
  function mountHome() {
    unmountPlayer('home-screen');
    $('#view').innerHTML = homeHTML() + footHTML();
    const host = $('#home-screen');
    const hero = S.starters.find((s) => s.gid === 'kit-neon-dash');
    if (!host || !hero) return;
    mountPlayer(host, hero.code, {
      title: 'Neon Dash, a playable runner game',
      onStart: () => recordPlay(hero.gid).catch(() => {}),
      onMessage: (d, p) => { if (d.t === 'over') onGameOver(hero.gid, d, p).catch((e) => toast(e.message, 'bad')); },
    });
  }
  function updateHome() { const s = $('#home-shelf'); if (s) s.innerHTML = homeShelf(); }

  /* ---------- business: services for brands, communities and schools ---------- */
  const BIZ_DEMO = { title: 'Kape Dash', palette: 'custom', colors: { bg: '#2b1a12', main: '#f2c48d', alt: '#d9480f' }, shape: 'orb' };
  const OFFERS = [
    { name: 'Branded mini-game', who: 'For shops, brands and events', items: ['Your colors, name and prize in a game kit, or a custom game', 'One link that opens on any phone', 'A leaderboard and a results summary at the end'] },
    { name: 'Playable quest', who: 'For crypto projects and online communities', items: ['A game built around your project', 'Wallet-signed scores tied to the exact game file', 'A verified winners list, and you send the rewards from your own wallet'] },
    { name: 'Game-making workshop', who: 'For schools, bootcamps and team events', items: ['Everyone makes and publishes a game in one session', 'Kits for beginners and the AI studio for advanced groups', 'A class arcade that keeps everyone’s games'] },
  ];
  function contactHTML() {
    const c = String(SITE.contact || '').trim();
    if (!c) return '';
    if (/^https:\/\//i.test(c)) return '<a class="btn big" href="' + esc(c) + '" target="_blank" rel="noopener">Talk to us</a>';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return '<span class="contact">Email us at <b class="mono" id="contact-addr">' + esc(c) + '</b><button class="btn small ghost" type="button" data-act="copy-contact">Copy</button></span>';
    return '';
  }
  function bizHTML() {
    const contact = contactHTML();
    return '<section class="hero biz" aria-labelledby="biz-title"><div class="hero-copy">'
      + '<p class="eyebrow">GamePlay for business</p><h1 class="page-title" id="biz-title">Games your audience plays from a link</h1>'
      + '<p class="lede">We build branded mini-games for brands, crypto communities and classrooms. Players need no app and no sign-up, and you get a leaderboard you can check.</p>'
      + '<div class="row cta"><button class="btn primary big" type="button" data-act="brand-demo">Make a branded demo</button>' + contact + '</div>'
      + '<p class="fine">The demo takes about a minute: pick your colors, rename the game and play it.</p></div>'
      + '<figure class="console"><div class="console-bar"><span class="led" aria-hidden="true"></span><span>Example build</span><span class="serial">Your colors here</span></div>'
      + '<div class="screen" id="biz-screen"></div>'
      + '<figcaption class="console-cap"><span><b>' + esc(BIZ_DEMO.title) + '</b> · A branded runner for a made-up coffee shop, in its own colors.</span></figcaption></figure></section>'

      + '<section class="section" aria-labelledby="h-offers"><div class="section-head"><h2 id="h-offers">What we build</h2></div><div class="ways">'
      + OFFERS.map((o) => '<article class="way"><p class="eyebrow">' + esc(o.who) + '</p><h3>' + esc(o.name) + '</h3><ul class="ticks small">' + o.items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></article>').join('')
      + '</div></section>'

      + '<section class="section" aria-labelledby="h-process"><div class="section-head"><h2 id="h-process">How a project runs</h2></div><ol class="steps">'
      + '<li><b>Brief</b><p>Tell us who will play, what you want them to do and what they can win.</p></li>'
      + '<li><b>Prototype</b><p>Play a first version in your colors and ask for changes.</p></li>'
      + '<li><b>Launch</b><p>Share one link. Players start with a tap, on any device.</p></li>'
      + '<li><b>Results</b><p>Get the leaderboard, the winners list and play counts.</p></li>'
      + '</ol></section>'

      + '<section class="section" aria-labelledby="h-why"><div class="section-head"><h2 id="h-why">Why it works for campaigns</h2></div><ul class="feature-grid">'
      + '<li><b>Nothing to install</b><span>No app and no sign-up, so people start playing as soon as they open the link.</span></li>'
      + '<li><b>Scores you can check</b><span>Each score is signed and tied to the exact game file, with a seed and input log for spot checks.</span></li>'
      + '<li><b>You keep the game</b><span>It is one HTML file. Host it on your own site, or keep it on GamePlay.</span></li>'
      + '<li><b>Accessible by default</b><span>Assist mode, keyboard play, high contrast and larger text are built in.</span></li>'
      + '<li><b>Rewards stay with you</b><span>For token or NFT prizes, we hand you the verified winners and you pay them from your own wallet.</span></li>'
      + '<li><b>Fair play rules</b><span>Assisted runs stay off ranked boards, and every result can be traced to a signed run.</span></li>'
      + '</ul></section>'

      + '<section class="section closing" aria-labelledby="h-start"><div class="panel stack"><h2 id="h-start">Start with a demo</h2>'
      + '<p>Make a branded game in a minute, then publish it to get a link you can share with your team.</p>'
      + '<div class="row"><button class="btn primary" type="button" data-act="brand-demo">Make a branded demo</button>' + contact + '</div></div></section>';
  }
  function mountBusiness() {
    unmountPlayer('biz-screen');
    $('#view').innerHTML = bizHTML() + footHTML();
    const host = $('#biz-screen'); if (!host) return;
    mountPlayer(host, K.kitDoc('runner', BIZ_DEMO), {
      title: 'Kape Dash, an example branded game',
      onMessage: (d) => { if (d.t === 'over') announce('Game over. Score ' + fmtInt(d.v || 0) + '.'); },
    });
  }

  /* ---------- game page ---------- */
  function gameChips(g) {
    const out = ['<span class="chip">' + esc(g.genre || 'Arcade') + '</span>', '<span class="chip">' + (g.kit === 'ai' ? 'AI-built' : esc((K.KITS[g.kit] || {}).name || g.kit) + ' kit') + '</span>', '<span class="chip">' + serial(g.hash) + '</span>'];
    if (g.parent) { const p = S.world.games.get(g.parent); if (p) out.push('<a class="chip accent" href="#game-' + esc(p.gid) + '" data-act="open-game" data-gid="' + esc(p.gid) + '">Remix of ' + esc(p.title) + '</a>'); }
    if (g.delisted) out.push('<span class="chip bad">Delisted</span>');
    if (g.local) out.push('<span class="chip">Saved on this device</span>');
    if (!g.starter) out.push('<span class="chip">by ' + esc(nameOf(g.creator)) + '</span>');
    return out.join('');
  }
  function gameActions(g) {
    const btn = (act, label, cls, extra) => '<button class="btn ' + (cls || '') + '" type="button" data-act="' + act + '" data-gid="' + esc(g.gid) + '"' + (extra || '') + '>' + label + '</button>';
    const out = [];
    if (!g.starter) {
      const mine = S.wallet && g.collects.find((c) => c.pk === S.wallet.from);
      const soldOut = g.cap && g.collects.length >= g.cap;
      if (mine) out.push('<span class="chip ok">' + I.ok + ' You own edition #' + mine.edition + '</span>');
      else out.push(btn('collect', soldOut ? 'Sold out' : 'Collect · ' + (g.price ? fmtSOL(g.price) + ' SOL' : 'free'), 'primary', soldOut || g.delisted ? ' disabled' : ''));
      out.push(btn('tip', 'Tip creator'));
    }
    out.push(btn('remix', 'Remix', g.starter ? 'primary' : ''));
    if (!g.starter) out.push(btn('boost', 'Boost'));
    out.push(btn('fullscreen', 'Fullscreen', 'ghost'));
    out.push(btn('view-code', 'View code', 'ghost'));
    if (canDownload()) out.push(btn('download', 'Download .html', 'ghost'));
    if (!g.starter) out.push(btn('report', 'Report', 'ghost'));
    if (!g.starter && canModerate()) out.push(btn('delist', g.delisted ? 'Relist' : 'Delist', 'danger'));
    return out.join('');
  }
  function gameAbout(g) {
    const players = g.players ? g.players.size : 0;
    const facts = [[fmtInt(players), 'unique players'], [fmtInt(g.plays), 'runs'], [fmtInt(g.scores.size), 'signed scores']];
    if (!g.starter) facts.push([fmtInt(g.collects.length) + (g.cap ? ' / ' + fmtInt(g.cap) : ''), 'editions owned'], [fmtSOL(g.revenue), 'SOL earned'], [fmtInt(g.remixes.length), 'remixes']);
    if (g.reports && g.reports.length) facts.push([fmtInt(g.reports.length), 'reports']);
    return '<div class="stack">' + (g.desc ? '<p>' + esc(g.desc) + '</p>' : '')
      + (g.prompt ? '<p class="muted">Prompt: “' + esc(g.prompt) + '”</p>' : '')
      + '<div class="facts">' + facts.map(([b, s]) => '<div class="fact"><b>' + b + '</b><span>' + s + '</span></div>').join('') + '</div></div>';
  }
  const TABS = [['board', 'Leaderboard'], ['cart', 'Cartridge'], ['splits', 'Splits'], ['family', 'Remixes']];
  function gamePanel(g) {
    const tab = S.ui.tab;
    if (tab === 'board') {
      const rows = [...g.scores.values()].sort((a, b) => b.score - a.score).slice(0, 25);
      const me = S.wallet && g.scores.get(S.wallet.from);
      return '<div class="stack"><p class="muted" style="font-size:0.875rem">Each score is signed by the player’s wallet and bound to this exact file (' + serial(g.hash) + '). Prize tournaments add replay checks first.</p>'
        + (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Player</th><th class="r">Score</th><th>Proof</th></tr></thead><tbody>'
          + rows.map((s, i) => '<tr' + (me && s.pk === me.pk ? ' style="font-weight:700"' : '') + '><td class="n">' + (i + 1) + '</td><td>' + esc(nameOf(s.pk)) + '<br><span class="mono muted">' + esc(short(s.pk)) + '</span></td><td class="n">' + fmtInt(s.score) + '</td><td><span class="chip ok" title="Signature ' + esc(s.sig) + '">' + I.ok + ' signed</span></td></tr>').join('')
          + '</tbody></table></div>' : '<div class="empty"><h2>No scores yet</h2><p>Finish a run. Your first score is signed automatically.</p></div>')
        + '</div>';
    }
    if (tab === 'cart') {
      const v = S.ui.verify[g.gid];
      return '<div class="stack"><dl class="kv">'
        + '<dt>Content hash</dt><dd class="hash">' + esc(g.hash) + '</dd>'
        + '<dt>Size</dt><dd>' + fmtInt(g.size) + ' bytes</dd>'
        + '<dt>Stored at</dt><dd class="hash">' + (g.starter ? 'Built into GamePlay' : 'blobs/' + esc(g.hash.slice(0, 16)) + '… (content-addressed; Arweave in production)') + '</dd>'
        + '<dt>Creator</dt><dd>' + esc(nameOf(g.creator)) + (g.starter ? '' : '<br><span class="hash">' + esc(g.creator) + '</span>') + '</dd>'
        + (g.starter ? '' : '<dt>Published</dt><dd>' + when(g.ts) + '</dd><dt>Signature</dt><dd class="hash">' + esc(g.sig) + '</dd>')
        + '<dt>Source</dt><dd>' + (g.kit === 'ai' ? 'AI-built from a prompt' : esc((K.KITS[g.kit] || {}).name || g.kit) + ' kit with tuned parameters') + '</dd>'
        + '</dl><div class="row"><button class="btn small" type="button" data-act="verify" data-gid="' + esc(g.gid) + '">Verify file and signature</button>'
        + (v ? (v.ok ? '<span class="chip ok">' + I.ok + ' ' + esc(v.msg) + '</span>' : '<span class="chip bad">' + I.no + ' ' + esc(v.msg) + '</span>') : '') + '</div></div>';
    }
    if (tab === 'splits') {
      if (g.starter) return '<p class="muted">Starter kits are free and have no owner, so nothing is split. Remix one and the cartridge is yours.</p>';
      const price = g.price || C.LAMPORTS / 10;
      const splits = C.collectSplits(price, g, S.world.games);
      const label = { creator: 'Creator', parent: 'Parent creator', grandparent: 'Grandparent', protocol: 'Protocol fee' };
      return '<div class="stack"><p class="muted" style="font-size:0.875rem">How one collect at ' + fmtSOL(price) + ' SOL splits' + (g.price ? '' : ' (example price; this game is a free collect)') + '. Tips go 100% to the creator.</p><div class="bars">'
        + splits.map((s) => '<div class="bar"><span>' + label[s.role] + (s.to !== C.TREASURY ? '<br><span class="mono muted">' + esc(nameOf(s.to)) + '</span>' : '') + '</span><i class="' + (s.role === 'protocol' ? 'f' : s.role === 'creator' ? '' : 'p') + '" style="width:' + Math.max(2, s.amt / price * 100) + '%"></i><em>' + Math.round(s.amt / price * 100) + '%</em></div>').join('')
        + '</div><dl class="kv"><dt>Collected</dt><dd>' + fmtInt(g.collects.length) + ' editions' + (g.cap ? ' of ' + fmtInt(g.cap) : ', open edition') + '</dd><dt>Tips</dt><dd>' + fmtSOL(g.tips.reduce((a, t) => a + t.amt, 0)) + ' SOL from ' + fmtInt(g.tips.length) + '</dd><dt>Earned</dt><dd>' + fmtSOL(g.revenue) + ' SOL, including royalties from remixes</dd></dl></div>';
    }
    const chain = [];
    let cur = g;
    while (cur && cur.parent) { const p = S.world.games.get(cur.parent); if (!p) break; chain.unshift(p); cur = p; }
    const kids = g.remixes.map((id) => S.world.games.get(id)).filter(Boolean);
    const link = (x) => '<a href="#game-' + esc(x.gid) + '" data-act="open-game" data-gid="' + esc(x.gid) + '">' + esc(x.title) + ' <span class="mono muted">' + esc(nameOf(x.creator)) + '</span></a>';
    return '<div class="stack"><p class="eyebrow">Lineage</p><div class="lineage">' + (chain.length ? chain.map((x) => link(x) + '<span class="pipe"></span>').join('') : '<span class="muted">Original cartridge</span><span class="pipe"></span>') + '<strong>' + esc(g.title) + '</strong></div>'
      + '<p class="eyebrow" style="margin-top:8px">Remixed into</p>' + (kids.length ? '<div class="lineage">' + kids.map(link).join('') + '</div>' : '<p class="muted">No remixes yet. Remix it and the original creator earns ' + pct(R.PARENT_BPS) + ' of your collects.</p>') + '</div>';
  }
  async function mountGame() {
    const g = S.world && S.world.games.get(S.arg);
    const v = $('#view');
    unmountPlayer('gp-screen');
    if (!g) {
      v.innerHTML = '<div class="empty"><h1>' + (S.world ? 'Cartridge not found' : 'Loading GamePlay…') + '</h1><p>' + (S.world ? 'It may have been published on another device, or it is still syncing.' : '') + '</p><a class="btn" href="#explore" data-nav="explore">Back to Explore</a></div>';
      return;
    }
    v.innerHTML = '<div class="gp-head"><a href="#explore" data-nav="explore">← Explore</a><h1>' + esc(g.title) + '</h1><div class="row" id="gp-chips">' + gameChips(g) + '</div></div>'
      + '<div class="gp-grid"><div class="gp-main"><div class="screen" id="gp-screen" data-gid="' + esc(g.gid) + '" style="background:#05070a url(' + K.cover(g) + ') center/cover"></div>'
      + '<div class="toolbar" id="gp-actions">' + gameActions(g) + '</div><div id="gp-about">' + gameAbout(g) + '</div></div>'
      + '<aside class="gp-side"><div class="tabs" role="tablist" id="gp-tabs">' + TABS.map(([k, l]) => '<button role="tab" type="button" data-act="tab" data-tab="' + k + '" aria-selected="' + (S.ui.tab === k) + '">' + l + '</button>').join('') + '</div><div class="panel" id="gp-panel">' + gamePanel(g) + '</div></aside></div>' + footHTML();
    const code = await getBlob(g.hash);
    const host = $('#gp-screen');
    if (!host || host.dataset.gid !== g.gid) return;
    if (!code) { host.innerHTML = '<div class="screen-cover" style="cursor:default"><span>The game file is not available on this device.</span></div>'; return; }
    mountPlayer(host, code, {
      title: g.title,
      onStart: () => recordPlay(g.gid).catch(() => {}),
      onMessage: (d, p) => { if (d.t === 'over') onGameOver(g.gid, d, p).catch((e) => toast(e.message, 'bad')); if (d.t === 'error') toast('This game reported an error: ' + d.v, 'bad'); },
    });
  }
  function updateGame(g) {
    $('#gp-chips').innerHTML = gameChips(g);
    $('#gp-actions').innerHTML = gameActions(g);
    $('#gp-about').innerHTML = gameAbout(g);
    $('#gp-panel').innerHTML = gamePanel(g);
    $$('#gp-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.ui.tab)));
  }
  let assistNoted = false;
  async function onGameOver(gid, d, p) {
    const g = S.world.games.get(gid);
    const score = Math.floor(d.v || 0);
    if (!g) return;
    if (d.assist && d.assist < 1) {
      announce('Game over. Score ' + fmtInt(score) + ', played at ' + Math.round(d.assist * 100) + '% speed.');
      if (!assistNoted) { assistNoted = true; toast('Assist mode is on, so runs stay off the ranked leaderboard. Score ' + fmtInt(score) + '.'); }
      return;
    }
    if (score <= 0) { announce('Game over. Score 0.'); return; }
    const prev = S.wallet && g.scores.get(S.wallet.from);
    if (prev && score <= prev.score) { toast('Score ' + fmtInt(score) + '. Your signed best is ' + fmtInt(prev.score) + '.'); return; }
    await ensureWallet();
    const { tx } = await signAndAppend('score', { gid: g.gid, hash: g.hash, score, seed: p.seed, ih: String(d.ih || ''), inputs: Math.floor(d.inputs || 0), dur: Math.floor(d.dur || 0) });
    toast('New best: ' + fmtInt(score) + '. Signed to the leaderboard.', null, short(tx.sig, 6, 6));
  }

  /* ---------- studio ---------- */
  function studioSparks() { const w = myWallet(); return w ? w.sparks : 0; }
  function remixBanner() {
    const st = S.studio;
    if (!st.parent || !S.world) return '';
    const p = S.world.games.get(st.parent);
    if (!p) return '';
    if (p.starter) return '<div class="banner info"><b>Remixing the ' + esc(p.title) + ' starter kit.</b><span class="muted">Kits are free to remix, so collects split ' + pct(10000 - R.FEE_BPS) + ' to you and ' + pct(R.FEE_BPS) + ' to the protocol.</span></div>';
    const fake = { creator: S.wallet ? S.wallet.from : 'you', parent: p.gid };
    const parts = C.collectSplits(10000, fake, S.world.games).map((s) => (s.role === 'creator' ? 'you' : s.role === 'protocol' ? 'protocol' : nameOf(s.to)) + ' ' + Math.round(s.amt / 100) + '%');
    return '<div class="banner info"><b>Remixing ' + esc(p.title) + ' by ' + esc(nameOf(p.creator)) + '.</b><span class="muted">When your remix is collected: ' + esc(parts.join(' · ')) + '.</span><button class="btn small ghost" type="button" data-act="clear-parent" style="justify-self:start">Start fresh instead</button></div>';
  }
  function studioLeft() {
    const st = S.studio;
    const seg = '<div class="seg" role="group" aria-label="How to build"><button type="button" data-act="studio-mode" data-mode="ai" aria-pressed="' + (st.mode === 'ai') + '">Describe with AI</button><button type="button" data-act="studio-mode" data-mode="kit" aria-pressed="' + (st.mode === 'kit') + '">Tune a kit</button></div>';
    let body;
    if (st.mode === 'ai') {
      if (!aiReady()) {
        body = ENV === 'claude'
          ? '<div class="banner warn"><b>Describing games with AI needs a Claude sign-in.</b><span>The AI studio runs on your own Claude account. Sign in to Claude and open GamePlay again to use it. Tuning a kit works for everyone, and publishing, scores and collecting work the same either way.</span><button class="btn small" type="button" data-act="studio-mode" data-mode="kit" style="justify-self:start">Tune a kit instead</button></div>'
          : '<div class="banner warn"><b>The AI studio is not switched on for this copy of GamePlay yet.</b><span>It needs a GamePlay server with an AI key. Tune a kit instead: publishing, scores and collecting work the same.</span><button class="btn small" type="button" data-act="studio-mode" data-mode="kit" style="justify-self:start">Tune a kit instead</button></div>';
      } else {
        const chat = st.chat.length ? st.chat.map((m) => '<div class="msg ' + (m.role === 'user' ? 'me' : m.role === 'note' ? 'note' : '') + '">' + esc(m.text) + '</div>').join('')
          : '<div class="msg note">Describe the game you want. Each build is a full game file you can play right away, then refine with follow-up requests.</div>';
        const has = !!st.versions.length;
        body = '<div class="panel stack"><div class="split"><p class="eyebrow">Describe your game</p><span class="chip" title="Your Sparks">' + I.spark + ' <span id="st-sparks">' + fmtInt(studioSparks()) + '</span> Sparks</span></div>'
          + '<div class="chat" id="st-chat">' + chat + '</div><div id="st-stream"></div>'
          + (has ? '' : '<div class="stack" style="gap:8px"><p class="eyebrow" id="crypto-ideas">Make a crypto game</p><div class="row" role="group" aria-labelledby="crypto-ideas">' + CRYPTO_IDEAS.map((t) => '<button class="chip" type="button" data-act="idea" data-idea="' + esc(t) + '" title="' + esc(t) + '">' + esc(ideaName(t)) + '</button>').join('') + '</div></div>')
          + '<label class="field"><span class="sr">Your idea or change</span><textarea id="st-prompt" data-in="prompt" placeholder="' + (has ? 'Ask for a change: “make the jump higher and add a double-jump power-up”' : 'Block Miner: stack falling transaction blocks before the gas meter runs dry…') + '">' + esc(st.prompt) + '</textarea></label>'
          + '<div class="row" role="group" aria-label="Art style">' + STYLES.map((s) => '<button class="chip" type="button" data-act="style" data-style="' + esc(s) + '" aria-pressed="' + (st.style === s) + '">' + esc(s) + '</button>').join('') + '</div>'
          + '<div class="row" id="st-gen">' + genButtons() + '</div>'
          + '<details><summary class="muted" style="cursor:pointer">Starter ideas to remix</summary><div class="stack" style="margin-top:10px">' + IDEAS.map((t) => '<button class="btn small ghost" type="button" data-act="idea" style="white-space:normal;text-align:left;justify-content:flex-start">' + esc(t) + '</button>').join('') + '</div></details>'
          + '</div>';
      }
    } else {
      const k = K.KITS[st.kit];
      body = '<div class="panel stack"><p class="eyebrow">Pick a kit</p><div class="kitpick">'
        + Object.values(K.KITS).map((x) => '<button type="button" data-act="kit" data-kit="' + x.id + '" aria-pressed="' + (st.kit === x.id) + '"><b>' + esc(x.name) + '</b><small>' + esc(x.blurb) + '</small></button>').join('') + '</div>'
        + '<label class="field">Title<input id="kn-title" type="text" maxlength="40" data-in="kit-title" value="' + esc(st.params.title) + '"></label>'
        + '<div class="stack" style="gap:8px"><p class="eyebrow">Palette</p><div class="swatches" role="group" aria-label="Palette">' + Object.entries(K.PALETTES).map(([key, p]) => '<button class="swatch" type="button" data-act="palette" data-pal="' + key + '" aria-pressed="' + (st.params.palette === key) + '" title="' + p.name + '" style="background:linear-gradient(135deg,' + p.bg1 + ' 0 45%,' + p.a1 + ' 45% 70%,' + p.a2 + ' 70%)"><span class="sr">' + p.name + '</span></button>').join('')
        + brandSwatch(st) + '</div>' + (st.params.palette === 'custom' ? brandFields(st.params.colors) : '') + '</div>'
        + '<div class="stack" style="gap:8px"><p class="eyebrow">Player shape</p><div class="row">' + Object.entries(K.SHAPES).map(([key, l]) => '<button class="chip" type="button" data-act="shape" data-shape="' + key + '" aria-pressed="' + (st.params.shape === key) + '">' + l + '</button>').join('') + '</div></div>'
        + '<div class="knobs">' + k.knobs.map((kn) => kn.type === 'bool'
          ? '<label class="knob" style="grid-template-columns:auto 1fr;align-items:center"><input type="checkbox" id="kn-' + kn.key + '" data-in="knob" data-key="' + kn.key + '"' + (st.params[kn.key] ? ' checked' : '') + ' style="grid-column:auto"><span>' + esc(kn.label) + '</span></label>'
          : '<label class="knob"><span>' + esc(kn.label) + '</span><output id="out-' + kn.key + '">' + fmtKnob(st.params[kn.key], kn) + '</output><input type="range" id="kn-' + kn.key + '" data-in="knob" data-key="' + kn.key + '" min="' + kn.min + '" max="' + kn.max + '" step="' + kn.step + '" value="' + st.params[kn.key] + '"></label>').join('') + '</div>'
        + '</div>';
    }
    return seg + remixBanner() + body + publishPanel();
  }
  function fmtKnob(v, kn) { return kn.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2) + '×'; }
  function brandColors(st) { return K.cleanColors(st.params.palette === 'custom' ? st.params.colors : st.brand); }
  function brandSwatchBg(c) { return 'linear-gradient(135deg,' + c.bg + ' 0 45%,' + c.main + ' 45% 70%,' + c.alt + ' 70%)'; }
  function brandSwatch(st) {
    return '<button class="swatch custom" id="sw-custom" type="button" data-act="palette" data-pal="custom" aria-pressed="' + (st.params.palette === 'custom') + '" title="Your colors" style="background:' + brandSwatchBg(brandColors(st)) + '"><span class="sr">Your colors</span><span class="plus" aria-hidden="true">+</span></button>';
  }
  function brandFields(c) {
    c = K.cleanColors(c);
    const f = (key, label) => '<label class="color"><input type="color" id="br-' + key + '" data-in="brand" data-key="' + key + '" value="' + c[key] + '"><span>' + label + '</span></label>';
    return '<div class="brand-fields" role="group" aria-label="Your colors">' + f('bg', 'Background') + f('main', 'Main color') + f('alt', 'Second color') + '</div>';
  }
  function genButtons() {
    const st = S.studio;
    const has = !!st.versions.length;
    if (st.busy) return '<button class="btn" type="button" data-act="stop">Stop</button><span class="muted" id="st-phase">' + esc((st.stream && st.stream.phase) || 'Thinking…') + '</span>';
    return '<button class="btn primary" type="button" data-act="gen-new">Build new game · ' + R.GEN_COST.new + ' Sparks</button>'
      + (has ? '<button class="btn" type="button" data-act="gen-edit">Apply change · ' + R.GEN_COST.edit + ' Sparks</button>' : '')
      + '<select id="st-quality" data-in="quality" aria-label="Build quality" style="width:auto"><option value="default"' + (st.quality === 'default' ? ' selected' : '') + '>Standard build</option><option value="complex"' + (st.quality === 'complex' ? ' selected' : '') + '>Best build (slower)</option></select>';
  }
  function publishPanel() {
    const st = S.studio;
    const ai = st.mode === 'ai';
    const meta = ai && st.versions[st.vi] ? st.versions[st.vi].meta || {} : {};
    const ready = !!studioCode();
    return '<div class="panel stack" id="st-publish"><p class="eyebrow">Publish</p>'
      + (ai ? '<label class="field">Title<input id="pub-title" type="text" maxlength="40" data-in="pub-title" value="' + esc(st.title || meta.title || '') + '" placeholder="Game title"></label>' : '')
      + '<label class="field">Description<input id="pub-desc" type="text" maxlength="200" data-in="pub-desc" value="' + esc(st.desc || meta.desc || '') + '" placeholder="One line players see on the cartridge"></label>'
      + '<div class="grid2"><label class="field">Collect price <small>devSOL, 0 for a free collect</small><input id="pub-price" type="number" min="0" max="100" step="0.01" data-in="pub-price" value="' + esc(st.price) + '"></label>'
      + '<label class="field">Editions <small>0 for an open edition</small><input id="pub-cap" type="number" min="0" max="100000" step="1" data-in="pub-cap" value="' + esc(st.cap) + '"></label></div>'
      + '<p class="muted" style="font-size:0.875rem">Publishing is free: network fees are sponsored. You sign the game’s content hash with your wallet; anyone can verify the file was not changed.</p>'
      + '<div class="row"><button class="btn primary" type="button" data-act="publish"' + (ready && !st.busy ? '' : ' disabled') + '>Sign &amp; publish</button>' + (ready ? '' : '<span class="muted">Build a game first.</span>') + '</div></div>';
  }
  function studioTools() {
    const st = S.studio;
    const ready = !!studioCode();
    const versions = st.mode === 'ai' && st.versions.length > 1 ? '<div class="versions" role="group" aria-label="Versions">' + st.versions.map((v, i) => '<button class="chip" type="button" data-act="version" data-i="' + i + '" aria-pressed="' + (i === st.vi) + '">v' + (i + 1) + '</button>').join('') + '</div>' : '';
    return '<button class="btn small" type="button" data-act="restart"' + (ready ? '' : ' disabled') + '>Restart</button>'
      + '<button class="btn small ghost" type="button" data-act="fullscreen-studio"' + (ready ? '' : ' disabled') + '>Fullscreen</button>'
      + '<button class="btn small ghost" type="button" data-act="view-code-studio"' + (ready ? '' : ' disabled') + '>View code</button>'
      + (canDownload() ? '<button class="btn small ghost" type="button" data-act="download-studio"' + (ready ? '' : ' disabled') + '>Download .html</button>' : '')
      + versions;
  }
  function studioStatus() {
    const st = S.studio;
    if (st.error) return '<div class="banner bad"><b>The game hit an error</b><span class="mono">' + esc(st.error) + '</span>' + (st.mode === 'ai' && aiReady() ? '<button class="btn small" type="button" data-act="gen-fix" style="justify-self:start">Fix it with AI · free</button>' : '') + '</div>';
    if (st.lastRun != null) return '<p class="muted">Test run scored ' + fmtInt(st.lastRun) + '. Scores count once the game is published.</p>';
    return '<p class="muted">' + (studioCode() ? 'Unpublished preview. Click the game to play.' : 'Your game appears here.') + '</p>';
  }
  function mountStudio() {
    if (!S.studio) loadStudio();
    $('#view').innerHTML = '<div class="gp-head"><p class="eyebrow">Create</p><h1>Make a cartridge</h1></div>'
      + '<div class="studio"><section class="st-left stack" id="st-left">' + studioLeft() + '</section>'
      + '<section class="st-right" id="st-right"><div class="screen" id="st-screen"></div><div class="toolbar" id="st-tools">' + studioTools() + '</div><div id="st-status">' + studioStatus() + '</div></section></div>' + footHTML();
    loadPreview();
    renderStream();
  }
  function updateStudio() {
    const sp = $('#st-sparks'); if (sp) sp.textContent = fmtInt(studioSparks());
  }
  function rerenderStudioLeft() {
    const left = $('#st-left'); if (!left) return;
    left.innerHTML = studioLeft();
    const chat = $('#st-chat'); if (chat) chat.scrollTop = chat.scrollHeight;
    renderStream();
  }
  function rerenderStudioRight() {
    const t = $('#st-tools'); if (t) t.innerHTML = studioTools();
    const s = $('#st-status'); if (s) s.innerHTML = studioStatus();
  }
  let previewTimer = null;
  function loadPreview(delay) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const host = $('#st-screen'); if (!host) return;
      const code = studioCode();
      S.studio.error = null; S.studio.lastRun = null;
      if (!code) { unmountPlayer('st-screen'); host.innerHTML = '<div class="screen-cover" style="cursor:default;background:transparent"><span>Your game appears here</span></div>'; rerenderStudioRight(); return; }
      host.innerHTML = '';
      mountPlayer(host, code, {
        title: 'Preview',
        onMessage: (d) => {
          if (d.t === 'error') { S.studio.error = d.v; rerenderStudioRight(); }
          if (d.t === 'over') { S.studio.lastRun = Math.floor(d.v || 0); rerenderStudioRight(); }
        },
      });
      rerenderStudioRight();
    }, delay || 0);
  }
  function renderStream() {
    const box = $('#st-stream'); if (!box) return;
    const st = S.studio;
    if (!st.busy || !st.stream) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="stream" aria-live="off">' + esc(st.stream.tail || 'Waiting for the first line of code…') + '</div>';
    const ph = $('#st-phase'); if (ph) ph.textContent = st.stream.phase;
  }
  async function generate(kind) {
    const st = S.studio;
    if (!aiReady() || st.busy) return;
    if (kind === 'edit' && !st.versions.length) kind = 'new';
    const prompt = (st.prompt || '').trim();
    if (kind !== 'fix' && !prompt) { toast('Describe your game first.'); const t = $('#st-prompt'); if (t) t.focus(); return; }
    const base = studioCode();
    const errText = st.error;
    await ensureWallet();
    await ensureSparks(R.GEN_COST[kind]);
    st.busy = true;
    st.stream = { phase: 'Thinking…', tail: '' };
    st.chat.push({ role: 'user', text: kind === 'fix' ? 'Fix the error: ' + errText : prompt });
    if (kind !== 'fix') st.prompt = '';
    rerenderStudioLeft();
    const ctl = new AbortController();
    S.ctl = ctl;
    try {
      const req = { kind, prompt, style: st.style, code: kind === 'new' ? '' : base || '', error: kind === 'fix' ? errText : '', tier: st.quality === 'complex' ? 'complex' : 'default' };
      const res = await aiBuild(req, {
        signal: ctl.signal,
        onText: ({ text }) => {
          st.stream.phase = 'Writing code · ' + (text.length / 1024).toFixed(1) + ' KB';
          st.stream.tail = text.slice(-900);
          renderStream();
        },
      });
      const code = extractHTML(res.text);
      const meta = readMeta(code);
      if (R.GEN_COST[kind]) await signAndAppend('gen', { kind, bytes: code.length });
      st.versions.push({ code, meta, kind, ts: Date.now() });
      st.vi = st.versions.length - 1;
      if (kind === 'new') { st.title = ''; st.desc = ''; }
      st.chat.push({ role: 'assistant', text: 'Built v' + st.versions.length + ': ' + (meta.title || 'Untitled') + ' (' + (code.length / 1024).toFixed(1) + ' KB).' + (meta.controls ? ' Controls: ' + meta.controls + '.' : '') + (res.truncated ? ' The reply was cut short, so ask for a simpler version if it misbehaves.' : '') });
      toast('Built ' + (meta.title || 'your game') + '. Click it to play.');
      loadPreview();
    } catch (e) {
      const code = e && e.code;
      const msg = code === 'cancelled' ? 'Stopped. Nothing was charged.'
        : code === 'not_granted' || code === 'sampling_disabled' ? 'Claude access was declined for this page, so AI building is off. Tune a kit instead.'
        : code === 'rate_limited' ? (ENV === 'web' ? (e && e.message) || 'The AI studio is busy. Try again in a minute.' : 'Too many builds at once or your Claude usage limit was reached. Try again later.')
        : code === 'refused' ? 'Claude declined this request. Rephrase the idea and try again.'
        : code === 'prompt_too_large' ? 'The game is too large to edit in one request. Start a new build.'
        : code === 'session_expired' ? 'Your Claude session expired. Sign in again, then retry.'
        : (e && e.message) || 'The build failed. Try again.';
      st.chat.push({ role: 'note', text: msg });
      if (code !== 'cancelled') toast(msg, 'bad');
    } finally {
      st.busy = false; st.stream = null; S.ctl = null;
      rerenderStudioLeft(); rerenderStudioRight(); saveStudio();
    }
  }
  async function publish() {
    const st = S.studio;
    const code = studioCode();
    if (!code) throw new Error('Build a game first.');
    const v = st.mode === 'ai' ? st.versions[st.vi] : null;
    const meta = v ? v.meta || {} : {};
    const title = (st.mode === 'kit' ? st.params.title : st.title || meta.title || 'Untitled').slice(0, 40).trim() || 'Untitled';
    const price = Math.round(Math.max(0, Math.min(100, Number(st.price) || 0)) * 1e4) / 1e4;
    const cap = Math.max(0, Math.floor(Number(st.cap) || 0));
    await ensureWallet();
    const hash = await C.sha256hex(code);
    const gid = 'g' + C.randHex(8);
    await putBlob(hash, code);
    const firstPrompt = st.mode === 'ai' ? (st.chat.find((m) => m.role === 'user') || {}).text || '' : '';
    const { tx } = await signAndAppend('publish', {
      gid, title, genre: st.mode === 'kit' ? K.KITS[st.kit].genre : meta.genre || 'Arcade', desc: (st.desc || meta.desc || '').slice(0, 200),
      prompt: firstPrompt.slice(0, 600), hash, size: code.length, parent: st.parent || null,
      price: Math.round(price * C.LAMPORTS), cap, kit: st.mode === 'kit' ? st.kit : 'ai', params: st.mode === 'kit' ? st.params : null,
    });
    toast('Published ' + title + '. Signed with your wallet.', null, short(tx.sig, 6, 6));
    S.studio.parent = null; S.studio.title = ''; S.studio.desc = '';
    saveStudio();
    nav('game', gid);
  }
  async function startRemix(gid) {
    const g = S.world.games.get(gid);
    if (!g) return;
    const st = newStudio();
    st.parent = gid;
    if (g.kit !== 'ai' && K.KITS[g.kit]) {
      st.mode = 'kit'; st.kit = g.kit;
      st.params = K.normalizeParams(g.kit, Object.assign({}, g.params, { title: (g.title + ' Remix').slice(0, 40) }));
    } else {
      const code = await getBlob(g.hash);
      if (!code) throw new Error('The game file is not available, so it cannot be remixed here.');
      st.mode = 'ai';
      st.versions = [{ code, meta: readMeta(code), kind: 'original', ts: Date.now() }];
      st.vi = 0;
      st.title = (g.title + ' Remix').slice(0, 40);
      st.chat = [{ role: 'note', text: 'Remixing ' + g.title + ' by ' + nameOf(g.creator) + '. Describe what to change, then press Apply change.' }];
    }
    S.studio = st;
    saveStudio();
    nav('create');
  }

  /* ---------- wallet ---------- */
  function viewWallet() {
    const inj = injectedProvider();
    if (!S.wallet) {
      return '<div class="gp-head"><p class="eyebrow">Wallet</p><h1>Get a wallet in one click</h1></div>'
        + '<div class="grid2"><div class="panel stack"><h2 class="display" style="font-size:1.25rem;text-transform:uppercase">GamePlay wallet</h2><p>A Solana keypair made in your browser. No extension, no seed phrase to write down first, and it works on phones.</p><p class="muted" style="font-size:0.875rem">Production uses a passkey or social-login embedded wallet with gasless transactions. This prototype keeps the devnet key in this browser so you can export it any time.</p><div class="row"><button class="btn primary" type="button" data-act="create-wallet">Create wallet</button><button class="btn ghost" type="button" data-act="import-wallet">Import a key</button></div></div>'
        + '<div class="panel stack"><h2 class="display" style="font-size:1.25rem;text-transform:uppercase">Bring your own</h2><p>Connect Phantom, Solflare or Backpack. You sign once to approve a 7-day session key, so games never interrupt you with pop-ups.</p>'
        + (inj ? '<div class="row"><button class="btn" type="button" data-act="connect-injected">Connect ' + esc(inj.name) + '</button></div>' : '<p class="muted" style="font-size:0.875rem">No wallet extension can reach this page. Embedded pages often hide extensions, so open GamePlay in its own tab to use one.</p>')
        + '</div></div>' + footHTML();
    }
    const w = myWallet() || { sol: 0, sparks: 0, park: 0, weeks: new Set(), lastAirdrop: 0, earnedSol: 0, earnedPark: 0, sparksEarned: 0, txs: [] };
    const now = Date.now();
    const nextDrop = w.lastAirdrop + R.AIRDROP_EVERY_MS;
    const claimed = w.weeks.has(C.weekKey(now));
    const games = S.world ? [...S.world.games.values()].filter((g) => g.creator === S.wallet.from) : [];
    const owned = S.world ? [...S.world.games.values()].filter((g) => g.collects.some((c) => c.pk === S.wallet.from)) : [];
    const recent = S.world ? S.world.log.filter((r) => r.ok && (r.tx.from === S.wallet.from || r.moves.some((m) => m.to === S.wallet.from))).slice(-12).reverse() : [];
    return '<div class="gp-head"><p class="eyebrow">Wallet</p><h1>' + esc(nameOf(S.wallet.from)) + '</h1></div>'
      + '<div class="grid3">'
      + '<div class="panel balance"><span class="unit">devSOL</span><span class="amt">' + fmtSOL(w.sol) + '</span><span class="muted" style="font-size:0.875rem">For collects and tips. Earned ' + fmtSOL(w.earnedSol) + ' SOL so far.</span><div class="row"><button class="btn small" type="button" data-act="airdrop"' + (now < nextDrop ? ' disabled' : '') + '>' + (now < nextDrop ? 'Faucet in ' + Math.ceil((nextDrop - now) / 3600000) + 'h' : 'Get ' + R.AIRDROP_LAMPORTS / C.LAMPORTS + ' devSOL') + '</button></div></div>'
      + '<div class="panel balance"><span class="unit">Sparks</span><span class="amt">' + fmtInt(w.sparks) + '</span><span class="muted" style="font-size:0.875rem">Pay for AI builds. Not transferable. ' + fmtInt(w.sparksEarned) + ' earned from players.</span><div class="row"><button class="btn small" type="button" data-act="claim"' + (claimed ? ' disabled' : '') + '>' + (claimed ? 'Claimed this week' : 'Claim ' + R.WEEKLY_SPARKS + ' free') + '</button><button class="btn small ghost" type="button" data-act="buy-sparks">Buy ' + R.SPARK_PACK.sparks + ' for ' + R.SPARK_PACK.lamports / C.LAMPORTS + ' SOL</button></div></div>'
      + '<div class="panel balance"><span class="unit">GPLY</span><span class="amt">' + fmtInt(w.park) + '</span><span class="muted" style="font-size:0.875rem">Earned in epoch rewards. Burn it to boost games or for Sparks.</span><div class="row"><button class="btn small ghost" type="button" data-act="convert"' + (w.park >= R.CONVERT.park ? '' : ' disabled') + '>Burn ' + R.CONVERT.park + ' for ' + R.CONVERT.sparks + ' Sparks</button></div></div>'
      + '</div>'
      + '<div class="grid2" style="margin-top:18px"><div class="panel stack"><p class="eyebrow">Identity</p><dl class="kv">'
      + '<dt>Address</dt><dd class="hash">' + esc(S.wallet.from) + '</dd>'
      + '<dt>Type</dt><dd>' + esc(S.wallet.label) + (S.wallet.exp ? ' (expires ' + when(S.wallet.exp) + ')' : '') + '</dd>'
      + '<dt>Handle</dt><dd><form class="row" data-form="handle" style="flex-wrap:nowrap"><input type="text" id="handle-in" maxlength="20" placeholder="' + esc(nameOf(S.wallet.from)) + '" aria-label="Handle"><button class="btn small" type="submit">Save</button></form></dd>'
      + '<dt>Stored</dt><dd>' + (S.wallet.kind === 'embedded' ? (S.storageOk ? 'In this browser only' : 'In memory until you close the page') : 'In your wallet extension') + '</dd>'
      + '</dl><div class="row"><button class="btn small ghost" type="button" data-act="copy-address">Copy address</button>' + (S.wallet.kind === 'embedded' ? '<button class="btn small ghost" type="button" data-act="export-key">Export secret key</button>' : '') + '<button class="btn small ghost" type="button" data-act="import-wallet">Import a key</button>' + (inj && S.wallet.kind === 'embedded' ? '<button class="btn small ghost" type="button" data-act="connect-injected">Use ' + esc(inj.name) + '</button>' : '') + '</div></div>'
      + '<div class="panel stack"><p class="eyebrow">Your cartridges</p>'
      + (games.length ? '<div class="lineage">' + games.map((g) => '<a href="#game-' + esc(g.gid) + '" data-act="open-game" data-gid="' + esc(g.gid) + '">' + esc(g.title) + ' <span class="mono muted">' + fmtInt(g.players.size) + ' players · ' + fmtSOL(g.revenue) + ' SOL</span></a>').join('') + '</div>' : '<p class="muted">None yet. <a href="#create" data-nav="create">Make one</a>.</p>')
      + '<p class="eyebrow" style="margin-top:6px">Your collection</p>'
      + (owned.length ? '<div class="lineage">' + owned.map((g) => '<a href="#game-' + esc(g.gid) + '" data-act="open-game" data-gid="' + esc(g.gid) + '">' + esc(g.title) + ' <span class="mono muted">edition #' + g.collects.find((c) => c.pk === S.wallet.from).edition + '</span></a>').join('') + '</div>' : '<p class="muted">Nothing collected yet.</p>')
      + '</div></div>'
      + '<section class="section"><div class="section-head"><h2>Recent activity</h2><a href="#ledger" data-nav="ledger">Open the ledger</a></div>'
      + (recent.length ? ledgerTable(recent) : '<div class="empty"><h3>No activity yet</h3><p>Grab devSOL from the faucet, then collect or tip a game.</p></div>')
      + '</section>' + footHTML();
  }

  /* ---------- ledger ---------- */
  const TYPE = { airdrop: 'Faucet', spark_claim: 'Weekly Sparks', handle: 'Handle', gen: 'AI build', publish: 'Publish', collect: 'Collect', tip: 'Tip', score: 'Score', spark_buy: 'Spark pack', boost: 'Boost', convert: 'Convert', report: 'Report', epoch: 'Epoch rewards' };
  const FILTERS = [['all', 'All'], ['games', 'Publishes'], ['money', 'Payments'], ['scores', 'Scores'], ['rewards', 'Rewards & burns'], ['bad', 'Rejected']];
  const inFilter = (r, f) => {
    const t = r.kind === 'epoch' ? 'epoch' : r.tx.t;
    if (f === 'all') return true;
    if (f === 'bad') return !r.ok;
    if (!r.ok) return false;
    if (f === 'games') return t === 'publish';
    if (f === 'money') return ['collect', 'tip', 'spark_buy', 'airdrop'].includes(t);
    if (f === 'scores') return t === 'score';
    return ['epoch', 'boost', 'convert', 'spark_claim', 'gen'].includes(t);
  };
  function describe(r) {
    const tx = r.tx;
    if (r.kind === 'epoch') return { who: 'Protocol', what: (tx.rewards || []).length + ' wallets', amt: fmtInt((tx.rewards || []).reduce((a, x) => a + (x.park || 0), 0)) + ' GPLY' };
    const g = tx.b && tx.b.gid && S.world.games.get(tx.b.gid);
    const who = nameOf(tx.from);
    const sol = r.moves.filter((m) => m.unit === 'SOL' && m.from === tx.from).reduce((a, m) => a + m.amt, 0);
    switch (tx.t) {
      case 'publish': return { who, what: tx.b.title, amt: '—' };
      case 'collect': return { who, what: g ? g.title : tx.b.gid, amt: fmtSOL(sol) + ' SOL' };
      case 'tip': return { who, what: g ? 'to ' + nameOf(g.creator) : '', amt: fmtSOL(sol) + ' SOL' };
      case 'score': return { who, what: g ? g.title : tx.b.gid, amt: fmtInt(tx.b.score) + ' pts' };
      case 'airdrop': return { who, what: 'devnet faucet', amt: fmtSOL(R.AIRDROP_LAMPORTS) + ' SOL' };
      case 'spark_claim': return { who, what: 'free weekly', amt: R.WEEKLY_SPARKS + ' Sparks' };
      case 'spark_buy': return { who, what: 'treasury', amt: fmtSOL(sol) + ' SOL' };
      case 'gen': return { who, what: tx.b.kind + ' build', amt: R.GEN_COST[tx.b.kind] + ' Sparks' };
      case 'boost': return { who, what: g ? g.title : '', amt: fmtInt(tx.b.amt) + ' GPLY burned' };
      case 'convert': return { who, what: 'Sparks', amt: fmtInt((tx.b.lots || 0) * R.CONVERT.park) + ' GPLY burned' };
      case 'report': return { who, what: g ? g.title : '', amt: '—' };
      case 'handle': return { who, what: '@' + (tx.b.name || ''), amt: '—' };
      default: return { who, what: '', amt: '' };
    }
  }
  function ledgerTable(rows) {
    return '<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Type</th><th>Signer</th><th>Detail</th><th class="r">Amount</th><th>Signature</th><th>Status</th></tr></thead><tbody>'
      + rows.map((r) => {
        const d = describe(r);
        const id = r.kind === 'epoch' ? 'ep' + r.tx.n : r.tx.id;
        const open = S.ui.openTx === id;
        const status = r.ok ? '<span class="chip ok">' + I.ok + ' Verified</span>' : '<span class="chip bad" title="' + esc(r.why) + '">' + I.no + ' ' + esc(r.why) + '</span>';
        const main = '<tr class="click" data-act="open-tx" data-id="' + esc(id) + '" tabindex="0"><td class="n" style="text-align:left">' + esc(ago(r.tx.ts)) + '</td><td>' + esc(TYPE[r.kind === 'epoch' ? 'epoch' : r.tx.t] || r.tx.t) + '</td><td>' + esc(d.who) + '</td><td>' + esc(d.what) + '</td><td class="n">' + esc(d.amt) + '</td><td class="mono">' + esc(short(r.tx.sig, 6, 6)) + '</td><td>' + status + '</td></tr>';
        if (!open) return main;
        const msg = r.kind === 'epoch' ? new TextDecoder().decode(C.epochMessage(r.tx)) : new TextDecoder().decode(C.txMessage(r.tx));
        const moves = r.moves.map((m) => (m.from.startsWith('@') ? m.from.slice(1) : nameOf(m.from)) + ' → ' + (m.to.startsWith('@') ? m.to.slice(1) : nameOf(m.to)) + ': ' + (m.unit === 'SOL' ? fmtSOL(m.amt) : fmtInt(m.amt)) + ' ' + m.unit + (m.role ? ' (' + m.role + ')' : '')).join('\n');
        return main + '<tr class="detail"><td colspan="7"><div class="stack"><dl class="kv"><dt>Signer key</dt><dd class="hash">' + esc(r.tx.pk) + '</dd>' + (r.tx.del ? '<dt>Session of</dt><dd class="hash">' + esc(r.tx.del.m) + '</dd>' : '') + '<dt>Signature</dt><dd class="hash">' + esc(r.tx.sig) + '</dd><dt>Account</dt><dd class="hash">' + esc(r.uid === '@protocol' ? 'protocol' : r.local ? 'this device' : 'shared gallery') + '</dd></dl>'
          + (moves ? '<p class="eyebrow">Balance changes</p><pre class="code">' + esc(moves) + '</pre>' : '')
          + '<p class="eyebrow">Signed message (Ed25519 over these exact bytes)</p><pre class="code">' + esc(msg) + '</pre></div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function viewLedger() {
    const w = S.world;
    const all = w ? w.log.slice().reverse() : [];
    const rows = all.filter((r) => inFilter(r, S.ui.ledger)).slice(0, 200);
    const ok = all.filter((r) => r.ok).length;
    return '<div class="gp-head"><p class="eyebrow">Ledger</p><h1>Every move, signed</h1><p class="muted" style="max-width:62ch">GamePlay replays every signed transaction in order and recomputes all balances, so nothing here depends on trusting the server. Tap a row to see the exact bytes that were signed.</p></div>'
      + '<div class="facts" style="margin-bottom:16px"><div class="fact"><b>' + fmtInt(all.length) + '</b><span>transactions</span></div><div class="fact"><b>' + fmtInt(ok) + '</b><span>verified</span></div><div class="fact"><b>' + fmtInt(all.length - ok) + '</b><span>rejected by the rules</span></div><div class="fact"><b>' + fmtInt(w ? w.wallets.size : 0) + '</b><span>wallets</span></div></div>'
      + '<div class="row" role="group" aria-label="Filter" style="margin-bottom:12px">' + FILTERS.map(([k, l]) => '<button class="chip" type="button" data-act="ledger-filter" data-f="' + k + '" aria-pressed="' + (S.ui.ledger === k) + '">' + l + '</button>').join('') + '</div>'
      + (rows.length ? ledgerTable(rows) : '<div class="empty"><h2>Nothing here yet</h2><p>Transactions appear as soon as anyone signs one.</p></div>') + footHTML();
  }

  /* ---------- economy ---------- */
  function emissionChart(current) {
    const W = 600, H = 230, L = 56, B = 32, T = 14, RR = 10, n = 20, max = R.EPOCH_BASE;
    const bw = (W - L - RR) / n;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="GPLY emission per epoch, decaying 10% each epoch">';
    for (const v of [0, 25000, 50000, 75000, 100000]) {
      const y = T + (H - T - B) * (1 - v / max);
      s += '<line x1="' + L + '" x2="' + (W - RR) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--line)" stroke-width="1"/><text x="' + (L - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" style="fill:var(--muted);font:500 10px var(--mono)">' + (v / 1000) + 'k</text>';
    }
    for (let i = 1; i <= n; i++) {
      const v = C.emissionFor(i), h = (H - T - B) * (v / max), x = L + (i - 1) * bw + 2, y = H - B - h;
      const fill = i === current ? 'var(--accent)' : i < current ? 'var(--muted)' : 'var(--shell-dark)';
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h.toFixed(1) + '" style="fill:' + fill + '"><title>Epoch ' + i + ': ' + fmtInt(v) + ' GPLY</title></rect>';
      if (i === 1 || i % 5 === 0) s += '<text x="' + (x + (bw - 4) / 2).toFixed(1) + '" y="' + (H - B + 16) + '" text-anchor="middle" style="fill:var(--muted);font:500 10px var(--mono)">' + i + '</text>';
    }
    s += '<text x="' + (W - RR) + '" y="' + (H - 4) + '" text-anchor="end" style="fill:var(--muted);font:500 10px var(--mono)">epoch</text></svg>';
    return s;
  }
  function flowDiagram() {
    const node = (x, y, t, sub, strong) => '<rect x="' + x + '" y="' + y + '" width="160" height="58" rx="4" style="fill:var(--panel-2);stroke:' + (strong ? 'var(--accent)' : 'var(--line)') + '" stroke-width="' + (strong ? 2 : 1) + '"/><text x="' + (x + 80) + '" y="' + (y + 25) + '" text-anchor="middle" style="fill:var(--ink);font:700 13px var(--body)">' + t + '</text><text x="' + (x + 80) + '" y="' + (y + 43) + '" text-anchor="middle" style="fill:var(--muted);font:400 11px var(--body)">' + sub + '</text>';
    const edge = (d, lx, ly, label, anchor) => '<path d="' + d + '" fill="none" style="stroke:var(--ink-2)" stroke-width="1.6" marker-end="url(#ah)"/><text x="' + lx + '" y="' + ly + '" text-anchor="' + (anchor || 'middle') + '" style="fill:var(--ink-2);font:600 11px var(--body);paint-order:stroke;stroke:var(--panel);stroke-width:4px;stroke-linejoin:round">' + label + '</text>';
    return '<div class="diagram-wrap"><svg viewBox="0 0 760 236" role="img" aria-label="How value flows through GamePlay"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" style="fill:var(--ink-2)"/></marker></defs>'
      + node(20, 16, 'GPLY emission', '100k per epoch, −10% each') + node(300, 16, 'Creators', 'make and publish games') + node(580, 16, 'Burn', 'boosts and conversions')
      + node(20, 160, 'Players & collectors', 'play, score, collect') + node(300, 160, 'Treasury', '5% fees + Spark packs', true) + node(580, 160, 'Free AI compute', R.WEEKLY_SPARKS + ' Sparks a week each')
      + edge('M180 45 H296', 238, 37, '70% to creators') + edge('M100 74 V156', 108, 118, '30% to players', 'start')
      + edge('M180 176 L296 70', 214, 108, 'collects, tips') + edge('M180 196 H296', 238, 188, 'fee, Spark packs')
      + edge('M380 160 V78', 388, 122, '40% of fees as SOL', 'start') + edge('M460 189 H576', 518, 181, 'pays for free Sparks')
      + edge('M460 45 H576', 518, 37, 'burn GPLY')
      + '</svg></div>';
  }
  function viewEconomy() {
    const w = S.world;
    if (!w) return '<p class="muted">Loading…</p>';
    const pending = C.computeEpoch(w, Date.now());
    const circulating = w.supply.emitted - w.supply.burned;
    const last = w.epochs[w.epochs.length - 1];
    const rows = pending.rewards.slice(0, 12);
    return '<div class="gp-head"><p class="eyebrow">Economy</p><h1>Rewards paid from real activity</h1><p class="muted" style="max-width:66ch">Players and collectors pay creators directly. A 5% fee and Spark packs fill the treasury, which pays for everyone’s free Sparks and sends 40% of fees back to creators each epoch. GPLY is emitted on a fixed, decaying schedule and burned when people boost games or convert it to Sparks.</p></div>'
      + '<div class="facts" style="margin-bottom:20px"><div class="fact"><b>' + pending.n + '</b><span>next epoch</span></div><div class="fact"><b>' + fmtInt(pending.emission) + '</b><span>GPLY it emits</span></div><div class="fact"><b>' + fmtSOL(w.treasury.sol) + '</b><span>SOL in treasury</span></div><div class="fact"><b>' + fmtInt(w.supply.emitted) + '</b><span>GPLY emitted</span></div><div class="fact"><b>' + fmtInt(w.supply.burned) + '</b><span>GPLY burned</span></div><div class="fact"><b>' + fmtInt(circulating) + '</b><span>GPLY circulating of ' + fmtInt(R.MAX_SUPPLY) + ' max</span></div></div>'
      + '<div class="grid2"><div class="panel stack"><div class="split"><p class="eyebrow">Epoch ' + pending.n + ' preview</p><span class="muted" style="font-size:0.8125rem">activity since ' + (last ? when(last.to) : 'launch') + '</span></div>'
      + (rows.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Wallet</th><th>Role</th><th class="r">GPLY</th><th class="r">SOL</th></tr></thead><tbody>' + rows.map((r) => '<tr><td>' + esc(nameOf(r.to)) + (S.wallet && r.to === S.wallet.from ? ' <span class="chip accent">you</span>' : '') + '</td><td>' + esc(r.roles.join(' + ')) + '</td><td class="n">' + fmtInt(r.park) + '</td><td class="n">' + fmtSOL(r.sol) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="empty"><h2>No rewards earned yet</h2><p>Creators earn from unique players, collects, tips and remixes. Players earn from leaderboard podiums and exploring games.</p></div>')
      + '<p class="muted" style="font-size:0.875rem">Creator pool ' + fmtInt(pending.cPool) + ' GPLY and ' + fmtSOL(pending.solPool) + ' SOL; player pool ' + fmtInt(pending.pPool) + ' GPLY.</p>'
      + (canSettle() ? '<div class="row"><button class="btn primary" type="button" data-act="settle"' + (rows.length ? '' : ' disabled') + '>Sign and settle epoch ' + pending.n + '</button><span class="muted" style="font-size:0.8125rem">' + (S.hasDb ? 'Signed by your wallet as the protocol authority.' : 'Settles your local sandbox.') + '</span></div>'
        : '<p class="muted" style="font-size:0.875rem">Only this prototype’s owner can settle epochs in this prototype. In production a public script computes the rewards and a multisig posts the result.</p>')
      + '</div><div class="panel stack"><p class="eyebrow">Emission schedule</p>' + emissionChart(pending.n) + '<p class="muted" style="font-size:0.875rem">' + fmtInt(R.EPOCH_BASE) + ' GPLY in epoch 1, then 10% less every epoch. ' + Math.round(R.CREATOR_SHARE * 100) + '% to creators, ' + Math.round(R.PLAYER_SHARE * 100) + '% to players.</p></div></div>'
      + '<section class="section"><div class="section-head"><h2>How value moves</h2></div><div class="panel">' + flowDiagram() + '</div></section>'
      + '<section class="section"><div class="section-head"><h2>Rules this ledger enforces</h2></div><div class="table-wrap"><table class="data"><tbody>'
      + [['Faucet', fmtSOL(R.AIRDROP_LAMPORTS) + ' devSOL per wallet every 24 hours'], ['Free Sparks', R.WEEKLY_SPARKS + ' per wallet per week; new game ' + R.GEN_COST.new + ', change ' + R.GEN_COST.edit + ', AI bug fix free'], ['Sparks from players', R.SPARKS_PER_PLAYER + ' per unique player of your games (up to ' + R.SPARKS_PLAYER_CAP + ' players per game)'], ['Collect split', 'creator ' + pct(10000 - R.FEE_BPS - R.PARENT_BPS - R.GRAND_BPS) + '–' + pct(10000 - R.FEE_BPS) + ', parent ' + pct(R.PARENT_BPS) + ', grandparent ' + pct(R.GRAND_BPS) + ', protocol ' + pct(R.FEE_BPS)], ['Tips', '100% to the creator'], ['Spark pack', R.SPARK_PACK.sparks + ' Sparks for ' + R.SPARK_PACK.lamports / C.LAMPORTS + ' SOL, paid to the treasury'], ['Burns', 'boosts burn GPLY; ' + R.CONVERT.park + ' GPLY burns for ' + R.CONVERT.sparks + ' Sparks'], ['Unique players', 'one per signed-in account per game (a stand-in for proof of personhood)']]
        .map(([k, v]) => '<tr><th scope="row" style="text-transform:none;font:700 0.875rem var(--body);color:var(--ink);background:transparent;width:30%">' + k + '</th><td>' + esc(v) + '</td></tr>').join('')
      + '</tbody></table></div></section>'
      + (w.epochs.length ? '<section class="section"><div class="section-head"><h2>Settled epochs</h2></div><div class="table-wrap"><table class="data"><thead><tr><th>Epoch</th><th>Settled</th><th class="r">GPLY</th><th class="r">SOL</th><th class="r">Wallets</th></tr></thead><tbody>' + w.epochs.slice().reverse().map((e) => '<tr><td class="n" style="text-align:left">' + e.n + '</td><td>' + when(e.to) + '</td><td class="n">' + fmtInt(e.rewards.reduce((a, x) => a + (x.park || 0), 0)) + '</td><td class="n">' + fmtSOL(e.rewards.reduce((a, x) => a + (x.sol || 0), 0)) + '</td><td class="n">' + e.rewards.length + '</td></tr>').join('') + '</tbody></table></div></section>' : '')
      + footHTML();
  }

  /* ---------------- navigation ---------------- */
  function nav(route, arg) {
    const hash = route === 'game' ? 'game-' + arg : route;
    if (location.hash.slice(1) !== hash) { try { history.pushState(null, '', '#' + hash); } catch (e) { try { location.hash = hash; } catch (_) { /* ignore */ } } }
    go(route, arg);
  }
  function go(route, arg) {
    const changed = route !== S.route || arg !== S.arg;
    if (S.route === 'create' && route !== 'create') unmountPlayer('st-screen');
    if (S.route === 'game' && (route !== 'game' || arg !== S.arg)) unmountPlayer('gp-screen');
    if (S.route === 'home' && route !== 'home') unmountPlayer('home-screen');
    if (S.route === 'business' && route !== 'business') unmountPlayer('biz-screen');
    S.route = route; S.arg = arg || null;
    if (changed && route === 'game') S.ui.tab = 'board';
    renderHeader();
    renderView(true);
    if (changed) { window.scrollTo(0, 0); const v = $('#view'); if (v) v.focus({ preventScroll: true }); }
  }
  function parseHash() {
    const h = (location.hash || '').slice(1);
    if (h.startsWith('game-')) return ['game', h.slice(5)];
    if (['home', 'explore', 'create', 'wallet', 'ledger', 'economy', 'business'].includes(h)) return [h, null];
    return ['home', null];
  }
  window.addEventListener('hashchange', () => { const [r, a] = parseHash(); if (r !== S.route || a !== S.arg) go(r, a); });
  window.addEventListener('popstate', () => { const [r, a] = parseHash(); if (r !== S.route || a !== S.arg) go(r, a); });

  /* ---------------- actions ---------------- */
  const gameOf = (el) => S.world && S.world.games.get(el.dataset.gid);
  const ACT = {
    'wallet-chip': () => nav('wallet'),
    'open-game': (el) => nav('game', el.dataset.gid),
    'sort': (el) => { S.ui.sort = el.dataset.sort; renderView(true); },
    'tab': (el) => { S.ui.tab = el.dataset.tab; const g = S.world.games.get(S.arg); if (g) updateGame(g); },
    'modal-close': () => closeModal(),
    'modal-backdrop': (el, e) => { if (e.target === el) closeModal(); },
    'create-wallet': async () => { await createWallet(false); renderView(true); },
    'connect-injected': async () => { await connectInjected(); },
    'import-wallet': () => modal('<h2>Import a key</h2><p>Paste a Solana secret key: base58, or the JSON byte array that Solana CLI keypair files use. It stays in this browser.</p><p class="muted" style="font-size:0.875rem">Use a devnet key. Never paste a key that holds real funds into a prototype.</p><form class="stack" data-form="import"><textarea id="import-key" required placeholder="Base58 secret key or [12, 34, …]"></textarea><div class="row"><button class="btn primary" type="submit">Import</button><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div></form>'),
    'export-key': () => modal('<h2>Your secret key</h2><p>Anyone with this key controls this wallet. It is a devnet key in a prototype, so treat it as a test key, and keep it if you want to use this wallet on another device.</p><pre class="code" id="sk-box">' + esc(S.wallet.secret) + '</pre><div class="row"><button class="btn" type="button" data-act="copy-key">Copy key</button><button class="btn ghost" type="button" data-act="modal-close">Done</button></div>'),
    'copy-key': () => copyText(S.wallet.secret, 'Secret key'),
    'copy-address': () => copyText(S.wallet.from, 'Address'),
    'airdrop': async () => { await ensureWallet(); await signAndAppend('airdrop', {}); toast('Received ' + R.AIRDROP_LAMPORTS / C.LAMPORTS + ' devSOL from the faucet.'); },
    'claim': async () => { await ensureWallet(); await signAndAppend('spark_claim', {}); toast('Claimed ' + R.WEEKLY_SPARKS + ' Sparks.'); },
    'buy-sparks': async () => { await ensureWallet(); await signAndAppend('spark_buy', { packs: 1 }); toast('Bought ' + R.SPARK_PACK.sparks + ' Sparks.'); },
    'convert': async () => { await signAndAppend('convert', { lots: 1 }); toast('Burned ' + R.CONVERT.park + ' GPLY for ' + R.CONVERT.sparks + ' Sparks.'); },
    'collect': async (el) => {
      const g = gameOf(el); if (!g) return;
      await ensureWallet();
      const w = myWallet();
      const splits = C.collectSplits(g.price, g, S.world.games);
      const short_ = (w ? w.sol : 0) < g.price;
      const dropReady = !w || Date.now() - w.lastAirdrop >= R.AIRDROP_EVERY_MS;
      const label = { creator: 'Creator', parent: 'Parent creator', grandparent: 'Grandparent', protocol: 'Protocol fee' };
      modal('<h2>Collect ' + esc(g.title) + '</h2><p>You get edition #' + (g.collects.length + 1) + (g.cap ? ' of ' + fmtInt(g.cap) : '') + ', recorded to your wallet. The game stays free to play for everyone.</p>'
        + '<div class="table-wrap"><table class="data"><tbody>' + splits.map((s) => '<tr><td>' + label[s.role] + (s.to !== C.TREASURY ? ' <span class="muted">' + esc(nameOf(s.to)) + '</span>' : '') + '</td><td class="n">' + fmtSOL(s.amt) + ' SOL</td></tr>').join('') + '<tr><td><b>Total</b></td><td class="n"><b>' + fmtSOL(g.price) + ' SOL</b></td></tr></tbody></table></div>'
        + (short_ ? '<div class="banner warn"><b>You have ' + fmtSOL(w ? w.sol : 0) + ' devSOL.</b>' + (dropReady ? '<span>Get free devSOL from the faucet first.</span><button class="btn small" type="button" data-act="airdrop-then-collect" data-gid="' + esc(g.gid) + '" style="justify-self:start">Get ' + R.AIRDROP_LAMPORTS / C.LAMPORTS + ' devSOL and collect</button>' : '<span>The faucet refills every 24 hours.</span>') + '</div>' : '')
        + '<div class="row"><button class="btn primary" type="button" data-act="confirm-collect" data-gid="' + esc(g.gid) + '"' + (short_ ? ' disabled' : '') + '>Sign and pay ' + fmtSOL(g.price) + ' SOL</button><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'airdrop-then-collect': async (el) => { await signAndAppend('airdrop', {}); await ACT['confirm-collect'](el); },
    'confirm-collect': async (el) => {
      const g = gameOf(el); if (!g) return;
      closeModal();
      const { tx } = await signAndAppend('collect', { gid: g.gid, price: g.price });
      toast('Collected ' + g.title + '. Payment split to ' + (g.parent ? 'creator and lineage' : 'the creator') + '.', null, short(tx.sig, 6, 6));
    },
    'tip': async (el) => {
      const g = gameOf(el); if (!g) return;
      await ensureWallet();
      const w = myWallet();
      modal('<h2>Tip ' + esc(nameOf(g.creator)) + '</h2><p>Tips go 100% to the creator of ' + esc(g.title) + '. You have ' + fmtSOL(w ? w.sol : 0) + ' devSOL.</p><div class="row">'
        + [0.01, 0.05, 0.1, 0.25].map((a) => '<button class="btn" type="button" data-act="confirm-tip" data-gid="' + esc(g.gid) + '" data-amt="' + a + '"' + ((w ? w.sol : 0) < a * C.LAMPORTS ? ' disabled' : '') + '>' + a + ' SOL</button>').join('')
        + '</div>' + ((w ? w.sol : 0) < 0.01 * C.LAMPORTS ? '<p class="muted">Get devSOL from the faucet in your <a href="#wallet" data-nav="wallet">wallet</a> first.</p>' : '') + '<div class="row"><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'confirm-tip': async (el) => {
      const g = gameOf(el); if (!g) return;
      closeModal();
      const amt = Math.round(Number(el.dataset.amt) * C.LAMPORTS);
      await signAndAppend('tip', { gid: g.gid, amt });
      toast('Tipped ' + fmtSOL(amt) + ' SOL to ' + nameOf(g.creator) + '.');
    },
    'boost': async (el) => {
      const g = gameOf(el); if (!g) return;
      const w = myWallet();
      const have = w ? w.park : 0;
      modal('<h2>Boost ' + esc(g.title) + '</h2><p>Burning GPLY lifts a cartridge in the Boosted sort. Burned GPLY leaves the supply for good. You have ' + fmtInt(have) + ' GPLY.</p><div class="row">'
        + [10, 50, 250].map((a) => '<button class="btn" type="button" data-act="confirm-boost" data-gid="' + esc(g.gid) + '" data-amt="' + a + '"' + (have < a ? ' disabled' : '') + '>Burn ' + a + '</button>').join('')
        + '</div>' + (have < 10 ? '<p class="muted">You earn GPLY when an epoch settles: make games people play, or place on a leaderboard.</p>' : '') + '<div class="row"><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'confirm-boost': async (el) => { const g = gameOf(el); closeModal(); await signAndAppend('boost', { gid: g.gid, amt: Number(el.dataset.amt) }); toast('Burned ' + el.dataset.amt + ' GPLY to boost ' + g.title + '.'); },
    'remix': async (el) => { await startRemix(el.dataset.gid); },
    'report': (el) => {
      const g = gameOf(el); if (!g) return;
      modal('<h2>Report ' + esc(g.title) + '</h2><p>Reports go to GamePlay’s moderators. Delisting hides a game from Explore; its signed record stays on the ledger.</p><div class="stack">'
        + ['Harmful or hateful content', 'Copies someone else’s game or brand', 'Scam or misleading', 'Broken or unplayable'].map((r) => '<button class="btn ghost" type="button" data-act="confirm-report" data-gid="' + esc(g.gid) + '" data-reason="' + esc(r) + '" style="justify-content:flex-start">' + esc(r) + '</button>').join('')
        + '</div><div class="row"><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'confirm-report': async (el) => { closeModal(); await ensureWallet(); await signAndAppend('report', { gid: el.dataset.gid, reason: el.dataset.reason }); toast('Thanks. The report is signed and visible to moderators.'); },
    'delist': async (el) => {
      const g = gameOf(el); if (!g) return;
      const p = JSON.parse(JSON.stringify(protocol()));
      p.moderation = p.moderation || { delisted: {} };
      p.moderation.delisted = p.moderation.delisted || {};
      if (p.moderation.delisted[g.gid]) delete p.moderation.delisted[g.gid]; else p.moderation.delisted[g.gid] = 'Delisted by moderators';
      if (S.hasDb) await S.caps.db.doc('protocol/moderation').set({ delisted: p.moderation.delisted });
      else { S.localProtocol = p; LS.set(KEY.protocol, p); }
      if (S.hasDb) S.sharedProtocol = p;
      toast(p.moderation.delisted[g.gid] ? 'Delisted ' + g.title + '.' : 'Relisted ' + g.title + '.');
      scheduleRefresh();
    },
    'fullscreen': () => fullscreen('gp-screen'),
    'fullscreen-studio': () => fullscreen('st-screen'),
    'view-code': async (el) => { const g = gameOf(el); const code = g && (await getBlob(g.hash)); showCode(g ? g.title : 'Game', code); },
    'view-code-studio': () => showCode('Preview', studioCode()),
    'download': async (el) => { const g = gameOf(el); const code = g && (await getBlob(g.hash)); await download(slug(g.title) + '.html', code); },
    'download-studio': async () => { const st = S.studio; const code = studioCode(); const v = st.versions[st.vi]; const t = st.mode === 'kit' ? st.params.title : st.title || (v && v.meta && v.meta.title) || 'gameplay-game'; await download(slug(t) + '.html', code); },
    'copy-code': () => { const t = $('#code-box'); if (t) copyText(t.textContent, 'Code'); },
    'verify': async (el) => {
      const g = gameOf(el); if (!g) return;
      const code = await getBlob(g.hash);
      let res;
      if (!code) res = { ok: false, msg: 'File not available on this device' };
      else {
        const h = await C.sha256hex(code);
        if (h !== g.hash) res = { ok: false, msg: 'File does not match its hash' };
        else if (g.starter) res = { ok: true, msg: 'File matches its hash' };
        else {
          const rec = S.world.log.find((r) => r.tx.id === g.txId);
          const v = rec && (await C.verifyTx(rec.tx));
          res = v && v.ok ? { ok: true, msg: 'File matches; publish signature valid' } : { ok: false, msg: 'Signature check failed' };
        }
      }
      S.ui.verify[g.gid] = res;
      updateGame(g);
    },
    'restart': () => loadPreview(),
    'studio-mode': (el) => { S.studio.mode = el.dataset.mode; saveStudio(); rerenderStudioLeft(); loadPreview(); },
    'kit': (el) => { const st = S.studio; const prevTitle = st.params.title; st.kit = el.dataset.kit; st.params = K.normalizeParams(st.kit, { title: prevTitle, palette: st.params.palette, colors: st.params.colors, shape: st.params.shape }); saveStudio(); rerenderStudioLeft(); refocus('[data-act="kit"][data-kit="' + st.kit + '"]'); loadPreview(); },
    'palette': (el) => {
      const st = S.studio, pal = el.dataset.pal;
      if (pal === 'custom') { st.params.palette = 'custom'; st.params.colors = K.cleanColors(st.brand || st.params.colors); }
      else { if (st.params.palette === 'custom') st.brand = K.cleanColors(st.params.colors); st.params.palette = pal; delete st.params.colors; }
      saveStudio(); rerenderStudioLeft(); refocus('[data-act="palette"][data-pal="' + pal + '"]'); loadPreview(150);
    },
    'brand-demo': () => {
      const st = S.studio || newStudio();
      st.mode = 'kit'; st.parent = null; st.kit = 'runner';
      st.brand = K.cleanColors(st.brand || K.CUSTOM_DEFAULT);
      st.params = K.normalizeParams('runner', { title: 'Your Brand Run', palette: 'custom', colors: st.brand, shape: 'block' });
      S.studio = st; saveStudio(); nav('create');
      toast('Set your colors under Palette and rename the game. Publish it to get a link you can share.');
    },
    'settings': () => openSettings(),
    'copy-contact': () => copyText(String(SITE.contact || ''), 'Email address'),
    'prefs-reset': () => { S.prefs = Object.assign({}, PREF_DEFAULTS); LS.set(KEY.prefs, S.prefs); applyPrefs(); renderView(true); openSettings(); announce('Display and assist settings reset.'); },
    'skip': () => { const v = $('#view'); if (v) { v.focus({ preventScroll: true }); v.scrollIntoView(); } },
    'shape': (el) => { S.studio.params.shape = el.dataset.shape; $$('[data-act="shape"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); saveStudio(); loadPreview(150); },
    'style': (el) => { const s = el.dataset.style; S.studio.style = S.studio.style === s ? '' : s; $$('[data-act="style"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === S.studio.style))); saveStudio(); },
    'idea': (el) => { const idea = el.dataset.idea || el.textContent; S.studio.prompt = idea; const t = $('#st-prompt'); if (t) { t.value = idea; t.focus(); } saveStudio(); },
    'home-idea': (el) => { S.studio.mode = 'ai'; S.studio.prompt = el.dataset.idea; saveStudio(); nav('create'); },
    'gen-new': () => generate('new'),
    'gen-edit': () => generate('edit'),
    'gen-fix': () => generate('fix'),
    'stop': () => { if (S.ctl) S.ctl.abort(); },
    'version': (el) => { S.studio.vi = Number(el.dataset.i); saveStudio(); rerenderStudioLeft(); loadPreview(); },
    'clear-parent': () => { S.studio.parent = null; saveStudio(); rerenderStudioLeft(); },
    'publish': async () => { await publish(); },
    'ledger-filter': (el) => { S.ui.ledger = el.dataset.f; renderView(true); },
    'open-tx': (el) => { S.ui.openTx = S.ui.openTx === el.dataset.id ? null : el.dataset.id; renderView(true); },
    'settle': async () => { await settleEpoch(); },
  };
  function showCode(title, code) {
    if (!code) { toast('The game file is not available on this device.', 'bad'); return; }
    modal('<h2>' + esc(title) + ' source</h2><p class="muted" style="font-size:0.875rem">' + fmtInt(code.length) + ' bytes. One standalone HTML file: no servers, no dependencies. You can host it anywhere.</p><pre class="code" id="code-box" style="max-height:52vh">' + esc(code) + '</pre><div class="row"><button class="btn" type="button" data-act="copy-code">Copy code</button><button class="btn ghost" type="button" data-act="modal-close">Close</button></div>');
  }
  const canDownload = () => !!S.caps.downloads || ENV === 'web';
  async function download(filename, code) {
    if (!code) { toast('The game file is not available on this device.', 'bad'); return; }
    const dl = S.caps.downloads;
    if (!dl && ENV === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([code], { type: 'text/html' }));
      a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast('Downloading ' + filename + '.');
      return;
    }
    if (!dl) { showCode(filename, code); return; }
    try { await dl.save({ filename, data: code }); toast('Saved ' + filename + '.'); }
    catch (e) { if (e && e.code !== 'declined') toast('Download is not available here. Use View code to copy it.', 'bad'); }
  }
  async function settleEpoch() {
    if (!canSettle()) throw new Error('Only the prototype owner can settle epochs.');
    await ensureWallet();
    if (S.wallet.del) throw new Error('Settle with a GamePlay wallet; session keys cannot act as the protocol authority.');
    const w = S.world;
    const pending = C.computeEpoch(w, Date.now());
    if (!pending.rewards.length) throw new Error('Nothing to settle yet.');
    const p = JSON.parse(JSON.stringify(protocol()));
    const prevAuth = p.config ? (p.config.authorities || (p.config.authority ? [p.config.authority] : [])) : [];
    const config = { authorities: prevAuth.includes(S.wallet.from) ? prevAuth : prevAuth.concat(S.wallet.from) };
    const ep = { n: pending.n, from: pending.from, to: pending.to, ts: pending.to, emission: pending.emission, rewards: pending.rewards.map((r) => ({ to: r.to, park: r.park, sol: r.sol })), pk: S.wallet.from };
    ep.sig = await S.wallet.sign(C.epochMessage(ep));
    if (S.hasDb) {
      const db = S.caps.db;
      if (!prevAuth.includes(S.wallet.from)) await db.doc('protocol/config').set(config);
      await db.doc('protocol/e' + ep.n).set(ep);
      S.sharedProtocol = Object.assign(p, { config, epochs: p.epochs.filter((e) => e.n !== ep.n).concat(ep).sort((a, b) => a.n - b.n) });
    } else {
      p.config = config;
      p.epochs = p.epochs.filter((e) => e.n !== ep.n).concat(ep).sort((a, b) => a.n - b.n);
      S.localProtocol = p;
      LS.set(KEY.protocol, p);
    }
    toast('Epoch ' + ep.n + ' settled: ' + fmtInt(ep.rewards.reduce((a, r) => a + r.park, 0)) + ' GPLY to ' + ep.rewards.length + ' wallets.');
    scheduleRefresh();
  }

  /* ---------------- events ---------------- */
  const busyActs = new Set();
  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (navEl) { e.preventDefault(); nav(navEl.dataset.nav); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act, fn = ACT[act];
    if (!fn) return;
    if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'TR') e.preventDefault();
    const key = act + ':' + (el.dataset.gid || '');
    if (busyActs.has(key)) return;
    busyActs.add(key);
    Promise.resolve().then(() => fn(el, e)).catch((err) => { console.error(err); toast((err && err.message) || String(err), 'bad'); }).finally(() => busyActs.delete(key));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.form;
    const run = async () => {
      if (kind === 'handle') {
        const v = ($('#handle-in').value || '').trim();
        if (!v) return;
        await signAndAppend('handle', { name: v });
        toast('Handle saved.');
        renderView(true);
      } else if (kind === 'import') {
        await importWallet($('#import-key').value);
        closeModal();
        renderView(true);
      }
    };
    run().catch((err) => toast(err.message || String(err), 'bad'));
  });
  document.addEventListener('input', (e) => {
    const t = e.target, k = t.dataset && t.dataset.in;
    if (!k || !S.studio) return;
    const st = S.studio;
    if (k === 'prompt') st.prompt = t.value;
    else if (k === 'kit-title') { st.params.title = t.value.slice(0, 40) || 'Untitled'; loadPreview(450); }
    else if (k === 'knob') {
      const kn = K.KITS[st.kit].knobs.find((x) => x.key === t.dataset.key);
      if (!kn) return;
      st.params[kn.key] = kn.type === 'bool' ? t.checked : Number(t.value);
      const out = $('#out-' + kn.key); if (out) out.textContent = fmtKnob(st.params[kn.key], kn);
      loadPreview(260);
    }
    else if (k === 'brand') {
      if (st.params.palette !== 'custom' || !/^#[0-9a-f]{6}$/i.test(t.value)) return;
      st.params.colors = K.cleanColors(Object.assign({}, st.params.colors, { [t.dataset.key]: t.value }));
      st.brand = Object.assign({}, st.params.colors);
      const sw = $('#sw-custom'); if (sw) sw.style.background = brandSwatchBg(st.params.colors);
      loadPreview(250);
    }
    else if (k === 'pub-title') st.title = t.value;
    else if (k === 'pub-desc') st.desc = t.value;
    else if (k === 'pub-price') st.price = t.value;
    else if (k === 'pub-cap') st.cap = t.value;
    else if (k === 'quality') st.quality = t.value;
    saveStudio();
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.type === 'radio' && t.name && t.name.indexOf('pref-') === 0) { setPref(t.name.slice(5), t.value); return; }
    if (t.dataset && (t.dataset.in === 'knob' || t.dataset.in === 'quality')) t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (S.ui.deferred && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { S.ui.deferred = false; renderView(false); }
    }, 0);
  });

  /* ---------------- boot ---------------- */
  async function boot() {
    if (!document.documentElement.lang) document.documentElement.lang = 'en';
    applyPrefs();
    if (reducedMotionQuery && reducedMotionQuery.addEventListener) reducedMotionQuery.addEventListener('change', () => { if (S.prefs.motion === 'system') renderView(true); });
    const [r, a] = parseHash();
    S.route = r; S.arg = a;
    renderHeader();
    S.starters = await K.starterGames(C.sha256hex);
    loadStudio();
    S.world = await C.buildWorld({ accounts: worldAccounts(), protocol: protocol(), starters: S.starters });
    await loadWallet();
    renderHeader();
    renderView(true);
    const cl = window.claude;
    if (cl && typeof cl.use === 'function') {
      const use = (n) => cl.use(n).catch(() => null);
      const [db, user, sample, downloads] = await Promise.all([use('db'), use('user'), use('sample'), use('downloads')]);
      S.caps = { db, user, sample, downloads };
      if (user) {
        S.uid = await user.id();
        S.isOwner = await user.isOwner();
        const cw = await user.can('data.write');
        S.canWrite = cw !== false;
      }
      if (db) {
        S.hasDb = true;
        S.mode = S.uid && S.canWrite ? 'shared' : 'local';
        db.collection('accounts').onSnapshot((snap) => {
          const m = new Map();
          for (const d of snap.docs) { const data = d.data(); if (data) m.set(d.id, data); }
          if (S.mode === 'shared' && S.uid && S.accounts.has(S.uid)) {
            const mine = S.accounts.get(S.uid), fromSnap = m.get(S.uid);
            if (!fromSnap || (fromSnap.txs || []).length < (mine.txs || []).length) m.set(S.uid, mine);
          }
          S.accounts = m;
          scheduleRefresh();
        }, (e) => toast('Live updates stopped (' + (e && e.code) + '). Reload the page to reconnect.', 'bad'));
        db.collection('protocol').onSnapshot((snap) => {
          const p = { config: null, epochs: [], moderation: { delisted: {} } };
          for (const d of snap.docs) {
            const data = d.data(); if (!data) continue;
            if (d.id === 'config') p.config = data;
            else if (d.id === 'moderation') p.moderation = { delisted: data.delisted || {} };
            else if (/^e\d+$/.test(d.id)) p.epochs.push(data);
          }
          p.epochs.sort((x, y) => x.n - y.n);
          S.sharedProtocol = p;
          scheduleRefresh();
        }, () => {});
        if (S.mode === 'shared' && S.localAccount && (S.localAccount.txs || []).length && !LS.get('pp.migrated.' + S.uid)) {
          toast('Your earlier device-only activity stays on this device; new activity goes to the shared gallery.');
          LS.set('pp.migrated.' + S.uid, true);
        }
      }
      if (S.route === 'create' && S.studio && !S.studio.versions.length && sample && S.studio.mode === 'kit' && !LS.get(KEY.studio)) S.studio.mode = 'ai';
      renderHeader();
      renderView(true);
      scheduleRefresh();
    }
    S.ready = true;
  }
  boot().catch((e) => { console.error(e); $('#view').innerHTML = '<div class="empty"><h1>GamePlay could not start</h1><p class="mono">' + esc(e && e.message) + '</p></div>'; });
  window.__pp = S;
})();
