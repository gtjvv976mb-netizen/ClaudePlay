(() => {
  const store = new Map();
  const listeners = [];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function docSnap(path) { const has = store.has(path); return { id: path.split('/').pop(), exists: has, data: () => (has ? clone(store.get(path)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; }
  function colSnap(path) {
    const depth = path.split('/').length + 1;
    const docs = [...store.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === depth).sort().map(docSnap);
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function notify() { for (const l of listeners.slice()) setTimeout(() => l.cb(l.kind === 'col' ? colSnap(l.path) : docSnap(l.path)), 5); }
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      get: async () => docSnap(path),
      set: async (d) => { if (window.__mockDeny) throw { code: 'invalid_argument', message: 'denied' }; if (JSON.stringify(d).length > 262144) throw { code: 'invalid_argument', message: 'too big' }; store.set(path, clone(d)); notify(); },
      update: async (d) => { store.set(path, Object.assign(store.get(path) || {}, clone(d))); notify(); },
      delete: async () => { store.delete(path); notify(); },
      onSnapshot: (cb) => { const l = { kind: 'doc', path, cb }; listeners.push(l); setTimeout(() => cb(docSnap(path)), 0); return () => {}; },
      collection: (sub) => colRef(path + '/' + sub),
    };
  }
  function colRef(path) {
    return {
      path,
      doc: (id) => docRef(path + '/' + (id || Math.random().toString(36).slice(2))),
      onSnapshot: (cb) => { const l = { kind: 'col', path, cb }; listeners.push(l); setTimeout(() => cb(colSnap(path)), 0); return () => {}; },
      get: async () => colSnap(path),
    };
  }
  const db = { doc: docRef, collection: colRef };
  const user = { id: async () => 'u_test_owner', isOwner: async () => true, canEdit: async () => true, can: async () => true };
  const GAME = `<!doctype html>
<html><head><meta charset="utf-8"><title>Target Pop</title>
<meta name="description" content="Pop the glowing targets before they fade.">
<meta name="gameplay-genre" content="Reflex">
<meta name="gameplay-controls" content="Tap or click targets">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#101828}canvas{display:block}</style></head>
<body><canvas id="c"></canvas>
<script>
const c=document.getElementById('c'),x=c.getContext('2d');let W,H,state='title',score=0,t=0,targets=[],end=0;
function fit(){W=c.width=innerWidth;H=c.height=innerHeight}addEventListener('resize',fit);fit();
function start(){state='play';score=0;targets=[];end=performance.now()+3000;SP.score(0)}
c.addEventListener('pointerdown',e=>{if(state!=='play'){start();return}SP.input('tap');for(const g of targets){if(Math.hypot(g.x-e.clientX,g.y-e.clientY)<g.r){g.hit=1;score+=10;SP.score(score)}}});
addEventListener('keydown',e=>{if(e.code==='Space'&&state!=='play')start()});
function loop(now){x.fillStyle='#101828';x.fillRect(0,0,W,H);
if(state==='play'){if(SP.rand()<0.05)targets.push({x:SP.rand()*W,y:SP.rand()*H,r:20});targets=targets.filter(g=>!g.hit);x.fillStyle='#ffd84d';for(const g of targets){x.beginPath();x.arc(g.x,g.y,g.r,0,7);x.fill()}
score+=1;SP.score(Math.floor(score));if(now>end){state='over';SP.gameOver(Math.floor(score))}}
x.fillStyle='#fff';x.font='24px sans-serif';x.fillText(state==='title'?'TARGET POP - tap to start':state==='over'?'GAME OVER '+Math.floor(score):String(Math.floor(score)),20,40);requestAnimationFrame(loop)}
SP.ready();requestAnimationFrame(loop);
</` + `script></body></html>`;
  window.__sampleCalls = [];
  async function sample(input, opts = {}) {
    window.__sampleCalls.push({ len: typeof input === 'string' ? input.length : 0, tier: opts.modelTier, head: String(input).slice(0, 80) });
    let text = '';
    for (let i = 0; i < GAME.length; i += 400) {
      await new Promise((r) => setTimeout(r, 15));
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'cancelled', text };
      const delta = GAME.slice(i, i + 400); text += delta;
      if (opts.onText) opts.onText({ text, delta });
    }
    return { text, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  }
  const downloads = { save: async ({ filename, data }) => { window.__downloaded = { filename, size: data.length }; return { status: 'saved' }; } };
  window.__mockStore = store;
  window.claude = { use: async (n) => ({ db, user, sample, downloads })[n] || null };
})();
