/* Floating miniature game worlds are decoration, independent of games and their hashes.
   Inline before app.js. PPWorkshop.mount(host, { reducedMotion }) returns an idempotent handle.
   It never catches a wheel, captures a pointer, or fetches an asset. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  const CSS = `
  .workshop-scene {
    --ws-grass:#74c84a; --ws-leaf:#2e9958; --ws-dirt:#976c45; --ws-rock:#8faac4;
    --ws-cream:#fff9e8; --ws-charcoal:#263651; --ws-coral:#ed785f; --ws-cobalt:#437be2;
    --ws-gold:#ffd54a; --ws-water:#57bfdf; --ws-cloud:#f7fcff; --ws-road:#415575;
    overflow:hidden; isolation:isolate; pointer-events:none; contain:layout paint; user-select:none;
  }
  :root[data-gp-theme="dark"] .workshop-scene, :root[data-theme="dark"] .workshop-scene {
    --ws-rock:#6e87ac; --ws-cloud:#c8def4; --ws-dirt:#866343;
  }
  @media(prefers-color-scheme:dark) {
    :root:not([data-gp-theme="light"]):not([data-theme="light"]) .workshop-scene { --ws-rock:#6e87ac; --ws-cloud:#c8def4; --ws-dirt:#866343; }
  }
  .workshop-scene .ws-canvas, .workshop-scene .ws-still { position:absolute; inset:0; width:100%; height:100%; display:block; }
  .workshop-scene[data-workshop-mode="webgl"] .ws-still { display:none; }
  .workshop-scene[data-workshop-mode="static"] .ws-canvas { display:none; }
  .workshop-scene .ws-island { position:absolute; left:40%; top:41%; width:185px; height:96px; transform:translate(-50%,-50%) rotate(-12deg) skewY(8deg); background:var(--ws-grass); border:2px solid var(--ws-leaf); box-shadow:0 12px 0 var(--ws-dirt),0 21px 0 color-mix(in srgb,var(--ws-dirt) 75%,var(--ws-charcoal)); clip-path:polygon(8% 0,89% 0,100% 22%,96% 81%,82% 100%,10% 94%,0 70%,0 16%); }
  .workshop-scene .ws-land { position:absolute; width:190px; height:170px; left:38%; top:44%; transform:translate(-50%,-50%); }
  .workshop-scene .ws-land .ws-island { left:50%; top:68%; }
  .workshop-scene .ws-tree { position:absolute; width:14px; height:74px; background:var(--ws-dirt); left:41%; top:8%; transform:rotate(-12deg); }
  .workshop-scene .ws-tree::before { content:""; position:absolute; left:-19px; top:0; width:52px; height:49px; background:var(--ws-leaf); box-shadow:8px -13px 0 -3px var(--ws-grass),-7px 17px 0 -8px var(--ws-grass); }
  .workshop-scene .ws-tree-small { left:73%; top:27%; transform:scale(.65) rotate(13deg); }
  .workshop-scene .ws-water { position:absolute; width:45%; height:17%; top:66%; left:11%; background:var(--ws-water); transform:rotate(-13deg) skewX(-20deg); }
  .workshop-scene .ws-race { left:76%; top:60%; width:143px; height:75px; transform:translate(-50%,-50%) rotate(12deg) skewY(-7deg); background:var(--ws-rock); border-color:var(--ws-cobalt); }
  .workshop-scene .ws-race::before { content:""; position:absolute; inset:9px 11px; border:12px solid var(--ws-road); border-radius:50%; outline:2px dashed var(--ws-cream); outline-offset:-8px; }
  .workshop-scene .ws-race::after { content:""; position:absolute; width:19px; height:10px; right:16px; top:18px; background:var(--ws-coral); border:2px solid var(--ws-charcoal); }
  .workshop-scene .ws-city { position:absolute; left:17%; top:24%; width:136px; height:130px; transform:translate(-50%,-50%) scale(.83); }
  .workshop-scene .ws-city .ws-island { left:50%; top:76%; width:150px; height:68px; background:var(--ws-rock); border-color:var(--ws-cobalt); }
  .workshop-scene .ws-building { position:absolute; width:33px; height:65px; left:24%; top:19%; background:var(--ws-cobalt); border-right:7px solid color-mix(in srgb,var(--ws-cobalt) 70%,var(--ws-charcoal)); border-top:5px solid var(--ws-cream); }
  .workshop-scene .ws-building::after { content:""; position:absolute; top:13px; left:5px; width:6px; height:7px; background:var(--ws-cream); box-shadow:10px 0 0 var(--ws-cream),0 17px 0 var(--ws-cream),10px 17px 0 var(--ws-cream); }
  .workshop-scene .ws-building-small { left:57%; top:34%; height:44px; background:var(--ws-coral); border-color:var(--ws-charcoal); }
  .workshop-scene .ws-cloud { position:absolute; left:58%; top:18%; width:90px; height:22px; background:var(--ws-cloud); box-shadow:20px -17px 0 -1px var(--ws-cloud),46px -7px 0 -3px var(--ws-cloud); }
  .workshop-scene .ws-cloud-low { left:5%; top:77%; transform:scale(.7); }
  .workshop-scene .ws-coin { position:absolute; width:18px; height:18px; background:var(--ws-gold); border:2px solid var(--ws-cream); transform:rotate(17deg); left:61%; top:38%; box-shadow:5px 4px 0 color-mix(in srgb,var(--ws-gold) 70%,var(--ws-dirt)); }
  .workshop-scene .ws-coin-high { left:86%; top:25%; transform:rotate(-15deg) scale(.7); }
  :root[data-gp-theme="contrast"] .workshop-scene { --ws-grass:Canvas; --ws-leaf:CanvasText; --ws-dirt:CanvasText; --ws-rock:Canvas; --ws-cream:CanvasText; --ws-charcoal:CanvasText; --ws-coral:Canvas; --ws-cobalt:CanvasText; --ws-gold:Canvas; --ws-water:CanvasText; --ws-cloud:CanvasText; --ws-road:CanvasText; }
  @media(forced-colors:active) { .workshop-scene { --ws-grass:Canvas; --ws-leaf:CanvasText; --ws-dirt:CanvasText; --ws-rock:Canvas; --ws-cream:CanvasText; --ws-charcoal:CanvasText; --ws-coral:Canvas; --ws-cobalt:CanvasText; --ws-gold:Canvas; --ws-water:CanvasText; --ws-cloud:CanvasText; --ws-road:CanvasText; } }
  @media(max-width:560px) { .workshop-scene .ws-land { left:41%; transform:translate(-50%,-50%) scale(.8); } .workshop-scene .ws-city { left:18%; transform:translate(-50%,-50%) scale(.65); } .workshop-scene .ws-race { left:77%; transform:translate(-50%,-50%) rotate(12deg) skewY(-7deg) scale(.72); } .workshop-scene .ws-cloud { transform:scale(.65); } }
  `;

  function installStyle() {
    if (document.getElementById('workshop-scene-style')) return;
    const style = document.createElement('style'); style.id = 'workshop-scene-style'; style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  function node(name, cls, parent) {
    const el = document.createElement(name); el.className = cls; if (parent) parent.appendChild(el); return el;
  }
  function fallback(host) {
    const still = node('div', 'ws-still', host);
    const land = node('div', 'ws-land', still); node('div', 'ws-island', land); node('div', 'ws-water', land);
    node('div', 'ws-tree', land); node('div', 'ws-tree ws-tree-small', land);
    node('div', 'ws-island ws-race', still);
    const city = node('div', 'ws-city', still); node('div', 'ws-island', city); node('div', 'ws-building', city); node('div', 'ws-building ws-building-small', city);
    node('div', 'ws-cloud', still); node('div', 'ws-cloud ws-cloud-low', still);
    node('div', 'ws-coin', still); node('div', 'ws-coin ws-coin-high', still);
    return still;
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const TAU = Math.PI * 2;

  function mount(host, options = {}) {
    if (!host || !host.appendChild) return { stop() {}, destroy() {}, retheme() {}, setMotion() {}, canvas: null };
    if (mounted.has(host)) mounted.get(host).stop();
    installStyle(); host.classList.add('workshop-scene'); host.setAttribute('aria-hidden', 'true');
    const still = fallback(host), canvas = node('canvas', 'ws-canvas', host);
    canvas.setAttribute('aria-hidden', 'true'); canvas.width = canvas.height = 1;
    const root = document.documentElement;
    const query = (s) => window.matchMedia ? window.matchMedia(s) : null;
    const reduced = query('(prefers-reduced-motion: reduce)'), forced = query('(forced-colors: active)'), contrast = query('(prefers-contrast: more)'), dark = query('(prefers-color-scheme: dark)');
    const media = [reduced, forced, contrast, dark].filter(Boolean);
    let stopped = false, requestedReduce = !!options.reducedMotion, inView = true, renderer = null, unavailable = false;
    let raf = 0, last = 0, elapsed = 0, stamp = 0, width = 1, height = 1, ema = 33, slow = 0;
    let px = 0, py = 0, tx = 0, ty = 0, pointerUntil = 0, palette = null;
    const cleanups = [];
    const listen = (target, event, fn, opts) => { target.addEventListener(event, fn, opts); cleanups.push(() => target.removeEventListener(event, fn, opts)); };
    const isCalm = () => requestedReduce || root.getAttribute('data-gp-motion') === 'reduce' || !!(reduced && reduced.matches);
    const isContrast = () => root.getAttribute('data-gp-theme') === 'contrast' || !!(forced && forced.matches) || !!(contrast && contrast.matches);
    const paused = () => document.hidden || !inView || (document.activeElement && /^(IFRAME|INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) || !!document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');

    function color(css, name, spare) {
      const value = css.getPropertyValue(name).trim(), h = value.match(/^#([0-9a-f]{6})$/i), rgb = value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/i);
      if (h) { const n = parseInt(h[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
      if (rgb) return rgb.slice(1, 4).map((n) => clamp(Number(n) / 255, 0, 1));
      return spare;
    }
    function readPalette() {
      const css = getComputedStyle(host);
      palette = {};
      const defaults = { grass:'#74c84a', leaf:'#2e9958', dirt:'#976c45', rock:'#8faac4', cream:'#fff9e8', charcoal:'#263651', coral:'#ed785f', cobalt:'#437be2', gold:'#ffd54a', water:'#57bfdf', cloud:'#f7fcff', road:'#415575' };
      for (const [name, value] of Object.entries(defaults)) {
        const v = parseInt(value.slice(1), 16);
        palette[name] = color(css, '--ws-' + name, [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]);
      }
    }

    function cancel() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; stamp = 0; }
    function staticMode() {
      cancel(); host.dataset.workshopMode = 'static'; canvas.hidden = true;
      // Keep only the tiny shared geometry when parked, and release the large drawing buffer.
      if (canvas.width !== 1 || canvas.height !== 1) canvas.width = canvas.height = 1;
    }
    function resize() {
      const rect = host.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      if (host.dataset.workshopMode !== 'webgl') return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(480000 / (width * height)));
      const w = Math.max(1, Math.floor(width * dpr)), h = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function schedule() {
      if (stopped || !host.isConnected) { stop(); return; }
      if (isCalm() || isContrast() || unavailable) { staticMode(); return; }
      if (!renderer) {
        try { renderer = createRenderer(canvas); } catch (e) { unavailable = true; staticMode(); return; }
        if (!renderer) { unavailable = true; staticMode(); return; }
      }
      host.dataset.workshopMode = 'webgl'; canvas.hidden = false; resize();
      if (paused()) { cancel(); return; }
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function frame(now) {
      raf = 0;
      if (stopped || !host.isConnected) { stop(); return; }
      if (isCalm() || isContrast() || unavailable) { staticMode(); return; }
      if (paused()) { cancel(); return; }
      // Thirty deliberate frames per second; no simulation work in the skipped display frames.
      if (stamp && now - stamp < 31) { raf = requestAnimationFrame(frame); return; }
      const dt = last ? clamp((now - last) / 1000, 0, .08) : 1 / 30;
      if (last) { ema += (Math.min(now - last, 120) - ema) * .04; if (ema > 65 && ++slow > 60) { unavailable = true; staticMode(); return; } else if (ema <= 65) slow = 0; }
      last = stamp = now; elapsed += dt;
      if (now > pointerUntil) tx = ty = 0;
      const ease = 1 - Math.exp(-dt * 4); px += (tx - px) * ease; py += (ty - py) * ease;
      try { renderer.draw(elapsed, width / height, px, py, palette); }
      catch (e) { renderer.destroy(); renderer = null; unavailable = true; staticMode(); return; }
      raf = requestAnimationFrame(frame);
    }
    function retheme() {
      if (stopped) return; readPalette();
      if (renderer) { try { renderer.labels(palette); } catch (e) { renderer.destroy(); renderer = null; unavailable = true; } }
      schedule();
    }
    function setMotion(value) { requestedReduce = !!value; schedule(); }
    function stop() {
      if (stopped) return; stopped = true; cancel();
      cleanups.splice(0).forEach((fn) => fn());
      if (renderer) { renderer.destroy(); renderer = null; }
      canvas.remove(); still.remove(); delete host.dataset.workshopMode;
      if (mounted.get(host) === handle) mounted.delete(host);
    }
    const handle = { stop, destroy: stop, retheme, setMotion, canvas }; mounted.set(host, handle);
    const move = (event) => {
      if (stopped || isCalm() || isContrast() || !inView) return;
      const r = host.getBoundingClientRect(), x = event.clientX, y = event.clientY;
      if (x < r.left - 80 || x > r.right + 80 || y < r.top - 80 || y > r.bottom + 80) return;
      tx = clamp((x - r.left) / Math.max(1, r.width) * 2 - 1, -1, 1);
      ty = clamp((y - r.top) / Math.max(1, r.height) * 2 - 1, -1, 1); pointerUntil = performance.now() + (event.pointerType === 'touch' ? 1100 : 2200);
    };
    listen(window, 'pointermove', move, { passive: true });
    listen(window, 'pointerdown', move, { passive: true });
    listen(document, 'visibilitychange', schedule);
    listen(document, 'focusin', schedule);
    listen(document, 'focusout', () => queueMicrotask(schedule));
    listen(window, 'blur', () => queueMicrotask(schedule));
    listen(window, 'focus', schedule);
    listen(canvas, 'webglcontextlost', (event) => { event.preventDefault(); unavailable = true; staticMode(); });
    listen(canvas, 'webglcontextrestored', () => { if (renderer) renderer.destroy(false); renderer = null; unavailable = false; retheme(); });
    for (const m of media) {
      if (m.addEventListener) listen(m, 'change', retheme);
      else if (m.addListener) { m.addListener(retheme); cleanups.push(() => m.removeListener(retheme)); }
    }
    if (window.ResizeObserver) { const observer = new ResizeObserver(() => { resize(); schedule(); }); observer.observe(host); cleanups.push(() => observer.disconnect()); }
    else listen(window, 'resize', () => { resize(); schedule(); }, { passive: true });
    if (window.IntersectionObserver) { const observer = new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; schedule(); }, { threshold: .01 }); observer.observe(host); cleanups.push(() => observer.disconnect()); }
    if (window.MutationObserver) {
      const observer = new MutationObserver((records) => {
        if (!host.isConnected) { stop(); return; }
        if (records.some((r) => r.type === 'attributes' && r.target === root)) retheme();
        else if (records.some((r) => r.type === 'childList')) schedule();
      });
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-gp-theme', 'data-theme', 'data-gp-motion'] });
      cleanups.push(() => observer.disconnect());
    }
    readPalette(); schedule();
    return handle;
  }

  function createRenderer(canvas) {
    let gl;
    try { gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true, preserveDrawingBuffer: false }); } catch (e) { return null; }
    if (!gl) return null;
    const buffers = [], programs = [], matrices = []; let mi = 0;
    const matrix = () => matrices[mi++] || (matrices[mi - 1] = new Float32Array(16));
    function transform(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ax = 0, ay = 0, az = 0) {
      const m = matrix(), cx = Math.cos(ax), si = Math.sin(ax), cy = Math.cos(ay), sj = Math.sin(ay), cz = Math.cos(az), sk = Math.sin(az);
      m[0] = cz * cy * sx; m[1] = sk * cy * sx; m[2] = -sj * sx; m[3] = 0;
      m[4] = (cz * sj * si - sk * cx) * sy; m[5] = (sk * sj * si + cz * cx) * sy; m[6] = cy * si * sy; m[7] = 0;
      m[8] = (cz * sj * cx + sk * si) * sz; m[9] = (sk * sj * cx - cz * si) * sz; m[10] = cy * cx * sz; m[11] = 0;
      m[12] = x; m[13] = y; m[14] = z; m[15] = 1; return m;
    }
    function multiply(a, b) {
      const m = matrix();
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) m[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return m;
    }
    function view(eye, target) {
      const z = eye.map((v, i) => v - target[i]), l = Math.hypot(...z); for (let i = 0; i < 3; i++) z[i] /= l;
      const x = [z[2], 0, -z[0]], n = Math.hypot(...x); for (let i = 0; i < 3; i++) x[i] /= n;
      const y = [z[1] * x[2], z[2] * x[0] - z[0] * x[2], -z[1] * x[0]], m = matrix();
      m.set([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -x.reduce((s, v, i) => s + v * eye[i], 0), -y.reduce((s, v, i) => s + v * eye[i], 0), -z.reduce((s, v, i) => s + v * eye[i], 0), 1]);
      return m;
    }
    function perspective(aspect) {
      const m = matrix(), f = 1 / Math.tan(.56 / 2); m.fill(0); m[0] = f / aspect; m[5] = f; m[10] = -1.004; m[11] = -1; m[14] = -.2004; return m;
    }
    function program(vs, fs) {
      const p = gl.createProgram(); programs.push(p);
      for (const [kind, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const shader = gl.createShader(kind); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Workshop shader unavailable'); }
        gl.attachShader(p, shader); gl.deleteShader(shader);
      }
      gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Workshop renderer unavailable');
      const u = {}, a = {};
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) { const key = gl.getActiveUniform(p, i).name; u[key] = gl.getUniformLocation(p, key); }
      for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i++) { const key = gl.getActiveAttrib(p, i).name; a[key] = gl.getAttribLocation(p, key); }
      return { p, u, a };
    }
    function mesh(data) {
      const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); return { b, n: data.length / 8 };
    }
    const triangle = (out, a, b, c, uv = [[0, 0], [1, 0], [1, 1]]) => {
      const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
      const norm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...norm);
      [a, b, c].forEach((p, i) => out.push(...p, ...norm.map((n) => n / len), ...uv[i]));
    };
    const quad = (out, a, b, c, d) => { triangle(out, a, b, c); triangle(out, a, c, d, [[0, 0], [1, 1], [0, 1]]); };
    let MESH, BOX, ISLAND, RING;
    try {
      MESH = program('attribute vec3 aP,aN; uniform mat4 uM,uVP; uniform mat3 uNormal; varying vec3 vN; void main(){ vN=normalize(uNormal*aN); gl_Position=uVP*uM*vec4(aP,1.); }',
        'precision mediump float; varying vec3 vN; uniform vec3 uColor; void main(){ vec3 n=normalize(vN); float sun=max(0.,dot(n,normalize(vec3(-.45,1.,.65)))); float fill=max(0.,dot(n,normalize(vec3(.8,.3,-.4)))); gl_FragColor=vec4(uColor*(.57+.38*sun+.08*fill),1.); }');
      const box = [];
      for (const face of [ [[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]], [[.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5]], [[-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5]], [[.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5]], [[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5]], [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5]] ]) quad(box, ...face);
      BOX = mesh(box);
      // One small, irregular, tapered mesh is shared by every floating island.
      const edge = [[-.78,-1],[.66,-1],[1,-.62],[.93,.58],[.60,.95],[-.58,1],[-1,.54],[-1,-.52]], island = [];
      for (let i=0;i<edge.length;i++) {
        const j=(i+1)%edge.length, a=[edge[i][0],0,edge[i][1]], b=[edge[j][0],0,edge[j][1]], c=[edge[j][0]*.48,-.66,edge[j][1]*.48], d=[edge[i][0]*.48,-.66,edge[i][1]*.48];
        triangle(island,[0,0,0],b,a); quad(island,a,b,c,d); triangle(island,[0,-.66,0],d,c);
      }
      ISLAND = mesh(island);
      const ring=[];
      for(let i=0;i<40;i++) {
        const a=i/40*TAU,b=(i+1)/40*TAU;
        quad(ring,[Math.cos(a),0,Math.sin(a)],[Math.cos(a)*.60,0,Math.sin(a)*.60],[Math.cos(b)*.60,0,Math.sin(b)*.60],[Math.cos(b),0,Math.sin(b)]);
      }
      RING = mesh(ring);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(0,0,0,0);
    } catch (e) { destroy(); return null; }
    const normal = new Float32Array(9);
    let VP;
    function paint(shape, model, color) {
      gl.useProgram(MESH.p); gl.bindBuffer(gl.ARRAY_BUFFER,shape.b);
      for (const [key,size,offset] of [['aP',3,0],['aN',3,12]]) { gl.enableVertexAttribArray(MESH.a[key]); gl.vertexAttribPointer(MESH.a[key],size,gl.FLOAT,false,32,offset); }
      gl.uniformMatrix4fv(MESH.u.uM,false,model); gl.uniformMatrix4fv(MESH.u.uVP,false,VP);
      // Inverse-transpose cofactors keep cube sides correctly shaded at every scale.
      normal.set([model[5]*model[10]-model[6]*model[9], model[6]*model[8]-model[4]*model[10], model[4]*model[9]-model[5]*model[8], model[9]*model[2]-model[10]*model[1], model[10]*model[0]-model[8]*model[2], model[8]*model[1]-model[9]*model[0], model[1]*model[6]-model[2]*model[5], model[2]*model[4]-model[0]*model[6], model[0]*model[5]-model[1]*model[4]]);
      gl.uniformMatrix3fv(MESH.u.uNormal,false,normal); gl.uniform3fv(MESH.u.uColor,color); gl.drawArrays(gl.TRIANGLES,0,shape.n);
    }
    function piece(parent,shape,color,x,y,z,sx,sy,sz,ax=0,ay=0,az=0) { paint(shape,multiply(parent,transform(x,y,z,sx,sy,sz,ax,ay,az)),color); }
    function tree(parent,P,x,z,size=1) {
      const part=(color,x1,y,z1,w,h,d) => piece(parent,BOX,color,x+x1*size,y*size,z+z1*size,w*size,h*size,d*size);
      part(P.dirt,0,.48,0,.16,.9,.16);
      part(P.leaf,0,.95,0,.65,.63,.60); part(P.grass,-.08,1.35,.04,.48,.32,.46);
      part(P.grass,.24,.89,.05,.33,.38,.38);
    }
    function cloud(P,x,y,z,size=1) {
      const parent=transform(x,y,z,size,size,size,0,-.1,0);
      for(const [cx,cy,cz,w,h,d] of [[0,0,0,1.2,.25,.48],[-.30,.19,0,.45,.28,.48],[.13,.29,-.02,.53,.34,.52],[.55,.08,.01,.34,.23,.40]]) piece(parent,BOX,P.cloud,cx,cy,cz,w,h,d);
    }
    function coin(parent,P,x,y,z,angle,size=.20) {
      piece(parent,BOX,P.gold,x,y,z,size,size,size,0,angle,.15);
      piece(parent,BOX,P.cream,x,y+size*.14,z+size*.51,size*.18,size*.36,.01,0,angle,.15);
    }
    function platformWorld(parent,P,time) {
      piece(parent,ISLAND,P.dirt,0,-.16,0,1.75,1.15,1.5);
      piece(parent,ISLAND,P.grass,0,.04,0,1.79,.30,1.54);
      piece(parent,BOX,P.water,-.65,.055,.27,.58,.035,1.54);
      // Stepped terrain gives the miniature a clearly playable platformer silhouette.
      piece(parent,BOX,P.dirt,.56,.16,-.38,1.18,.26,1.14); piece(parent,BOX,P.grass,.56,.30,-.38,1.21,.045,1.17);
      piece(parent,BOX,P.dirt,1.01,.40,-.55,.67,.25,.79); piece(parent,BOX,P.grass,1.01,.54,-.55,.70,.045,.82);
      tree(parent,P,.95,-.63,.84); tree(parent,P,-1.08,-.69,.66); tree(parent,P,1.15,.75,.52);
      for(let j=0;j<3;j++) piece(parent,BOX,P.cream,-.61,.10,-.45+j*.32,.39,.08,.14);
      // A tiny red player hops across the foreground steps. It remains decoration only.
      const hop=(Math.sin(time*1.35)+1)*.5, x=-.14+Math.sin(time*.48)*.39;
      piece(parent,BOX,P.coral,x,.36+hop*.28,.79,.24,.32,.22);
      piece(parent,BOX,P.cream,x,.59+hop*.28,.79,.20,.15,.20);
      for(let j=0;j<3;j++) coin(parent,P,-.13+j*.45,.78+j*.12,-.02,time*.62+j*.2,.18);
    }
    function raceWorld(parent,P,time) {
      piece(parent,ISLAND,P.rock,0,-.07,0,1.41,.93,1.15);
      piece(parent,ISLAND,P.grass,0,.035,0,1.40,.25,1.14);
      piece(parent,RING,P.cream,0,.046,0,1.24,1,1.0);
      piece(parent,RING,P.road,0,.050,0,1.18,1,.94);
      for(let j=0;j<16;j++) { const a=j*TAU/16; piece(parent,BOX,P.cream,Math.cos(a)*.96,.055,Math.sin(a)*.765,.055,.014,.13,0,-a,0); }
      tree(parent,P,0,0,.50);
      for(const x of [-.2,.2]) { piece(parent,BOX,P.charcoal,x,.19,.98,.045,.32,.045); piece(parent,BOX,P.cream,x,.38,.98,.17,.10,.014); }
      const angle=time*.45, car=multiply(parent,transform(Math.cos(angle)*.95,.17,Math.sin(angle)*.75,1,1,1,0,-angle,0));
      piece(car,BOX,P.coral,0,0,0,.22,.14,.38); piece(car,BOX,P.cream,0,.105,-.015,.18,.08,.18);
      for(const x of [-.12,.12]) for(const z of [-.12,.12]) piece(car,BOX,P.charcoal,x,-.04,z,.07,.075,.09);
    }
    function cityWorld(parent,P,time) {
      piece(parent,ISLAND,P.rock,0,-.06,0,1.24,.91,1.12);
      piece(parent,BOX,P.cream,0,.025,0,1.89,.07,1.70);
      piece(parent,BOX,P.road,0,.068,0,1.94,.02,.30); piece(parent,BOX,P.road,.15,.071,0,.31,.02,1.73);
      for(const [x,z,h,color] of [[-.60,-.45,.72,P.cobalt],[.60,-.48,1.04,P.coral],[-.61,.48,.49,P.water],[.63,.48,.67,P.cobalt]]) {
        piece(parent,BOX,color,x,.095+h*.5,z,.42,h,.41); piece(parent,BOX,P.cream,x,.112+h,z,.47,.05,.46);
        for(let j=0;j<Math.floor(h/.22);j++) for(const wx of [-.1,.1]) piece(parent,BOX,P.cream,x+wx,.24+j*.22,z+.211,.055,.07,.013);
      }
      piece(parent,BOX,P.gold,-.68+((time*.17)%1)*1.45,.12,0,.19,.08,.12);
      tree(parent,P,-.86,.74,.27);
    }
    function draw(time,aspect,px,py,P) {
      mi=0; const narrow=aspect<1.3 ? 1.3/aspect : 1;
      VP=multiply(perspective(aspect),view([(5.7+px*.55)*narrow,(7.9+py*.35)*narrow,14.3*narrow],[0,1.35,0]));
      gl.viewport(0,0,canvas.width,canvas.height); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.depthMask(true);
      // Each distinct game world floats on its own gentle cycle, with quiet orbital drift.
      platformWorld(transform(-.53+Math.sin(time*.18)*.10,1.00+Math.sin(time*.53)*.10,.53,1.05,1.05,1.05,.015,.13+px*.035,.015+py*.01),P,time);
      raceWorld(transform(3.01+Math.sin(time*.21)*.13,.76+Math.sin(time*.48+2)*.13,-.27,.87,.87,.87,0,-.10+Math.sin(time*.16)*.045,-.035),P,time);
      cityWorld(transform(-2.83+Math.cos(time*.19)*.10,2.02+Math.sin(time*.43+4)*.12,-1.42,.74,.74,.74,0,.24+Math.sin(time*.14)*.06,.025),P,time);
      cloud(P,2.35+Math.sin(time*.15)*.25,3.25,-1.24,.82);
      cloud(P,-3.48+Math.sin(time*.17+1)*.18,.61,1.13,.71);
      cloud(P,1.58+Math.sin(time*.13+2)*.20,.10,1.58,.46);
      const identity=transform();
      coin(identity,P,2.16,2.07+Math.sin(time*.70)*.12,.88,time*.50,.27);
      coin(identity,P,-1.48,3.32+Math.sin(time*.64+2)*.10,-.84,-time*.47,.22);
    }
    function destroy(lose = true) {
      buffers.forEach((b)=>gl.deleteBuffer(b)); programs.forEach((p)=>gl.deleteProgram(p));
      if(lose) { const extension=gl.getExtension('WEBGL_lose_context'); if(extension) extension.loseContext(); }
    }
    return { draw, labels() {}, destroy };
  }
  window.PPWorkshop = Object.freeze({ mount });
})();
