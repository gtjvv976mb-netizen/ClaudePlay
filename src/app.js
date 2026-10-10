/* ClaudePlay app: views, wallet, storage, players and the AI build harness. */
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

  const KEY = { wallet: 'pp.wallet.v1', session: 'pp.session.v1', account: 'pp.account.v1', protocol: 'pp.protocol.v1', studio: 'pp.studio.v1', blob: 'pp.blob.', prefs: 'gp.prefs.v1', gallery: 'pp.gallery.v1', pending: 'pp.pending.v1', pro: 'pp.pro.v1' };
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
    if (pk === C.STARTER) return 'ClaudePlay kit';
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
  async function putBlob(hash, code, screen) {
    S.blobs.set(hash, code);
    if (S.mode === 'shared') {
      try { await S.caps.db.doc('blobs/' + hash).set(Object.assign({ code, size: code.length, ts: Date.now() }, screen ? { screen } : {})); return; }
      catch (e) {
        if (e && e.code === 'blocked') throw new Error(e.message || 'Run the safety check before publishing.');
        if (e && e.code === 'invalid_argument') goLocal(myDoc()); else throw new Error('Could not store the game file (' + (e.code || 'error') + ').');
      }
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
      S.world = await C.buildWorld({ accounts: worldAccounts(), protocol: protocol(), starters: S.starters, chain: worldChain });
      renderHeader();
      renderView(false);
    } catch (e) { console.error(e); }
    refreshing = false;
    if (refreshAgain) { refreshAgain = false; scheduleRefresh(); }
  }

  /* ---------------- wallet ---------------- */
  async function useEmbedded(v) {
    const s = await C.ed.signer(C.b58dec(v.sk));
    S.wallet = { kind: 'embedded', label: 'ClaudePlay wallet', from: s.pk, pk: s.pk, sign: s.sign, secret: v.sk };
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
    loadChainBal();
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
    if (!inj) { toast('No Solana wallet extension can reach this page. Use the ClaudePlay wallet instead.', 'bad'); return; }
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
    if (MAINNET) throw new Error('Keys are not imported on mainnet. Connect your wallet app instead, so your key never touches this page.');
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

  /* ---------------- Solana network ----------------
     When server/server.mjs runs with GP_SOLANA_CLUSTER, GP_SITE.chain is set and collects and tips are
     real Solana payments: the player's wallet pays the creator, the lineage and the treasury directly
     (ClaudePlay never holds funds), the memo "gameplay:<ledger id>" ties the payment to its ledger entry,
     and every page checks the payment on Solana before the entry counts. Without it, the ledger keeps
     its simulated devSOL balances. */
  const SOLN = window.PPSolana;
  const CHAIN = SITE.chain && SITE.chain.api && SOLN.CLUSTERS.includes(SITE.chain.cluster) && SOLN.isAddress(SITE.chain.treasury || '') ? SITE.chain : null;
  const MAINNET = !!CHAIN && CHAIN.cluster === 'mainnet-beta';
  const UNIT = MAINNET ? 'SOL' : 'devSOL';
  const RENT_MIN = 890880; // lamports a brand-new Solana account must receive to exist
  const CHAIN_DROP = 1e9; // what the server's devnet/testnet faucet drops
  const b64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
  async function chainApi(path, body) {
    const res = await fetch(CHAIN.api.replace(/\/?$/, '/') + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.message || 'Solana did not answer. Try again.');
    return j;
  }
  const paySeen = new Map(), payMiss = new Map();
  async function chainLookup(sigs) {
    const now = Date.now();
    const ask = sigs.filter((s) => !paySeen.has(s) && (payMiss.get(s) || 0) < now - 5000);
    for (let i = 0; i < ask.length; i += 100) {
      const part = ask.slice(i, i + 100);
      try {
        const { txs } = await chainApi('txs', { sigs: part });
        for (const s of part) { if (txs && txs[s]) paySeen.set(s, txs[s]); else payMiss.set(s, now); }
      } catch (e) { /* unknown for now: those entries wait for the next refresh */ }
    }
    return new Map(sigs.filter((s) => paySeen.has(s)).map((s) => [s, paySeen.get(s)]));
  }
  const worldChain = CHAIN ? { treasury: CHAIN.treasury, lookup: chainLookup } : null;
  /* Balance: on a real network it is read from Solana; otherwise it is the simulated ledger's. */
  const solOf = (w) => (CHAIN ? S.chainBal || 0 : w ? w.sol : 0);
  async function loadChainBal() {
    if (!CHAIN || !S.wallet) return;
    try { S.chainBal = (await chainApi('balance/' + S.wallet.from)).lamports; renderHeader(); } catch (e) { /* keep the last value */ }
  }
  /* Wallet Standard: wallet apps announce themselves to the page. */
  const STD = [];
  (function discoverWallets() {
    const api = { register: (...ws) => { for (const w of ws) if (w && w.features && !STD.includes(w)) STD.push(w); return () => {}; } };
    window.addEventListener('wallet-standard:register-wallet', (e) => { try { e.detail(api); } catch (err) { /* ignore */ } });
    try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })); } catch (e) { /* ignore */ }
  })();
  async function injectedPay(message) {
    const main = S.wallet.from;
    const unsigned = SOLN.serializeTx(message);
    const chainId = 'solana:' + (MAINNET ? 'mainnet' : CHAIN.cluster);
    const canPay = (w) => w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction'];
    const std = STD.find((w) => canPay(w) && (w.accounts || []).some((a) => a.address === main))
      || STD.find((w) => canPay(w) && w.features['standard:connect'] && String(S.wallet.label).startsWith(w.name));
    if (std) {
      let acct = (std.accounts || []).find((a) => a.address === main);
      if (!acct && std.features['standard:connect']) {
        const r = await std.features['standard:connect'].connect();
        acct = ((r && r.accounts) || []).find((a) => a.address === main);
      }
      if (!acct) throw new Error('Switch your wallet app to ' + short(main) + ' and try again.');
      const st = std.features['solana:signTransaction'];
      if (st) {
        const [out] = await st.signTransaction({ account: acct, transaction: unsigned, chain: chainId });
        return (await chainApi('send', { tx: b64(new Uint8Array(out.signedTransaction)) })).signature;
      }
      const [out] = await std.features['solana:signAndSendTransaction'].signAndSendTransaction({ account: acct, transaction: unsigned, chain: chainId });
      return C.b58enc(new Uint8Array(out.signature));
    }
    const inj = injectedProvider();
    if (inj && typeof inj.p.request === 'function') {
      const r = await inj.p.request({ method: 'signAndSendTransaction', params: { message: C.b58enc(message) } });
      if (r && r.signature) return r.signature;
    }
    throw new Error('Your wallet app cannot pay from this page. Try Phantom, Solflare or Backpack.');
  }
  async function waitConfirmed(sig) {
    for (let i = 0; i < 60; i++) {
      const s = await chainApi('status/' + sig).catch(() => ({}));
      if (s.err) throw new Error('The payment failed on Solana.');
      if (s.status === 'confirmed' || s.status === 'finalized') return;
      await new Promise((r) => setTimeout(r, i < 10 ? 1000 : 2000));
    }
    throw new Error('Solana has not confirmed the payment yet. ClaudePlay will record it once it lands.');
  }
  /* Pays `transfers` ([{ to, amt }]) from the wallet with the memo for ledger entry `id`. */
  async function walletPay(transfers, id) {
    const payer = S.wallet.from;
    const list = transfers.filter((t) => t.amt > 0).map((t) => ({ to: t.to === C.TREASURY ? CHAIN.treasury : t.to, lamports: t.amt }));
    for (const t of list) {
      if (t.to === payer || t.lamports >= RENT_MIN) continue;
      const { lamports } = await chainApi('balance/' + t.to);
      if (!lamports) throw new Error(short(t.to) + ' has never been funded on Solana, and a first payment to a wallet must be at least ' + fmtSOL(RENT_MIN) + ' SOL. Pick a bigger amount.');
    }
    const { blockhash } = await chainApi('blockhash');
    const message = SOLN.buildPayment({ payer, transfers: list, memo: 'gameplay:' + id, blockhash });
    let sig;
    if (S.wallet.kind === 'embedded') {
      const s = await S.wallet.sign(message);
      sig = (await chainApi('send', { tx: b64(SOLN.serializeTx(message, s)) })).signature;
    } else sig = await injectedPay(message);
    return sig;
  }
  /* Collect or tip: check the action first with a stand-in payment, pay on Solana, then record it.
     A payment whose ledger entry was not saved yet is kept in this browser and retried on the next visit. */
  /* The kind each account declared for a wallet ('embedded' keys live in one browser's storage). */
  function walletKind(addr) {
    for (const d of S.accounts.values()) if (d && d.wallets && d.wallets[addr]) return d.wallets[addr].kind;
    const mine = S.localAccount && S.localAccount.wallets && S.localAccount.wallets[addr];
    return mine ? mine.kind : null;
  }
  async function payAndAppend(type, body, transfers) {
    if (!CHAIN) return signAndAppend(type, body);
    if (MAINNET && S.wallet.kind === 'embedded') throw new Error('Real SOL is paid from your own wallet app. Connect Phantom, Solflare or Backpack in Wallet.');
    // Real SOL sent to a key kept in someone's browser storage is lost if they clear it.
    if (MAINNET && transfers.some((t) => t.amt > 0 && t.to !== C.TREASURY && walletKind(t.to) === 'embedded')) throw new Error('This creator has not connected a wallet app, so they cannot receive real SOL yet.');
    const id = C.randHex(8), stand = '1'.repeat(64), from = S.wallet.from;
    const dry = { treasury: CHAIN.treasury, lookup: async (sigs) => {
      const m = await chainLookup(sigs.filter((s) => s !== stand));
      m.set(stand, { ok: true, signer: from, transfers: transfers.map((t) => ({ from, to: t.to === C.TREASURY ? CHAIN.treasury : t.to, lamports: t.amt })), memos: ['gameplay:' + id] });
      return m;
    } };
    await signAndAppend(type, Object.assign({}, body, { chain: stand }), { id, chain: dry, dry: true });
    if (S.wallet.kind !== 'embedded') toast('Approve the payment in your wallet app.');
    const sig = await walletPay(transfers, id);
    const pend = LS.get(KEY.pending) || [];
    pend.push({ id, type, body: Object.assign({}, body, { chain: sig }), from, at: Date.now() });
    LS.set(KEY.pending, pend.slice(-20));
    await waitConfirmed(sig);
    const out = await signAndAppend(type, Object.assign({}, body, { chain: sig }), { id });
    LS.set(KEY.pending, (LS.get(KEY.pending) || []).filter((p) => p.id !== id));
    await loadChainBal();
    return out;
  }
  async function chainAirdrop() {
    const { signature } = await chainApi('airdrop', { to: S.wallet.from });
    await waitConfirmed(signature);
    await loadChainBal();
  }
  async function retryPending() {
    if (!CHAIN || !S.wallet) return;
    for (const p of LS.get(KEY.pending) || []) {
      if (p.from !== S.wallet.from) continue;
      if (S.world.log.some((r) => r.tx.id === p.id && r.ok)) { LS.set(KEY.pending, (LS.get(KEY.pending) || []).filter((x) => x.id !== p.id)); continue; }
      try {
        await signAndAppend(p.type, p.body, { id: p.id });
        LS.set(KEY.pending, (LS.get(KEY.pending) || []).filter((x) => x.id !== p.id));
        toast('Recorded your earlier ' + p.type + ' payment.');
      } catch (e) {
        if (Date.now() - p.at > 86400000) LS.set(KEY.pending, (LS.get(KEY.pending) || []).filter((x) => x.id !== p.id));
      }
    }
  }

  /* ---------------- transactions ---------------- */
  let lastTs = 0;
  /* opts: { id } a preset ledger id (payments carry it in their memo); { dry, chain } checks the
     action against a stand-in payment without saving it. */
  async function signAndAppend(type, body, opts) {
    opts = opts || {};
    if (!S.wallet) throw new Error('Create a wallet first.');
    const doc = myDoc();
    const n = doc.txs.filter((t) => t.from === S.wallet.from).length + 1;
    lastTs = Math.max(Date.now(), lastTs + 1);
    const tx = { id: opts.id || C.randHex(8), t: type, from: S.wallet.from, pk: S.wallet.pk, ts: lastTs, n, b: body };
    if (S.wallet.del) tx.del = S.wallet.del;
    tx.sig = await S.wallet.sign(C.txMessage(tx));
    doc.txs.push(tx);
    doc.primary = S.wallet.from;
    doc.wallets[S.wallet.from] = doc.wallets[S.wallet.from] || { kind: S.wallet.kind, created: Date.now() };
    const w = await C.buildWorld({ accounts: worldAccounts(doc), protocol: protocol(), starters: S.starters, chain: opts.chain || worldChain });
    const rec = w.log.find((r) => r.tx.id === tx.id);
    if (!rec || !rec.ok) throw new Error(rec ? rec.why : 'Transaction rejected.');
    if (opts.dry) return { tx, rec };
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
    const seed = opts.seed != null ? opts.seed >>> 0 : (C.randBytes(4).reduce((a, b) => a * 256 + b, 0)) >>> 0;
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    frame.setAttribute('title', opts.title || 'Game');
    frame.setAttribute('allow', 'autoplay');
    frame.srcdoc = K.withSDK(code, seed, Object.assign(gameOpts(), opts.room ? { room: opts.room.hello } : {}));
    host.querySelectorAll('iframe').forEach((f) => f.remove());
    host.appendChild(frame);
    const player = { id: host.id, frame, seed, opts, running: false, netReady: false, netQueue: [] };
    S.players.set(host.id, player);
    if (opts.room) opts.room.listen((m) => { if (player.netReady) netDeliver(player, m); else player.netQueue.push(m); });
    return player;
  }
  function netDeliver(p, m) { try { p.frame.contentWindow.postMessage(Object.assign({ __ppnet: 1 }, m), '*'); } catch (e) { /* the frame is gone */ } }
  function unmountPlayer(id) {
    const p = S.players.get(id);
    if (p) { try { p.frame.remove(); } catch (e) { /* ignore */ } if (p.opts.room) p.opts.room.close(); S.players.delete(id); }
  }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.__pp !== 1) return;
    for (const p of S.players.values()) {
      if (p.frame.contentWindow !== e.source) continue;
      if (d.t === 'score' && !p.running) { p.running = true; if (p.opts.onStart) p.opts.onStart(); }
      if (d.t === 'over') { if (!p.running && p.opts.onStart) p.opts.onStart(); p.running = false; }
      if (d.t === 'net-ready' && p.opts.room) { p.netReady = true; p.netQueue.splice(0).forEach((m) => netDeliver(p, m)); }
      if (d.t === 'net' && p.opts.room) p.opts.room.send(d.d, typeof d.to === 'string' ? d.to : null);
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

  /* ---------------- multiplayer rooms ----------------
     Games that use SP.room can be played together. On a website served by server/server.mjs a room is
     a relay on the server (SITE.rooms); in the studio, "Test 2 players" joins two previews through a
     room inside the page. A room endpoint is { hello: { me, host, players }, seed, listen(fn), send(d, to), close() }. */
  const isMulti = (code) => /SP\.room\b/.test(code || '');
  const roomBase = () => String(SITE.rooms || '').replace(/\/?$/, '');
  function endpoint(hello, seed, sendFn, closeFn) {
    let fn = null; const early = [];
    return {
      hello, seed,
      listen(f) { fn = f; early.splice(0).forEach(f); },
      emit(m) { if (m.t === 'join') hello.players.push({ id: m.id, name: m.name }); if (m.t === 'leave') hello.players = hello.players.filter((p) => p.id !== m.id); if (m.t === 'host') hello.host = m.id; if (fn) fn(m); else early.push(m); },
      send: sendFn, close: closeFn,
    };
  }
  function localRooms(n) {
    const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + (i + 1), name: 'Player ' + (i + 1) }));
    const seed = (C.randBytes(4).reduce((a, b) => a * 256 + b, 0)) >>> 0;
    const eps = players.map((p) => endpoint({ me: p.id, host: 'p1', players: players.slice() }, seed, (d, to) => {
      eps.forEach((e) => { if (e.hello.me !== p.id && (!to || to === e.hello.me)) setTimeout(() => e.emit({ t: 'msg', from: p.id, d: JSON.parse(JSON.stringify(d === undefined ? null : d)) }), 30); });
    }, () => {}));
    return eps;
  }
  function joinServerRoom(code, gid, onChange) {
    return new Promise((ok, fail) => {
      const url = roomBase() + '/' + encodeURIComponent(code) + '/events?gid=' + encodeURIComponent(gid) + '&name=' + encodeURIComponent(S.wallet ? nameOf(S.wallet.from) : 'Player');
      const es = new EventSource(url);
      let ep = null, queue = [], timer = null, closed = false;
      const flush = async () => {
        timer = null;
        if (!queue.length || closed) return;
        const msgs = queue.splice(0, 40);
        try { await fetch(roomBase() + '/' + code + '/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: ep.hello.me, token: ep.token, msgs }) }); } catch (e) { /* dropped, like a lost packet */ }
        if (queue.length && !timer) timer = setTimeout(flush, 50);
      };
      es.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'hello') {
          ep = endpoint({ me: m.you, host: m.host, players: m.players }, m.seed, (d, to) => { if (queue.length < 400) queue.push({ d, to }); if (!timer) timer = setTimeout(flush, 50); }, () => { closed = true; es.close(); });
          ep.token = m.token;
          ok(ep); onChange(ep);
        } else if (ep) { ep.emit(m); onChange(ep); }
      };
      es.onerror = () => {
        if (closed) return;
        closed = true; es.close();
        if (!ep) fail(new Error('Could not join that room. It may have closed or be full.'));
        else { ep.emit({ t: 'closed' }); onChange(ep, true); }
      };
    });
  }
  function roomHTML(g, state) {
    if (!state) return '';
    if (state.kind === 'offer') return '<div class="banner info"><b>This game is multiplayer.</b>' + (SITE.rooms ? '<span>Open a room and send friends the link to play together.</span><button class="btn small primary" type="button" data-act="room-open" data-gid="' + esc(g.gid) + '" style="justify-self:start">Play with friends</button>' : '<span>Rooms need the ClaudePlay website. You are playing solo here.</span>') + '</div>';
    if (state.kind === 'joining') return '<div class="banner info"><b>Joining room ' + esc(state.code) + '…</b></div>';
    if (state.kind === 'error') return '<div class="banner bad"><b>' + esc(state.message) + '</b><button class="btn small" type="button" data-act="room-leave" data-gid="' + esc(g.gid) + '" style="justify-self:start">Play solo</button></div>';
    const ep = state.ep, link = location.href.split('#')[0] + '#game-' + g.gid + '&room=' + state.code;
    return '<div class="banner info"><b>Room ' + esc(state.code) + (state.lost ? ' · disconnected' : ' · ' + ep.hello.players.length + (ep.hello.players.length === 1 ? ' player' : ' players')) + '</b>'
      + '<span>' + esc(ep.hello.players.map((p) => p.name + (p.id === ep.hello.me ? ' (you)' : '')).join(', ')) + '</span>'
      + '<label class="field"><span class="sr">Room link</span><input type="text" readonly id="room-link" value="' + esc(link) + '"></label>'
      + '<div class="row"><button class="btn small" type="button" data-act="room-copy">Copy link</button><button class="btn small ghost" type="button" data-act="room-leave" data-gid="' + esc(g.gid) + '">Leave room</button></div></div>';
  }
  function renderRoom(g) { const el = $('#gp-room'); if (el) el.innerHTML = roomHTML(g, S.ui.room); }

  /* ---------------- AI harness ---------------- */
  const H = window.PPHarness;
  /* Where AI builds run: inside Claude, the viewer's own account (`sample`); on a website served
     by server/server.mjs, that server (GP_SITE.ai is its build endpoint). */
  const aiReady = () => (ENV === 'claude' ? !!S.caps.sample : !!SITE.ai);
  function aiBuild(req, opts) {
    if (ENV === 'claude') return S.caps.sample(H.harnessPrompt(req.kind, req), Object.assign({ cache: false, modelTier: req.tier }, opts));
    return serverBuild(req, opts);
  }
  /* Streams a build from the ClaudePlay server: one JSON object per line ({t:'text'|'done'|'error'}). */
  async function serverBuild(req, opts) {
    const aborted = () => !!(opts.signal && opts.signal.aborted);
    let res;
    try {
      res = await fetch(SITE.ai, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, keyHeader()), body: JSON.stringify(req), signal: opts.signal });
    } catch (e) {
      throw aborted() ? { code: 'cancelled' } : { code: 'offline', message: 'Could not reach the ClaudePlay server. Check your connection and try again.' };
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
    if (S.plan && typeof done.left === 'number') S.plan.left = done.left;
    return { text, truncated: !!done.truncated };
  }

  /* ---------------- Free and Pro plans ----------------
     On a website served by server/server.mjs, AI builds come in two plans: free (a few builds a day on a
     low-cost model) and Pro, a pass paid in SOL from the player's wallet straight to the site owner's
     treasury. The memo "gameplay:<pro id>" ties the payment to this browser's gallery account, and the
     server checks it on Solana before turning Pro on. */
  const apiUrl = (name) => String(SITE.ai || '').replace(/build$/, name);
  const keyHeader = () => { const k = SITE.gallery ? LS.get(KEY.gallery) : null; return k ? { 'x-gp-key': k } : {}; };
  const modelName = (id) => String(id || '').replace(/^claude-/, 'Claude ').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1').replace(/ (\w)/, (m, c) => ' ' + c.toUpperCase());
  const shortDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  async function loadPlan() {
    if (ENV !== 'web' || !SITE.ai) return;
    try {
      const res = await fetch(apiUrl('status'), { headers: keyHeader() });
      if (!res.ok) return;
      S.plan = await res.json();
    } catch (e) { return; }
    const pend = LS.get(KEY.pro);
    if (pend && pend.sig && S.plan.pro && S.plan.plan !== 'pro' && Date.now() - pend.at < 2 * 86400000) {
      try { await claimPro(pend.sig, 1); return; } catch (e) { /* tried again on the next visit */ }
    }
    renderPlan();
  }
  async function claimPro(sig, tries) {
    for (let i = 0; ; i++) {
      const res = await fetch(apiUrl('pro'), { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, keyHeader()), body: JSON.stringify({ sig }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { LS.del(KEY.pro); await loadPlan(); return j.until; }
      if (res.status === 409 && j.code === 'pending' && i + 1 < tries) { await new Promise((r) => setTimeout(r, 2000)); continue; }
      if (res.status !== 409 || j.code === 'used') LS.del(KEY.pro);
      throw new Error(j.message || 'Could not turn Pro on. Try again.');
    }
  }
  function planHTML() {
    const p = S.plan;
    if (ENV !== 'web' || !p || !p.ai) return '';
    const builds = fmtInt(p.left) + ' of ' + fmtInt(p.daily) + ' new games' + (p.edits ? ' and ' + fmtInt(p.edits.left) + ' changes' : '') + ' left today';
    const m = p.models || {};
    if (p.plan === 'pro') {
      return '<p class="muted"><b>Pro</b> until ' + esc(shortDate(p.until)) + ' · ' + builds + ' · new games use ' + esc(modelName(m.new)) + '.'
        + (p.pro && p.pro.memo ? ' <button class="btn small ghost" type="button" data-act="get-pro">Add ' + p.pro.days + ' days</button>' : '') + '</p>';
    }
    return '<div class="stack" style="gap:6px"><p class="muted"><b>Free plan</b> · ' + builds + ' · new games built with ' + esc(modelName(m.freeNew || m.free)) + '.</p>'
      + (p.pro && p.pro.memo ? '<div class="row"><button class="btn small" type="button" data-act="get-pro">Get Pro · ' + fmtSOL(p.pro.price) + ' ' + UNIT + ' for ' + p.pro.days + ' days</button><span class="muted">' + p.pro.daily + ' new games and ' + (p.pro.dailyEdits || 60) + ' changes a day</span></div>' : '')
      + '</div>';
  }
  function renderPlan() { const el = $('#st-plan'); if (el) el.innerHTML = planHTML(); const q = $('#st-gen'); if (q && !S.studio.busy) q.innerHTML = genButtons(); }
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
  const STYLES = H.STYLES, IDEAS = H.IDEAS, CRYPTO_IDEAS = H.CRYPTO_IDEAS, GENRES = H.GENRES;
  const ideaName = (t) => t.split(':')[0];

  /* ---------------- the creator's pictures ----------------
     An uploaded picture becomes a small sprite in the browser: scaled to fit PIC_SIDE, a plain
     background made transparent, empty edges cropped. At build time it is restyled to the chosen art
     style and added to the game file as a block the AI never sees (H.withPictures). */
  const PIC_SIDE = 128;
  const loadImg = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('That file is not a picture this browser can read.')); im.src = src; });
  const readFile = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Could not read that file.')); r.readAsDataURL(file); });
  function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  function picName(raw, taken) {
    let n = String(raw || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+/, '').replace(/_+$/, '').slice(0, 14) || 'pic';
    let out = n, i = 2;
    while (taken.includes(out)) out = n.slice(0, 13) + i++;
    return out;
  }
  /* Makes a plain, even background transparent by flooding in from the edges. */
  function clearBackground(d) {
    const { width: w, height: h, data: px } = d;
    const edge = [];
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
    const opaque = edge.filter((i) => px[i * 4 + 3] > 200);
    if (opaque.length < edge.length * 0.6) return;
    const avg = [0, 1, 2].map((c) => opaque.reduce((a, i) => a + px[i * 4 + c], 0) / opaque.length);
    const near = (i, tol) => Math.abs(px[i * 4] - avg[0]) + Math.abs(px[i * 4 + 1] - avg[1]) + Math.abs(px[i * 4 + 2] - avg[2]) <= tol;
    if (opaque.filter((i) => near(i, 60)).length < edge.length * 0.6) return;
    const seen = new Uint8Array(w * h), stack = edge.filter((i) => near(i, 70));
    stack.forEach((i) => { seen[i] = 1; });
    while (stack.length) {
      const i = stack.pop();
      px[i * 4 + 3] = 0;
      const x = i % w, y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !seen[j]) { seen[j] = 1; if (px[j * 4 + 3] > 0 && near(j, 70)) stack.push(j); }
      }
    }
  }
  function cropBox(d) {
    const { width: w, height: h, data: px } = d;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  async function picFromFile(file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('Pick a picture file (PNG, JPG, GIF or WebP).');
    if (file.size > 15e6) throw new Error('That picture is too large. Pick one under 15 MB.');
    const im = await loadImg(await readFile(file));
    const k = Math.min(1, PIC_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = canvasOf(w, h), x = c.getContext('2d');
    x.drawImage(im, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h);
    clearBackground(d);
    x.putImageData(d, 0, 0);
    const b = cropBox(d);
    const out = canvasOf(b.w, b.h);
    out.getContext('2d').drawImage(c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return out.toDataURL('image/png');
  }
  /* Draws `src` with an outline of `color` (radius r) behind it, on a canvas padded by r. */
  function outlined(src, r, color, shadow) {
    const c = canvasOf(src.width + r * 2 + (shadow ? 2 : 0), src.height + r * 2 + (shadow ? 2 : 0)), x = c.getContext('2d');
    const sil = canvasOf(src.width, src.height), sx = sil.getContext('2d');
    sx.drawImage(src, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = color; sx.fillRect(0, 0, sil.width, sil.height);
    if (shadow) { x.globalAlpha = 0.3; const dark = canvasOf(src.width, src.height), dx = dark.getContext('2d'); dx.drawImage(src, 0, 0); dx.globalCompositeOperation = 'source-in'; dx.fillStyle = '#000'; dx.fillRect(0, 0, dark.width, dark.height); x.drawImage(dark, r + 2, r + 2); x.globalAlpha = 1; }
    for (let a = 0; a < 16; a++) x.drawImage(sil, r + Math.round(Math.cos(a / 8 * Math.PI) * r), r + Math.round(Math.sin(a / 8 * Math.PI) * r));
    x.drawImage(src, r, r);
    return c;
  }
  /* The picture restyled for an art style, as { w, h, data } (PNG base64), small enough to send. */
  async function stylePic(raw, style) {
    const im = await loadImg(raw);
    let side = Math.max(im.naturalWidth, im.naturalHeight);
    if (style === 'Pixel art') side = Math.min(side, 32);
    for (;;) {
      const k = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
      let c = canvasOf(Math.round(im.naturalWidth * k), Math.round(im.naturalHeight * k));
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        let r = px[i], g = px[i + 1], b = px[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        if (style === 'Pixel art') { const q = (v) => Math.round(v / 51) * 51; r = q(r); g = q(g); b = q(b); px[i + 3] = px[i + 3] < 128 ? 0 : 255; }
        else if (style === 'Monochrome ink') { r = g = b = l < 85 ? 17 : l < 170 ? 110 : 236; }
        else if (style === 'Neon arcade') { const s = 1.7; r = l + (r - l) * s + 20; g = l + (g - l) * s + 20; b = l + (b - l) * s + 20; }
        else if (style === 'Pastel cozy') { r = r * 0.6 + 102; g = g * 0.6 + 102; b = b * 0.6 + 102; }
        px[i] = Math.max(0, Math.min(255, r)); px[i + 1] = Math.max(0, Math.min(255, g)); px[i + 2] = Math.max(0, Math.min(255, b));
      }
      x.putImageData(d, 0, 0);
      if (style === 'Neon arcade') c = outlined(c, 2, '#3ff6ff');
      else if (style === 'Paper cutout') c = outlined(c, 3, '#ffffff', true);
      else if (style === 'Monochrome ink') c = outlined(c, 1, '#111111');
      const data = c.toDataURL('image/png').split(',')[1];
      if (data.length <= H.PICS.data && c.width <= H.PICS.side && c.height <= H.PICS.side) return { w: c.width, h: c.height, data };
      side = Math.floor(side * 0.8);
      if (side < 8) throw new Error('A picture is too detailed to use. Try a simpler one.');
    }
  }
  const stylePics = (pics, style) => Promise.all((pics || []).map(async (p) => Object.assign({ name: p.name }, await stylePic(p.raw, style))));
  function picsHTML() {
    const st = S.studio, pics = st.pics || [];
    return '<div class="stack" style="gap:8px"><p class="eyebrow" id="pics-label">Your pictures</p>'
      + (pics.length ? '<div class="pics" role="group" aria-labelledby="pics-label">' + pics.map((p, i) => '<div class="pic"><img src="' + esc(p.raw) + '" alt=""><label class="sr" for="pic-' + i + '">Name of picture ' + (i + 1) + '</label><input id="pic-' + i + '" type="text" maxlength="16" data-in="pic-name" data-i="' + i + '" value="' + esc(p.name) + '" spellcheck="false"><button class="btn small ghost" type="button" data-act="pic-del" data-i="' + i + '" aria-label="Remove picture ' + esc(p.name) + '">Remove</button></div>').join('') + '</div>' : '')
      + '<div class="row">' + (pics.length < H.PICS.max ? '<button class="btn small" type="button" data-act="pic-add">Add a picture</button>' : '') + '<span class="muted" style="font-size:0.875rem">' + (pics.length ? 'Use the names in your idea, like “the hero is ' + esc(pics[0].name) + '”.' : 'Turn a drawing or photo into a character or item.') + ' Plain backgrounds are removed and pictures match the art style.</span></div></div>';
  }
  async function addPicture(file) {
    const st = S.studio;
    st.pics = st.pics || [];
    if (st.pics.length >= H.PICS.max) return;
    try {
      const raw = await picFromFile(file);
      st.pics.push({ name: picName(file.name, st.pics.map((p) => p.name)), raw });
      saveStudio(); rerenderStudioLeft();
      toast('Added the picture. Mention it by name in your idea.');
    } catch (e) { toast(e.message || 'Could not use that picture.', 'bad'); }
  }

  /* ---------------- studio state ---------------- */
  function newStudio() {
    return {
      mode: aiReady() ? 'ai' : 'kit', kit: 'runner', params: K.normalizeParams('runner', { title: 'My Runner', palette: 'neon', shape: 'block' }),
      versions: [], vi: -1, chat: [], prompt: '', style: '', pics: [], quality: 'default', brand: null,
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
      const keep = { mode: st.mode, kit: st.kit, params: st.params, brand: st.brand, versions: st.versions.slice(-6), vi: Math.min(st.vi, 5), chat: st.chat.slice(-20), prompt: st.prompt, style: st.style, pics: st.pics, dim: st.dim, players: st.players, genre: st.genre, quality: st.quality, parent: st.parent, title: st.title, desc: st.desc, price: st.price, cap: st.cap };
      if (st.versions.length > 6) keep.vi = Math.max(-1, st.vi - (st.versions.length - 6));
      if (!LS.set(KEY.studio, keep) && keep.versions.length > 2) {
        keep.vi = Math.max(-1, keep.vi - (keep.versions.length - 2)); keep.versions = keep.versions.slice(-2);
        LS.set(KEY.studio, keep);
      }
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
    chip.innerHTML = '<span class="dot"></span><span class="addr">' + esc(short(S.wallet.from)) + '</span><span class="bal"><span title="' + UNIT + '">' + I.sol + fmtSOL(solOf(w)) + '</span><span title="Sparks">' + I.spark + fmtInt(w ? w.sparks : 0) + '</span><span title="GPLY">' + I.park + fmtInt(w ? w.park : 0) + '</span></span>';
  }
  function footHTML() {
    const where = S.mode === 'shared' ? 'Connected to the shared gallery'
      : S.hasDb ? 'View-only on the shared gallery; your activity stays on this device'
      : 'Running on this device only: your key, games and scores stay in this browser';
    return '<footer class="foot"><div class="foot-main"><b class="foot-mark">ClaudePlay</b>'
      + '<p>An unofficial fan project on Solana. Not affiliated with or endorsed by Anthropic, Google or Google Labs Playground. Claude is a trademark of Anthropic.</p>'
      + '<p>' + (MAINNET ? 'Collects and tips are real SOL on Solana mainnet, paid from your own wallet app straight to creators. ClaudePlay never holds your funds. GPLY rewards are points with no cash value, and nothing is for sale.'
        : CHAIN ? 'Devnet: collects and tips are real Solana devnet transactions paid with free test SOL, so no real funds move. GPLY is a working name and is not for sale.'
        : 'Devnet preview: transactions use real Ed25519 signatures on a simulated Solana ledger, and no real funds move. GPLY is a working name and is not for sale.') + '</p></div>'
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
    const tags = [];
    if (g.starter) tags.push('<span class="chip">Starter kit</span>');
    if (g.parent) tags.push('<span class="chip accent">Remix</span>');
    if (g.kit === 'ai') tags.push('<span class="chip">AI-built</span>');
    if (g.boost) tags.push('<span class="chip gold">' + I.park + ' ' + fmtInt(g.boost) + ' boost</span>');
    if (g.local) tags.push('<span class="chip">This device</span>');
    if (g.ratingCount) tags.push('<span class="chip" title="Rated ' + g.rating.toFixed(1) + ' out of 5 by ' + plural(g.ratingCount, 'player') + '"><span aria-hidden="true">★</span> ' + g.rating.toFixed(1) + '<span class="sr"> out of 5 stars</span> (' + fmtInt(g.ratingCount) + ')</span>');
    const price = g.starter ? 'Free' : g.price ? fmtSOL(g.price) + ' SOL' : 'Free collect';
    // Each sticker sits a few degrees off straight, the same way every time for the same game.
    const tilt = ((parseInt(String(g.hash || g.gid).slice(-2), 16) || 0) % 7 - 3) * 0.6;
    return '<a class="cart" href="#game-' + esc(g.gid) + '" data-act="open-game" data-gid="' + esc(g.gid) + '" style="--r:' + tilt.toFixed(1) + 'deg">'
      + '<span class="sticker"><img src="' + K.cover(g) + '" alt="" width="480" height="300"></span>'
      + '<span class="cart-title">' + esc(g.title) + '</span>'
      + '<span class="cart-by"><span>by <b>' + esc(nameOf(g.creator)) + '</b></span><span>' + esc(price) + '</span></span>'
      + '<span class="cart-tags">' + tags.join('') + '</span></a>';
  }
  const SORTS = [['new', 'Newest'], ['played', 'Most played'], ['earning', 'Top earning'], ['remixed', 'Most remixed'], ['rated', 'Top rated'], ['boosted', 'Boosted']];
  /* Ranks by rating, pulled toward 3 stars until a game has a few ratings, so one 5-star vote does not top the list. */
  const ratedScore = (g) => ((g.rating || 0) * (g.ratingCount || 0) + 3 * 3) / ((g.ratingCount || 0) + 3);
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
      rated: (a, b) => (ratedScore(b) - ratedScore(a)) || ((b.ratingCount || 0) - (a.ratingCount || 0)) || (b.ts - a.ts),
    }[S.ui.sort];
    community = community.sort(by);
    const totalPlayers = w ? new Set([].concat(...[...w.games.values()].map((g) => [...g.players]))).size : 0;
    const sigs = w ? w.log.filter((r) => r.ok).length : 0;
    return '<section class="page-head"><div class="stack">'
      + '<h1>Play any game free</h1>'
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
    ['Is ClaudePlay free?', 'Yes. Playing, making and publishing are free. Every week you get ' + R.WEEKLY_SPARKS + ' Sparks for AI builds, and you earn ' + R.SPARKS_PER_PLAYER + ' more for each new player who tries one of your games.'],
    ['Do I need a crypto wallet?', 'No. The first time you score or publish, ClaudePlay creates a wallet key in your browser. You can connect Phantom, Solflare or Backpack later, or export the key from Wallet.'],
    MAINNET ? ['Is this real money?', 'Yes. Collects and tips are paid in real SOL from your own wallet app, straight to the creator, the remix creators and a 5% protocol fee. ClaudePlay never holds your funds. GPLY rewards are points with no cash value, and nothing is for sale.']
      : ['Is this real money?', 'Not yet. This preview runs on Solana devnet, so SOL balances are test tokens. GPLY is the working name of a future reward token. Nothing is for sale and there is no presale.'],
    ['Who can use it?', 'Anyone with a modern browser, in any country. When real-money features arrive they will follow local rules, including age checks where the law requires them.'],
    ['Is ClaudePlay made by Anthropic or Google?', 'No. ClaudePlay is an unofficial fan project. It is not affiliated with or endorsed by Anthropic, Google or Google Labs Playground. Claude is a trademark of Anthropic.'],
    ['Can I keep my game?', 'Yes. Every game is one HTML file. Download it from its page and it plays offline in any browser, with no ClaudePlay account.'],
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
    return '<div class="spec"><table><caption class="sr">ClaudePlay compared with Google Labs Playground</caption><thead><tr><th scope="col"><span class="sr">Feature</span></th><th scope="col">Google Labs Playground</th><th scope="col">ClaudePlay</th></tr></thead><tbody>'
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
    const seg = [['you', 'You, the remixer', creatorBps], ['parent', 'Creator of the game you remixed', R.PARENT_BPS], ['grand', 'Creator one step further back', R.GRAND_BPS], ['fee', 'ClaudePlay protocol fee', R.FEE_BPS]];
    const solOf = (bps) => (bps / 10000).toFixed(2);
    const st = S.studio || {};
    const dim = st.dim || '2d';
    const peeks = S.starters.filter((x) => x.gid !== 'kit-neon-dash').slice(0, 3);
    return '<section class="hero hero-home pack" aria-labelledby="hero-title"><div class="hero-copy">'
      + '<h1 class="hero-title" id="hero-title"><span>Make it.</span> <span>Play it.</span> <span class="hl">Own it.</span></h1>'
      + '<p class="lede">Describe a game in one sentence and Claude builds it. Share the link, and earn when people collect or remix it.</p>'
      + '<form class="maker" data-form="home-build"><label class="sr" for="home-prompt">Describe your game</label>'
      + '<div class="maker-box"><textarea id="home-prompt" rows="2" maxlength="600" placeholder="A cat on a skateboard dodging gas fees across neon rooftops">' + esc(st.versions && st.versions.length ? '' : (st.prompt || '')) + '</textarea>'
      + '<div class="maker-bar"><div class="seg" role="group" aria-label="2D or 3D">' + ['2d', '3d'].map((d) => '<button type="button" data-act="dim" data-dim="' + d + '" aria-pressed="' + (dim === d) + '">' + d.toUpperCase() + '</button>').join('') + '</div>'
      + '<button class="btn primary" type="submit">' + I.spark + (aiReady() ? ' Build it' : ' Open the studio') + '</button></div></div>'
      + '<div class="maker-ideas" role="group" aria-labelledby="h-crypto"><span class="fine" id="h-crypto">Or start from a crypto idea</span>' + CRYPTO_IDEAS.map((t) => '<button class="chip" type="button" data-act="home-idea" data-idea="' + esc(t) + '" title="' + esc(t) + '">' + esc(ideaName(t)) + '</button>').join('') + '</div></form>'
      + '<p class="fine"><a href="#explore" data-nav="explore">Play a game first</a>, or <a href="#create" data-act="home-kit">tune a kit with no AI</a>. Free, with no sign-up.</p></div>'
      + '<div class="stage3d">' + peeks.map((x, i) => '<span class="sticker peek peek-' + 'abc'[i] + '" aria-hidden="true"><img src="' + K.cover(Object.assign({ creator: C.STARTER }, x)) + '" alt="" width="480" height="300"></span>').join('')
      + '<figure class="console" id="home-console">'
      + '<div class="screen" id="home-screen" data-gid="kit-neon-dash"' + (hero ? ' style="background:#05070a url(' + K.cover(Object.assign({ creator: C.STARTER }, hero)) + ') center/cover"' : '') + '></div>'
      + '<figcaption class="console-cap"><span><b>Neon Dash</b> · Tap the game, or press Tab to reach it and Space to jump.</span><a href="#game-kit-neon-dash" data-act="open-game" data-gid="kit-neon-dash">Leaderboard</a></figcaption></figure>'
      + '<img class="mascot" id="home-mascot" src="' + MASCOT + '" alt="" width="370" height="403" decoding="async"></div></section>'

      + '<section class="section" aria-labelledby="h-carts"><div class="section-head"><h2 id="h-carts">Peel one off and play</h2><a href="#explore" data-nav="explore">See every game</a></div>'
      + '<div class="sheet"><div class="shelf" id="home-shelf">' + homeShelf() + '</div></div></section>'

      + '<section class="section flow" aria-labelledby="h-steps"><div class="flow-intro"><h2 class="h2" id="h-steps">From one sentence to a game your friends can play</h2>'
      + '<p class="lede">Every game is free to play and free to remix, and the file is yours to keep.</p><a class="btn primary" href="#create" data-nav="create">' + I.spark + ' Open the maker</a></div>'
      + '<ol class="flow-list">'
      + '<li><b>Describe</b><p>Tell the AI studio what to build, in 2D or 3D, with your own pictures if you like. Or pick Runner, Flapper, Shooter, Breaker or Dodger and tune it by hand.</p></li>'
      + '<li><b>Play-test</b><p>The preview restarts with every change. Each game works with touch, mouse and keyboard, and with a friend in the same room.</p></li>'
      + '<li><b>Publish</b><p>Your wallet signs the game’s fingerprint, so anyone can check it was not changed. You set the collect price and the number of editions.</p></li>'
      + '<li><b>Earn</b><p>New players bring you Sparks, collectors pay you SOL, and every remix of your game pays you a share.</p></li>'
      + '<li><b>For crowds</b><p>Running a brand, a community or a class? <a href="#business" data-nav="business">ClaudePlay for business</a> makes branded games with leaderboards you can check.</p></li>'
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
      + '</ul></div><p class="fine">' + (MAINNET ? 'Collects, tips and royalties are paid in real SOL straight to your wallet. GPLY rewards are points with no cash value.' : 'On devnet these are test balances. Real payouts start at mainnet beta, after a security audit.') + '</p></section>'

      + '<section class="section" aria-labelledby="h-compare"><div class="section-head"><h2 id="h-compare">ClaudePlay and Google Labs Playground</h2>'
      + '<p class="muted">Google Labs launched Playground on October 7, 2026. Here is how the two compare.</p></div>'
      + '<div class="table-scroll">' + specTable() + '</div>'
      + '<p class="fine">Playground details as reported in October 2026: ' + PLAYGROUND_SOURCES.map(([n, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(n) + '</a>').join(', ') + '.</p></section>'

      + '<section class="section access" aria-labelledby="h-access"><div class="access-intro"><h2 class="h2" id="h-access">Built for every player</h2>'
      + '<p class="muted">These settings work across the site and inside every game.</p><button class="btn" type="button" data-act="settings">Open accessibility settings</button></div><ul class="feature-grid">'
      + '<li><b>Assist mode</b><span>Slow any game to 75% or 50% speed. Assisted runs count as personal results and stay off ranked leaderboards.</span></li>'
      + '<li><b>One-button friendly</b><span>Runner and Flapper play with a single key or tap. Every kit works with keyboard, touch or mouse.</span></li>'
      + '<li><b>Calm motion</b><span>Turn off screen shake and page animations, or follow your device’s reduced-motion setting.</span></li>'
      + '<li><b>High contrast, larger text</b><span>A black-and-yellow high-contrast theme and three text sizes.</span></li>'
      + '<li><b>Screen reader support</b><span>Labeled controls, focus that moves to each new page, and a spoken score when a run ends.</span></li>'
      + '<li><b>Light on data</b><span>One small page with no tracking scripts. Games are single files you can download and play offline.</span></li>'
      + '</ul></section>'

      + '<section class="section" aria-labelledby="h-road"><div class="section-head"><h2 id="h-road">Roadmap</h2>'
      + '<p class="muted">Fun first, money second, the token last. Each stage opens when the checkpoint before it is met, not on a date.</p></div><ol class="road">'
      + ROADMAP.map((s) => '<li class="stage' + (s.now ? ' now' : '') + '"><div class="stage-top">' + (s.now ? '<span class="chip accent">We are here</span>' : '') + '</div><b>' + esc(s.name) + '</b><p>' + esc(s.what) + '</p>' + (s.gate ? '<p class="gate"><span>Checkpoint</span>' + esc(s.gate) + '</p>' : '') + '</li>').join('')
      + '</ol></section>'

      + '<section class="section" aria-labelledby="h-faq"><div class="section-head"><h2 id="h-faq">Questions</h2></div><div class="faq">'
      + FAQ.map(([q, a]) => '<details><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>').join('')
      + '</div></section>';
  }
  function mountHome() {
    unmountPlayer('home-screen');
    $('#view').innerHTML = homeHTML() + footHTML();
    wakeMascot($('#home-mascot'));
    revealShelf($('#home-shelf'));
    const host = $('#home-screen');
    const hero = S.starters.find((s) => s.gid === 'kit-neon-dash');
    if (!host || !hero) return;
    mountPlayer(host, hero.code, {
      title: 'Neon Dash, a playable runner game',
      onStart: () => recordPlay(hero.gid).catch(() => {}),
      onMessage: (d, p) => { if (d.t === 'over') onGameOver(hero.gid, d, p).catch((e) => toast(e.message, 'bad')); },
    });
  }
  // Cart, the mascot, is a sticker on the console. The page carries a still; on the website (SITE.mascot, set by
  // build.mjs) the waving loop, a separate file next to the page, replaces it once loaded, unless calm motion is on.
  const MASCOT = 'MASCOT_STILL';
  function wakeMascot(img) {
    if (!img || !SITE.mascot || calmNow()) return;
    const anim = new Image();
    anim.onload = () => { if (img.isConnected && !calmNow()) img.src = anim.src; };
    anim.src = SITE.mascot;
  }
  // Stickers on a sheet slap down in turn the first time they scroll into view.
  function revealShelf(root) {
    if (!root || calmNow() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((list) => list.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      e.target.style.setProperty('--i', String([...e.target.parentElement.children].indexOf(e.target) % 8));
      e.target.classList.add('in');
    }), { rootMargin: '0px 0px -8% 0px' });
    [...root.children].forEach((c) => io.observe(c));
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
      + '<h1 class="page-title" id="biz-title">Games your audience plays from a link</h1>'
      + '<p class="lede">We build branded mini-games for brands, crypto communities and classrooms. Players need no app and no sign-up, and you get a leaderboard you can check.</p>'
      + '<div class="row cta"><button class="btn primary big" type="button" data-act="brand-demo">Make a branded demo</button>' + contact + '</div>'
      + '<p class="fine">The demo takes about a minute: pick your colors, rename the game and play it.</p></div>'
      + '<figure class="console">'
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
      + '<li><b>You keep the game</b><span>It is one HTML file. Host it on your own site, or keep it on ClaudePlay.</span></li>'
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
  function rateHTML(g) {
    const ratings = g.ratings ? [...g.ratings.values()] : [];
    const mine = S.wallet && ratings.find((r) => r.pk === S.wallet.from);
    const own = S.wallet && g.creator === S.wallet.from;
    const avg = g.ratingCount ? '<b>' + g.rating.toFixed(1) + '</b> out of 5 from ' + plural(g.ratingCount, 'rating') : 'No ratings yet';
    return '<div class="rate"><span class="muted"><span aria-hidden="true">★</span> ' + avg + '</span>'
      + (own ? '' : '<div class="row" role="group" aria-label="Your rating">' + [1, 2, 3, 4, 5].map((n) => '<button class="star" type="button" data-act="rate" data-gid="' + esc(g.gid) + '" data-stars="' + n + '" aria-pressed="' + !!(mine && mine.stars === n) + '" aria-label="Rate ' + n + (n === 1 ? ' star' : ' stars') + '"><span aria-hidden="true">' + (mine && n <= mine.stars ? '★' : '☆') + '</span></button>').join('') + '</div>')
      + '</div>';
  }
  function gameAbout(g) {
    const players = g.players ? g.players.size : 0;
    const facts = [[fmtInt(players), 'unique players'], [fmtInt(g.plays), 'runs'], [fmtInt(g.scores.size), 'signed scores']];
    if (!g.starter) facts.push([fmtInt(g.collects.length) + (g.cap ? ' / ' + fmtInt(g.cap) : ''), 'editions owned'], [fmtSOL(g.revenue), 'SOL earned'], [fmtInt(g.remixes.length), 'remixes']);
    if (g.reports && g.reports.length) facts.push([fmtInt(g.reports.length), 'reports']);
    return '<div class="stack">' + rateHTML(g) + (g.desc ? '<p>' + esc(g.desc) + '</p>' : '')
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
        + '<dt>Stored at</dt><dd class="hash">' + (g.starter ? 'Built into ClaudePlay' : 'blobs/' + esc(g.hash.slice(0, 16)) + '… (content-addressed; Arweave in production)') + '</dd>'
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
      v.innerHTML = '<div class="empty"><h1>' + (S.world ? 'Cartridge not found' : 'Loading ClaudePlay…') + '</h1><p>' + (S.world ? 'It may have been published on another device, or it is still syncing.' : '') + '</p><a class="btn" href="#explore" data-nav="explore">Back to Explore</a></div>';
      return;
    }
    v.innerHTML = '<div class="gp-head"><a href="#explore" data-nav="explore">← Explore</a><h1>' + esc(g.title) + '</h1><div class="row" id="gp-chips">' + gameChips(g) + '</div></div>'
      + '<div class="gp-grid"><div class="gp-main"><div class="screen" id="gp-screen" data-gid="' + esc(g.gid) + '" style="background:#05070a url(' + K.cover(g) + ') center/cover"></div>'
      + '<div class="toolbar" id="gp-actions">' + gameActions(g) + '</div><div id="gp-room"></div><div id="gp-about">' + gameAbout(g) + '</div></div>'
      + '<aside class="gp-side"><div class="tabs" role="tablist" id="gp-tabs">' + TABS.map(([k, l]) => '<button role="tab" type="button" data-act="tab" data-tab="' + k + '" aria-selected="' + (S.ui.tab === k) + '">' + l + '</button>').join('') + '</div><div class="panel" id="gp-panel">' + gamePanel(g) + '</div></aside></div>' + footHTML();
    const code = await getBlob(g.hash);
    const host = $('#gp-screen');
    if (!host || host.dataset.gid !== g.gid) return;
    if (!code) { host.innerHTML = '<div class="screen-cover" style="cursor:default"><span>The game file is not available on this device.</span></div>'; return; }
    const play = (room) => mountPlayer(host, code, {
      title: g.title, room, seed: room ? room.seed : null,
      onStart: () => recordPlay(g.gid).catch(() => {}),
      onMessage: (d, p) => { if (d.t === 'over') onGameOver(g.gid, d, p).catch((e) => toast(e.message, 'bad')); if (d.t === 'error') toast('This game reported an error: ' + d.v, 'bad'); },
    });
    S.ui.mountSeq = (S.ui.mountSeq || 0) + 1;
    if (!isMulti(code)) { S.ui.room = null; play(null); return; }
    const want = S.ui.roomCode;
    if (!want || !SITE.rooms) { S.ui.room = { kind: 'offer' }; renderRoom(g); play(null); return; }
    S.ui.room = { kind: 'joining', code: want }; renderRoom(g);
    const seq = S.ui.mountSeq = (S.ui.mountSeq || 0) + 1;
    try {
      const ep = await joinServerRoom(want, g.gid, (e, lost) => { if (S.ui.room && S.ui.room.ep === e) { if (lost) S.ui.room.lost = true; renderRoom(g); } });
      if (seq !== S.ui.mountSeq || S.route !== 'game' || S.arg !== g.gid || S.ui.roomCode !== want || $('#gp-screen') !== host) { ep.close(); return; }
      S.ui.room = { kind: 'in', code: want, ep }; renderRoom(g);
      play(ep);
    } catch (e) {
      S.ui.room = { kind: 'error', message: e.message }; renderRoom(g);
    }
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
          ? '<div class="banner warn"><b>Describing games with AI needs a Claude sign-in.</b><span>The AI studio runs on your own Claude account. Sign in to Claude and open ClaudePlay again to use it. Tuning a kit works for everyone, and publishing, scores and collecting work the same either way.</span><button class="btn small" type="button" data-act="studio-mode" data-mode="kit" style="justify-self:start">Tune a kit instead</button></div>'
          : '<div class="banner warn"><b>The AI studio is not switched on for this copy of ClaudePlay yet.</b><span>It needs a ClaudePlay server with an AI key. Tune a kit instead: publishing, scores and collecting work the same.</span><button class="btn small" type="button" data-act="studio-mode" data-mode="kit" style="justify-self:start">Tune a kit instead</button></div>';
      } else {
        const chat = st.chat.length ? st.chat.map((m) => '<div class="msg ' + (m.role === 'user' ? 'me' : m.role === 'note' ? 'note' : '') + '">' + esc(m.text) + '</div>').join('')
          : '<div class="msg note">Describe the game you want. Each build is a full game file you can play right away, then refine with follow-up requests.</div>';
        const has = !!st.versions.length;
        body = '<div class="panel stack"><div class="split"><p class="eyebrow">Describe your game</p><span class="chip" title="Your Sparks">' + I.spark + ' <span id="st-sparks">' + fmtInt(studioSparks()) + '</span> Sparks</span></div>'
          + '<div class="chat" id="st-chat">' + chat + '</div><div id="st-stream"></div>'
          + (has ? '' : '<div class="stack" style="gap:8px"><p class="eyebrow" id="crypto-ideas">Make a crypto game</p><div class="row" role="group" aria-labelledby="crypto-ideas">' + CRYPTO_IDEAS.map((t) => '<button class="chip" type="button" data-act="idea" data-idea="' + esc(t) + '" title="' + esc(t) + '">' + esc(ideaName(t)) + '</button>').join('') + '</div></div>')
          + '<label class="field"><span class="sr">Your idea or change</span><textarea id="st-prompt" data-in="prompt" placeholder="' + (has ? 'Ask for a change: “make the jump higher and add a double-jump power-up”' : 'Block Miner: stack falling transaction blocks before the gas meter runs dry…') + '">' + esc(st.prompt) + '</textarea></label>'
          + '<div class="row" role="group" aria-label="Game type"><div class="seg" role="group" aria-label="2D or 3D">' + ['2d', '3d'].map((d) => '<button type="button" data-act="dim" data-dim="' + d + '" aria-pressed="' + ((st.dim || '2d') === d) + '">' + d.toUpperCase() + '</button>').join('') + '</div>'
          + '<label class="sr" for="st-genre">Genre</label><select id="st-genre" data-in="genre" style="width:auto"><option value="">Any genre</option>' + GENRES.map((g) => '<option' + (st.genre === g ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select>'
          + '<button class="chip" type="button" data-act="players" aria-pressed="' + (st.players === 'multi') + '">Multiplayer</button></div>'
          + '<div class="row" role="group" aria-label="Art style">' + STYLES.map((s) => '<button class="chip" type="button" data-act="style" data-style="' + esc(s) + '" aria-pressed="' + (st.style === s) + '">' + esc(s) + '</button>').join('') + '</div>'
          + picsHTML()
          + '<div class="row" id="st-gen">' + genButtons() + '</div><div id="st-plan">' + planHTML() + '</div>'
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
      + '<select id="st-quality" data-in="quality" aria-label="Build quality" style="width:auto"><option value="default"' + (st.quality === 'default' ? ' selected' : '') + '>Standard build</option><option value="complex"' + (st.quality === 'complex' ? ' selected' : '') + '>' + (S.plan && S.plan.pro && S.plan.plan !== 'pro' ? 'Best build (Pro)' : 'Best build (slower)') + '</option></select>';
  }
  function publishPanel() {
    const st = S.studio;
    const ai = st.mode === 'ai';
    const meta = ai && st.versions[st.vi] ? st.versions[st.vi].meta || {} : {};
    const ready = !!studioCode();
    return '<div class="panel stack" id="st-publish"><p class="eyebrow">Publish</p>'
      + (ai ? '<label class="field">Title<input id="pub-title" type="text" maxlength="40" data-in="pub-title" value="' + esc(st.title || meta.title || '') + '" placeholder="Game title"></label>' : '')
      + '<label class="field">Description<input id="pub-desc" type="text" maxlength="200" data-in="pub-desc" value="' + esc(st.desc || meta.desc || '') + '" placeholder="One line players see on the cartridge"></label>'
      + '<div class="grid2"><label class="field">Collect price <small>' + UNIT + ', 0 for a free collect</small><input id="pub-price" type="number" min="0" max="100" step="0.01" data-in="pub-price" value="' + esc(st.price) + '"></label>'
      + '<label class="field">Editions <small>0 for an open edition</small><input id="pub-cap" type="number" min="0" max="100000" step="1" data-in="pub-cap" value="' + esc(st.cap) + '"></label></div>'
      + (st.blocked ? '<div class="banner bad" role="alert"><b>The safety check stopped this game</b><span>' + esc(st.blocked.join(' ')) + '</span><span class="muted">Ask for a change that fixes it, then publish again.</span></div>' : '')
      + '<p class="muted" style="font-size:0.875rem">Every game gets an automatic safety check before it goes public. Publishing is free: network fees are sponsored. You sign the game’s content hash with your wallet; anyone can verify the file was not changed.</p>'
      + '<div class="row"><button class="btn primary" type="button" data-act="publish"' + (ready && !st.busy ? '' : ' disabled') + '>Sign &amp; publish</button>' + (ready ? '' : '<span class="muted">Build a game first.</span>') + '</div></div>';
  }
  function studioTools() {
    const st = S.studio;
    const ready = !!studioCode();
    const versions = st.mode === 'ai' && st.versions.length > 1 ? '<div class="versions" role="group" aria-label="Versions">' + st.versions.map((v, i) => '<button class="chip" type="button" data-act="version" data-i="' + i + '" aria-pressed="' + (i === st.vi) + '">v' + (i + 1) + '</button>').join('') + '</div>' : '';
    return '<button class="btn small" type="button" data-act="restart"' + (ready ? '' : ' disabled') + '>Restart</button>'
      + '<button class="btn small ghost" type="button" data-act="fullscreen-studio"' + (ready ? '' : ' disabled') + '>Fullscreen</button>'
      + (st.mode === 'ai' && isMulti(studioCode()) ? '<button class="btn small" type="button" data-act="mp-test" aria-pressed="' + !!st.mp + '">' + (st.mp ? 'One player' : 'Test 2 players') + '</button>' : '')
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
    $('#view').innerHTML = '<div class="gp-head"><h1>Make a cartridge</h1></div>'
      + '<div class="studio"><section class="st-left stack" id="st-left">' + studioLeft() + '</section>'
      + '<section class="st-right" id="st-right"><div class="screen" id="st-screen"></div><div class="toolbar" id="st-tools">' + studioTools() + '</div><div id="st-status">' + studioStatus() + '</div></section></div>' + footHTML();
    loadPreview();
    renderStream();
    loadPlan();
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
      unmountPlayer('st-p1'); unmountPlayer('st-p2');
      if (!code) { unmountPlayer('st-screen'); host.innerHTML = '<div class="screen-cover" style="cursor:default;background:transparent"><span>Your game appears here</span></div>'; rerenderStudioRight(); return; }
      const onMessage = (d) => {
        if (d.t === 'error') { S.studio.error = d.v; rerenderStudioRight(); }
        if (d.t === 'over') { S.studio.lastRun = Math.floor(d.v || 0); rerenderStudioRight(); }
      };
      if (S.studio.mp && isMulti(code)) {
        // Two previews in one room inside the page, so creators can test multiplayer before publishing.
        unmountPlayer('st-screen');
        host.innerHTML = '<div class="mp-split"><div id="st-p1"></div><div id="st-p2"></div></div>';
        localRooms(2).forEach((ep, i) => mountPlayer($('#st-p' + (i + 1)), code, { title: 'Preview, player ' + (i + 1), room: ep, seed: ep.seed, onMessage }));
        rerenderStudioRight();
        return;
      }
      host.innerHTML = '';
      mountPlayer(host, code, { title: 'Preview', onMessage });
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
      const pics = await stylePics(st.pics, st.style);
      const req = { kind, prompt, style: st.style, mode: st.dim || '2d', genre: st.genre || '', players: st.players === 'multi' ? 'multi' : '', pics, code: kind === 'new' ? '' : H.stripPictures(base || ''), error: kind === 'fix' ? errText : '', tier: st.quality === 'complex' ? 'complex' : 'default' };
      const res = await aiBuild(req, {
        signal: ctl.signal,
        onText: ({ text }) => {
          st.stream.phase = 'Writing code · ' + (text.length / 1024).toFixed(1) + ' KB';
          st.stream.tail = text.slice(-900);
          renderStream();
        },
      });
      const code = H.withPictures(extractHTML(res.text), pics);
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
      if (S.plan) loadPlan();
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
    if (MAINNET && S.wallet.kind === 'embedded') throw new Error('Connect your wallet app (Phantom, Solflare or Backpack) in Wallet before publishing, so collects and tips reach a wallet you control.');
    const hash = await C.sha256hex(code);
    const gid = 'g' + C.randHex(8);
    const check = await safetyCheck(code, title, (st.desc || meta.desc || '').slice(0, 200));
    if (!check.ok) {
      st.blocked = check.reasons; rerenderStudioLeft();
      throw new Error('The safety check stopped this game: ' + check.reasons.join(' '));
    }
    st.blocked = null;
    await putBlob(hash, code, check.token);
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
  /* The safety check every game passes before it is published. On the website the server reviews it
     (patterns plus Claude, and the gallery only takes checked files); inside Claude the viewer's own
     Claude account reviews it; elsewhere only the pattern checks run. */
  async function safetyCheck(code, title, desc) {
    const found = H.staticScreen(code);
    if (found.length) return { ok: false, reasons: found };
    toast('Running the safety check…');
    if (ENV === 'web' && SITE.screen) {
      let res, j = {};
      try { res = await fetch(SITE.screen, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, title, desc }) }); j = await res.json(); }
      catch (e) { throw new Error('Could not reach the safety check. Check your connection and try again.'); }
      if (!res.ok) throw new Error(j.message || 'The safety check failed. Try again.');
      return j.ok ? { ok: true, token: j.token } : { ok: false, reasons: j.reasons || ['The safety check did not allow this game.'] };
    }
    if (ENV === 'claude' && S.caps.sample) {
      try {
        const res = await S.caps.sample(H.SCREEN_PROMPT + '\n\nTITLE: ' + title + '\nDESCRIPTION: ' + desc + '\n\nGAME CODE:\n' + H.stripPictures(code), { cache: false });
        const v = H.parseScreen(res && (res.text || res));
        return v.ok ? { ok: true } : { ok: false, reasons: v.reasons };
      } catch (e) { return { ok: true }; } // the viewer declined or has no Claude access; the gallery owner can still delist
    }
    return { ok: true };
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
      return '<div class="gp-head"><h1>Get a wallet in one click</h1></div>'
        + '<div class="grid2"><div class="panel stack"><h2 class="display" style="font-size:1.25rem;text-transform:uppercase">ClaudePlay wallet</h2><p>A Solana keypair made in your browser. No extension, no seed phrase to write down first, and it works on phones.</p><p class="muted" style="font-size:0.875rem">Production uses a passkey or social-login embedded wallet with gasless transactions. This prototype keeps the devnet key in this browser so you can export it any time.</p><div class="row"><button class="btn primary" type="button" data-act="create-wallet">Create wallet</button><button class="btn ghost" type="button" data-act="import-wallet">Import a key</button></div></div>'
        + '<div class="panel stack"><h2 class="display" style="font-size:1.25rem;text-transform:uppercase">Bring your own</h2><p>Connect Phantom, Solflare or Backpack. You sign once to approve a 7-day session key, so games never interrupt you with pop-ups.</p>'
        + (inj ? '<div class="row"><button class="btn" type="button" data-act="connect-injected">Connect ' + esc(inj.name) + '</button></div>' : '<p class="muted" style="font-size:0.875rem">No wallet extension can reach this page. Embedded pages often hide extensions, so open ClaudePlay in its own tab to use one.</p>')
        + '</div></div>' + footHTML();
    }
    const w = myWallet() || { sol: 0, sparks: 0, park: 0, weeks: new Set(), lastAirdrop: 0, earnedSol: 0, earnedPark: 0, sparksEarned: 0, txs: [] };
    const now = Date.now();
    const nextDrop = CHAIN ? 0 : w.lastAirdrop + R.AIRDROP_EVERY_MS;
    const dropAmt = CHAIN ? CHAIN_DROP : R.AIRDROP_LAMPORTS;
    const claimed = w.weeks.has(C.weekKey(now));
    const games = S.world ? [...S.world.games.values()].filter((g) => g.creator === S.wallet.from) : [];
    const owned = S.world ? [...S.world.games.values()].filter((g) => g.collects.some((c) => c.pk === S.wallet.from)) : [];
    const recent = S.world ? S.world.log.filter((r) => r.ok && (r.tx.from === S.wallet.from || r.moves.some((m) => m.to === S.wallet.from))).slice(-12).reverse() : [];
    return '<div class="gp-head"><h1>' + esc(nameOf(S.wallet.from)) + '</h1></div>'
      + '<div class="grid3">'
      + '<div class="panel balance"><span class="unit">' + UNIT + '</span><span class="amt">' + fmtSOL(solOf(w)) + '</span><span class="muted" style="font-size:0.875rem">For collects and tips. Earned ' + fmtSOL(w.earnedSol) + ' SOL so far.</span>' + (MAINNET ? '<p class="muted" style="font-size:0.875rem">Real SOL on Solana mainnet, paid straight from your wallet app.</p>' : '<div class="row"><button class="btn small" type="button" data-act="airdrop"' + (now < nextDrop ? ' disabled' : '') + '>' + (now < nextDrop ? 'Faucet in ' + Math.ceil((nextDrop - now) / 3600000) + 'h' : 'Get ' + dropAmt / C.LAMPORTS + ' devSOL') + '</button></div>') + '</div>'
      + '<div class="panel balance"><span class="unit">Sparks</span><span class="amt">' + fmtInt(w.sparks) + '</span><span class="muted" style="font-size:0.875rem">Pay for AI builds. Not transferable. ' + fmtInt(w.sparksEarned) + ' earned from players.</span><div class="row"><button class="btn small" type="button" data-act="claim"' + (claimed ? ' disabled' : '') + '>' + (claimed ? 'Claimed this week' : 'Claim ' + R.WEEKLY_SPARKS + ' free') + '</button>' + (CHAIN ? '' : '<button class="btn small ghost" type="button" data-act="buy-sparks">Buy ' + R.SPARK_PACK.sparks + ' for ' + R.SPARK_PACK.lamports / C.LAMPORTS + ' SOL</button>') + '</div></div>'
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
  const TYPE = { airdrop: 'Faucet', spark_claim: 'Weekly Sparks', handle: 'Handle', gen: 'AI build', publish: 'Publish', collect: 'Collect', tip: 'Tip', score: 'Score', spark_buy: 'Spark pack', boost: 'Boost', convert: 'Convert', report: 'Report', rate: 'Rating', epoch: 'Epoch rewards' };
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
      case 'rate': return { who, what: g ? g.title : '', amt: Math.floor(+tx.b.stars || 0) + ' ★' };
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
    return '<div class="gp-head"><h1>Every move, signed</h1><p class="muted" style="max-width:62ch">ClaudePlay replays every signed transaction in order and recomputes all balances, so nothing here depends on trusting the server. Tap a row to see the exact bytes that were signed.</p></div>'
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
    return '<div class="diagram-wrap"><svg viewBox="0 0 760 236" role="img" aria-label="How value flows through ClaudePlay"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" style="fill:var(--ink-2)"/></marker></defs>'
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
    return '<div class="gp-head"><h1>Rewards paid from real activity</h1><p class="muted" style="max-width:66ch">Players and collectors pay creators directly. A 5% fee and Spark packs fill the treasury, which pays for everyone’s free Sparks and sends 40% of fees back to creators each epoch. GPLY is emitted on a fixed, decaying schedule and burned when people boost games or convert it to Sparks.</p></div>'
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
    S.ui.roomCode = null;
    if (location.hash.slice(1) !== hash) { try { history.pushState(null, '', '#' + hash); } catch (e) { try { location.hash = hash; } catch (_) { /* ignore */ } } }
    go(route, arg);
  }
  function go(route, arg) {
    const changed = route !== S.route || arg !== S.arg;
    if (S.route === 'create' && route !== 'create') { unmountPlayer('st-screen'); unmountPlayer('st-p1'); unmountPlayer('st-p2'); }
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
    if (h.startsWith('game-')) { const [gid, room] = h.slice(5).split('&room='); return ['game', gid, room && /^[A-HJ-NP-Z2-9]{6}$/.test(room) ? room : null]; }
    if (['home', 'explore', 'create', 'wallet', 'ledger', 'economy', 'business'].includes(h)) return [h, null];
    return ['home', null];
  }
  function onHash() {
    const [r, a, room] = parseHash();
    const roomChanged = (room || null) !== (S.ui.roomCode || null);
    S.ui.roomCode = room || null;
    if (r !== S.route || a !== S.arg) go(r, a);
    else if (r === 'game' && roomChanged) mountGame();
  }
  window.addEventListener('hashchange', onHash);
  window.addEventListener('popstate', onHash);

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
    'airdrop': async () => {
      await ensureWallet();
      if (CHAIN) { await chainAirdrop(); toast('Received ' + CHAIN_DROP / C.LAMPORTS + ' devSOL from the ' + CHAIN.cluster + ' faucet.'); return; }
      await signAndAppend('airdrop', {}); toast('Received ' + R.AIRDROP_LAMPORTS / C.LAMPORTS + ' devSOL from the faucet.');
    },
    'claim': async () => { await ensureWallet(); await signAndAppend('spark_claim', {}); toast('Claimed ' + R.WEEKLY_SPARKS + ' Sparks.'); },
    'buy-sparks': async () => { await ensureWallet(); await signAndAppend('spark_buy', { packs: 1 }); toast('Bought ' + R.SPARK_PACK.sparks + ' Sparks.'); },
    'convert': async () => { await signAndAppend('convert', { lots: 1 }); toast('Burned ' + R.CONVERT.park + ' GPLY for ' + R.CONVERT.sparks + ' Sparks.'); },
    'collect': async (el) => {
      const g = gameOf(el); if (!g) return;
      await ensureWallet();
      await loadChainBal();
      const w = myWallet();
      const splits = C.collectSplits(g.price, g, S.world.games);
      const short_ = solOf(w) < g.price;
      const dropReady = CHAIN ? !MAINNET : !w || Date.now() - w.lastAirdrop >= R.AIRDROP_EVERY_MS;
      const dropAmt = CHAIN ? CHAIN_DROP : R.AIRDROP_LAMPORTS;
      const label = { creator: 'Creator', parent: 'Parent creator', grandparent: 'Grandparent', protocol: 'Protocol fee' };
      modal('<h2>Collect ' + esc(g.title) + '</h2><p>You get edition #' + (g.collects.length + 1) + (g.cap ? ' of ' + fmtInt(g.cap) : '') + ', recorded to your wallet. The game stays free to play for everyone.</p>'
        + '<div class="table-wrap"><table class="data"><tbody>' + splits.map((s) => '<tr><td>' + label[s.role] + (s.to !== C.TREASURY ? ' <span class="muted">' + esc(nameOf(s.to)) + '</span>' : '') + '</td><td class="n">' + fmtSOL(s.amt) + ' SOL</td></tr>').join('') + '<tr><td><b>Total</b></td><td class="n"><b>' + fmtSOL(g.price) + ' SOL</b></td></tr></tbody></table></div>'
        + (short_ ? '<div class="banner warn"><b>You have ' + fmtSOL(solOf(w)) + ' ' + UNIT + '.</b>' + (dropReady ? '<span>Get free devSOL from the faucet first.</span><button class="btn small" type="button" data-act="airdrop-then-collect" data-gid="' + esc(g.gid) + '" style="justify-self:start">Get ' + dropAmt / C.LAMPORTS + ' devSOL and collect</button>' : MAINNET ? '<span>Add SOL to your wallet app first.</span>' : '<span>The faucet refills every 24 hours.</span>') + '</div>' : '')
        + '<div class="row"><button class="btn primary" type="button" data-act="confirm-collect" data-gid="' + esc(g.gid) + '"' + (short_ ? ' disabled' : '') + '>Sign and pay ' + fmtSOL(g.price) + ' SOL</button><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'airdrop-then-collect': async (el) => { if (CHAIN) await chainAirdrop(); else await signAndAppend('airdrop', {}); await ACT['confirm-collect'](el); },
    'confirm-collect': async (el) => {
      const g = gameOf(el); if (!g) return;
      closeModal();
      const { tx } = await payAndAppend('collect', { gid: g.gid, price: g.price }, C.collectSplits(g.price, g, S.world.games));
      toast('Collected ' + g.title + '. Payment split to ' + (g.parent ? 'creator and lineage' : 'the creator') + '.', null, short(tx.sig, 6, 6));
    },
    'tip': async (el) => {
      const g = gameOf(el); if (!g) return;
      await ensureWallet();
      await loadChainBal();
      const w = myWallet();
      modal('<h2>Tip ' + esc(nameOf(g.creator)) + '</h2><p>Tips go 100% to the creator of ' + esc(g.title) + '. You have ' + fmtSOL(solOf(w)) + ' ' + UNIT + '.</p><div class="row">'
        + [0.01, 0.05, 0.1, 0.25].map((a) => '<button class="btn" type="button" data-act="confirm-tip" data-gid="' + esc(g.gid) + '" data-amt="' + a + '"' + (solOf(w) < a * C.LAMPORTS ? ' disabled' : '') + '>' + a + ' SOL</button>').join('')
        + '</div>' + (solOf(w) < 0.01 * C.LAMPORTS ? '<p class="muted">' + (MAINNET ? 'Add SOL to your wallet app first.' : 'Get devSOL from the faucet in your <a href="#wallet" data-nav="wallet">wallet</a> first.') + '</p>' : '') + '<div class="row"><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'confirm-tip': async (el) => {
      const g = gameOf(el); if (!g) return;
      closeModal();
      const amt = Math.round(Number(el.dataset.amt) * C.LAMPORTS);
      await payAndAppend('tip', { gid: g.gid, amt }, [{ to: g.creator, amt }]);
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
    'get-pro': async () => {
      const p = S.plan && S.plan.pro; if (!p || !p.memo) return;
      await ensureWallet();
      if (MAINNET && S.wallet.kind === 'embedded') throw new Error('Real SOL is paid from your own wallet app. Connect Phantom, Solflare or Backpack in Wallet.');
      await loadChainBal();
      const bal = solOf(myWallet()), short_ = bal < p.price + 10000;
      modal('<h2>Get ClaudePlay Pro</h2><p>' + fmtSOL(p.price) + ' ' + UNIT + ' for ' + p.days + ' days: ' + p.daily + ' new games and ' + (p.dailyEdits || 60) + ' AI changes a day, and best builds made with ' + esc(modelName(S.plan.models && S.plan.models.new)) + ' for changes too.</p>'
        + '<p class="muted">Your wallet pays the site owner directly on Solana' + (MAINNET ? ', in real SOL' : '') + '. Pro belongs to this browser’s ClaudePlay account. You have ' + fmtSOL(bal) + ' ' + UNIT + '.</p>'
        + (short_ ? '<p class="muted">' + (MAINNET ? 'Add SOL to your wallet app first.' : 'Get devSOL from the faucet in your <a href="#wallet" data-nav="wallet">wallet</a> first.') + '</p>' : '')
        + '<div class="row"><button class="btn primary" type="button" data-act="confirm-pro"' + (short_ ? ' disabled' : '') + '>Pay ' + fmtSOL(p.price) + ' ' + UNIT + '</button><button class="btn ghost" type="button" data-act="modal-close">Cancel</button></div>');
    },
    'confirm-pro': async () => {
      const p = S.plan && S.plan.pro; if (!p || !p.memo) return;
      closeModal();
      if (S.wallet.kind !== 'embedded') toast('Approve the payment in your wallet app.');
      const sig = await walletPay([{ to: p.treasury, amt: p.price }], p.memo.slice('gameplay:'.length));
      LS.set(KEY.pro, { sig, at: Date.now() });
      await waitConfirmed(sig);
      const until = await claimPro(sig, 6);
      await loadChainBal();
      toast('Pro is on until ' + shortDate(until) + '.');
    },
    'confirm-boost': async (el) => { const g = gameOf(el); closeModal(); await signAndAppend('boost', { gid: g.gid, amt: Number(el.dataset.amt) }); toast('Burned ' + el.dataset.amt + ' GPLY to boost ' + g.title + '.'); },
    'remix': async (el) => { await startRemix(el.dataset.gid); },
    'report': (el) => {
      const g = gameOf(el); if (!g) return;
      modal('<h2>Report ' + esc(g.title) + '</h2><p>Reports go to ClaudePlay’s moderators. Delisting hides a game from Explore; its signed record stays on the ledger.</p><div class="stack">'
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
    'dim': (el) => { S.studio.dim = el.dataset.dim; $$('[data-act="dim"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dim === S.studio.dim))); saveStudio(); },
    'style': (el) => { const s = el.dataset.style; S.studio.style = S.studio.style === s ? '' : s; $$('[data-act="style"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === S.studio.style))); saveStudio(); },
    'idea': (el) => { const idea = el.dataset.idea || el.textContent; S.studio.prompt = idea; const t = $('#st-prompt'); if (t) { t.value = idea; t.focus(); } saveStudio(); },
    'home-idea': (el) => { S.studio.mode = 'ai'; S.studio.prompt = el.dataset.idea; saveStudio(); nav('create'); },
    'home-kit': () => { if (!S.studio.versions.length) S.studio.mode = 'kit'; saveStudio(); nav('create'); },
    'gen-new': () => generate('new'),
    'gen-edit': () => generate('edit'),
    'gen-fix': () => generate('fix'),
    'stop': () => { if (S.ctl) S.ctl.abort(); },
    'rate': async (el) => {
      const stars = +el.dataset.stars;
      await ensureWallet();
      await signAndAppend('rate', { gid: el.dataset.gid, stars });
      toast('Rated ' + stars + (stars === 1 ? ' star' : ' stars') + '. Thanks!');
    },
    'room-open': async (el) => {
      const gid = el.dataset.gid;
      el.disabled = true;
      try {
        const res = await fetch(roomBase(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gid }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message || 'Could not open a room. Try again.');
        try { history.replaceState(null, '', '#game-' + gid + '&room=' + j.code); } catch (e) { /* ignore */ }
        S.ui.roomCode = j.code;
        await mountGame();
        toast('Room ' + j.code + ' is open. Copy the link and send it to friends.');
      } catch (e) { el.disabled = false; toast(e.message, 'bad'); }
    },
    'room-copy': async () => {
      const inp = $('#room-link'); if (!inp) return;
      try { await navigator.clipboard.writeText(inp.value); toast('Room link copied.'); } catch (e) { inp.focus(); inp.select(); toast('Press Ctrl+C or ⌘C to copy the link.'); }
    },
    'room-leave': (el) => {
      S.ui.roomCode = null;
      try { history.replaceState(null, '', '#game-' + el.dataset.gid); } catch (e) { /* ignore */ }
      mountGame();
    },
    'players': (el) => { S.studio.players = S.studio.players === 'multi' ? '' : 'multi'; el.setAttribute('aria-pressed', String(S.studio.players === 'multi')); saveStudio(); },
    'mp-test': () => { S.studio.mp = !S.studio.mp; loadPreview(); },
    'pic-add': () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/webp';
      inp.addEventListener('change', () => { if (inp.files && inp.files[0]) addPicture(inp.files[0]); });
      inp.click();
    },
    'pic-del': (el) => { const st = S.studio; st.pics.splice(+el.dataset.i, 1); saveStudio(); rerenderStudioLeft(); const b = $('[data-act="pic-add"]'); if (b) b.focus(); },
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
    if (S.wallet.del) throw new Error('Settle with a ClaudePlay wallet; session keys cannot act as the protocol authority.');
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
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.id === 'home-prompt') { e.preventDefault(); e.target.form.requestSubmit(); }
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
      } else if (kind === 'home-build') {
        const t = $('#home-prompt'), v = ((t && t.value) || '').trim();
        if (!v) { toast('Describe your game first.'); if (t) t.focus(); return; }
        S.studio.mode = 'ai'; S.studio.prompt = v; saveStudio();
        nav('create');
        if (aiReady()) await generate('new');
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
    else if (k === 'genre') st.genre = t.value;
    else if (k === 'pic-name') {
      const i = +t.dataset.i, p = st.pics && st.pics[i];
      if (!p) return;
      p.name = picName(t.value, st.pics.filter((q, j) => j !== i).map((q) => q.name));
    }
    saveStudio();
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.type === 'radio' && t.name && t.name.indexOf('pref-') === 0) { setPref(t.name.slice(5), t.value); return; }
    if (t.dataset && (t.dataset.in === 'knob' || t.dataset.in === 'quality' || t.dataset.in === 'genre')) t.dispatchEvent(new Event('input', { bubbles: true }));
    if (t.dataset && t.dataset.in === 'pic-name' && S.studio.pics[+t.dataset.i]) t.value = S.studio.pics[+t.dataset.i].name;
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (S.ui.deferred && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { S.ui.deferred = false; renderView(false); }
    }, 0);
  });

  /* ---------------- shared gallery on a website ---------------- */
  /* On a website served by server/server.mjs (GP_SITE.gallery is set), the server keeps the shared
     gallery. This gives the page the same db/user interface Claude gives an artifact. Each browser
     has a random gallery key; the site owner opens the site once as /?admin=<GP_ADMIN_KEY>. */
  async function webCaps() {
    const base = SITE.gallery.replace(/\/?$/, '/');
    const qs = new URLSearchParams(location.search);
    const admin = qs.get('admin');
    if (admin) {
      LS.set(KEY.gallery, admin);
      qs.delete('admin');
      try { history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash); } catch (e) { /* ignore */ }
    }
    let key = LS.get(KEY.gallery);
    if (!key) { key = C.randHex(24); LS.set(KEY.gallery, key); }
    const call = async (method, path, body) => {
      let res;
      try {
        res = await fetch(base + path, { method, headers: Object.assign({ 'x-gp-key': key }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
      } catch (e) { throw { code: 'unavailable', message: 'Could not reach the shared gallery.' }; }
      let j = null;
      try { j = await res.json(); } catch (e) { /* not JSON */ }
      if (!res.ok) throw { code: (j && j.code) || 'unavailable', message: (j && j.message) || 'Gallery error ' + res.status };
      return j;
    };
    let me;
    try { me = await call('GET', 'me'); } catch (e) { toast('The shared gallery is not reachable, so your activity stays on this device for now.', 'bad'); return null; }

    const cols = { accounts: new Map(), protocol: new Map() };
    const subs = { accounts: [], protocol: [] };
    let ver = 0, timer = null, failures = 0, polling = false;
    const snap = (m) => ({ docs: [...m].map(([id, d]) => ({ id, exists: true, data: () => d })) });
    async function poll() {
      clearTimeout(timer);
      if (polling) return;
      polling = true;
      try {
        const s = await call('GET', 'snapshot?since=' + ver);
        failures = 0;
        const first = !ver, changed = {};
        for (const c of ['accounts', 'protocol']) for (const [id, d] of Object.entries(s[c] || {})) { cols[c].set(id, d); changed[c] = true; }
        ver = s.ver || ver || -1;
        for (const c of ['accounts', 'protocol']) if (first || changed[c]) subs[c].forEach((x) => x.cb(snap(cols[c])));
      } catch (e) {
        if (++failures === 3) subs.accounts.forEach((x) => x.err && x.err(e));
      }
      polling = false;
      timer = setTimeout(poll, document.hidden ? 15000 : 4000);
    }
    const db = {
      collection: (c) => ({
        onSnapshot(cb, err) {
          subs[c].push({ cb, err });
          if (subs.accounts.length + subs.protocol.length === 1) poll();
          else if (ver) setTimeout(() => cb(snap(cols[c])), 0);
          return () => {};
        },
      }),
      doc: (path) => ({
        async set(d) { await call('PUT', path, d); setTimeout(poll, 100); },
        async get() {
          try { const d = await call('GET', path); return { exists: true, data: () => d }; }
          catch (e) { if (e.code === 'not_found') return { exists: false, data: () => undefined }; throw e; }
        },
      }),
    };
    const user = { id: async () => me.uid, isOwner: async () => !!me.isOwner, can: async () => true };
    return { db, user, sample: null, downloads: null };
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    if (!document.documentElement.lang) document.documentElement.lang = 'en';
    applyPrefs();
    if (reducedMotionQuery && reducedMotionQuery.addEventListener) reducedMotionQuery.addEventListener('change', () => { if (S.prefs.motion === 'system') renderView(true); });
    const [r, a, room] = parseHash();
    S.route = r; S.arg = a; S.ui.roomCode = room || null;
    renderHeader();
    S.starters = await K.starterGames(C.sha256hex);
    loadStudio();
    S.world = await C.buildWorld({ accounts: worldAccounts(), protocol: protocol(), starters: S.starters, chain: worldChain });
    if (MAINNET) { const tag = $('.mark span'); if (tag) tag.textContent = 'Fan project'; }
    await loadWallet();
    loadChainBal();
    renderHeader();
    renderView(true);
    const cl = window.claude;
    let caps = null;
    if (cl && typeof cl.use === 'function') {
      const use = (n) => cl.use(n).catch(() => null);
      const [db, user, sample, downloads] = await Promise.all([use('db'), use('user'), use('sample'), use('downloads')]);
      caps = { db, user, sample, downloads };
    } else if (SITE.gallery) caps = await webCaps();
    if (caps) {
      const { db, user, sample } = caps;
      S.caps = caps;
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
    if (CHAIN) {
      setInterval(() => { if (!document.hidden) loadChainBal(); }, 15000);
      setTimeout(() => retryPending().catch(() => {}), 5000);
    }
    S.ready = true;
  }
  boot().catch((e) => { console.error(e); $('#view').innerHTML = '<div class="empty"><h1>ClaudePlay could not start</h1><p class="mono">' + esc(e && e.message) + '</p></div>'; });
  window.__pp = S;
})();
