// Native-browser navigation checks. WORLD_SITE_URL opts into rebuilt local-site integration.
import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

let browser, source, servedHash;
before(async (t) => {
  source = await readFile(new URL('../src/world-navigation.js',import.meta.url),'utf8');
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,
    args:['--no-sandbox','--disable-background-networking','--disable-component-update','--disable-breakpad']});
  t.diagnostic('Native Chromium ' + browser.version() + '; navigation source SHA-256 ' + createHash('sha256').update(source).digest('hex'));
});
after(async () => { await browser?.close(); });

function instrument() {
  const stats = window.navStats = {listeners:[],observers:0};
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type,fn,options) {
    if (window.trackNavigation) stats.listeners.push({target:this,type,fn,options,live:true});
    return add.call(this,type,fn,options);
  };
  EventTarget.prototype.removeEventListener = function (type,fn,options) {
    for (const item of stats.listeners) if (item.target === this && item.type === type && item.fn === fn && item.options === options) item.live = false;
    return remove.call(this,type,fn,options);
  };
  for (const name of ['ResizeObserver','MutationObserver','IntersectionObserver']) {
    const Native = window[name]; if (!Native) continue;
    window[name] = class {
      constructor(callback,options) { this.native = new Native(callback,options); this.tracked = !!window.trackNavigation; this.live = false; }
      observe(...args) { if (this.tracked && !this.live) { this.live = true; stats.observers++; } return this.native.observe(...args); }
      unobserve(...args) { return this.native.unobserve?.(...args); }
      disconnect() { if (this.tracked && this.live) { this.live = false; stats.observers--; } this.native.disconnect(); }
    };
  }
  window.mountNavigation = () => {
    window.trackNavigation = true;
    try { window.navigation = PPWorldNavigation.mount(document.querySelector('#host')); } finally { window.trackNavigation = false; }
  };
  window.navigationSnapshot = () => ({listeners:stats.listeners.filter((item) => item.live).length,observers:stats.observers});
}
async function fixture(t,{viewport={width:1440,height:900},xl=false}={}) {
  const context = await browser.newContext({viewport}), page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror',(error) => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors,[]); });
  await page.setContent('<html><head><style>:root{--panel:#fffdf0;--panel-2:#eef6fc;--ink:#14334b;--ink-2:#2b4f67;--accent:#08628b;--accent-soft:#d3edf8;font-size:' + (xl ? '21px' : '16px') + '}body{margin:0;background:#77c7ee}#site-world{position:fixed;inset:0;background:linear-gradient(100deg,#9decff,#b9ff7b)}main{position:fixed;left:20px;top:180px;width:300px;z-index:2}input,button{font:inherit;padding:10px}main label{display:grid;gap:8px}#outside{position:fixed;right:18px;top:18px;z-index:8}</style></head><body><div id="site-world" aria-hidden="true"></div><div id="host" class="retained" data-island-route="prior" data-island-theme="prior"><span id="unowned">Preserved</span></div><main><label>Game idea<input id="idea" value=""></label></main><button id="outside">Outside control</button></body></html>');
  await page.evaluate(instrument); await page.addScriptTag({content:source}); await page.evaluate(() => mountNavigation());
  await page.evaluate(() => document.addEventListener('click',(event) => {
    const link = event.target.closest('[data-nav]'); if (!link) return;
    event.preventDefault(); window.lastRoute = link.dataset.nav; navigation.setRoute(link.dataset.nav);
  }));
  return page;
}
async function openMap(page) {
  const toggle = page.getByRole('button',{name:'Visit island',exact:true}); await toggle.click();
  await page.locator('.island-nav-overlay').waitFor({state:'visible'}); return toggle;
}
async function visibleLink(page,route) {
  const links = page.locator('.island-nav a[data-nav="' + route + '"]');
  for (let i = 0; i < await links.count(); i++) if (await links.nth(i).isVisible()) return links.nth(i);
  await openMap(page);
  for (let i = 0; i < await links.count(); i++) if (await links.nth(i).isVisible()) return links.nth(i);
  assert.fail('No reachable destination for ' + route);
}
async function assertNoViewportOverflow(page) {
  const geometry = await page.evaluate(() => ({width:document.documentElement.scrollWidth - innerWidth,height:document.documentElement.scrollHeight - innerHeight}));
  assert.ok(geometry.width <= 1,'no sideways navigation overflow');
  assert.ok(geometry.height <= 1,'fixed navigation must not make the window scroll');
  for (const link of await page.locator('.island-nav a,.island-nav button').all()) {
    if (!await link.isVisible()) continue;
    const r = await link.boundingBox(), viewport = page.viewportSize();
    // An open panel may scroll its own link list; its visible link targets stay inside the viewport.
    if (r.y + r.height < 0 || r.y > viewport.height) continue;
    assert.ok(r.x >= -1 && r.x + r.width <= viewport.width + 1,'visible navigation link fits horizontally');
  }
}

test('navigation: desktop island signposts are accessible siblings of art and do not cover creator controls',async (t) => {
  const page = await fixture(t);
  assert.equal(await page.evaluate(() => PPWorldNavigation.mount(null)),null);
  await page.evaluate(() => mountNavigation());
  assert.equal(await page.locator('.island-nav-destinations').count(),1,'mounting the same host is idempotent');
  assert.equal(await page.locator('.island-nav-marker:visible').count(),6);
  assert.equal(await page.locator('#site-world .island-nav').count(),0);
  assert.equal(await page.getAttribute('#host','aria-hidden'),null);
  await page.locator('#idea').fill('A friendly sky race');
  assert.equal(await page.locator('#idea').inputValue(),'A friendly sky race');
  const hit = await page.locator('#idea').evaluate((input) => {
    const r = input.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2,r.y + r.height / 2) === input;
  });
  assert.equal(hit,true,'the full-screen navigation host must not intercept an input');
  await assertNoViewportOverflow(page);
  await (await visibleLink(page,'create')).click();
  assert.equal(await page.evaluate(() => lastRoute),'create');
  assert.equal(await page.locator('.island-nav-destinations').isVisible(),false);
  assert.equal(await page.locator('.island-nav-home').isVisible(),true);
});

test('navigation: the actual disclosure keyboard flow, Escape and outside actions keep focus usable',async (t) => {
  const page = await fixture(t,{viewport:{width:390,height:844},xl:true});
  const toggle = page.getByRole('button',{name:'Visit island',exact:true});
  await toggle.focus(); await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.nav),'create');
  await page.evaluate(() => navigation.setRoute('home'));
  assert.equal(await toggle.getAttribute('aria-expanded'),'true','ordinary same-route renders preserve an open disclosure');
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await toggle.evaluate((el) => document.activeElement === el),true);
  await openMap(page); await page.locator('#outside').click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#outside').evaluate((el) => document.activeElement === el),true,'outside action keeps its focus');
  await toggle.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => lastRoute),'create');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false','choosing an island closes the disclosure');
  await openMap(page); await page.locator('.island-nav-map a[data-nav="create"]').click();
  assert.equal(await toggle.evaluate((el) => document.activeElement === el),true,'activating the current island must not leave focus on its hidden map link');
});

test('navigation: route-family selection and World map work through actual links',async (t) => {
  const page = await fixture(t,{viewport:{width:390,height:844}});
  for (const route of ['create','explore','wallet','ledger','economy','business']) {
    await (await visibleLink(page,route)).click();
    assert.equal(await page.evaluate(() => lastRoute),route);
    await openMap(page);
    assert.equal(await page.locator('.island-nav-map a[aria-current="page"]').getAttribute('data-nav'),route);
    await page.keyboard.press('Escape');
  }
  for (const [route,destination] of [['game-example','explore'],['maker-example','create'],['group-example','explore']]) {
    await page.evaluate((route) => navigation.setRoute(route),route); await openMap(page);
    assert.equal(await page.locator('.island-nav-map a[aria-current="page"]').getAttribute('data-nav'),destination);
    await page.keyboard.press('Escape');
  }
  await page.locator('.island-nav-home').click();
  assert.equal(await page.evaluate(() => lastRoute),'home');
});

test('navigation: desktop, short windows and largest phone text retain reachable controls',async (t) => {
  const page = await fixture(t);
  for (const viewport of [{width:1440,height:900},{width:1000,height:680},{width:1280,height:580},{width:390,height:844},{width:360,height:640}]) {
    await page.setViewportSize(viewport); await page.evaluate(() => { document.documentElement.style.fontSize = '21px'; navigation.setRoute('home'); });
    await assertNoViewportOverflow(page);
    if (viewport.width <= 900 || viewport.height <= 600) {
      assert.equal(await page.locator('.island-nav-marker:visible').count(),0);
      await openMap(page); await assertNoViewportOverflow(page);
      const map = page.locator('.island-nav-map a[data-nav="business"]'); await map.scrollIntoViewIfNeeded(); await map.click();
      assert.equal(await page.evaluate(() => lastRoute),'business');
      await assertNoViewportOverflow(page);
    }
  }
  await page.setViewportSize({width:390,height:844}); await page.evaluate(() => navigation.setRoute('home'));
  await openMap(page); await page.locator('.island-nav-map a[data-nav="wallet"]').focus();
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(() => document.querySelector('.island-nav-overlay').hidden);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.nav),'create','a map focused during resize moves focus to a visible signpost');
});

test('navigation: explicit contrast and forced-color settings keep solid readable map surfaces',async (t) => {
  const page = await fixture(t,{viewport:{width:390,height:844}});
  await page.evaluate(() => { document.documentElement.setAttribute('data-gp-theme','contrast'); document.documentElement.style.setProperty('--panel','#000'); document.documentElement.style.setProperty('--ink','#fff'); });
  await openMap(page);
  const appearance = await page.locator('.island-nav-overlay').evaluate((el) => ({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter}));
  assert.equal(appearance.background,'rgb(0, 0, 0)'); assert.equal(appearance.blur,'none');
  await page.emulateMedia({forcedColors:'active'});
  assert.equal(await page.locator('.island-nav-overlay').evaluate((el) => getComputedStyle(el).backdropFilter),'none');
  await (await visibleLink(page,'ledger')).click(); assert.equal(await page.evaluate(() => lastRoute),'ledger');
});

test('navigation: leaving the Home invitation parks signposts and preserves keyboard focus on both layouts',async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    const style = document.createElement('style'); style.textContent = '.fit-off{display:none!important}#view{position:absolute;left:340px;top:90px;width:400px}.hero-copy{height:600px}#later-content{margin-top:750px;height:700px}'; document.head.appendChild(style);
    const view = document.createElement('div'); view.id = 'view';
    view.innerHTML = '<section class="pack"><div class="hero-copy">Home invitation</div></section><section id="later-content"><button id="game-control">Play game</button></section>';
    document.body.appendChild(view); document.documentElement.setAttribute('data-fit','');
    document.addEventListener('keydown',(event) => {
      if (event.key === 'PageDown' && !event.target.closest('.island-nav-overlay')) { event.preventDefault(); document.querySelector('.hero-copy').classList.add('fit-off'); }
    });
  });
  await page.waitForFunction(() => document.querySelector('#host').dataset.islandHomeMode === 'map');
  await page.locator('.island-nav-marker[data-nav="create"]').focus(); await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('#host').dataset.islandHomeMode === 'compact');
  assert.equal(await page.locator('.island-nav-marker:visible').count(),0,'later fitted Home panes have no signpost hitboxes over the game');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('island-nav-toggle')),true,'a hidden focused signpost moves to the visible Visit island control');
  await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  // A refit may reveal the invitation while focus remains in the island disclosure.
  await page.evaluate(() => document.querySelector('.hero-copy').classList.remove('fit-off'));
  await page.waitForFunction(() => document.querySelector('#host').dataset.islandHomeMode === 'map');
  assert.equal(await page.locator('.island-nav-overlay').isVisible(),false);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.nav),'create','returning to the invitation parks the disclosure and restores visible navigation focus');
  await page.evaluate(() => document.documentElement.removeAttribute('data-fit'));
  await page.evaluate(() => window.scrollTo(0,150));
  await page.waitForFunction(() => document.querySelector('#host').dataset.islandHomeMode === 'compact');
  assert.ok(await page.locator('.hero-copy').evaluate((el) => el.getBoundingClientRect().bottom) > 0,'navigation parks while the invitation is still partly visible');
  await page.evaluate(() => window.scrollTo(0,1000));
  await page.waitForFunction(() => document.querySelector('#host').dataset.islandHomeMode === 'compact');
  assert.equal(await page.locator('.island-nav-marker:visible').count(),0,'scrolled-past invitation has no fixed signposts over later content');
  await page.locator('#game-control').scrollIntoViewIfNeeded(); await page.locator('#game-control').click();
  assert.equal(await page.locator('#game-control').evaluate((el) => document.activeElement === el),true);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.waitForFunction(() => document.querySelector('#host').dataset.islandHomeMode === 'map');
  assert.equal(await page.locator('.island-nav-marker:visible').count(),6);
});

test('navigation: repeated teardown releases all owned listeners and observers and preserves host content',async (t) => {
  const page = await fixture(t,{viewport:{width:390,height:844}}); await openMap(page);
  await page.evaluate(() => { navigation.destroy(); navigation.destroy(); });
  assert.deepEqual(await page.evaluate(() => navigationSnapshot()),{listeners:0,observers:0});
  assert.equal(await page.locator('#host .island-nav-overlay').count(),0);
  assert.equal(await page.locator('#unowned').count(),1);
  assert.equal(await page.getAttribute('#host','class'),'retained');
  assert.equal(await page.getAttribute('#host','data-island-route'),'prior');
  assert.equal(await page.getAttribute('#host','data-island-theme'),'prior');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => mountNavigation()); await page.evaluate(() => navigation.destroy());
    assert.deepEqual(await page.evaluate(() => navigationSnapshot()),{listeners:0,observers:0});
  }
});

async function integration(t,{viewport,text}) {
  const site = process.env.WORLD_SITE_URL;
  if (!site) { t.skip('Set WORLD_SITE_URL to a rebuilt local page for complete integration.'); return null; }
  const url = new URL(site); assert.ok(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname),'integration stays local and uses no API credits');
  const context = await browser.newContext({viewport,reducedMotion:'reduce'}), page = await context.newPage(), errors = [], writes = [];
  page.setDefaultTimeout(15000); page.on('pageerror',(error) => errors.push(error.message));
  t.after(async () => { await context.close(); assert.deepEqual(errors,[]); assert.deepEqual(writes,[]); });
  await context.addInitScript((text) => { if (window === top) localStorage.setItem('gp.prefs.v1',JSON.stringify({theme:'light',text,layout:'fit',motion:'reduce',speed:1,sound:false})); },text);
  await context.route('**/*',(route) => {
    const request = route.request();
    if (!['GET','HEAD'].includes(request.method())) { writes.push(request.url()); return route.abort(); }
    return new URL(request.url()).origin === url.origin ? route.continue() : route.abort();
  });
  const response = await page.goto(site); assert.equal(response?.ok(),true);
  const hash = createHash('sha256').update(await response.body()).digest('hex');
  if (!servedHash) { servedHash = hash; t.diagnostic('Served HTML SHA-256 ' + hash); } else assert.equal(hash,servedHash,'the build must remain frozen across integration contexts');
  await page.waitForFunction(() => window.__pp?.ready && document.querySelector('#world-navigation.island-nav'));
  assert.equal(await page.evaluate(() => __pp.mode),'local');
  await page.evaluate(() => { window.savedNavigation = document.querySelector('#world-navigation'); window.savedCamera = document.querySelector('#site-world .world-camera'); });
  return page;
}
for (const [name,viewport,text] of [['desktop',{width:1440,height:900},'md'],['phone XL',{width:390,height:844},'xl']]) {
  test('navigation: integrated ' + name + ' island links change real routes and preserve fitted controls',async (t) => {
    const page = await integration(t,{viewport,text}); if (!page) return;
    const idea = page.locator('#home-prompt'); await idea.fill('A game of cloud hopping');
    assert.equal(await idea.inputValue(),'A game of cloud hopping');
    for (const route of ['create','explore','wallet','ledger','economy','business','home']) {
      await (await visibleLink(page,route)).click();
      await page.waitForFunction((route) => __pp.route === route && document.querySelector('#site-world').dataset.worldRoute === route && document.querySelector('#world-navigation').dataset.islandRoute === route,route);
      assert.equal(await page.evaluate(() => savedNavigation === document.querySelector('#world-navigation')),true);
      assert.equal(await page.evaluate(() => savedCamera === document.querySelector('#site-world .world-camera')),true);
      await assertNoViewportOverflow(page);
      const usable = await page.evaluate(() => {
        const pager = document.querySelector('#view>.pager');
        const controls = [document.querySelector('#a11y-btn'),document.querySelector('#wchip'),...(pager ? [...pager.querySelectorAll('button:not(:disabled)')] : [])];
        return controls.filter((el) => el && el.getClientRects().length).map((el) => {
          const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2,r.y + r.height / 2);
          return {name:el.getAttribute('aria-label') || el.textContent.trim(),hit:el === hit || el.contains(hit),onscreen:r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1};
        });
      });
      assert.ok(usable.length >= 2);
      assert.ok(usable.every((control) => control.hit && control.onscreen),route + ': utility controls and pager must stay reachable: ' + JSON.stringify(usable));
      if (route === 'create') {
        const toggle = await openMap(page); await page.locator('.island-nav-map a[data-nav="create"]').click();
        assert.equal(await toggle.evaluate((el) => document.activeElement === el || document.activeElement.id === 'view'),true,'actual same-route navigation keeps focus on a visible opener or route content');
      }
    }
    await page.locator('#a11y-btn').click(); await page.getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(await page.locator('#modal-root [role="dialog"]').count(),0);
    const next = page.getByRole('button',{name:'Next part',exact:true});
    if (await next.count() && await next.isEnabled()) {
      await next.click(); await page.waitForFunction(() => document.querySelector('#world-navigation').dataset.islandHomeMode === 'compact');
      assert.equal(await page.locator('.island-nav-marker:visible').count(),0,'actual later Home panes park the island signposts');
      await assertNoViewportOverflow(page);
      await openMap(page); await page.locator('.island-nav-map a[data-nav="explore"]').click();
      await page.waitForFunction(() => __pp.route === 'explore');
    }
  });
}

test('navigation: a tall integrated map uses native keyboard scrolling without flipping the page below',async (t) => {
  const page = await integration(t,{viewport:{width:390,height:430},text:'xl'}); if (!page) return;
  await openMap(page); await page.locator('.island-nav-map a[data-nav="create"]').focus();
  const before = await page.evaluate(() => ({pane:__pp.ui.pane,top:document.querySelector('.island-nav-overlay').scrollTop,height:document.querySelector('.island-nav-overlay').clientHeight,scrollHeight:document.querySelector('.island-nav-overlay').scrollHeight}));
  assert.ok(before.scrollHeight > before.height,'this fixture must exercise a genuinely scrollable map');
  await page.keyboard.press('PageDown');
  await page.waitForFunction((top) => document.querySelector('.island-nav-overlay').scrollTop > top,before.top);
  assert.equal(await page.evaluate(() => __pp.ui.pane),before.pane,'PageDown in the map must not change the underlying fitted pane');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Visit island',exact:true}).evaluate((el) => document.activeElement === el),true);
});

test('navigation: actual HD island frames and clamped signposts share anchors through 4K and compact resizing',async (t) => {
  const page = await integration(t,{viewport:{width:1440,height:900},text:'md'}); if (!page) return;
  await page.waitForFunction(() => [...document.querySelectorAll('#site-world .world-island-art')].length === 4
    && [...document.querySelectorAll('#site-world .world-island-art')].every((image) => image.complete && image.naturalWidth > 0));
  for (const viewport of [{width:1440,height:900},{width:1000,height:680},{width:3840,height:2160},{width:1280,height:580},{width:390,height:844},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({width,height}) => {
      const scene = PPWorldBackground.layout(width,height);
      const marker = document.querySelector('.island-nav-marker[data-nav="create"]');
      const island = document.querySelector('#site-world .world-island-forest'), rect = island.getBoundingClientRect(), frame = scene.frames.forest;
      return Math.abs(parseFloat(marker.style.getPropertyValue('--island-x')) - scene.frames.forest.anchor.x * width) < .01
        && Math.abs(parseFloat(marker.style.getPropertyValue('--island-y')) - scene.frames.forest.anchor.y * height) < .01
        && Math.abs(rect.left - frame.x * width) < 1 && Math.abs(rect.top - frame.y * height) < 1;
    },viewport);
    const anchors = await page.evaluate(() => {
      const scene = PPWorldBackground.layout(innerWidth,innerHeight);
      return [...document.querySelectorAll('.island-nav-marker')].map((link) => {
        const frame = scene.frames[link.dataset.island], anchor = link.classList.contains('island-nav-secondary') ? frame.secondary : frame.anchor;
        const island = document.querySelector('#site-world .world-island-' + link.dataset.island), islandRect = island.getBoundingClientRect(), r = link.getBoundingClientRect();
        return {route:link.dataset.nav,compact:scene.compact || document.querySelector('#world-navigation').dataset.islandHomeMode === 'compact',visible:!!link.getClientRects().length,
          intended:{x:anchor.x * innerWidth,y:anchor.y * innerHeight},
          configured:{x:parseFloat(link.style.getPropertyValue('--island-x')),y:parseFloat(link.style.getPropertyValue('--island-y'))},
          clamped:{x:Math.max(125,Math.min(innerWidth - 125,anchor.x * innerWidth)),y:Math.max(40,Math.min(innerHeight - 60,anchor.y * innerHeight))},
          actual:{x:r.left + r.width / 2,y:r.top + r.height / 2},
          frame:{expected:{x:frame.x * innerWidth,y:frame.y * innerHeight,width:frame.width * innerWidth,height:frame.height * innerHeight},
            actual:{x:islandRect.left,y:islandRect.top,width:islandRect.width,height:islandRect.height}}};
      });
    });
    assert.equal(anchors.length,6);
    for (const anchor of anchors) {
      for (const key of ['x','y']) assert.ok(Math.abs(anchor.configured[key] - anchor.intended[key]) < .01,anchor.route + ': resize updates the shared anchor');
      for (const key of ['x','y','width','height']) assert.ok(Math.abs(anchor.frame.actual[key] - anchor.frame.expected[key]) < 1,anchor.route + ': the real renderer uses the shared frame');
      if (anchor.compact) assert.equal(anchor.visible,false,'compact displays use the reachable map instead of scenery hitboxes');
      else {
        assert.equal(anchor.visible,true);
        for (const key of ['x','y']) assert.ok(Math.abs(anchor.actual[key] - anchor.clamped[key]) < 1,anchor.route + ': actual signpost center stays attached to its rendered island');
      }
    }
    await assertNoViewportOverflow(page);
  }
});

test('navigation: visible 4K Home play panes park secondary signposts and retain actual game and keyboard map controls',async (t) => {
  const page = await integration(t,{viewport:{width:3840,height:2160},text:'md'}); if (!page) return;
  const play = page.locator('#home-pack .play-stage iframe'); await play.waitFor({state:'visible'});
  const point = await page.evaluate(() => {
    const anchor = PPWorldBackground.layout(innerWidth,innerHeight).frames.race.secondary;
    const iframe = document.querySelector('#home-pack .play-stage iframe'), r = iframe.getBoundingClientRect();
    return {x:anchor.x * innerWidth,y:anchor.y * innerHeight,iframe:{x:r.left,y:r.top,right:r.right,bottom:r.bottom}};
  });
  assert.ok(point.x > point.iframe.x && point.x < point.iframe.right && point.y > point.iframe.y && point.y < point.iframe.bottom,
    'this real 4K layout reproduces the secondary economy signpost position over the playable iframe');
  await page.waitForFunction(() => document.querySelector('#world-navigation').dataset.islandHomeMode === 'compact');
  assert.equal(await page.locator('.island-nav-marker:visible').count(),0,'visible play panes must park all world signpost hitboxes');
  assert.equal(await page.evaluate(({x,y}) => document.elementFromPoint(x,y) === document.querySelector('#home-pack .play-stage iframe'),point),true,
    'the former economy-marker position must hit the actual playable iframe');
  await page.mouse.click(point.x,point.y);
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#home-pack .play-stage iframe')),true,
    'an actual game click must focus the playable frame');
  for (const route of ['economy','business']) {
    const toggle = page.getByRole('button',{name:'Visit island',exact:true}); await toggle.focus(); await page.keyboard.press('Enter');
    await page.locator('.island-nav-overlay').waitFor({state:'visible'});
    const link = page.locator('.island-nav-map a[data-nav="' + route + '"]'); await link.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction((route) => __pp.route === route,route);
    assert.equal(await page.locator('.island-nav-overlay').isVisible(),false,'secondary destinations close their map after keyboard activation');
    await page.locator('.island-nav-home').click(); await page.waitForFunction(() => __pp.route === 'home');
    await page.waitForFunction(() => document.querySelector('#world-navigation').dataset.islandHomeMode === 'compact');
  }
  await page.getByRole('button',{name:'Visit island',exact:true}).focus();
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(() => document.querySelector('#world-navigation').dataset.islandHomeMode === 'map');
  assert.equal(await page.locator('.island-nav-marker:visible').count(),6,'the single invitation pane retains its island signposts');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.nav),'create','returning to signposts keeps navigation focus visible');
  await assertNoViewportOverflow(page);
});

test('navigation: titles and island lettering prefer smooth Outfit with a usable sans fallback when fonts are blocked',async (t) => {
  const page = await integration(t,{viewport:{width:1440,height:900},text:'md'}); if (!page) return;
  const fontState = await page.evaluate(() => {
    const family = (node) => getComputedStyle(node).fontFamily;
    return {heading:family(document.querySelector('#view h1')),brand:family(document.querySelector('.world-brand .mark b')),
      labels:[...document.querySelectorAll('.island-nav strong')].map(family),
      display:getComputedStyle(document.documentElement).getPropertyValue('--display'),stylesheet:document.querySelector('#optional-fonts').href,
      loadedOutfit:[...document.fonts].filter((face) => face.family.replace(/["']/g,'') === 'Outfit' && face.status === 'loaded').length};
  });
  for (const family of [fontState.heading,fontState.brand,...fontState.labels]) {
    assert.match(family,/^['"]?Outfit['"]?(?:,|$)/,'display text must prefer Outfit');
    assert.match(family,/sans-serif/,'the fallback remains smooth sans typography');
    assert.doesNotMatch(family,/Silkscreen|Press Start|Pixel/i,'display text must not fall back to the retired pixel face');
  }
  assert.match(fontState.display,/Outfit/); assert.match(fontState.stylesheet,/family=Outfit/);
  assert.equal(fontState.loadedOutfit,0,'this case intentionally blocks optional external fonts; loaded-face verification belongs to the font-enabled design audit');
  await page.locator('#home-prompt').fill('A smooth sky adventure');
  assert.equal(await page.locator('#home-prompt').inputValue(),'A smooth sky adventure','font loading must not gate creation controls');
});
