import asyncio, json, sys, os, subprocess, time, urllib.request
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/local.html'
SITE = 'http://127.0.0.1:8765/site/index.html'
AI_SITE = 'http://127.0.0.1:8766/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
MOCK = open(os.path.join(os.path.dirname(__file__), 'mock_claude.js')).read()
fails = []
def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

async def new_page(browser, mock=False, **kw):
    ctx = await browser.new_context(**kw)
    await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    if mock: await ctx.add_init_script(MOCK)
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
    return ctx, page, errs

async def toast_text(page):
    return ' | '.join(await page.locator('.toast').all_inner_texts())

async def play_until_over(page, frame_sel, timeout=12000):
    box = await page.locator(frame_sel).bounding_box()
    await page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)

async def scenario_local(browser):
    ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900})
    await page.goto(BASE)
    await page.wait_for_selector('.cart', timeout=15000)
    n = await page.locator('.shelf').first.locator('.cart').count()
    check(n == 5, f'5 starter cartridges shown on the front page ({n})')
    check(await page.locator('#home-screen iframe').count() == 1, 'front page mounts the playable hero game')
    check(await page.locator('h1').count() == 1, 'front page has one h1')
    await page.screenshot(path=f'{OUT}/01-home.png', full_page=True)
    # play Neon Dash
    await page.locator('.cart', has_text='Neon Dash').first.click()
    await page.wait_for_selector('#gp-screen iframe', timeout=10000)
    await page.wait_for_timeout(600)
    await play_until_over(page, '#gp-screen iframe')
    await page.wait_for_selector('.toast:has-text("New best")', timeout=15000)
    check(True, 'runner game over -> score signed: ' + await toast_text(page))
    await page.wait_for_timeout(400)
    rows = await page.locator('#gp-panel tbody tr').count()
    check(rows == 1, f'leaderboard has my signed score ({rows} rows)')
    chip = await page.locator('#wchip').inner_text()
    check('…' in chip, 'wallet auto-created: ' + chip.replace('\n', ' '))
    await page.screenshot(path=f'{OUT}/02-game.png', full_page=True)
    # remix via kit knobs and publish
    await page.click('button[data-act="remix"]')
    await page.wait_for_selector('#st-screen iframe', timeout=8000)
    title = await page.input_value('#kn-title')
    check(title == 'Neon Dash Remix', 'remix prefilled title: ' + title)
    await page.eval_on_selector('#kn-speed', 'el => { el.value = 1.4; el.dispatchEvent(new Event("input", {bubbles:true})); }')
    await page.click('button[data-act="palette"][data-pal="sunset"]')
    await page.fill('#pub-price', '0.1')
    await page.fill('#pub-desc', 'Faster and warmer.')
    await page.wait_for_timeout(400)
    await page.screenshot(path=f'{OUT}/03-studio-kit.png', full_page=True)
    await page.click('button[data-act="publish"]')
    await page.wait_for_selector('.gp-head h1:has-text("Neon Dash Remix")', timeout=8000)
    check(True, 'published remix and opened its page')
    # collect with faucet
    await page.click('button[data-act="collect"]')
    await page.wait_for_selector('.modal', timeout=4000)
    await page.click('button[data-act="airdrop-then-collect"]')
    await page.wait_for_selector('.toast:has-text("Collected")', timeout=8000)
    check(True, 'faucet + collect succeeded')
    await page.wait_for_timeout(300)
    owned = await page.locator('#gp-actions .chip.ok').count()
    check(owned == 1, 'shows owned edition chip')
    # tip
    await page.click('button[data-act="tip"]')
    await page.click('button[data-act="confirm-tip"][data-amt="0.05"]')
    await page.wait_for_selector('.toast:has-text("Tipped")', timeout=6000)
    check(True, 'tip succeeded')
    # verify file
    await page.click('button[data-act="tab"][data-tab="cart"]')
    await page.click('button[data-act="verify"]')
    await page.wait_for_selector('#gp-panel .chip.ok', timeout=6000)
    check('signature valid' in (await page.locator('#gp-panel .chip.ok').inner_text()), 'file hash + publish signature verify')
    await page.click('button[data-act="tab"][data-tab="splits"]')
    await page.screenshot(path=f'{OUT}/04-game-splits.png', full_page=True)
    # economy settle
    await page.click('.nav a[data-nav="economy"]')
    await page.wait_for_selector('button[data-act="settle"]', timeout=5000)
    await page.screenshot(path=f'{OUT}/05-economy.png', full_page=True)
    await page.click('button[data-act="settle"]')
    await page.wait_for_selector('.toast:has-text("settled")', timeout=8000)
    check(True, 'epoch settled: ' + await toast_text(page))
    await page.wait_for_timeout(400)
    chip = await page.locator('#wchip').inner_text()
    check(chip.split('\n')[-1].replace(',', '').isdigit() and int(chip.split('\n')[-1].replace(',', '')) > 0, 'PARK balance after epoch: ' + chip.replace('\n', ' '))
    # boost
    await page.go_back()
    await page.wait_for_timeout(500)
    if not await page.locator('button[data-act="boost"]').count():
        await page.click('.nav a[data-nav="explore"]'); await page.locator('.cart', has_text='Neon Dash Remix').first.click()
    await page.click('button[data-act="boost"]')
    await page.click('button[data-act="confirm-boost"][data-amt="10"]')
    await page.wait_for_selector('.toast:has-text("Burned 10 GPLY")', timeout=6000)
    check(True, 'boost burned PARK')
    # wallet page
    await page.click('.nav a[data-nav="wallet"]')
    await page.wait_for_selector('.balance', timeout=5000)
    await page.fill('#handle-in', 'pixelpilot')
    await page.click('form[data-form="handle"] button')
    await page.wait_for_selector('.gp-head h1:has-text("pixelpilot")', timeout=5000)
    check(True, 'handle saved and shown')
    await page.screenshot(path=f'{OUT}/06-wallet.png', full_page=True)
    # ledger
    await page.click('.nav a[data-nav="ledger"]')
    await page.wait_for_selector('table.data tbody tr', timeout=5000)
    nrows = await page.locator('table.data tbody tr').count()
    check(nrows >= 8, f'ledger rows: {nrows}')
    await page.locator('table.data tbody tr.click').first.click()
    await page.wait_for_selector('tr.detail pre.code', timeout=3000)
    msg = await page.locator('tr.detail pre.code').last.inner_text()
    check(msg.startswith('GAMEPLAY/v1'), 'ledger detail shows signed bytes: ' + msg[:40])
    bad = await page.locator('table.data .chip.bad').count()
    check(bad == 0, f'no rejected txs ({bad})')
    await page.screenshot(path=f'{OUT}/07-ledger.png', full_page=True)
    # explore shows community cart
    await page.click('.nav a[data-nav="explore"]')
    await page.wait_for_selector('.cart:has-text("Neon Dash Remix")', timeout=4000)
    await page.screenshot(path=f'{OUT}/08-explore-after.png', full_page=True)
    # reload persists (local storage)
    await page.reload()
    await page.wait_for_selector('.cart:has-text("Neon Dash Remix")', timeout=8000)
    check(True, 'state persists across reload (local mode)')
    # play each starter briefly to catch runtime errors
    for gid in ['kit-sky-hop', 'kit-star-siege', 'kit-brickfall', 'kit-meteor-drift']:
        await page.evaluate(f'location.hash = "game-{gid}"')
        await page.wait_for_selector('#gp-screen iframe', timeout=6000)
        await page.wait_for_timeout(500)
        box = await page.locator('#gp-screen iframe').bounding_box()
        await page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.6)
        await page.wait_for_timeout(1800)
        await page.screenshot(path=f'{OUT}/09-{gid}.png')
    game_errs = [t for t in await page.locator('.toast').all_inner_texts() if 'error' in t.lower()]
    check(not game_errs, 'starter kits ran without reported errors ' + str(game_errs))
    real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
    check(not real, 'no console/page errors in local scenario ' + str(real[:5]))
    await ctx.close()

async def scenario_mock(browser):
    ctx, page, errs = await new_page(browser, mock=True, viewport={'width': 1280, 'height': 900})
    await page.goto(BASE + '#create')
    await page.wait_for_selector('#st-left', timeout=10000)
    await page.wait_for_timeout(800)
    seg = await page.locator('button[data-act="studio-mode"][aria-pressed="true"]').inner_text()
    check(seg.startswith('Describe'), 'AI mode active when sample capability exists: ' + seg)
    foot = await page.locator('.foot').inner_text()
    check('Connected to the shared gallery' in foot, 'shared mode footer')
    await page.fill('#st-prompt', 'Pop glowing targets before they fade, 30 second rounds.')
    await page.click('button[data-act="style"][data-style="Neon arcade"]')
    await page.click('button[data-act="gen-new"]')
    await page.wait_for_selector('.toast:has-text("Built")', timeout=20000)
    check(True, 'AI build streamed and loaded: ' + await toast_text(page))
    calls = await page.evaluate('window.__sampleCalls')
    check(len(calls) == 1 and calls[0]['head'].startswith('You are the game engine behind GamePlay'), 'harness prompt sent once')
    await page.wait_for_selector('#st-screen iframe', timeout=5000)
    t = await page.input_value('#pub-title')
    check(t == 'Target Pop', 'meta title read from generated file: ' + t)
    await page.screenshot(path=f'{OUT}/10-studio-ai.png', full_page=True)
    # test run in preview
    box = await page.locator('#st-screen iframe').bounding_box()
    await page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
    await page.wait_for_selector('#st-status:has-text("Test run scored")', timeout=8000)
    check(True, 'preview reports test run score')
    # edit
    await page.fill('#st-prompt', 'Make the targets bigger.')
    await page.click('button[data-act="gen-edit"]')
    await page.wait_for_selector('button[data-act="version"][data-i="1"]', timeout=20000)
    check(True, 'edit produced v2 with version switcher')
    await page.click('button[data-act="download-studio"]')
    await page.wait_for_timeout(300)
    dl = await page.evaluate('window.__downloaded')
    check(dl and dl['filename'].endswith('.html'), 'download capability called: ' + json.dumps(dl))
    await page.click('button[data-act="publish"]')
    await page.wait_for_selector('.gp-head h1:has-text("Target Pop")', timeout=8000)
    keys = await page.evaluate('[...window.__mockStore.keys()]')
    check('accounts/u_test_owner' in keys, 'account doc written to shared db')
    check(any(k.startswith('blobs/') for k in keys), 'game file written to blobs/<hash>')
    acc = await page.evaluate('window.__mockStore.get("accounts/u_test_owner")')
    types = [x['t'] for x in acc['txs']]
    check(types[:1] == ['spark_claim'] and 'gen' in types and 'publish' in types, 'account txs: ' + ','.join(types))
    # play published AI game to sign a score
    await page.wait_for_selector('#gp-screen iframe', timeout=6000)
    await page.wait_for_timeout(500)
    box = await page.locator('#gp-screen iframe').bounding_box()
    await page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
    await page.wait_for_selector('.toast:has-text("New best")', timeout=10000)
    check(True, 'AI game score signed in shared mode')
    acc = await page.evaluate('window.__mockStore.get("accounts/u_test_owner")')
    check(any(v['n'] >= 1 for v in acc['plays'].values()), 'play recorded in account doc')
    # settle as owner
    await page.click('.nav a[data-nav="economy"]')
    await page.wait_for_selector('button[data-act="settle"]', timeout=5000)
    disabled = await page.locator('button[data-act="settle"]').is_disabled()
    print('     settle disabled?', disabled, '(creator plays by self do not count; expected podium points only)')
    if not disabled:
        await page.click('button[data-act="settle"]')
        await page.wait_for_selector('.toast:has-text("settled")', timeout=8000)
        keys = await page.evaluate('[...window.__mockStore.keys()]')
        check('protocol/e1' in keys and 'protocol/config' in keys, 'epoch + config written to protocol/')
    # mobile + dark screenshots in this context
    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.click('.nav a[data-nav="explore"]')
    await page.wait_for_timeout(500)
    await page.screenshot(path=f'{OUT}/11-mobile-explore.png', full_page=True)
    ow = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    check(not ow, 'no horizontal scroll at 390px (explore)')
    await page.locator('.cart', has_text='Target Pop').first.click()
    await page.wait_for_timeout(700)
    await page.screenshot(path=f'{OUT}/12-mobile-game.png', full_page=True)
    ow = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    check(not ow, 'no horizontal scroll at 390px (game)')
    for r in ['home', 'business', 'create', 'wallet', 'ledger', 'economy']:
        await page.evaluate(f'location.hash = "{r}"'); await page.wait_for_timeout(500)
        ow = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
        check(not ow, f'no horizontal scroll at 390px ({r})')
        await page.screenshot(path=f'{OUT}/13-mobile-{r}.png', full_page=True)
    real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
    check(not real, 'no console/page errors in mock scenario ' + str(real[:5]))
    await ctx.close()

async def scenario_dark(browser):
    ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900}, color_scheme='dark')
    await page.goto(BASE)
    await page.wait_for_selector('.cart', timeout=10000)
    await page.wait_for_timeout(500)
    await page.screenshot(path=f'{OUT}/14-dark-home.png', full_page=False)
    await page.evaluate('location.hash = "economy"'); await page.wait_for_timeout(500)
    await page.screenshot(path=f'{OUT}/15-dark-economy.png', full_page=True)
    await page.evaluate('location.hash = "game-kit-star-siege"'); await page.wait_for_timeout(900)
    await page.screenshot(path=f'{OUT}/16-dark-game.png', full_page=False)
    await ctx.close()

AUDIT = r'''() => {
  const out = { contrast: [], names: [], labels: [], imgs: [], frames: [], headings: [], ids: [], targets: [] };
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = layers.length && layers[layers.length - 1].a >= 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 };
    while (layers.length) base = over(layers.pop(), base);
    return base;
  };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('[hidden], .sr, .skip, svg, iframe, .screen, .toasts')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const fg0 = parse(cs.color), bg = bgOf(el);
    if (!fg0 || !bg) continue;
    const fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < need - 0.01) out.contrast.push(el.tagName + '.' + String(el.className).slice(0, 30) + ' "' + t.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2) + '<' + need);
  }
  for (const el of document.querySelectorAll('button, a[href], summary, [role="button"]')) {
    if (el.closest('[hidden]') || !el.getClientRects().length) continue;
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim();
    if (!name) out.names.push(el.outerHTML.slice(0, 90));
    const r = el.getBoundingClientRect();
    const inline = el.closest('p, li, dd, td, figcaption, .fine, .lede, .foot-links, .section-head, .cart');
    if (!inline && !el.classList.contains('skip') && (r.width < 24 || r.height < 24)) out.targets.push(el.outerHTML.slice(0, 60) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (el.type === 'hidden') continue;
    const lab = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'));
    if (!lab && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) out.labels.push(el.outerHTML.slice(0, 90));
  }
  for (const im of document.querySelectorAll('img')) if (!im.hasAttribute('alt')) out.imgs.push(im.outerHTML.slice(0, 60));
  for (const f of document.querySelectorAll('iframe')) if (!f.getAttribute('title')) out.frames.push(f.outerHTML.slice(0, 60));
  let prev = 0;
  for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4, .modal h2')) { const n = +h.tagName[1]; if (prev && n > prev + 1) out.headings.push(h.tagName + ' "' + h.textContent.slice(0, 30) + '" after h' + prev); prev = n; }
  const ids = {};
  for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
  out.ids = Object.keys(ids).filter((k) => ids[k] > 1);
  out.h1 = document.querySelectorAll('main h1').length;
  out.lang = document.documentElement.lang;
  out.landmarks = ['header', 'nav', 'main', 'footer'].filter((t) => !document.querySelector(t));
  return out;
}'''

def audit_ok(name, res, allow_no_h1=False):
    problems = {k: v for k, v in res.items() if isinstance(v, list) and v}
    if res.get('landmarks'): problems['missing landmarks'] = res['landmarks']
    if res.get('lang') != 'en': problems['lang'] = res.get('lang')
    if not allow_no_h1 and res.get('h1') != 1: problems['h1 count'] = res.get('h1')
    check(not problems, 'a11y audit ' + name + ('' if not problems else ' ' + json.dumps(problems)[:900]))

async def frame_of(page, host):
    el = await page.query_selector(host + ' iframe')
    return await el.content_frame() if el else None

async def scenario_site(browser):
    ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    await page.goto(SITE)
    await page.wait_for_selector('#home-screen iframe', timeout=15000)
    check(await page.evaluate('document.documentElement.lang') == 'en', 'self-hosted page declares lang="en"')
    check(await page.title() == 'GamePlay', 'self-hosted page title')
    desc = await page.eval_on_selector('meta[name="description"]', 'm => m.content')
    check('free game maker' in desc, 'self-hosted page has a meta description')
    # skip link is the first stop for keyboard users
    await page.keyboard.press('Tab')
    check(await page.evaluate('document.activeElement.className') == 'skip', 'first Tab lands on the skip link')
    await page.keyboard.press('Enter')
    check(await page.evaluate('document.activeElement.id') == 'view', 'skip link moves focus to the main content')
    # settings dialog: opens, traps focus, closes with Escape, returns focus
    await page.click('#a11y-btn')
    await page.wait_for_selector('.modal fieldset.prefs', timeout=3000)
    check(await page.evaluate('document.querySelector(".modal").getAttribute("aria-labelledby")') == 'modal-title', 'settings dialog is labelled by its heading')
    for _ in range(25): await page.keyboard.press('Tab')
    check(await page.evaluate('!!document.activeElement.closest(".modal")'), 'focus stays inside the settings dialog')
    await page.keyboard.press('Escape')
    await page.wait_for_timeout(100)
    check(await page.evaluate('document.activeElement.id') == 'a11y-btn', 'Escape closes the dialog and returns focus to its button')
    # assist mode: 50% speed, calm motion, sound off reach the game
    await page.click('#a11y-btn')
    await page.check('input[name="pref-speed"][value="0.5"]')
    await page.check('input[name="pref-motion"][value="reduce"]')
    await page.check('input[name="pref-sound"][value="off"]')
    await page.click('.modal button[data-act="modal-close"]')
    await page.wait_for_timeout(600)
    src = await page.eval_on_selector('#home-screen iframe', 'f => f.srcdoc')
    check('"speed":0.5' in src and '"calm":true' in src and '"mute":true' in src, 'game receives assist, calm and mute settings')
    fr = await frame_of(page, '#home-screen')
    elapsed = await fr.evaluate('() => new Promise((res) => { const a = performance.now(), t = Date.now(); const spin = () => (Date.now() - t < 400 ? setTimeout(spin, 10) : res(performance.now() - a)); spin(); })')
    check(150 < elapsed < 260, f'game clock runs at half speed ({elapsed:.0f} ms of game time in 400 ms)')
    shake = await fr.evaluate('() => { window.E.shake = 14; return window.E.shake; }')
    check(shake == 0, 'calm motion pins screen shake at zero')
    gain = await fr.evaluate('() => { const c = new AudioContext(); const g = c.destination.gain; return g ? g.value : -1; }')
    check(gain == 0, 'sound off routes game audio through a silent gain')
    check(await page.evaluate('document.documentElement.dataset.gpMotion') == 'reduce', 'reduce motion applies to the page')
    box = await page.locator('#home-screen iframe').bounding_box()
    await page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
    await page.wait_for_selector('.toast:has-text("Assist mode is on")', timeout=20000)
    check(True, 'assisted run is reported and kept off the leaderboard')
    check(await page.evaluate('!window.__pp.wallet'), 'assisted run does not sign a score or create a wallet')
    live = await page.evaluate('document.getElementById("sr-live").textContent')
    check('Game over' in live and '50%' in live, 'screen readers hear the result: ' + live)
    await page.click('#a11y-btn')
    await page.click('button[data-act="prefs-reset"]')
    await page.click('.modal button[data-act="modal-close"]')
    await page.wait_for_timeout(400)
    src = await page.eval_on_selector('#home-screen iframe', 'f => f.srcdoc')
    check('"speed":1' in src and '"mute":false' in src, 'reset restores full speed and sound')
    # business page and the branded demo
    await page.click('.nav a[data-nav="business"]')
    await page.wait_for_selector('#biz-screen iframe', timeout=8000)
    check(await page.locator('.ways .way').count() == 3, 'business page lists three offers')
    check(await page.locator('.contact').count() == 0, 'no contact block until a contact is configured')
    await page.screenshot(path=f'{OUT}/20-business.png', full_page=True)
    await page.locator('button[data-act="brand-demo"]').first.click()
    await page.wait_for_selector('#br-main', timeout=6000)
    check(await page.get_attribute('#sw-custom', 'aria-pressed') == 'true', 'branded demo opens the maker with custom colors')
    await page.eval_on_selector('#br-main', 'el => { el.value = "#e63946"; el.dispatchEvent(new Event("input", { bubbles: true })); }')
    await page.eval_on_selector('#br-bg', 'el => { el.value = "#1d3557"; el.dispatchEvent(new Event("input", { bubbles: true })); }')
    await page.fill('#kn-title', 'Brand Rush')
    await page.wait_for_timeout(700)
    src = await page.eval_on_selector('#st-screen iframe', 'f => f.srcdoc')
    check('#e63946' in src and '#1d3557' in src, 'brand colors flow into the game file')
    await page.click('button[data-act="palette"][data-pal="mint"]')
    await page.click('button[data-act="palette"][data-pal="custom"]')
    check(await page.input_value('#br-main') == '#e63946', 'brand colors survive switching palettes')
    await page.screenshot(path=f'{OUT}/21-brand-studio.png', full_page=True)
    await page.click('button[data-act="publish"]')
    await page.wait_for_selector('.gp-head h1:has-text("Brand Rush")', timeout=8000)
    pal = await page.evaluate('[...window.__pp.world.games.values()].find(g => g.title === "Brand Rush").params.colors.main')
    check(pal == '#e63946', 'published game keeps its brand colors')
    # downloads work on a plain website
    async with page.expect_download() as dl:
        await page.click('button[data-act="download"]')
    d = await dl.value
    check(d.suggested_filename == 'brand-rush.html', 'download saves the game file: ' + d.suggested_filename)
    # larger text and high contrast on a phone
    await page.set_viewport_size({'width': 390, 'height': 844})
    await page.click('#a11y-btn')
    await page.check('input[name="pref-text"][value="xl"]')
    await page.check('input[name="pref-theme"][value="contrast"]')
    await page.click('.modal button[data-act="modal-close"]')
    for r in ['home', 'explore', 'create', 'business', 'wallet', 'economy', 'ledger']:
        await page.evaluate(f'location.hash = "{r}"'); await page.wait_for_timeout(450)
        ow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
        check(ow <= 0, f'no horizontal scroll at 390px with larger text ({r}: {ow}px)')
        if r in ('home', 'create'): await page.screenshot(path=f'{OUT}/22-contrast-xl-{r}.png', full_page=False)
    real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
    check(not real, 'no console/page errors on the self-hosted site ' + str(real[:5]))
    await ctx.close()

async def scenario_server(browser):
    # The plain website served by server/server.mjs (with a fake Claude): anyone can describe a crypto game.
    proc = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), 'fake_ai_server.mjs'), '8766'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(AI_SITE + 'api/status', timeout=1); break
            except Exception: time.sleep(0.1)
        ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900})
        await page.goto(AI_SITE)
        await page.wait_for_selector('#h-crypto', timeout=15000)
        n = await page.locator('button[data-act="home-idea"]').count()
        check(n == 6, f'front page offers crypto game ideas ({n})')
        await page.locator('button[data-act="home-idea"]', has_text='Block Miner').click()
        await page.wait_for_selector('#st-prompt', timeout=8000)
        prompt = await page.input_value('#st-prompt')
        check(prompt.startswith('Block Miner:'), 'idea fills the AI studio prompt: ' + prompt[:40])
        seg = await page.locator('button[data-act="studio-mode"][aria-pressed="true"]').inner_text()
        check(seg.startswith('Describe'), 'AI studio is on for a website with a GamePlay server')
        check(await page.locator('button[data-act="idea"][data-idea^="Rug Pull"]').count() == 1, 'studio lists crypto ideas')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built")', timeout=20000)
        check(True, 'server build streamed and loaded: ' + await toast_text(page))
        await page.wait_for_selector('#st-screen iframe', timeout=5000)
        check(await page.input_value('#pub-title') == 'Block Miner', 'game title read from the built file')
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check(len(calls) == 1 and calls[0]['model'] == 'claude-sonnet-5-5' and calls[0]['task'].startswith('GAME IDEA FROM THE CREATOR:\nBlock Miner'), 'server sent the idea to Sonnet 5.5: ' + json.dumps(calls)[:160])
        await page.screenshot(path=f'{OUT}/30-server-ai.png', full_page=True)
        await page.fill('#st-prompt', 'Make the blocks glow.')
        await page.click('button[data-act="gen-edit"]')
        await page.wait_for_selector('button[data-act="version"][data-i="1"]', timeout=20000)
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check(len(calls) == 2 and calls[1]['model'] == 'claude-haiku-5-5', 'change request went to Haiku 5.5')
        await page.click('button[data-act="publish"]')
        await page.wait_for_selector('.gp-head h1:has-text("Block Miner")', timeout=8000)
        check(True, 'published the AI-built crypto game')
        check('Connected to the shared gallery' in await page.locator('.foot').inner_text(), 'website visitors write to the shared gallery')
        gid_url = page.url
        # a second visitor, in a fresh browser, sees and plays the published game
        ctx2, page2, errs2 = await new_page(browser, viewport={'width': 390, 'height': 844})
        await page2.goto(AI_SITE + '#explore')
        await page2.wait_for_selector('.cart:has-text("Block Miner")', timeout=15000)
        check(True, 'another visitor sees the published game in the arcade')
        await page2.goto(gid_url.replace(AI_SITE, AI_SITE + '?r=1'))
        await page2.wait_for_selector('#gp-screen iframe', timeout=10000)
        await page2.wait_for_timeout(500)
        box = await page2.locator('#gp-screen iframe').bounding_box()
        await page2.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
        await page2.wait_for_selector('.toast:has-text("New best")', timeout=12000)
        check(True, 'the share link opens and plays for another visitor, score signed')
        await page2.screenshot(path=f'{OUT}/31-second-visitor.png', full_page=True)
        await page.wait_for_timeout(5000)
        await page.click('button[data-act="tab"][data-tab="board"]') if await page.locator('button[data-act="tab"][data-tab="board"]').count() else None
        await page.wait_for_timeout(300)
        rows = await page.locator('#gp-panel tbody tr').count()
        check(rows >= 1, f'creator sees the other visitor on the leaderboard ({rows} rows)')
        real2 = [e for e in errs2 if 'fonts.g' not in e and 'ERR_FAILED' not in e]
        check(not real2, 'no console/page errors for the second visitor ' + str(real2[:5]))
        await ctx2.close()
        real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
        check(not real, 'no console/page errors with the GamePlay server ' + str(real[:5]))
        await ctx.close()
    finally:
        proc.terminate()

async def scenario_a11y(browser):
    for scheme, theme in (('light', None), ('dark', None), ('light', 'contrast')):
        ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900}, color_scheme=scheme)
        if theme: await ctx.add_init_script("localStorage.setItem('gp.prefs.v1', JSON.stringify({theme: '%s'}))" % theme)
        await page.goto(SITE)
        await page.wait_for_selector('#home-screen iframe', timeout=15000)
        label = scheme + ('/' + theme if theme else '')
        for r in ['home', 'explore', 'game-kit-neon-dash', 'create', 'business', 'wallet', 'ledger', 'economy']:
            await page.evaluate(f'location.hash = "{r}"'); await page.wait_for_timeout(500)
            res = await page.evaluate(AUDIT)
            audit_ok(f'{label} {r}', res)
        await page.click('#a11y-btn'); await page.wait_for_timeout(200)
        audit_ok(f'{label} settings dialog', await page.evaluate(AUDIT))
        await ctx.close()

async def main():
    async with async_playwright() as p:
        exe = os.environ.get('CHROME_PATH')
        browser = await p.chromium.launch(executable_path=exe or None, args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        only = os.environ.get('E2E_ONLY', '').split(',')
        for sc in (scenario_local, scenario_mock, scenario_dark, scenario_site, scenario_server, scenario_a11y):
            if only != [''] and sc.__name__.replace('scenario_', '') not in only: continue
            try:
                await sc(browser)
            except Exception as e:
                fails.append(sc.__name__ + ': ' + repr(e)[:400]); print('FAIL', sc.__name__, repr(e)[:600])
        await browser.close()
    print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED:\n- ' + '\n- '.join(fails)))
asyncio.run(main())
