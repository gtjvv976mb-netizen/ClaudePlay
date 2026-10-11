// Real-browser checks for the decorative module. No fake successful WebGL implementation.
// CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node --test test/workshop-scene.test.mjs
// Set WORKSHOP_SITE_URL=http://127.0.0.1:8765/local.html to include the integrated route guard.
// WORKSHOP_ALLOW_SOFTWARE=0 preserves strict hardware policy and skips unsupported GPU checks.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const source = await readFile(new URL('../src/workshop-scene.js', import.meta.url), 'utf8');
let browser;
before(async () => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined);
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-background-networking', '--disable-component-update', '--disable-breakpad'] });
});
after(async () => { if (browser) await browser.close(); });

// Instrument native resources and lifecycle hooks. Software policy is relaxed only in this test
// harness, after an actual strict-policy context request returned null; the production module is
// unchanged. A blocked/missing native implementation never becomes a pretend successful context.
function instrument({ blocked = false, shaderFailure = false, allowSoftware = true }) {
  const stats = window.__workshop = { frames: 0, draws: 0, attempts: 0, software: false, nativeUnavailable: false, listeners: [], observers: 0, pending: new Set(), created: {}, deleted: {} };
  const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const id = raf((time) => { stats.pending.delete(id); stats.frames++; callback(time); }); stats.pending.add(id); return id;
  };
  window.cancelAnimationFrame = (id) => { stats.pending.delete(id); cancel(id); };
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    if (window.__trackWorkshop && !stats.listeners.some((e) => e.live && e.target === this && e.type === type && e.fn === fn && e.capture === capture)) stats.listeners.push({ target: this, type, fn, capture, live: true });
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    for (const entry of stats.listeners) if (entry.target === this && entry.type === type && entry.fn === fn && entry.capture === capture) entry.live = false;
    return remove.call(this, type, fn, options);
  };
  for (const name of ['ResizeObserver', 'IntersectionObserver', 'MutationObserver']) {
    const Native = window[name]; if (!Native) continue;
    window[name] = class {
      constructor(callback) { this.native = new Native(callback); this.live = false; this.tracked = !!window.__trackWorkshop; }
      observe(...args) { if (this.tracked && !this.live) { this.live = true; stats.observers++; } return this.native.observe(...args); }
      unobserve(...args) { return this.native.unobserve?.(...args); }
      takeRecords() { return this.native.takeRecords?.(); }
      disconnect() { if (this.tracked && this.live) { this.live = false; stats.observers--; } this.native.disconnect(); }
    };
  }
  const get = HTMLCanvasElement.prototype.getContext, seen = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (kind, options) {
    if (kind !== 'webgl') return get.call(this, kind, options);
    stats.attempts++;
    if (blocked) return null;
    let gl = get.call(this, kind, options);
    if (!gl && options?.failIfMajorPerformanceCaveat) {
      stats.nativeUnavailable = true;
      if (allowSoftware) { gl = get.call(this, kind, { ...options, failIfMajorPerformanceCaveat: false }); if (gl) stats.software = true; }
    }
    if (!gl || seen.has(gl)) return gl;
    seen.add(gl);
    for (const resource of ['Buffer', 'Texture', 'Program', 'Shader']) {
      const create = gl['create' + resource].bind(gl), drop = gl['delete' + resource].bind(gl);
      stats.created[resource] = stats.created[resource] || 0; stats.deleted[resource] = stats.deleted[resource] || 0;
      gl['create' + resource] = (...args) => { const obj = create(...args); if (obj) stats.created[resource]++; return obj; };
      gl['delete' + resource] = (obj) => { if (obj) stats.deleted[resource]++; return drop(obj); };
    }
    const draw = gl.drawArrays.bind(gl); gl.drawArrays = (...args) => { stats.draws++; return draw(...args); };
    if (shaderFailure) gl.getShaderParameter = () => false;
    return gl;
  };
  window.__workshopSnapshot = () => ({ frames: stats.frames, draws: stats.draws, attempts: stats.attempts, software: stats.software, nativeUnavailable: stats.nativeUnavailable, listeners: stats.listeners.filter((e) => e.live).length, observers: stats.observers, pending: stats.pending.size, created: { ...stats.created }, deleted: { ...stats.deleted } });
  window.__workshopMount = (options = {}) => {
    window.__trackWorkshop = true;
    try { window.scene = PPWorkshop.mount(document.querySelector('#host'), options); return window.scene.canvas !== null; }
    finally { window.__trackWorkshop = false; }
  };
}

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 850, height: 640 }, deviceScaleFactor: 2, ...options.context });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'the scene must not throw browser errors'); });
  await page.setContent('<html><head><style>body{margin:0;background:#f2eee4}.workshop-scene{position:relative;width:min(800px,95vw);height:480px;margin:15px auto}input,textarea,select,button{margin:5px}</style></head><body><div id="host"></div><input id="ask"><textarea id="text"></textarea><select id="choice"><option>A</option></select><button id="outside">Outside</button><div id="dialogs"></div><iframe id="toy" srcdoc="<button>Game</button>"></iframe></body></html>');
  await page.evaluate(instrument, { allowSoftware: process.env.WORKSHOP_ALLOW_SOFTWARE !== '0', ...options });
  await page.addScriptTag({ content: source });
  return page;
}
const snapshot = (page) => page.evaluate(() => __workshopSnapshot());
async function nativeScene(t, page) {
  await page.evaluate(() => __workshopMount());
  await page.waitForTimeout(100);
  const state = await snapshot(page), mode = await page.evaluate(() => document.querySelector('#host').dataset.workshopMode);
  if (mode !== 'webgl') { t.skip('Native WebGL unavailable under this browser/hardware policy; static fallback is tested separately. Set WORKSHOP_ALLOW_SOFTWARE=1 to permit native software rendering in this harness.'); return false; }
  if (state.software) t.diagnostic('Strict hardware policy returned null; this isolated test uses real native software WebGL. Production policy remains unchanged.');
  await page.waitForFunction(() => __workshop.draws > 0);
  return true;
}
async function parked(page) { await page.waitForFunction(() => __workshop.pending.size === 0); }
async function resumed(page) { const frames = (await snapshot(page)).frames; await page.waitForFunction((n) => __workshop.frames > n, frames); }
function freed(state) {
  assert.equal(state.listeners, 0, 'all module event listeners must be removed');
  assert.equal(state.observers, 0, 'all module observers must be disconnected');
  assert.equal(state.pending, 0, 'no module animation frame may remain scheduled');
  for (const [kind, count] of Object.entries(state.created)) assert.equal(state.deleted[kind], count, 'all allocated ' + kind + ' objects must be deleted');
}

test('workshop: denied WebGL keeps an accessible static illustration and cleans up twice', async (t) => {
  const page = await fixture(t, { blocked: true });
  await page.evaluate(() => __workshopMount());
  assert.equal(await page.getAttribute('#host', 'data-workshop-mode'), 'static');
  assert.equal(await page.getAttribute('#host', 'aria-hidden'), 'true');
  assert.equal(await page.locator('.ws-still .ws-island').count(), 3);
  assert.equal(await page.locator('.ws-still .ws-tree').count(), 2);
  assert.equal(await page.locator('.ws-still .ws-cloud').count(), 2);
  assert.equal(await page.locator('.ws-still .ws-building').count(), 2);
  assert.equal(await page.locator('.ws-still .ws-coin').count(), 2);
  assert.ok((await snapshot(page)).attempts > 0);
  await page.evaluate(() => { scene.stop(); scene.destroy(); });
  assert.equal(await page.locator('#host > *').count(), 0); freed(await snapshot(page));
});

test('workshop: native geometry moves intentionally within the DPR and pixel caps', async (t) => {
  const page = await fixture(t);
  if (!(await nativeScene(t, page))) return;
  const dimensions = await page.evaluate(() => ({ width: scene.canvas.width, height: scene.canvas.height, box: scene.canvas.getBoundingClientRect().toJSON() }));
  assert.ok(dimensions.width <= dimensions.box.width * 1.5);
  assert.ok(dimensions.height <= dimensions.box.height * 1.5);
  assert.ok(dimensions.width * dimensions.height <= 480000);
  const first = await page.locator('#host').screenshot(); await page.waitForTimeout(500);
  const second = await page.locator('#host').screenshot(); assert.notDeepEqual(first, second, 'actual rendered game worlds/clouds must move');
  const allocations = await snapshot(page);
  assert.equal(allocations.created.Buffer, 3, 'three geometry buffers are shared by all miniature worlds');
  assert.equal(allocations.created.Texture, 0, 'the scene must not allocate textures or depend on image assets');
  assert.equal(allocations.created.Program, 1, 'one material program shades every island');
  await page.setViewportSize({ width: 390, height: 760 });
  await page.evaluate(() => { document.querySelector('#host').style.height = '280px'; });
  await page.waitForTimeout(80);
  const mobile = await page.evaluate(() => ({ width: scene.canvas.width, height: scene.canvas.height, box: scene.canvas.getBoundingClientRect().toJSON() }));
  assert.ok(mobile.width <= mobile.box.width * 1.5 && mobile.height <= 420 && mobile.width * mobile.height <= 480000);
  await page.evaluate(() => scene.stop()); freed(await snapshot(page));
});

test('workshop: live calm, contrast, and OS preferences park animation without layout changes', async (t) => {
  const page = await fixture(t);
  if (!(await nativeScene(t, page))) return;
  const rect = await page.locator('#host').boundingBox();
  for (const [name, value] of [['data-gp-motion', 'reduce'], ['data-gp-theme', 'contrast']]) {
    await page.evaluate(([name, value]) => document.documentElement.setAttribute(name, value), [name, value]);
    await parked(page); assert.equal(await page.getAttribute('#host', 'data-workshop-mode'), 'static');
    assert.deepEqual(await page.locator('#host').boundingBox(), rect);
    await page.evaluate((name) => document.documentElement.removeAttribute(name), name); await resumed(page);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await parked(page);
  assert.equal(await page.getAttribute('#host', 'data-workshop-mode'), 'static');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await resumed(page);
  await page.emulateMedia({ forcedColors: 'active' }); await parked(page);
  assert.equal(await page.getAttribute('#host', 'data-workshop-mode'), 'static');
  await page.emulateMedia({ forcedColors: 'none' }); await resumed(page);
  await page.evaluate(() => scene.setMotion(true)); await parked(page);
  await page.evaluate(() => scene.setMotion(false)); await resumed(page);
  await page.evaluate(() => scene.stop()); freed(await snapshot(page));
});

test('workshop: creator inputs, modal attention, and a real player iframe pause and resume', async (t) => {
  const page = await fixture(t);
  if (!(await nativeScene(t, page))) return;
  for (const selector of ['#ask', '#text', '#choice']) {
    await page.focus(selector); await parked(page);
    const count = (await snapshot(page)).frames; await page.waitForTimeout(80); assert.equal((await snapshot(page)).frames, count);
    await page.focus('#outside'); await resumed(page);
  }
  await page.frameLocator('#toy').locator('button').focus(); await parked(page);
  const count = (await snapshot(page)).frames; await page.waitForTimeout(80); assert.equal((await snapshot(page)).frames, count);
  await page.focus('#outside'); await resumed(page);
  await page.evaluate(() => { document.querySelector('#dialogs').innerHTML = '<div role="dialog" aria-modal="true">Modal</div>'; }); await parked(page);
  await page.evaluate(() => document.querySelector('#dialogs').replaceChildren()); await resumed(page);
  await page.evaluate(() => scene.stop()); freed(await snapshot(page));
});

test('workshop: hidden documents and offscreen stages schedule no animation work', async (t) => {
  const page = await fixture(t);
  if (!(await nativeScene(t, page))) return;
  // Deterministic visibility events exercise the same browser handler without relying on which
  // headless window happens to be foreground. Intersection below is an actual layout observation.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await parked(page);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await resumed(page);
  await page.evaluate(() => { document.querySelector('#host').style.marginTop = '1600px'; }); await parked(page);
  await page.evaluate(() => { document.querySelector('#host').style.marginTop = '15px'; }); await resumed(page);
  await page.evaluate(() => scene.stop()); freed(await snapshot(page));
});

test('workshop: native context loss parks safely and restoration recreates usable resources', async (t) => {
  const page = await fixture(t);
  if (!(await nativeScene(t, page))) return;
  const extension = await page.evaluate(() => { window.loss = scene.canvas.getContext('webgl').getExtension('WEBGL_lose_context'); return !!loss; });
  if (!extension) { t.skip('This native WebGL implementation does not expose WEBGL_lose_context.'); return; }
  await page.evaluate(() => loss.loseContext());
  await page.waitForFunction(() => document.querySelector('#host').dataset.workshopMode === 'static'); await parked(page);
  await page.waitForTimeout(100); await page.evaluate(() => loss.restoreContext());
  await page.waitForFunction(() => document.querySelector('#host').dataset.workshopMode === 'webgl'); await resumed(page);
  await page.evaluate(() => scene.stop()); freed(await snapshot(page));
});

test('workshop: partial shader failure releases native allocations and keeps the fallback', async (t) => {
  const page = await fixture(t, { shaderFailure: true }); await page.evaluate(() => __workshopMount());
  await page.waitForTimeout(80); const state = await snapshot(page);
  if (!state.created.Program) { t.skip('Native WebGL unavailable, so partial native shader allocation cannot be exercised.'); return; }
  assert.equal(await page.getAttribute('#host', 'data-workshop-mode'), 'static');
  assert.equal(state.deleted.Program, state.created.Program); assert.equal(state.deleted.Shader, state.created.Shader);
  await page.evaluate(() => scene.stop()); freed(await snapshot(page));
});

test('workshop: remount, repeated teardown, and static detachment leak no listeners or buffers', async (t) => {
  const page = await fixture(t);
  if (!(await nativeScene(t, page))) return;
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => __workshopMount()); await page.waitForTimeout(60);
    assert.equal(await page.locator('#host > canvas').count(), 1);
  }
  await page.evaluate(() => { scene.stop(); scene.stop(); }); freed(await snapshot(page));
  await page.evaluate(() => { __workshopMount({ reducedMotion: true }); document.querySelector('#host').remove(); });
  await page.waitForFunction(() => __workshop.observers === 0); freed(await snapshot(page));
});

test('workshop: integrated home/explore uses the persistent world without allocating the retired workshop', async (t) => {
  const site = process.env.WORKSHOP_SITE_URL;
  if (!site) { t.skip('Set WORKSHOP_SITE_URL=http://127.0.0.1:8765/local.html after building to run the integrated route lifecycle guard.'); return; }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await context.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); t.after(async () => { await context.close(); assert.deepEqual(errors, []); });
  await page.addInitScript(instrument, { allowSoftware: process.env.WORKSHOP_ALLOW_SOFTWARE !== '0' });
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'PPWorkshop', { configurable: true, get: () => api, set(value) {
      api = { mount(...args) { window.__trackWorkshop = true; try { return value.mount(...args); } finally { window.__trackWorkshop = false; } } };
    } });
  });
  await page.route('**/*', (route) => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto(site); await page.waitForSelector('#site-world .world-camera', { state: 'attached' });
  for (let i = 0; i < 20; i++) {
    await page.locator('[data-nav="explore"]').first().click();
    await page.waitForFunction(() => document.documentElement.dataset.route === 'explore');
    const state = await snapshot(page); assert.equal(state.listeners, 0); assert.equal(state.observers, 0);
    assert.deepEqual(state.created, {}, 'the retired workshop must allocate no GPU resources');
    await page.locator('[data-nav="home"]').first().click(); await page.waitForFunction(() => document.documentElement.dataset.route === 'home');
    assert.equal(await page.locator('#site-world .world-camera').count(), 1);
    assert.equal(await page.locator('#home-world, #home-world > canvas').count(), 0);
  }
  await page.locator('[data-nav="explore"]').first().click();
  await page.waitForFunction(() => __workshop.observers === 0 && __workshop.listeners.every((l) => !l.live));
});
