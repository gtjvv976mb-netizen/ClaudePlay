import asyncio, json, sys, os, subprocess, time, urllib.request
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/local.html'
SITE = 'http://127.0.0.1:8765/site/index.html'
AI_SITE = 'http://127.0.0.1:8766/'
CHAIN_SITE = 'http://127.0.0.1:8767/'
MAIN_SITE = 'http://127.0.0.1:8768/'
SOCIAL_SITE = 'http://127.0.0.1:8769/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
MOCK = open(os.path.join(os.path.dirname(__file__), 'mock_claude.js')).read()
fails = []
def png_square(w, h, bg, fg, pad):
    """A w x h PNG: a plain bg with an fg rectangle inset by pad."""
    import zlib, struct
    rows = b''
    for y in range(h):
        rows += b'\x00' + b''.join(bytes(fg if pad <= x < w - pad and pad <= y < h - pad else bg) for x in range(w))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

async def new_page(browser, mock=False, fit=False, **kw):
    ctx = await browser.new_context(**kw)
    # Feature scenarios use the long-page layout so every part of a page is on screen; scenario_fit covers the
    # default one-screen layout.
    if not fit: await ctx.add_init_script("if (window === top) try { if (!localStorage.getItem('gp.prefs.v1')) localStorage.setItem('gp.prefs.v1', JSON.stringify({layout: 'scroll'})) } catch (e) {}")
    await ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    await ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    if mock: await ctx.add_init_script(MOCK)
    page = await ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
    return ctx, page, errs

async def skip_guide(page, timeout=15000):
    # A fresh studio opens on the guided steps; skip them to reach the full form.
    await page.wait_for_selector('#st-prompt, button[data-act="guide-skip"]', timeout=timeout)
    if await page.locator('button[data-act="guide-skip"]').count(): await page.click('button[data-act="guide-skip"]')
    await page.wait_for_selector('#st-prompt', timeout=5000)

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
    for attempt in range(3):
        await play_until_over(page, '#gp-screen iframe')
        try:
            await page.wait_for_selector('.toast:has-text("New best")', timeout=8000)
            break
        except Exception:
            if attempt == 2:
                await page.screenshot(path=f'{OUT}/debug-local.png', full_page=True)
                print('DEBUG toasts', await page.locator('.toast').all_inner_texts(), errs[:5], await page.evaluate('scrollY'))
                raise
            print('     retrying the first run (attempt', attempt + 2, ')')
    check(True, 'runner game over -> score signed: ' + await toast_text(page))
    await page.wait_for_timeout(400)
    rows = await page.locator('#gp-panel tbody tr').count()
    check(rows == 1, f'leaderboard has my signed score ({rows} rows)')
    chip = await page.locator('#wchip').inner_text()
    check('…' in chip, 'wallet auto-created: ' + chip.replace('\n', ' '))
    await page.screenshot(path=f'{OUT}/02-game.png', full_page=True)
    # remix via kit knobs and publish
    await page.click('.remix-box button[type="submit"]')
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
    # The guided start: kind of game, then 2D or 3D, then players, then the description.
    await page.wait_for_selector('#guide-q', timeout=5000)
    check('kind of game' in await page.locator('#guide-q').inner_text(), 'a fresh studio opens on the guided steps')
    await page.screenshot(path=f'{OUT}/10a-guide.png')
    await page.click('button.pick[data-act="guide-genre"][data-v="Arcade"]')
    await page.wait_for_selector('button.pick[data-act="guide-dim"]', timeout=3000)
    await page.click('button.pick[data-act="guide-dim"][data-v="2d"]')
    await page.click('button.pick[data-act="guide-players"][data-v=""]')
    await page.wait_for_selector('#st-prompt', timeout=3000)
    check(await page.input_value('#st-genre') == 'Arcade' and await page.evaluate('document.activeElement.id') == 'st-prompt', 'the guided picks carry into the form and focus the description')
    await page.fill('#st-prompt', 'Pop glowing targets before they fade, 30 second rounds.')
    await page.click('button[data-act="style"][data-style="Neon arcade"]')
    await page.click('button[data-act="gen-new"]')
    await page.wait_for_selector('.toast:has-text("Built")', timeout=20000)
    check(True, 'AI build streamed and loaded: ' + await toast_text(page))
    calls = await page.evaluate('window.__sampleCalls')
    check(len(calls) == 1 and calls[0]['head'].startswith('You are the game engine behind ClaudePlay'), 'harness prompt sent once')
    await page.wait_for_selector('#st-screen iframe', timeout=5000)
    t = await page.input_value('#pub-title')
    check(t == 'Target Pop', 'meta title read from generated file: ' + t)
    chat = await page.locator('#st-chat').inner_text()
    check('Play-tested v1' in chat and await page.locator('#st-status .chip:has-text("Play-tested")').count() == 1 and await page.locator('#st-test').count() == 0, 'every build is play-tested before the creator sees it')
    await page.screenshot(path=f'{OUT}/10-studio-ai.png', full_page=True)
    # test run in preview
    # After a full-page screenshot of a scrolled page, headless Chrome sends clicks past the game frame
    # until the page scrolls again, so scroll to the top first (the guided start leaves the description in view).
    await page.evaluate('scrollTo(0, 0)'); await page.wait_for_timeout(200)
    box = await page.locator('#st-screen iframe').bounding_box()
    for attempt in range(3):
        await page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
        try:
            await page.wait_for_selector('#st-status:has-text("Test run scored")', timeout=5000)
            break
        except Exception:
            if attempt == 2: raise
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
    check(await page.title() == 'ClaudePlay', 'self-hosted page title')
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
        check(seg.startswith('Describe'), 'AI studio is on for a website with a ClaudePlay server')
        check(await page.locator('button[data-act="idea"][data-idea^="Rug Pull"]').count() == 1, 'studio lists crypto ideas')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built")', timeout=20000)
        check(True, 'server build streamed and loaded: ' + await toast_text(page))
        await page.wait_for_selector('#st-screen iframe', timeout=5000)
        check(await page.input_value('#pub-title') == 'Block Miner', 'game title read from the built file')
        tests = json.loads(urllib.request.urlopen(AI_SITE + '__playtests').read())
        check(len(tests) == 1 and tests[0]['images'] == 3 and tests[0]['model'] == 'claude-haiku-5-5' and 'errors: none' in tests[0]['log'], 'Claude reviews three play-test screenshots and the run log: ' + json.dumps(tests)[:200])
        check('Claude played it and found nothing to fix' in await page.locator('#st-chat').inner_text(), 'the play-test result shows in the chat')
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check(len(calls) == 1 and calls[0]['model'] == 'claude-sonnet-5-5' and calls[0]['task'].startswith('GAME IDEA FROM THE CREATOR:\nBlock Miner'), 'free plan sent the new game idea to Sonnet 5.5: ' + json.dumps(calls)[:160])
        plan = await page.locator('#st-plan').inner_text()
        check('Free plan' in plan and 'Claude Sonnet 5.5' in plan and 'Get Pro' not in plan, 'studio shows the free plan, with no Pro offer without Solana payments: ' + plan)
        await page.screenshot(path=f'{OUT}/30-server-ai.png', full_page=True)
        await page.fill('#st-prompt', 'Make the blocks glow.')
        await page.click('button[data-act="gen-edit"]')
        await page.wait_for_selector('button[data-act="version"][data-i="1"]', timeout=20000)
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check(len(calls) == 2 and calls[1]['model'] == 'claude-haiku-5-5', 'change request went to Haiku 5.5')
        # Changes are small patches, with what changed, before and after, and undo.
        await page.wait_for_selector('.toast:has-text("Built Block Miner")', timeout=20000)
        check(calls[1].get('patch') and 'Changed 1 part of the game for v2' in await page.locator('#st-chat').inner_text(), 'the change came back as a patch: ' + (await page.locator('#st-chat').inner_text())[-160:])
        await page.wait_for_selector('#st-screen iframe', timeout=5000)
        frame = next(f for f in page.frames if f != page.main_frame)
        html = await frame.evaluate('document.documentElement.outerHTML')
        check('#7df9ff' in html and '#ffd84d' not in html and 'BLOCK MINER' in html, 'the patch changed one line and kept the rest of the game')
        await page.click('button[data-act="view-changes"]')
        diff = await page.locator('.modal .changes').inner_text()
        check("− x.fillStyle='#ffd84d'" in diff and "+ x.fillStyle='#7df9ff'" in diff, 'What changed shows the removed and added lines')
        await page.screenshot(path=f'{OUT}/30b-what-changed.png')
        await page.click('[data-act="modal-close"]')
        await page.click('button[data-act="compare"]')
        await page.wait_for_selector('#st-p2 iframe', timeout=5000)
        tags = await page.locator('.split-tag').all_inner_texts()
        check(tags == ['Before · v1', 'After · v2'], 'Before and after plays both versions side by side: ' + str(tags))
        await page.screenshot(path=f'{OUT}/30c-before-after.png')
        await page.click('button[data-act="compare"]')
        # A patch that no longer fits the file falls back to a complete rewrite.
        await page.fill('#st-prompt', 'Make the blocks glow even more.')
        await page.click('button[data-act="gen-edit"]')
        await page.wait_for_selector('button[data-act="version"][data-i="2"]', timeout=25000)
        chat = await page.locator('#st-chat').inner_text()
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check('did not fit the file' in chat and 'Rebuilt the game as v3' in chat and len(calls) == 4, 'a patch that does not fit is rebuilt as a whole file')
        await page.wait_for_selector('button[data-act="undo-version"]', timeout=10000)
        await page.click('button[data-act="undo-version"]')
        await page.wait_for_selector('button[data-act="version"][data-i="1"][aria-pressed="true"]', timeout=5000)
        check('Undid the change: back to v2' in await page.locator('#st-chat').inner_text(), 'Undo change goes back to the version the change was made from')
        # A big request: Claude plans a checklist, builds it, and ticks it off.
        await page.click('button[data-act="version"][data-i="0"]')
        await page.fill('#st-prompt', 'Make the blocks glow, and do three things: faster blocks and a boss.')
        await page.click('button[data-act="gen-edit"]')
        await page.wait_for_selector('button[data-act="version"][data-i="3"]', timeout=25000)
        await page.wait_for_selector('button[data-act="build-rest"]', timeout=20000)
        items = await page.locator('#st-chat .checklist li').all_inner_texts()
        check(len(items) == 3 and 'a boss' in items[2] and 'not built yet' in items[2] and await page.locator('button[data-act="build-rest"]').count() == 1, 'the checklist is ticked off in the reply, with Build the rest: ' + str(items))
        await page.screenshot(path=f'{OUT}/30d-checklist.png')
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
        # The first tap can land while the cover is still starting the game, so tap again if no run starts.
        for attempt in range(3):
            await page2.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
            try:
                await page2.wait_for_selector('.toast:has-text("New best")', timeout=6000)
                break
            except Exception:
                if attempt == 2:
                    await page2.screenshot(path=f'{OUT}/debug-second.png', full_page=True)
                    print('DEBUG toasts', await page2.locator('.toast').all_inner_texts(), errs2[:5])
                    raise
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
        # Guided start: pick 3D and a genre, and the game runs on the built-in 3D engine.
        await page.goto(AI_SITE + '#create')
        await page.wait_for_selector('button[data-act="dim"][data-dim="3d"]', timeout=10000)
        await page.click('button[data-act="dim"][data-dim="3d"]')
        await page.select_option('#st-genre', 'Racing')
        await page.fill('#st-prompt', 'Steer a cube down a neon track.')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built Cube Dash 3D")', timeout=20000)
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check('Game type: 3D' in calls[-1]['task'] and 'Genre: Racing' in calls[-1]['task'], 'the 3D and genre picks reach Claude: ' + calls[-1]['task'][-80:])
        await page.wait_for_selector('#st-screen iframe', timeout=5000)
        await page.wait_for_timeout(1500)
        frame = next(f for f in page.frames if f != page.main_frame)
        frames = await frame.evaluate('window.__frames || 0')
        check(frames > 10 and await frame.evaluate('!!window.SP3D'), f'the 3D game renders with SP3D ({frames} frames)')
        await page.screenshot(path=f'{OUT}/35-studio-3d.png')
        # Your own pictures: a drawing on a plain background becomes a sprite the game draws.
        pic = os.path.join(OUT, 'cat.png')
        with open(pic, 'wb') as f:
            f.write(png_square(40, 30, (255, 255, 255), (200, 40, 40), 10))
        await page.click('button[data-act="dim"][data-dim="2d"]')
        async with page.expect_file_chooser() as fc:
            await page.click('button[data-act="pic-add"]')
        await (await fc.value).set_files(pic)
        await page.wait_for_selector('#pic-0', timeout=5000)
        check(await page.input_value('#pic-0') == 'cat', 'the picture is named after its file')
        await page.fill('#st-prompt', 'My cat catches falling tokens.')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built Cat Catch")', timeout=20000)
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check(calls[-1]['images'] == 1 and calls[-1]['pics'] == ["- 'cat': 20x10 px"], 'Claude sees the picture and its name and size: ' + str(calls[-1]['pics']))
        await page.wait_for_selector('#st-screen iframe', timeout=5000)
        await page.wait_for_timeout(800)
        frame = next(f for f in page.frames if f != page.main_frame)
        w = await frame.evaluate('window.__pic || 0')
        corner = await frame.evaluate("(() => { const i = SP.image('cat'), c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return [x.getImageData(0, 0, 1, 1).data[3], x.getImageData(5, 5, 1, 1).data[0]]; })()")
        check(w == 20 and corner[1] > 150, f'the game draws the cropped picture ({w}px wide, {corner})')
        check(corner[0] == 255, 'the cropped picture keeps its own pixels')
        await page.screenshot(path=f'{OUT}/36-studio-picture.png')
        # The picture follows the art style: Neon arcade adds a glowing 2px outline. Changes keep the pictures.
        await page.click('button[data-act="style"][data-style="Neon arcade"]')
        await page.fill('#st-prompt', 'Make the cat faster.')
        await page.click('button[data-act="gen-edit"]')
        await page.wait_for_selector('button[data-act="version"][data-i="6"]', timeout=20000)
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check(calls[-1]['pics'] == ["- 'cat': 24x14 px"] and calls[-1]['images'] == 1 and not calls[-1]['picBlock'], 'a change restyles the picture and never sends its data as code: ' + str(calls[-1]['pics']))
        # Let v6's play-test finish before starting the next build, so the studio is idle.
        await page.wait_for_function("() => /(Play-tested|play-test of|Skipped the play-test for) v6/.test(document.querySelector('#st-chat').innerText) && !document.querySelector('#st-test')", timeout=20000)
        await page.click('button[data-act="style"][data-style="Neon arcade"]')
        # Multiplayer: build a room game, test two players in the studio, then play it with a friend through a room link.
        await page.click('button[data-act="pic-del"][data-i="0"]')
        await page.click('button[data-act="players"]')
        await page.fill('#st-prompt', 'Tag your friends in an arena.')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built Tag Arena")', timeout=20000)
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        check('Players: multiplayer (use SP.room)' in calls[-1]['tail'], 'the multiplayer pick reaches Claude')
        await page.click('button[data-act="mp-test"]')
        await page.wait_for_selector('#st-p2 iframe', timeout=5000)
        await page.wait_for_timeout(1500)
        frames = [f for f in page.frames if f != page.main_frame]
        mp = [await f.evaluate('window.__mp') for f in frames]
        check(len(mp) == 2 and all(m and m['online'] and m['players'] == 2 and m['got'] > 2 for m in mp) and sum(1 for m in mp if m['host']) == 1, f'the studio tests two players in one room ({mp})')
        await page.screenshot(path=f'{OUT}/37-studio-two-players.png')
        await page.click('button[data-act="mp-test"]')
        await page.click('button[data-act="publish"]')
        await page.wait_for_selector('.gp-head h1:has-text("Tag Arena")', timeout=8000)
        await page.wait_for_selector('button[data-act="room-open"]', timeout=8000)
        await page.click('button[data-act="room-open"]')
        await page.wait_for_selector('#room-link', timeout=8000)
        link = await page.input_value('#room-link')
        check('&room=' in link, 'Play with friends opens a room with a share link: ' + link)
        ctx3, page3, errs3 = await new_page(browser, viewport={'width': 390, 'height': 844})
        await page3.goto(link)
        await page3.wait_for_selector('#room-link', timeout=15000)
        await page3.wait_for_timeout(1500)
        f1 = next(f for f in page.frames if f != page.main_frame)
        f3 = next(f for f in page3.frames if f != page3.main_frame)
        m1, m3 = await f1.evaluate('window.__mp'), await f3.evaluate('window.__mp')
        check(m1['players'] == 2 and m3['players'] == 2 and m1['got'] > 2 and m3['got'] > 2 and m1['host'] and not m3['host'], f'two browsers play together through the room ({m1}, {m3})')
        check('2 players' in await page.locator('#gp-room').inner_text(), 'the room shows both players')
        await page3.screenshot(path=f'{OUT}/38-room-friend.png', full_page=True)
        await page3.click('button[data-act="room-leave"]')
        await page.wait_for_function("document.querySelector('#gp-room').innerText.includes('1 player')", timeout=8000)
        check(True, 'leaving the room updates the other player')
        real3 = [e for e in errs3 if 'fonts.g' not in e and 'ERR_FAILED' not in e]
        check(not real3, 'no console/page errors for the friend ' + str(real3[:5]))
        await ctx3.close()
        # When the play-test finds a problem, Claude fixes it once by itself, then hands the rest to the creator.
        await page.goto(AI_SITE + '#create')
        await page.wait_for_selector('button[data-act="players"]', timeout=10000)
        if await page.locator('button[data-act="players"][aria-pressed="true"]').count(): await page.click('button[data-act="players"]')
        n0 = len(json.loads(urllib.request.urlopen(AI_SITE + '__playtests').read()))
        await page.fill('#st-prompt', 'Block Miner PLAYTESTFIX')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('#st-status .banner:has-text("The play-test found a problem")', timeout=40000)
        chat = await page.locator('#st-chat').inner_text()
        calls = json.loads(urllib.request.urlopen(AI_SITE + '__calls').read())
        tests = json.loads(urllib.request.urlopen(AI_SITE + '__playtests').read())
        check(len(tests) - n0 == 2 and calls[-1]['task'].startswith('The current game has this problem') and 'title text is cut off' in calls[-1]['task'] and 'Fixing it now' in chat, 'the play-test problem went back to Claude as one automatic fix')
        check(await page.locator('#st-status button[data-act="gen-fix"]').count() == 1, 'a problem left after the fix is shown with Fix with AI')
        await page.screenshot(path=f'{OUT}/39-playtest-fix.png')
        real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
        check(not real, 'no console/page errors with the ClaudePlay server ' + str(real[:5]))
        await ctx.close()
    finally:
        proc.terminate()

async def scenario_social(browser):
    # Unlisted games, follows, friends boards, the phone QR code, republishing and drafts, with two visitors.
    proc = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), 'fake_ai_server.mjs'), '8769'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(SOCIAL_SITE + 'api/status', timeout=1); break
            except Exception: time.sleep(0.1)
        ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900})
        await page.goto(SOCIAL_SITE + '#create')
        await skip_guide(page)
        await page.fill('#st-prompt', 'Block Miner: tap to fill blocks before gas runs out.')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('button[data-act="publish"]:enabled', timeout=25000)
        await page.click('button[data-act="vis"][data-vis="unlisted"]')
        check('open it with the link' in await page.locator('fieldset.vis').inner_text(), 'the publish panel offers Unlisted')
        await page.click('button[data-act="publish"]')
        await page.wait_for_selector('.gp-head h1:has-text("Block Miner")', timeout=8000)
        check(await page.locator('#gp-chips .chip:has-text("Unlisted")').count() == 1, 'an unlisted game says so on its page')
        link = page.url
        # A second visitor: the game is not in Explore, but the link opens it.
        ctx2, page2, errs2 = await new_page(browser, viewport={'width': 1280, 'height': 900})
        await page2.goto(SOCIAL_SITE + '#explore')
        await page2.wait_for_selector('.cart', timeout=15000)
        await page2.wait_for_timeout(1500)
        check(await page2.locator('.cart:has-text("Block Miner")').count() == 0, 'unlisted games stay out of Explore')
        await page2.goto(link.replace(SOCIAL_SITE, SOCIAL_SITE + '?v=2'))
        await page2.wait_for_selector('#gp-screen iframe', timeout=15000)
        check(await page2.locator('.gp-head h1').inner_text() == 'Block Miner', 'the link opens an unlisted game')
        await page2.wait_for_timeout(500)
        box = await page2.locator('#gp-screen iframe').bounding_box()
        for attempt in range(3):
            await page2.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
            try:
                await page2.wait_for_selector('.toast:has-text("New best")', timeout=6000)
                break
            except Exception:
                if attempt == 2: raise
        await page2.click('button[data-act="follow"]')
        await page2.wait_for_selector('button[data-act="follow"][aria-pressed="true"]', timeout=8000)
        check('Following' in await page2.locator('button[data-act="follow"]').inner_text(), 'a player follows the maker')
        await page2.click('button[data-act="phone"]')
        await page2.wait_for_selector('.modal .qr svg', timeout=5000)
        qr = await page2.locator('.modal .qr svg').get_attribute('aria-label')
        check(bool(qr) and '#game-' in await page2.input_value('#phone-link'), 'Play on your phone shows a QR code and the link')
        await page2.screenshot(path=f'{OUT}/40-phone-qr.png')
        await page2.click('.modal [data-act="modal-close"]')
        await page2.click('button[data-act="tab"][data-tab="board"]')
        await page2.click('button[data-act="group-new"]')
        await page2.fill('#group-name', 'Lunch crew')
        await page2.click('.modal button[type="submit"]')
        await page2.wait_for_selector('h1:has-text("Lunch crew")', timeout=8000)
        invite = await page2.input_value('#group-link')
        await page2.wait_for_selector('table.data td:has-text("Block Miner")', timeout=8000)
        check('#group-' in invite, 'a friends board gets an invite link and shows the members\' best runs')
        await page2.screenshot(path=f'{OUT}/41-friends-board.png', full_page=True)
        # The maker joins through the invite, sees the follower, then republishes and lists the game.
        await page.goto(invite)
        await page.wait_for_selector('button[data-act="group-join"]', timeout=15000)
        await page.click('button[data-act="group-join"]')
        await page.wait_for_selector('#group-link', timeout=8000)
        check('2 members' in await page.locator('.page-head').inner_text(), 'the invite link lets a friend join')
        await page.goto(link)
        await page.wait_for_function("document.querySelector('#gp-about') && document.querySelector('#gp-about').innerText.includes('1 follower')", timeout=15000)
        check(True, 'the maker sees their new follower')
        await page.click('button[data-act="edit-game"]')
        await page.wait_for_selector('.drafts .chip:has-text("Editing your published game")', timeout=8000)
        await page.fill('#st-prompt', 'Make the blocks glow.')
        await page.click('button[data-act="gen-edit"]')
        await page.wait_for_selector('button[data-act="publish"]:enabled:has-text("republish")', timeout=25000)
        await page.click('button[data-act="publish"]')
        await page.wait_for_selector('#gp-chips .chip:has-text("Version 2")', timeout=10000)
        check(page.url == link, 'republishing keeps the same game and link, now at version 2')
        await page.click('button[data-act="set-vis"]')
        await page.wait_for_function("!document.querySelector('#gp-chips').innerText.includes('Unlisted')", timeout=8000)
        await page2.goto(SOCIAL_SITE + '#explore')
        await page2.wait_for_selector('.cart:has-text("Block Miner")', timeout=15000)
        check(True, 'listing the game puts it in Explore')
        # Drafts: starting a new game files the current one as a draft.
        await page.goto(SOCIAL_SITE + '#create')
        await page.wait_for_selector('button[data-act="new-game"]', timeout=8000)
        await page.fill('#st-prompt', 'A half-finished idea')
        await page.click('button[data-act="new-game"]')
        await page.wait_for_selector('.drafts-list summary:has-text("Drafts (1)")', timeout=5000)
        check(True, 'New game keeps the unfinished one as a draft')
        for name, e in (('maker', errs), ('player', errs2)):
            real = [x for x in e if 'fonts.g' not in x and 'ERR_FAILED' not in x]
            check(not real, f'no console/page errors for the {name} ' + str(real[:5]))
        await ctx2.close(); await ctx.close()
    finally:
        proc.terminate()

async def scenario_chain(browser):
    # Payments on a (fake) Solana devnet: collects and tips are real signed Solana transfers.
    proc = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), 'fake_ai_server.mjs'), '8767', 'chain'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    chain = lambda: json.loads(urllib.request.urlopen(CHAIN_SITE + '__chain').read())
    try:
        for _ in range(50):
            try: urllib.request.urlopen(CHAIN_SITE + 'api/status', timeout=1); break
            except Exception: time.sleep(0.1)
        ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900})
        await page.goto(CHAIN_SITE + '#create')
        await skip_guide(page)
        await page.fill('#st-prompt', 'Block Miner: tap to fill blocks before gas runs out.')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built")', timeout=20000)
        await page.wait_for_selector('#pub-price', timeout=5000)
        await page.fill('#pub-price', '0.1')
        await page.click('button[data-act="publish"]')
        await page.wait_for_selector('.gp-head h1:has-text("Block Miner")', timeout=8000)
        creator = await page.evaluate('window.__pp.wallet.from')
        gid_url = page.url
        check(True, 'creator published a 0.1 SOL game on the devnet site')
        ctx2, page2, errs2 = await new_page(browser, viewport={'width': 390, 'height': 844})
        await page2.goto(gid_url)
        await page2.wait_for_selector('button[data-act="collect"]', timeout=15000)
        await page2.click('button[data-act="collect"]')
        await page2.wait_for_selector('button[data-act="airdrop-then-collect"]', timeout=5000)
        check(True, 'collect offers devnet SOL from the faucet first')
        await page2.click('button[data-act="airdrop-then-collect"]')
        await page2.wait_for_selector('.toast:has-text("Collected")', timeout=20000)
        c = chain()
        check(c['balances'].get(creator) == 95000000 and c['balances'].get(c['treasury']) == 5000000, 'the collect paid the creator 95% and the treasury 5% on Solana: ' + json.dumps(c)[:200])
        frame = next(f for f in page2.frames if f != page2.main_frame)
        res = await frame.evaluate("fetch('" + CHAIN_SITE + "api/status').then(() => 'reached', () => 'blocked')")
        check(res == 'blocked', 'a game cannot reach the network (' + res + ')')
        # The page re-renders once the collect is recorded; open the tip dialog after that.
        await page2.wait_for_selector('text=You own edition', timeout=10000)
        await page2.wait_for_timeout(500)
        await page2.click('button[data-act="tip"]')
        await page2.wait_for_selector('button[data-act="confirm-tip"][data-amt="0.01"]:enabled', timeout=10000)
        await page2.click('button[data-act="confirm-tip"][data-amt="0.01"]')
        await page2.wait_for_selector('.toast:has-text("Tipped")', timeout=20000)
        c = chain()
        check(c['balances'].get(creator) == 105000000 and c['sent'] == 2, 'the tip paid the creator on Solana')
        await page2.screenshot(path=f'{OUT}/32-chain-collect.png', full_page=True)
        # Pro: a SOL payment to the treasury unlocks Sonnet and more builds a day.
        await page2.goto(CHAIN_SITE + '#create')
        await page2.wait_for_selector('#st-plan button[data-act="get-pro"]', timeout=15000)
        check('Free plan' in await page2.locator('#st-plan').inner_text(), 'the studio shows the free plan and a Pro offer')
        await page2.click('#st-plan button[data-act="get-pro"]')
        await page2.wait_for_selector('button[data-act="confirm-pro"]:enabled', timeout=10000)
        await page2.click('button[data-act="confirm-pro"]')
        await page2.wait_for_selector('.toast:has-text("Pro is on")', timeout=20000)
        await page2.wait_for_selector('#st-plan:has-text("Pro until")', timeout=5000)
        c = chain()
        check(c['balances'].get(c['treasury']) == 105000000 and c['sent'] == 3, 'the Pro pass was paid to the treasury on Solana: ' + json.dumps(c)[:160])
        await page2.screenshot(path=f'{OUT}/34-chain-pro.png', full_page=True)
        # The creator's page checks the payments on Solana before counting them.
        await page.goto(CHAIN_SITE + '#wallet')
        await page.wait_for_timeout(5000)
        await page.reload()
        await page.wait_for_selector('.panel.balance', timeout=10000)
        await page.wait_for_timeout(1500)
        txt = await page.locator('.panel.balance').first.inner_text()
        check('devSOL' in txt and '0.105' in txt, 'creator wallet shows the Solana balance: ' + txt.replace('\n', ' ')[:120])
        check('Earned 0.105' in txt, 'creator earnings come from verified payments')
        await page.screenshot(path=f'{OUT}/33-chain-wallet.png', full_page=True)
        real = [e for e in errs + errs2 if 'fonts.g' not in e and 'ERR_FAILED' not in e and 'Content Security Policy' not in e]
        check(not real, 'no console/page errors on the devnet site ' + str(real[:5]))
        await ctx2.close(); await ctx.close()
    finally:
        proc.terminate()

async def scenario_mainnet(browser):
    # Mainnet (real SOL): the page says so, and keys kept in a browser can neither pay nor receive.
    proc = subprocess.Popen(['node', os.path.join(os.path.dirname(__file__), 'fake_ai_server.mjs'), '8768', 'mainnet'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for _ in range(50):
            try: urllib.request.urlopen(MAIN_SITE + 'api/status', timeout=1); break
            except Exception: time.sleep(0.1)
        ctx, page, errs = await new_page(browser, viewport={'width': 1280, 'height': 900})
        await page.goto(MAIN_SITE)
        await page.wait_for_selector('.foot', timeout=15000)
        foot = await page.locator('.foot').inner_text()
        check('real SOL on Solana mainnet' in foot and 'no real funds move' not in foot, 'mainnet site says payments are real SOL')
        check('test tokens' not in await page.locator('#view').inner_text(), 'mainnet site never calls balances test tokens')
        await page.goto(MAIN_SITE + '#create')
        await skip_guide(page)
        await page.fill('#st-prompt', 'Block Miner: tap to fill blocks before gas runs out.')
        await page.click('button[data-act="gen-new"]')
        await page.wait_for_selector('.toast:has-text("Built")', timeout=20000)
        await page.click('button[data-act="publish"]')
        await page.wait_for_selector('.toast:has-text("Connect your wallet app")', timeout=8000)
        check(True, 'publishing from a browser-kept key is refused on mainnet')
        await page.goto(MAIN_SITE + '#wallet')
        await page.wait_for_selector('.panel.balance', timeout=10000)
        txt = await page.locator('.panel.balance').first.inner_text()
        check(txt.startswith('SOL') and await page.locator('button[data-act="airdrop"]').count() == 0, 'mainnet wallet shows SOL and no faucet: ' + txt.replace('\n', ' ')[:80])
        real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e and 'Connect your wallet app' not in e]
        check(not real, 'no console/page errors on the mainnet site ' + str(real[:5]))
        await ctx.close()
    finally:
        proc.terminate()

# Games written against the built-in engines (SP2D + SPSound, SP3D textures), run through withSDK.
ENGINE_2D = r"""<!doctype html><html><head><meta charset="utf-8"><title>Coin Hopper</title></head><body><script>
const g = SP2D.create({ width: 480, height: 270, background: '#1b2a4a', gravity: 1400, pixelArt: true });
SPSound.music({ mood: 'happy', seed: 3 });
let score = 0, p;
g.scene('play', () => {
  g.level([
    '...............................',
    '..........C....C...............',
    '.........===..===......C.......',
    '...C..................====.....',
    '..===......E...................',
    '...............C.....E.........',
    '.P..C......#####...#####.......',
    '###############################',
  ], 32, { '#': { color: '#6b8f4e' }, '=': { color: '#8b6b3e', oneWay: true },
    P: (x, y) => { p = g.add({ x, y, w: 22, h: 28, body: true, color: '#ffd84d', tag: 'player' }); },
    C: (x, y) => g.add({ x: x + 8, y: y + 8, size: 16, shape: 'circle', color: '#ffe066', tag: 'coin' }),
    E: (x, y) => g.add({ x, y: y + 4, w: 26, h: 24, body: true, vx: 60, color: '#ff5d73', tag: 'enemy' }) });
  g.camera.follow(p);
  g.overlap('player', 'coin', (a, c) => { c.remove(); score += 10; SP.score(score); SPSound.sfx('coin'); g.burst(c.x, c.y, { color: '#ffe066' }); });
  g.overlap('player', 'enemy', () => { SPSound.sfx('hit'); g.camera.shake(8); });
});
g.buttons(['left', 'right', 'jump']);
g.go('play');
SP.ready();
g.start((dt) => {
  for (const e of g.all('enemy')) if (e.hitWall) e.vx = -e.vx || 60;
  p.vx = (g.keys.right ? 200 : 0) - (g.keys.left ? 200 : 0);
  if ((g.pressed.jump || g.pressed.up) && p.onGround) { p.vy = -560; SPSound.sfx('jump'); }
  g.hud.fillStyle = '#fff'; g.hud.font = 'bold 16px sans-serif'; g.hud.textAlign = 'left'; g.hud.fillText('COINS ' + score, 10, 20);
  window.__state = { x: p.x, y: p.y, ground: p.onGround, score, frames: (window.__state ? window.__state.frames : 0) + 1, cam: g.camera.x };
});
</script></body></html>
"""
ENGINE_3D = r"""<!doctype html><html><head><title>T</title></head><body><script>
const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32; const cx = cv.getContext('2d'); cx.fillStyle = '#f00'; cx.fillRect(0,0,16,16); cx.fillStyle='#00f'; cx.fillRect(16,16,16,16);
const g = SP3D.create({ background: '#223' });
g.camera.y = 3; g.camera.z = 6;
const b = g.add('box', { image: cv, size: 2, y: 1 });
const s = g.add('sprite', { image: cv, x: 2.5, y: 1, size: 1.5 });
g.add('plane', { sx: 20, sz: 20, color: '#3a6', image: cv, repeat: 5 });
g.start((dt) => { b.ry += dt; window.__f = (window.__f || 0) + 1; });
</script></body></html>
"""

async def run_in_frame(page, code):
    await page.evaluate("""(code) => { document.body.innerHTML = ''; const f = document.createElement('iframe'); f.style.cssText = 'width:960px;height:540px;border:0'; f.sandbox = 'allow-scripts'; f.srcdoc = PPKits.withSDK(code, 1, {}); document.body.appendChild(f); }""", code)
    await page.wait_for_timeout(1200)
    return page.frames[1]

async def scenario_engines(browser):
    ctx, page, errs = await new_page(browser, viewport={'width': 960, 'height': 540})
    await page.goto(BASE)
    await page.wait_for_function('window.PPKits')
    check('SP2D_LIB' not in await page.evaluate("PPKits.withSDK('<html><head></head><body>plain</body></html>', 1, {})"), 'engines are only added to games that use them')
    fr = await run_in_frame(page, ENGINE_2D)
    st = await fr.evaluate('window.__state')
    check(st and st['ground'] and st['frames'] > 10, f'SP2D: the level loads and the player stands on solid tiles ({st})')
    await page.mouse.click(480, 100)
    await page.keyboard.down('ArrowRight'); await page.wait_for_timeout(900)
    await page.keyboard.press('Space'); await page.wait_for_timeout(250)
    mid = await fr.evaluate('window.__state')
    await page.wait_for_timeout(500); await page.keyboard.up('ArrowRight')
    end = await fr.evaluate('window.__state')
    check(end['x'] > st['x'] + 150 and end['cam'] > 0, f'SP2D: arrow keys move the player and the camera follows ({end})')
    check(mid['y'] < st['y'] - 20 and not mid['ground'], f'SP2D: Space jumps ({mid})')
    check(end['score'] >= 10, 'SP2D: overlap callbacks collect a coin')
    check(await fr.evaluate('SPSound.playing') and await fr.evaluate("SPSound.context.state") == 'running', 'SPSound: music plays after the first tap')
    await page.screenshot(path=f'{OUT}/40-engine-2d.png')
    fr = await run_in_frame(page, ENGINE_3D)
    check(await fr.evaluate('window.__f || 0') > 10, 'SP3D: textured shapes and camera-facing sprites render')
    await page.screenshot(path=f'{OUT}/41-engine-3d.png')
    real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e and '404' not in e]
    check(not real, 'no console/page errors in engine games ' + str(real[:5]))
    await ctx.close()

async def scenario_a11y(browser):
    for scheme, theme in (('light', None), ('dark', None), ('light', 'contrast')):
        ctx, page, errs = await new_page(browser, fit=True, viewport={'width': 1280, 'height': 900}, color_scheme=scheme)
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

async def scenario_fit(browser):
    routes = ['home', 'explore', 'game-kit-neon-dash', 'create', 'wallet', 'ledger', 'economy', 'business']
    for w, h in ((1440, 900), (1366, 768), (1280, 720), (390, 844), (360, 640)):
        mobile = w < 500
        ctx, page, errs = await new_page(browser, fit=True, viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
        await page.goto(SITE)
        await page.wait_for_selector('#home-screen iframe', state='attached', timeout=15000)
        for r in routes:
            await page.evaluate(f'location.hash = "{r}"'); await page.wait_for_timeout(600)
            sy, sx = await page.evaluate('[document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth]')
            check(sy <= 0 and sx <= 0, f'one screen at {w}x{h} ({r}: {sy}px down, {sx}px across)')
            vis = await page.evaluate('''() => [...document.querySelectorAll('#view .pager, #view > :not(.fit-off)')].every((e) => { const b = e.getBoundingClientRect(); return b.height === 0 || b.bottom <= innerHeight + 1; })''')
            check(vis, f'every shown part fits the window at {w}x{h} ({r})')
        real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
        check(not real, f'no console/page errors in one-screen layout at {w}x{h} {real[:3]}')
        await ctx.close()
    ctx, page, errs = await new_page(browser, fit=True, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    await page.goto(SITE + '#business')
    await page.wait_for_selector('.pager', timeout=15000)
    first = await page.inner_text('.pg-name')
    await page.click('.pg-step.next'); await page.wait_for_timeout(400)
    second = await page.inner_text('.pg-name')
    check(first != second and '2 /' in second, f'the pager flips to the next part ({first!r} then {second!r})')
    await page.keyboard.press('PageUp'); await page.wait_for_timeout(800)
    check('1 /' in await page.inner_text('.pg-name'), 'Page Up flips back')
    await page.click('#a11y-btn'); await page.wait_for_timeout(200)
    await page.click('label.opt:has(input[name="pref-layout"][value="scroll"])'); await page.click('[data-act="modal-close"]'); await page.wait_for_timeout(500)
    tall = await page.evaluate('document.documentElement.scrollHeight - innerHeight')
    check(tall > 0 and await page.locator('.pager').count() == 0, f'the Scrolling pages setting brings back long pages ({tall}px)')
    real = [e for e in errs if 'fonts.g' not in e and 'ERR_FAILED' not in e]
    check(not real, f'no console/page errors while flipping parts {real[:3]}')
    await ctx.close()

async def main():
    async with async_playwright() as p:
        exe = os.environ.get('CHROME_PATH')
        browser = await p.chromium.launch(executable_path=exe or None, args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'])
        only = os.environ.get('E2E_ONLY', '').split(',')
        for sc in (scenario_local, scenario_mock, scenario_dark, scenario_site, scenario_server, scenario_social, scenario_chain, scenario_mainnet, scenario_engines, scenario_fit, scenario_a11y):
            if only != [''] and sc.__name__.replace('scenario_', '') not in only: continue
            try:
                await sc(browser)
            except Exception as e:
                fails.append(sc.__name__ + ': ' + repr(e)[:400]); print('FAIL', sc.__name__, repr(e)[:600])
        await browser.close()
    print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED:\n- ' + '\n- '.join(fails)))
asyncio.run(main())
