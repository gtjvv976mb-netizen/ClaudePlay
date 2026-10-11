// Real-browser checks for the persistent full-site world. Build/serve separately for integration.
// WORLD_SITE_URL=http://127.0.0.1:8765/site/index.html node --test test/world-background.test.mjs
// CHROME_PATH selects an installed browser; otherwise Playwright's cached Chromium is used.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

let browser, source, assets, servedHash;
before(async (t) => {
  source = await readFile(new URL('../src/world-background.js', import.meta.url), 'utf8');
  const files = {forest:'island-forest',castle:'island-castle',race:'island-race',city:'island-city',cloud:'cloud',car:'flying-car'};
  assets = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key,file]) => [key,
    'data:image/webp;base64,' + (await readFile(new URL('../src/assets/world-hd/' + file + '.webp',import.meta.url))).toString('base64')])));
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true,
    args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--disable-breakpad'] });
  t.diagnostic('Native Chromium ' + browser.version() + '; world source SHA-256 ' + createHash('sha256').update(source).digest('hex'));
});
after(async () => { await browser?.close(); });

// Track only resources created by the module, including resources requested by its own RAF callbacks.
// Browser rendering and CSS animations remain native; no fabricated contexts, transforms or timers.
function instrument() {
  const stats = window.__worldStats = { listeners: [], observers: 0, pending: new Set(), frames: 0 };
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    if (window.__trackWorld && !stats.listeners.some((e) => e.live && e.target === this && e.type === type && e.fn === fn && e.capture === capture))
      stats.listeners.push({ target: this, type, fn, capture, live: true });
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
      constructor(callback) { this.native = new Native(callback); this.live = false; this.tracked = !!window.__trackWorld; }
      observe(...args) { if (this.tracked && !this.live) { this.live = true; stats.observers++; } return this.native.observe(...args); }
      unobserve(...args) { return this.native.unobserve?.(...args); }
      takeRecords() { return this.native.takeRecords?.(); }
      disconnect() { if (this.tracked && this.live) { this.live = false; stats.observers--; } this.native.disconnect(); }
    };
  }
  const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const tracked = !!window.__trackWorld;
    const id = raf((time) => {
      stats.pending.delete(id);
      const previous = window.__trackWorld; window.__trackWorld = tracked;
      try { if (tracked) stats.frames++; callback(time); } finally { window.__trackWorld = previous; }
    });
    if (tracked) stats.pending.add(id); return id;
  };
  window.cancelAnimationFrame = (id) => { stats.pending.delete(id); return cancel(id); };
  window.__runWorld = (callback) => {
    const previous = window.__trackWorld; window.__trackWorld = true;
    try { return callback(); } finally { window.__trackWorld = previous; }
  };
  window.__mountWorld = (options = {}) => __runWorld(() => { window.world = PPWorldBackground.mount(document.querySelector('#host'), options); });
  window.__worldSnapshot = () => ({ listeners: stats.listeners.filter((e) => e.live).length, observers: stats.observers,
    pending: stats.pending.size, frames: stats.frames });
}

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options.context });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'the world must not throw browser errors'); });
  await page.setContent('<html><head><style>body{margin:0;background:#e5f4fa}main{position:relative;z-index:2;background:#fff;width:320px;padding:8px}button,input,textarea,select{display:block;margin:8px}</style></head><body><div id="host"><span id="unowned">Preserved</span></div><main><input id="ask"><textarea id="text"></textarea><select id="choice"><option>A</option></select><div id="edit" contenteditable="true">Write</div><button id="outside">Outside</button><div id="dialogs"></div><iframe id="toy" title="Game" srcdoc="<button>Game</button>"></iframe></main></body></html>');
  await page.evaluate((assets) => { window.GP_WORLD_ASSETS = assets; },assets);
  await page.evaluate(instrument);
  await page.addScriptTag({ content: source });
  await page.evaluate((options) => __mountWorld(options), options.mount || {});
  await page.waitForSelector('.world-camera', { state: 'attached' });
  await page.waitForFunction(() => [...document.querySelectorAll('#host img')].every((img) => img.complete && img.naturalWidth > 0));
  return page;
}
const snapshot = (page) => page.evaluate(() => __worldSnapshot());
const route = (page, name) => page.evaluate((name) => __runWorld(() => world.setRoute(name)), name);
const mode = (page) => page.getAttribute('#host', 'data-world-motion');
const layerTransforms = (page) => page.evaluate(() => [...document.querySelectorAll('#host .world-cloud, #host .world-vehicle, #host .world-island-float')]
  .map((el) => ({ className: el.className, transform: getComputedStyle(el).transform })));
async function running(page) { await page.waitForFunction(() => document.querySelector('#host').dataset.worldMotion === 'running'); }
async function parked(page, expected = 'paused') {
  await page.waitForFunction((expected) => document.querySelector('#host').dataset.worldMotion === expected, expected);
  // Let any camera transition finish before comparing the ambient layers.
  await page.waitForTimeout(80);
  const first = await layerTransforms(page), before = await snapshot(page);
  await page.waitForTimeout(200);
  assert.deepEqual(await layerTransforms(page), first, expected + ' world layers must not continue moving');
  assert.equal((await snapshot(page)).frames, before.frames, expected + ' world must not keep requesting frames');
  assert.equal((await snapshot(page)).pending, 0);
  const active = await page.evaluate(() => document.querySelector('#host').getAnimations({ subtree: true })
    .filter((a) => a.playState === 'running' && !Number.isFinite(a.effect?.getComputedTiming().endTime)).length);
  assert.equal(active, 0, expected + ' world must have no running infinite animations');
}
function freed(state) {
  assert.equal(state.listeners, 0, 'all module listeners must be removed');
  assert.equal(state.observers, 0, 'all module observers must disconnect');
  assert.equal(state.pending, 0, 'no module frame may remain scheduled');
}

test('world: standalone HD alpha islands, clouds and vehicles compose a decorative full viewport', async (t) => {
  const page = await fixture(t);
  assert.equal(await page.getAttribute('#host', 'aria-hidden'), 'true');
  assert.equal(await page.locator('#host .world-camera').count(), 1);
  assert.equal(await page.locator('#host .world-island-forest, #host .world-island-castle, #host .world-island-race, #host .world-island-city').count(), 4);
  assert.equal(await page.locator('#host img.world-island-art').count(),4);
  assert.ok(await page.locator('#host .world-cloud').count() >= 2);
  assert.ok(await page.locator('#host .world-vehicle').count() >= 2);
  const geometry = await page.evaluate(() => {
    const el = document.querySelector('#host'), style = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, position: style.position, pointerEvents: style.pointerEvents,
      images:[...el.querySelectorAll('img')].map((img) => {
        const style = getComputedStyle(img), canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
        const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let edgeAlpha = 0;
        for (let x=0;x<canvas.width;x++) edgeAlpha = Math.max(edgeAlpha,pixels[x*4+3],pixels[((canvas.height-1)*canvas.width+x)*4+3]);
        for (let y=1;y<canvas.height-1;y++) edgeAlpha = Math.max(edgeAlpha,pixels[y*canvas.width*4+3],pixels[(y*canvas.width+canvas.width-1)*4+3]);
        const corners = [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]]
          .map(([x,y]) => ctx.getImageData(x,y,1,1).data[3]);
        return {className:img.className,width:img.naturalWidth,height:img.naturalHeight,src:img.currentSrc.startsWith('data:image/webp'),
          objectFit:style.objectFit,rendering:style.imageRendering,mask:style.maskImage,clip:style.clipPath,background:style.backgroundImage,corners,edgeAlpha,
          sourceKey:Object.entries(GP_WORLD_ASSETS).find(([,source]) => source === img.currentSrc)?.[0]};
      }) };
  });
  assert.equal(geometry.position, 'fixed'); assert.equal(geometry.pointerEvents, 'none');
  assert.equal(geometry.width,1280); assert.equal(geometry.height,900);
  assert.equal(geometry.images.length,12,'four islands, five clouds and three cars use independent images');
  for (const img of geometry.images) {
    assert.ok(img.width >= 1024 && img.height >= 1024,img.className + ': source has native HD detail');
    assert.equal(img.src,true); assert.equal(img.objectFit,'contain'); assert.equal(img.rendering,'auto');
    assert.equal(img.mask,'none'); assert.equal(img.clip,'none'); assert.equal(img.background,'none');
    assert.deepEqual(img.corners,[0,0,0,0],img.className + ': standalone asset has actual transparent surroundings');
    assert.ok(img.edgeAlpha <= 2,img.className + ': visible art is fully surrounded by transparent margins');
  }
  assert.deepEqual(new Set(geometry.images.map((img) => img.sourceKey)),new Set(['forest','castle','race','city','cloud','car']));
  assert.equal(await page.locator('.world-sky img').count(),0,'the old pixel panorama/sky plate must not be rendered');
  await page.evaluate(() => __runWorld(() => world.destroy())); freed(await snapshot(page));
});

test('world: responsive overview and every route contain complete islands without atlas cropping or source enlargement',async (t) => {
  const page = await fixture(t,{mount:{reducedMotion:true}});
  for (const viewport of [{width:320,height:568},{width:390,height:430},{width:390,height:844},{width:1280,height:600},{width:1440,height:900},{width:1920,height:1080},{width:3840,height:2160}]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({width,height}) => world.getGeometry().width === width && world.getGeometry().height === height,viewport);
    await route(page,'home');
    const shared = await page.evaluate(() => ({exposed:PPWorldBackground.layout(innerWidth,innerHeight),active:world.getGeometry()}));
    assert.deepEqual(shared.active.frames,shared.exposed.frames,'navigation and actual image placement share the same complete frames');
    for (const name of ['home','explore','create','game','maker','group','wallet','ledger','economy','business']) {
      await route(page,name);
      const frames = await page.evaluate(() => {
        const current = world.getGeometry();
        const nodes = current.island === 'overview' ? [...document.querySelectorAll('.world-island')] : [document.querySelector('.world-island[data-world-selected]')];
        return nodes.map((node) => {
          const r = node.getBoundingClientRect(), img = node.querySelector('img'), style = getComputedStyle(node);
          return {name:node.dataset.worldAsset,left:r.left,top:r.top,right:r.right,bottom:r.bottom,opacity:style.opacity,
            sourceScale:Math.min(r.width/img.naturalWidth,r.height/img.naturalHeight),objectFit:getComputedStyle(img).objectFit};
        });
      });
      assert.equal(frames.length,name === 'home' ? 4 : 1);
      for (const frame of frames) {
        assert.ok(frame.left >= 0 && frame.top >= 0 && frame.right <= viewport.width && frame.bottom <= viewport.height,
          `${viewport.width}×${viewport.height} ${name}/${frame.name}: complete image frame stays in the viewport`);
        assert.ok(frame.sourceScale <= 1.001,`${name}/${frame.name}: native source is not magnified above its pixel dimensions`);
        assert.equal(frame.objectFit,'contain'); assert.equal(frame.opacity,'1');
      }
      if (name !== 'home') {
        assert.equal(await page.locator('.world-island:not([data-world-selected])').evaluateAll((nodes) => nodes.every((el) => Number(getComputedStyle(el).opacity) <= .1)),true,
          'other islands recede instead of obstructing the selected destination');
      }
    }
  }
  await page.evaluate(() => __runWorld(() => world.stop())); freed(await snapshot(page));
});

test('world: clouds drift, vehicles fly and each island floats in the real renderer', async (t) => {
  const page = await fixture(t); await running(page);
  const before = await layerTransforms(page); await page.waitForTimeout(450);
  const after = await layerTransforms(page);
  for (const family of ['world-cloud', 'world-vehicle', 'world-island-float']) {
    const indexes = before.map((el, i) => el.className.includes(family) ? i : -1).filter((i) => i >= 0);
    assert.ok(indexes.length > 0 && indexes.some((i) => before[i].transform !== after[i].transform), family + ' must visibly move');
  }
  await page.evaluate(() => __runWorld(() => world.stop())); freed(await snapshot(page));
});

test('world: all ten routes select an individual island camera and overview returns home', async (t) => {
  const page = await fixture(t, { mount: { reducedMotion: true } });
  const routes = ['home', 'explore', 'game', 'create', 'business', 'maker', 'group', 'wallet', 'ledger', 'economy'];
  const cameras = [];
  for (const name of routes) {
    await route(page, name);
    await page.waitForTimeout(30);
    const camera = await page.evaluate(() => {
      const host = document.querySelector('#host'), camera = host.querySelector('.world-camera');
      return { route: host.dataset.worldRoute, island: host.dataset.worldIsland, zoom: Number(host.dataset.worldZoom), transform: getComputedStyle(camera).transform };
    });
    assert.equal(camera.route, name);
    if (name === 'home') { assert.equal(camera.island, 'overview'); assert.equal(camera.zoom, 1); }
    else { assert.ok(['forest', 'castle', 'race', 'city'].includes(camera.island)); assert.ok(camera.zoom > 1, name + ' must zoom toward an island'); }
    cameras.push(camera);
  }
  assert.ok(new Set(cameras.map((camera) => camera.transform)).size >= 5, 'overview and all four island cameras must differ');
  assert.deepEqual(new Set(cameras.slice(1).map((camera) => camera.island)), new Set(['forest', 'castle', 'race', 'city']));
  await route(page, 'unknown');
  assert.equal(await page.getAttribute('#host', 'data-world-route'), 'home');
  assert.equal(await page.getAttribute('#host', 'data-world-island'), 'overview');
  await parked(page, 'static');
  await page.evaluate(() => __runWorld(() => world.destroy())); freed(await snapshot(page));
});

test('world: ordinary route changes animate the camera, calm route changes settle immediately', async (t) => {
  const page = await fixture(t); await running(page);
  const start = await page.locator('.world-camera').evaluate((el) => getComputedStyle(el).transform);
  await route(page, 'create'); await page.waitForTimeout(110);
  const during = await page.locator('.world-camera').evaluate((el) => getComputedStyle(el).transform);
  assert.notEqual(during, start, 'the route camera must actually travel');
  await page.waitForTimeout(1300);
  const end = await page.locator('.world-camera').evaluate((el) => getComputedStyle(el).transform);
  assert.notEqual(end, during, 'camera must continue its finite journey');
  await page.evaluate(() => __runWorld(() => world.setMotion(true))); await parked(page, 'static');
  await route(page, 'wallet'); await page.waitForTimeout(60);
  const calm = await page.locator('.world-camera').evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.world-camera').evaluate((el) => getComputedStyle(el).transform), calm);
  await page.evaluate(() => __runWorld(() => world.stop())); freed(await snapshot(page));
});

test('world: motion settings, high contrast and live OS preferences park every ambient animation', async (t) => {
  const page = await fixture(t); await running(page);
  for (const [name, value] of [['data-gp-motion', 'reduce'], ['data-gp-theme', 'contrast']]) {
    await page.evaluate(([name, value]) => document.documentElement.setAttribute(name, value), [name, value]);
    await parked(page, 'static');
    await page.evaluate((name) => document.documentElement.removeAttribute(name), name); await running(page);
  }
  for (const [attribute, value, reset] of [['reducedMotion', 'reduce', 'no-preference'], ['forcedColors', 'active', 'none']]) {
    await page.emulateMedia({ [attribute]: value }); await parked(page, 'static');
    await page.emulateMedia({ [attribute]: reset }); await running(page);
  }
  await page.evaluate(() => __runWorld(() => world.setMotion(true))); await parked(page, 'static');
  await page.evaluate(() => __runWorld(() => world.setMotion(false))); await running(page);
  await page.evaluate(() => { document.documentElement.setAttribute('data-gp-theme', 'dark'); __runWorld(() => world.retheme()); });
  await running(page);
  await page.evaluate(() => __runWorld(() => world.stop())); freed(await snapshot(page));
});

test('world: an explicit Full motion choice overrides OS reduce while stronger pause choices still win', async (t) => {
  const page = await fixture(t, { context: { reducedMotion: 'reduce' } });
  await parked(page, 'static');
  await page.evaluate(() => { document.documentElement.setAttribute('data-gp-motion', 'full'); __runWorld(() => world.setMotion(false)); });
  await running(page);
  const before = await layerTransforms(page); await page.waitForTimeout(350);
  assert.notDeepEqual(await layerTransforms(page), before, 'Full motion must restore actual native layer movement under OS reduce');
  await route(page, 'create'); await page.waitForTimeout(100);
  assert.equal(await page.locator('.world-camera').evaluate((el) => el.getAnimations().some((animation) => animation.playState === 'running')), true,
    'Full motion must also allow a route camera journey under OS reduce');
  await page.evaluate(() => document.documentElement.setAttribute('data-gp-motion', 'reduce')); await parked(page, 'static');
  await page.evaluate(() => { document.documentElement.setAttribute('data-gp-motion', 'full'); document.documentElement.setAttribute('data-gp-theme', 'contrast'); }); await parked(page, 'static');
  await page.evaluate(() => document.documentElement.removeAttribute('data-gp-theme')); await running(page);
  await page.emulateMedia({ forcedColors: 'active' }); await parked(page, 'static');
  await page.emulateMedia({ forcedColors: 'none' }); await running(page);
  await page.evaluate(() => __runWorld(() => world.setMotion(true))); await parked(page, 'static');
  await page.evaluate(() => __runWorld(() => world.setMotion(false))); await running(page);
  await page.evaluate(() => document.documentElement.removeAttribute('data-gp-motion')); await parked(page, 'static');
  await page.evaluate(() => __runWorld(() => world.stop())); freed(await snapshot(page));
});

test('world: focused creator controls, active player iframe, hidden document and modal attention pause work', async (t) => {
  const page = await fixture(t); await running(page);
  for (const selector of ['#ask', '#text', '#choice', '#edit']) {
    await page.focus(selector); await parked(page);
    await page.focus('#outside'); await running(page);
  }
  await page.frameLocator('#toy').locator('button').focus(); await parked(page);
  await page.focus('#outside'); await running(page);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await parked(page);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await running(page);
  await page.evaluate(() => { document.querySelector('#dialogs').innerHTML = '<div role="dialog" aria-modal="true">Modal</div>'; }); await parked(page);
  await page.evaluate(() => document.querySelector('#dialogs').replaceChildren()); await running(page);
  await page.evaluate(() => __runWorld(() => world.stop())); freed(await snapshot(page));
});

test('world: replacement mounts and repeated teardown preserve unrelated children without leaking listeners', async (t) => {
  const page = await fixture(t);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => __mountWorld());
    assert.equal(await page.locator('#host .world-camera').count(), 1);
  }
  await route(page, 'business'); await page.waitForTimeout(60);
  const activeCamera = await page.evaluate(() => {
    window.ownedCameraAnimations = document.querySelector('#host .world-camera').getAnimations()
      .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    return ownedCameraAnimations.some((animation) => animation.playState === 'running');
  });
  assert.equal(activeCamera, true, 'teardown must exercise a camera journey that is still in progress');
  await page.evaluate(() => __runWorld(() => { world.stop(); world.destroy(); world.stop(); }));
  assert.equal(await page.evaluate(() => ownedCameraAnimations.every((animation) => animation.playState === 'idle')), true, 'teardown must cancel the unfinished camera animation');
  assert.equal(await page.locator('#host .world-camera').count(), 0);
  assert.equal(await page.locator('#unowned').count(), 1);
  assert.equal(await page.getAttribute('#host', 'data-world-motion'), null);
  freed(await snapshot(page));
  await page.evaluate(() => { __mountWorld({ reducedMotion: true }); document.querySelector('#host').remove(); });
  await page.waitForFunction(() => __worldSnapshot().observers === 0);
  freed(await snapshot(page));
});

async function integration(t, configuration) {
  const site = process.env.WORLD_SITE_URL;
  if (!site) { t.skip('Set WORLD_SITE_URL to a built local static page to run route/fit integration.'); return null; }
  const url = new URL(site);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'integration may use a local static page only');
  const context = await browser.newContext({ viewport: configuration.viewport, reducedMotion: configuration.reducedMotion || 'no-preference' }), page = await context.newPage(), errors = [], writes = [];
  page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors, []); assert.deepEqual(writes, []); });
  await context.addInitScript((prefs) => { if (window === top) localStorage.setItem('gp.prefs.v1', JSON.stringify(prefs)); }, configuration.prefs);
  await context.route('**/*', (route) => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method())) { writes.push(request.url()); return route.abort(); }
    return new URL(request.url()).origin === url.origin ? route.continue() : route.abort();
  });
  const response = await page.goto(site);
  assert.equal(response?.ok(), true, 'the built local page must load successfully');
  const hash = createHash('sha256').update(await response.body()).digest('hex');
  if (!servedHash) { servedHash = hash; t.diagnostic('Served HTML SHA-256 ' + hash); }
  else assert.equal(hash, servedHash, 'finish integration/build before testing; served HTML changed between contexts');
  await page.waitForFunction(() => window.__pp?.ready && document.querySelector('#site-world .world-camera'));
  await page.waitForFunction(() => [...document.querySelectorAll('#site-world img')].every((img) => img.complete && img.naturalWidth > 0));
  assert.equal(await page.evaluate(() => __pp.mode), 'local', 'integration fixture must stay local and spend no credits');
  await page.evaluate(() => { window.savedWorldHost = document.querySelector('#site-world'); window.savedWorldCamera = savedWorldHost.querySelector('.world-camera'); });
  return page;
}

test('world: the embedded local artifact decodes every HD asset without external image requests',async (t) => {
  if (!process.env.WORLD_SITE_URL) { t.skip('Set WORLD_SITE_URL to a built local static page to verify the embedded artifact.'); return; }
  const site = new URL(process.env.WORLD_SITE_URL);
  assert.ok(site.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(site.hostname));
  const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),page = await context.newPage(),errors = [],externalImages = [];
  t.after(async () => { await context.close(); assert.deepEqual(errors,[]); assert.deepEqual(externalImages,[],'all background assets are truly embedded'); });
  page.on('pageerror',(error) => errors.push(error.message));
  await context.route('**/*',(request) => {
    const target = new URL(request.request().url());
    if (request.request().resourceType() === 'image') externalImages.push(target.href);
    return target.origin === site.origin && target.pathname === '/local.html' ? request.continue() : request.abort();
  });
  const response = await page.goto(new URL('/local.html',site).href);
  assert.equal(response?.ok(),true);
  await page.waitForFunction(() => window.__pp?.ready && document.querySelectorAll('#site-world img').length === 12
    && [...document.querySelectorAll('#site-world img')].every((img) => img.complete && img.naturalWidth >= 1024 && img.currentSrc.startsWith('data:image/webp')));
  assert.equal(await page.evaluate(() => __pp.mode),'local');
});

async function navigate(page, hash) {
  const expected = hash.split('-')[0];
  await page.evaluate((hash) => { location.hash = hash; }, hash);
  await page.waitForFunction((expected) => __pp.route === expected && document.querySelector('#view h1') && document.querySelector('#site-world').dataset.worldRoute === expected, expected);
  await page.waitForTimeout(100);
}

test('world: integrated background persists outside the view across every route family', async (t) => {
  const page = await integration(t, { viewport: { width: 1440, height: 900 }, prefs: { theme: 'light', text: 'md', layout: 'scroll', motion: 'reduce', speed: 1, sound: false } });
  if (!page) return;
  for (const hash of ['home', 'explore', 'game-kit-neon-dash', 'create', 'business', 'maker-11111111111111111111111111111111', 'group-missing0', 'wallet', 'ledger', 'economy', 'home']) {
    await navigate(page, hash);
    const state = await page.evaluate(() => ({ sameHost: savedWorldHost === document.querySelector('#site-world'), sameCamera: savedWorldCamera === savedWorldHost.querySelector('.world-camera'),
      outsideView: !document.querySelector('#view').contains(savedWorldHost), total: document.querySelectorAll('#site-world .world-camera').length, width: document.documentElement.scrollWidth - innerWidth }));
    assert.equal(state.sameHost, true, hash + ': background host persists'); assert.equal(state.sameCamera, true, hash + ': camera persists');
    assert.equal(state.outsideView, true); assert.equal(state.total, 1); assert.ok(state.width <= 1, hash + ': no horizontal overflow');
  }
});

test('world: actual Settings UI enables Full motion under OS reduce and restores the device preference', async (t) => {
  const page = await integration(t, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce',
    prefs: { theme: 'light', text: 'md', layout: 'fit', motion: 'system', speed: 1, sound: false } });
  if (!page) return;
  const worldMode = (expected) => page.waitForFunction((expected) => document.querySelector('#site-world').dataset.worldMotion === expected, expected);
  async function chooseMotion(value) {
    await page.locator('#a11y-btn').click();
    await page.locator('#modal-root input[name="pref-motion"][value="' + value + '"]').check();
    await page.waitForFunction((value) => __pp.prefs.motion === value, value);
    await page.locator('#modal-root').getByRole('button', { name: 'Done', exact: true }).click();
  }
  await worldMode('static');
  await chooseMotion('full'); await worldMode('running');
  assert.equal(await page.getAttribute('html', 'data-gp-motion'), 'full');
  const first = await page.locator('#site-world .world-cloud').first().evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(350);
  assert.notEqual(await page.locator('#site-world .world-cloud').first().evaluate((el) => getComputedStyle(el).transform), first);
  const start = await page.locator('#site-world .world-camera').evaluate((el) => getComputedStyle(el).transform);
  // Observe the native journey in the actual click dispatch, after the app's
  // document handler navigates. A later Playwright sample can miss a completed
  // 1450ms journey when other browser checks keep the machine busy.
  await page.evaluate(() => {
    window.__worldClickJourney = null;
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.island-nav-marker[data-nav="explore"]')) return;
      const host = document.querySelector('#site-world');
      const animations = host.querySelector('.world-camera').getAnimations();
      window.__worldClickJourney = {
        route: __pp.route,
        worldRoute: host.dataset.worldRoute,
        started: animations.some((animation) => animation.playState === 'running'
          && Number.isFinite(animation.effect?.getComputedTiming().endTime)),
      };
    }, { once: true });
  });
  await page.locator('.island-nav-marker[data-nav="explore"]').click();
  assert.deepEqual(await page.evaluate(() => __worldClickJourney), { route: 'explore', worldRoute: 'explore', started: true },
    'the real island click must start a native camera journey to Explore');
  await page.waitForFunction(() => __pp.route === 'explore' && document.querySelector('#view h1')
    && document.querySelector('#site-world .world-camera').getAnimations().every((animation) => animation.playState !== 'running'));
  assert.notEqual(await page.locator('#site-world .world-camera').evaluate((el) => getComputedStyle(el).transform), start);
  await chooseMotion('reduce'); await worldMode('static');
  await chooseMotion('full'); await worldMode('running');
  await page.locator('#a11y-btn').click();
  await page.locator('#modal-root input[name="pref-theme"][value="contrast"]').check();
  await page.locator('#modal-root').getByRole('button', { name: 'Done', exact: true }).click();
  await worldMode('static');
  assert.equal(await page.evaluate(() => __pp.prefs.motion), 'full', 'high contrast must remain still even when Full is selected');
  await page.locator('#a11y-btn').click();
  await page.locator('#modal-root [data-act="prefs-reset"]').click();
  await page.locator('#modal-root').getByRole('button', { name: 'Done', exact: true }).click();
  await worldMode('static');
  assert.equal(await page.evaluate(() => __pp.prefs.motion), 'system');
  assert.equal(await page.getAttribute('html', 'data-gp-motion'), null);
});

for (const [name, viewport, text] of [['desktop', { width: 1440, height: 900 }, 'md'], ['phone', { width: 390, height: 844 }, 'xl']]) {
  test('world: integrated ' + name + ' fitted pages retain usable panes and creator input', async (t) => {
    const page = await integration(t, { viewport, prefs: { theme: 'light', text, layout: 'fit', motion: 'reduce', speed: 1, sound: false } });
    if (!page) return;
    for (const hash of ['home', 'explore', 'game-kit-neon-dash', 'create', 'business', 'maker-11111111111111111111111111111111', 'group-missing0', 'wallet', 'ledger', 'economy']) {
      await navigate(page, hash);
      const geometry = await page.evaluate(() => {
        const host = document.querySelector('#site-world'), r = host.getBoundingClientRect(), pager = document.querySelector('#view>.pager')?.getBoundingClientRect();
        return { width: document.documentElement.scrollWidth - innerWidth, height: document.documentElement.scrollHeight - innerHeight,
          world: { width: r.width, height: r.height, x: r.x, y: r.y }, pager: pager ? { top: pager.top, bottom: pager.bottom, right: pager.right, left: pager.left } : null };
      });
      assert.ok(geometry.width <= 1 && geometry.height <= 1, hash + ': fitted page must not scroll the window');
      assert.deepEqual(geometry.world, { width: viewport.width, height: viewport.height, x: 0, y: 0 });
      if (geometry.pager) assert.ok(geometry.pager.top >= -1 && geometry.pager.left >= -1 && geometry.pager.bottom <= viewport.height + 1 && geometry.pager.right <= viewport.width + 1, hash + ': pager remains reachable');
    }
    await navigate(page, 'home');
    const input = page.locator('#home-prompt');
    await input.fill('Make a tiny sky adventure');
    assert.equal(await input.inputValue(), 'Make a tiny sky adventure');
    assert.equal(await input.evaluate((el) => document.activeElement === el), true);
  });
}
