// Manual rendered-design audit. Start the existing static server separately; this never starts/builds it.
// node test/design-audit.mjs --help
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const axes = {
  routes: ['home', 'explore', 'game', 'create', 'business', 'maker', 'group', 'wallet', 'ledger', 'economy'],
  layouts: ['scroll', 'fit'], devices: ['desktop', 'mobile'],
  themes: ['light', 'dark', 'contrast'], fonts: ['loaded', 'offline'],
};
const help = `Usage: node test/design-audit.mjs [options]
Requires an already built dist/site and an already running local static server.
  --url=http://127.0.0.1:8765/site/index.html
  --out=reports/redesign-shots       JSON report, Markdown summary and screenshots (ignored)
  --routes=${axes.routes.join(',')}
  --layouts=scroll,fit --devices=desktop,mobile --themes=light,dark,contrast
  --fonts=loaded,offline             Loaded mode verifies declared and visible primary font families
Includes axe defaults plus experimental label-content-name-mismatch; no default rules are disabled.
  --screenshots=all                  all (default), failures, or none
  --workers=1                       1 (default) to 3 isolated browser contexts in parallel
  --timeout-ms=15000 --headed        Optional headed run; CHROME_PATH selects a browser binary
Default: 24 configurations × 10 routes, every fitted pane, plus the settings dialog.
Example focused rerun:
  node test/design-audit.mjs --routes=maker,group --fonts=offline --themes=contrast --devices=mobile
Fitted configurations also check a fresh guest Home with calm motion before their signed-fixture route checks.
Exit 1: blocking audit findings, missing coverage, setup/runtime errors or failed requested fonts.
Exit 0 does not certify WCAG compliance; inconclusive axe results need human review.
No server, API calls, external writes, generated-wallet files, or storage-state files are created.
`;
const opts = { url: 'http://127.0.0.1:8765/site/index.html', out: 'reports/redesign-shots', screenshots: 'all', timeout: 15000, workers: 1, headed: false, ...axes };
try {
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') { process.stdout.write(help); process.exit(0); }
    if (arg === '--headed') { opts.headed = true; continue; }
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unknown option: ${arg}`);
    const [, key, value] = match;
    if (key in axes) {
      const values = [...new Set(value.split(','))];
      if (!values.length || values.some((v) => !axes[key].includes(v))) throw new Error(`Invalid --${key}; choose ${axes[key].join(',')}`);
      opts[key] = values;
    } else if (key === 'url' || key === 'out') opts[key] = value;
    else if (key === 'screenshots' && ['all', 'failures', 'none'].includes(value)) opts.screenshots = value;
    else if (key === 'workers' && /^[123]$/.test(value)) opts.workers = +value;
    else if (key === 'timeout-ms' && /^\d+$/.test(value) && +value >= 1000 && +value <= 120000) opts.timeout = +value;
    else throw new Error(`Unknown or invalid option: ${arg}`);
  }
} catch (error) { console.error(error.message); process.exit(1); }
const base = new URL(opts.url);
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password) {
  console.error('Use a local HTTP static server only; remote URLs and credentials are refused.'); process.exit(1);
}
base.hash = '';
const output = resolve(opts.out);
const nameRules = new Set(['button-name', 'link-name', 'input-button-name', 'input-image-alt', 'select-name', 'label', 'aria-command-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-dialog-name', 'frame-title']);
// A rules map extends axe's defaults; runOnly/withRules would incorrectly narrow the audit.
const axeOptions = { rules: { 'label-content-name-mismatch': { enabled: true } } };
const fontRequest = (request) => request.resourceType() === 'font' || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(request.url());
const fontURL = (url) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url || '') || /\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(url || '');
const summary = {
  startedAt: new Date().toISOString(), target: base.href, options: opts, states: [], contexts: [], fatal: [],
  axeOptions,
  limitations: [
    'Automated axe checks and screenshots do not certify WCAG compliance or composed-pixel contrast.',
    'This is Chromium automation; physical phone, Safari and real GPU performance need separate review.',
    'Fixture keys/storage exist only in ephemeral browser memory and are not written to reports.',
    'Fixtures contain a real locally signed kit publish and friends board; group scores start empty.',
    'Scene lifecycle and performance checks are handled separately from this audit.',
  ],
};
let browser;
const briefError = (e) => String(e?.message || e).slice(0, 1800);
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function contextFor(config, storage) {
  const mobile = config.device === 'mobile';
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, colorScheme: config.theme === 'dark' ? 'dark' : 'light' });
  const prefs = { theme: config.theme, text: mobile ? 'xl' : 'md', layout: config.layout, motion: config.motion || 'system', speed: 1, sound: false };
  await context.addInitScript(({ storage, prefs, origin }) => {
    if (window !== top || location.origin !== origin) return;
    for (const { name, value } of storage || []) localStorage.setItem(name, value);
    localStorage.setItem('gp.prefs.v1', JSON.stringify(prefs));
  }, { storage, prefs, origin: base.origin });
  const record = { config, errors: [], fontRequests: [], failedFonts: [], localImages: [], failedImages: [], blockedWrites: [] };
  // Only page/assets on this local origin and optional public font reads are allowed.
  // Generated fixture actions must remain local even if someone serves hosted configuration by mistake.
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    const isFont = fontRequest(request), read = ['GET', 'HEAD'].includes(request.method());
    if (isFont) record.fontRequests.push(request.url());
    if (config.font === 'offline' && isFont) return route.abort('blockedbyclient');
    if (!read || (url.origin !== base.origin && !(isFont && /^https:$/.test(url.protocol)))) {
      record.blockedWrites.push({ method: request.method(), url: request.url() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  context.on('page', (page) => {
    page._designAuditFontMode = config.font;
    page.setDefaultTimeout(opts.timeout);
    page.on('pageerror', (error) => record.errors.push({ kind: 'pageerror', message: briefError(error), url: page.url() }));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const location = message.location();
      // Ignore only the deliberate font-network failure in offline mode.
      if (config.font === 'offline' && fontURL(location.url)) return;
      record.errors.push({ kind: 'console', message: message.text().slice(0, 1800), url: page.url(), location });
    });
    page.on('requestfailed', (request) => {
      if (config.font !== 'offline' && fontRequest(request)) record.failedFonts.push({ url: request.url(), error: request.failure()?.errorText });
      if (request.resourceType() === 'image' && new URL(request.url()).origin === base.origin) record.failedImages.push({ url: request.url(), error: request.failure()?.errorText });
    });
    page.on('response', (response) => {
      if (config.font !== 'offline' && fontRequest(response.request()) && response.status() >= 400) record.failedFonts.push({ url: response.url(), status: response.status() });
      if (response.request().resourceType() === 'image' && new URL(response.url()).origin === base.origin) {
        record.localImages.push({ url: response.url(), status: response.status() });
        if (!response.ok()) record.failedImages.push({ url: response.url(), status: response.status() });
      }
    });
  });
  return { context, record };
}
async function settled(page) {
  if (page._designAuditFontMode === 'loaded') {
    await page.waitForFunction(() => {
      const link = document.getElementById('optional-fonts');
      return !link || link.media === 'all';
    }, null, { timeout: opts.timeout });
  }
  await page.evaluate(async (ms) => {
    // The nonblocking stylesheet can create font faces after the original ready promise resolved.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let timer;
    try {
      await Promise.race([document.fonts.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Font readiness timeout')), ms); })]);
    } finally { clearTimeout(timer); }
    const finite = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 800))]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, opts.timeout);
}
async function inspectFonts(page, config) {
  return deadline(page.evaluate(async (loaded) => {
    const familyName = (name) => name.trim().replace(/^["']|["']$/g, '');
    const link = document.getElementById('optional-fonts');
    const expectedFamilies = link ? new URL(link.href).searchParams.getAll('family').map((part) => part.split(':')[0]) : [];
    const faces = [...document.fonts];
    const declaredFamilies = [...new Set(faces.map((face) => familyName(face.family)))];
    const missingFamilies = loaded ? expectedFamilies.filter((family) => !declaredFamilies.includes(family)) : [];
    const choices = new Map();
    const webFamilies = new Set([...expectedFamilies, ...declaredFamilies]);
    for (const el of document.querySelectorAll('body,h1,h2,h3,p,a,button,input,textarea,select,label,legend,.mono,.hash')) {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth || style.visibility === 'hidden' || el.closest('.fit-off')) continue;
      const family = familyName(style.fontFamily.split(',')[0]);
      if (!webFamilies.has(family)) continue;
      const descriptor = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${JSON.stringify(family)}`;
      if (!choices.has(descriptor)) choices.set(descriptor, { family, weight: style.fontWeight, size: style.fontSize, descriptor,
        // Samples come from visible copy or placeholders; input values/keys are never copied to diagnostics.
        // A Latin probe avoids mistaking intentional symbol-glyph fallback for an absent font family.
        sample: (el.innerText || el.getAttribute('placeholder') || '').slice(0, 80) + ' Aa0123456789' });
    }
    const used = await Promise.all([...choices.values()].map(async ({ sample, ...font }) => {
      if (!loaded) return { ...font, loaded: null };
      const matched = await document.fonts.load(font.descriptor, sample);
      return { ...font, loaded: matched.length > 0 && matched.every((face) => face.status === 'loaded') };
    }));
    return { stylesheetApplied: link ? link.media === 'all' : null, expectedFamilies, declaredFamilies, missingFamilies, used,
      faces: [...document.fonts].map((face) => ({ family: familyName(face.family), weight: face.weight, style: face.style, status: face.status })) };
  }, config.font === 'loaded'), opts.timeout, 'Visible web-font verification');
}
async function navigate(page, hash) {
  await page.evaluate((hash) => { location.hash = hash; }, hash);
  await page.waitForFunction((hash) => {
    const [route, ...parts] = hash.split('-');
    const expectedArg = ['game', 'maker', 'group'].includes(route) ? parts.join('-') : null;
    return location.hash === '#' + hash && window.__pp?.ready && __pp.route === route && __pp.arg === expectedArg && document.querySelector('#view h1');
  }, hash);
  await settled(page);
}
async function fixtures() {
  const { context, record } = await contextFor({ device: 'desktop', layout: 'scroll', theme: 'light', font: 'offline' });
  try {
    const page = await context.newPage();
    const response = await page.goto(base.href + '#wallet', { waitUntil: 'domcontentloaded' });
    if (!response?.ok() || createHash('sha256').update(await response.body()).digest('hex') !== summary.htmlSha256) throw new Error('Served HTML changed during fixture setup; finish integration/build before rerunning.');
    await page.waitForFunction(() => window.__pp?.ready);
    if (await page.evaluate(() => __pp.mode !== 'local' || __pp.hasDb || !!window.GP_SITE?.chain)) throw new Error('Fixture creation requires the static local-mode build; hosted configuration is refused.');
    await page.locator('[data-act="create-wallet"]').click();
    await page.waitForSelector('#handle-in');
    await page.locator('#handle-in').fill('pixel-island-auditor');
    await page.locator('form[data-form="handle"] button').click();
    await page.waitForFunction(() => __pp.world.wallets.get(__pp.wallet.from)?.handle === 'pixel-island-auditor');
    const maker = await page.evaluate(() => __pp.wallet.from);
    await navigate(page, 'game-kit-neon-dash');
    await page.locator('.remix-box button[type="submit"]').click();
    await page.waitForSelector('#kn-title');
    await page.locator('#kn-title').fill('Moonlit island adventures beyond the sky');
    await page.locator('#pub-desc').fill('A locally signed design-audit cartridge with a long title and a readable description. No external service or payment is involved.');
    await page.locator('[data-act="publish"]').click();
    await page.waitForFunction(() => __pp.route === 'game' && __pp.arg.startsWith('g') && __pp.world.games.get(__pp.arg)?.title === 'Moonlit island adventures beyond the sky');
    const game = await page.evaluate(() => __pp.arg);
    await page.locator('[data-act="group-new"]').click();
    await page.locator('#group-name').fill('Sky islands friends group');
    await page.locator('form[data-form="group-new"] button[type="submit"]').click();
    await page.waitForFunction(() => __pp.route === 'group' && __pp.world.groups.has(__pp.arg));
    const group = await page.evaluate(() => __pp.arg);
    const state = await context.storageState();
    const storage = state.origins.find((o) => o.origin === base.origin)?.localStorage;
    if (!storage?.length || record.blockedWrites.length || record.errors.length || record.failedImages.length) throw new Error('Local fixture setup produced errors, failed local images or attempted a network write.');
    return { storage, hashes: { home: 'home', explore: 'explore', game: 'game-' + game, create: 'create', business: 'business', maker: 'maker-' + maker, group: 'group-' + group, wallet: 'wallet', ledger: 'ledger', economy: 'economy' } };
  } finally { await context.close(); }
}
function compactRule(rule) {
  return { id: rule.id, impact: rule.impact, description: rule.description, help: rule.help, helpUrl: rule.helpUrl,
    nodes: rule.nodes.map((n) => ({ target: n.target, summary: n.failureSummary,
      checks: [...(n.any || []), ...(n.all || []), ...(n.none || [])].map((check) => ({ id: check.id, message: check.message })),
      html: n.html?.slice(0, 350) })) };
}
async function inspectState(page, config, route, pane) {
  const id = [config.device, config.layout, config.theme, config.font, route, pane].join('-');
  const state = { id, config, route, pane, blocking: [], warnings: [], manual: [] };
  summary.states.push(state);
  try {
    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const visible = (el) => el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
      const shown = [...document.querySelectorAll('#view > :not(.fit-off)')].filter(visible);
      const pager = document.querySelector('#view > .pager'), bounds = pager?.getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, horizontalOverflow: root.scrollWidth - innerWidth, verticalOverflow: root.scrollHeight - innerHeight,
        mainHeading: document.querySelector('#view h1')?.textContent?.trim(),
        pagerBounds: bounds ? { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right } : null,
        fittedBottomOverflow: root.hasAttribute('data-fit') ? shown.filter((el) => !['absolute', 'fixed'].includes(getComputedStyle(el).position) && el.getBoundingClientRect().bottom > innerHeight + 1).map((el) => ({ tag: el.tagName, id: el.id, classes: el.className, bottom: Math.round(el.getBoundingClientRect().bottom) })) : [],
        selectedPane: document.querySelector('.pg-name')?.textContent?.trim() || null };
    });
    state.geometry = geometry;
    if (geometry.horizontalOverflow > 1) state.blocking.push({ kind: 'horizontal-overflow', pixels: geometry.horizontalOverflow });
    if (config.layout === 'fit' && geometry.verticalOverflow > 1) state.blocking.push({ kind: 'fitted-page-scrolls', pixels: geometry.verticalOverflow });
    if (geometry.fittedBottomOverflow.length) state.blocking.push({ kind: 'fitted-content-outside-window', elements: geometry.fittedBottomOverflow });
    if (config.layout === 'fit' && geometry.pagerBounds && (geometry.pagerBounds.top < -1 || geometry.pagerBounds.bottom > geometry.height + 1 || geometry.pagerBounds.left < -1 || geometry.pagerBounds.right > geometry.width + 1))
      state.blocking.push({ kind: 'fitted-pager-outside-window', ...geometry.pagerBounds });
    if (!geometry.mainHeading) state.blocking.push({ kind: 'missing-main-heading' });
    // A placeholder is real instructional text. Keep this computed check explicit,
    // because image/pseudo-element backgrounds can make axe's result inconclusive.
    state.placeholderChecks = await page.evaluate(() => {
      const input = document.getElementById('home-prompt');
      if (!input || input.closest('.fit-off') || !input.getBoundingClientRect().height) return [];
      const style = getComputedStyle(input), placeholder = getComputedStyle(input, '::placeholder');
      const rgb = (value) => {
        const parts = value.match(/[\d.]+/g)?.map(Number);
        return parts?.length >= 3 ? { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 } : null;
      };
      const foreground = rgb(placeholder.color), background = rgb(style.backgroundColor);
      // The maker field has a solid panel. Do not fabricate contrast when that changes.
      if (!foreground || !background || background.alpha !== 1 || style.backgroundImage !== 'none')
        return [{ selector: '#home-prompt::placeholder', ratio: null, reason: 'Non-solid field background requires composed-pixel review' }];
      const alpha = foreground.alpha * Number(placeholder.opacity) * Number(style.opacity);
      const painted = foreground.rgb.map((c, i) => c * alpha + background.rgb[i] * (1 - alpha));
      const luminance = (color) => color.map((c) => c / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
      const f = luminance(painted), b = luminance(background.rgb), size = parseFloat(placeholder.fontSize), bold = Number(placeholder.fontWeight) >= 700;
      return [{ selector: '#home-prompt::placeholder', color: placeholder.color, background: style.backgroundColor,
        opacity: alpha, fontSize: size, fontWeight: placeholder.fontWeight, ratio: (Math.max(f, b) + .05) / (Math.min(f, b) + .05),
        minimum: size >= 24 || (bold && size >= 18.6667) ? 3 : 4.5 }];
    });
    for (const check of state.placeholderChecks) {
      if (check.ratio !== null && check.ratio < check.minimum) state.blocking.push({ kind: 'placeholder-contrast', ...check });
      if (check.ratio === null) state.warnings.push({ kind: 'placeholder-contrast-manual', ...check });
    }
    state.fonts = await inspectFonts(page, config);
    if (state.fonts.missingFamilies.length || state.fonts.used.some((font) => font.loaded === false)) state.blocking.push({ kind: 'web-fonts-unavailable',
      missingFamilies: state.fonts.missingFamilies, failedStyles: state.fonts.used.filter((font) => font.loaded === false) });
    const results = await deadline(new AxeBuilder({ page }).options(axeOptions).analyze(), opts.timeout * 2, 'axe analysis');
    for (const rule of results.violations) {
      const item = { kind: nameRules.has(rule.id) ? 'accessible-name' : 'axe', ...compactRule(rule) };
      (['serious', 'critical'].includes(rule.impact) || rule.id === 'color-contrast' || nameRules.has(rule.id) ? state.blocking : state.warnings).push(item);
    }
    state.manual = results.incomplete.map(compactRule);
    state.axe = { version: results.testEngine.version, passes: results.passes.length, violations: results.violations.length, incomplete: results.incomplete.length };
  } catch (error) { state.blocking.push({ kind: 'audit-error', message: briefError(error) }); }
  if (opts.screenshots === 'all' || (opts.screenshots === 'failures' && state.blocking.length)) {
    try { state.screenshot = id + '.png'; await page.screenshot({ path: resolve(output, state.screenshot), fullPage: config.layout === 'scroll' }); }
    catch (error) { state.blocking.push({ kind: 'screenshot-error', message: briefError(error) }); }
  }
  console.log(`${state.blocking.length ? 'FAIL' : 'ok  '} ${id} (${state.blocking.length} blocking, ${state.manual.length} manual)`);
}
async function inspectRoute(page, config, route, hash) {
  try {
    await navigate(page, hash);
    const state = await page.evaluate(() => ({ route: __pp.route, paneCount: __pp.ui.panes?.length || 1, ready: __pp.ready }));
    if (state.route !== route) throw new Error(`Expected ${route}; rendered ${state.route}`);
    const count = config.layout === 'fit' ? state.paneCount : 1;
    if (count > 20) throw new Error(`Refusing incomplete coverage: ${count} fitted panes exceeds the audit bound of 20`);
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        const next = page.locator('.pg-step.next');
        if (!(await next.count()) || !(await next.isEnabled())) throw new Error(`Cannot reach fitted pane ${i + 1} of ${count}`);
        await next.click(); await settled(page);
        if (await page.evaluate(() => __pp.ui.pane) !== i) throw new Error(`Pager did not reach pane ${i + 1}`);
      }
      await inspectState(page, config, route, i + 1);
    }
  } catch (error) {
    summary.states.push({ id: [config.device, config.layout, config.theme, config.font, route, 'coverage'].join('-'), config, route, blocking: [{ kind: 'route-coverage-error', message: briefError(error) }] });
    console.error(`FAIL ${route} coverage: ${briefError(error)}`);
  }
}
async function runConfiguration(config, fixture, worker) {
  if (config.layout === 'fit') await inspectGuestHome(config, worker);
  const { context, record } = await contextFor(config, fixture.storage);
  record.worker = worker;
  summary.contexts.push(record);
  try {
    const page = await context.newPage();
    const response = await page.goto(base.href + '#home', { waitUntil: 'domcontentloaded' });
    record.htmlSha256 = response?.ok() ? createHash('sha256').update(await response.body()).digest('hex') : null;
    if (record.htmlSha256 !== summary.htmlSha256) throw new Error('Served HTML changed during the matrix; this would mix releases. Finish integration/build before rerunning.');
    await page.waitForFunction(() => window.__pp?.ready);
    await settled(page);
    record.fontFacesAtHome = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })));
    record.fontFaces = record.fontFacesAtHome;
    if (config.font === 'loaded' && record.fontRequests.length && !record.fontFaces.some((f) => f.status === 'loaded')) record.errors.push({ kind: 'fonts-not-loaded', message: 'Web fonts were requested, but no web font face loaded; this is not a loaded-font pass.' });
    for (const route of opts.routes) await inspectRoute(page, config, route, fixture.hashes[route]);
    // Audit the shared dialog as well as route content; do not exclude or disable contrast/name rules.
    await navigate(page, 'home');
    const opener = page.locator('#a11y-btn');
    await opener.click(); await page.waitForSelector('[role="dialog"]'); await settled(page);
    await inspectState(page, config, 'settings', 1);
    await page.keyboard.press('Escape');
    if (await page.locator('[role="dialog"]').count() || !(await opener.evaluate((el) => el === document.activeElement))) record.errors.push({ kind: 'dialog-focus', message: 'Escape must close settings and return focus to its opener.' });
    record.fontFaces = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })));
  } catch (error) { record.errors.push({ kind: 'configuration-error', message: briefError(error) }); }
  finally { await context.close(); }
}
async function inspectGuestHome(config, worker) {
  const guest = { ...config, phase: 'guest-first-visit', motion: 'calm' };
  const { context, record } = await contextFor(guest);
  record.worker = worker;
  summary.contexts.push(record);
  try {
    const page = await context.newPage();
    const response = await page.goto(base.href + '#home', { waitUntil: 'domcontentloaded' });
    record.htmlSha256 = response?.ok() ? createHash('sha256').update(await response.body()).digest('hex') : null;
    if (record.htmlSha256 !== summary.htmlSha256) throw new Error('Served HTML changed during guest first-visit checks.');
    await page.waitForFunction(() => window.__pp?.ready && __pp.route === 'home');
    if (await page.evaluate(() => __pp.mode !== 'local' || !!__pp.wallet?.from)) throw new Error('Guest checks require a fresh local page without a wallet.');
    // No hash transition, wallet creation, synthetic resize or rerender is allowed before
    // the first measurement: those actions can hide a missed optional-font refit.
    await settled(page);
    await inspectFonts(page, guest);
    await settled(page);
    const count = await page.evaluate(() => __pp.ui.panes?.length || 1);
    if (count > 20) throw new Error('Guest Home pane count exceeds audit coverage bound.');
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        const next = page.locator('.pg-step.next');
        if (!(await next.count()) || !(await next.isEnabled())) throw new Error(`Cannot reach guest Home pane ${i + 1} of ${count}`);
        await next.click(); await settled(page);
        if (await page.evaluate(() => __pp.ui.pane) !== i) throw new Error(`Guest pager did not reach pane ${i + 1}`);
      }
      await inspectState(page, guest, 'guest-home', i + 1);
    }
    record.fontFaces = await page.evaluate(() => [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })));
  } catch (error) { record.errors.push({ kind: 'guest-first-visit-error', message: briefError(error) }); }
  finally { await context.close(); }
}
async function runMatrix(fixture) {
  const jobs = [];
  for (const device of opts.devices) for (const layout of opts.layouts) for (const theme of opts.themes) for (const font of opts.fonts) jobs.push({ device, layout, theme, font });
  let next = 0;
  // Each job gets fresh local storage and a separate context; nothing is shared with the app or other jobs.
  await Promise.all(Array.from({ length: Math.min(opts.workers, jobs.length) }, (_, worker) => (async () => {
    while (next < jobs.length) {
      const config = jobs[next++];
      try { await runConfiguration(config, fixture, worker + 1); }
      catch (error) { summary.fatal.push(`${Object.values(config).join('/')}: ${briefError(error)}`); }
    }
  })()));
}
async function saveReport() {
  summary.finishedAt = new Date().toISOString();
  summary.counts = {
    states: summary.states.length, contexts: summary.contexts.length,
    blocking: summary.states.reduce((n, s) => n + s.blocking.length, 0) + summary.contexts.reduce((n, c) => n + c.errors.length + c.failedFonts.length + c.failedImages.length + c.blockedWrites.length, 0) + summary.fatal.length,
    manual: summary.states.reduce((n, s) => n + (s.manual?.length || 0), 0),
  };
  await writeFile(resolve(output, 'audit-results.json'), JSON.stringify(summary, null, 2) + '\n');
  const manualGroups = new Map();
  for (const state of summary.states) for (const rule of state.manual || []) for (const node of rule.nodes) {
    const key = JSON.stringify([rule.id, node.target, state.config.theme, state.config.font]);
    let group = manualGroups.get(key);
    if (!group) {
      group = { rule: rule.id, selector: node.target, type: /^<([a-z]+)/i.exec(node.html || '')?.[1] || 'unknown', theme: state.config.theme, font: state.config.font, occurrences: 0, states: [], checks: node.checks || [], exampleHTML: node.html };
      manualGroups.set(key, group);
    }
    group.occurrences++; group.states.push(state.id);
  }
  await writeFile(resolve(output, 'audit-manual-review.json'), JSON.stringify([...manualGroups.values()], null, 2) + '\n');
  const failed = summary.states.filter((s) => s.blocking.length);
  const lines = ['# Rendered design audit', '', `Target: ${base.href}`, `Started: ${summary.startedAt}`, `Finished: ${summary.finishedAt}`, '',
    `${summary.counts.states} states in ${summary.counts.contexts} configurations; ${summary.counts.blocking} blocking findings; ${summary.counts.manual} inconclusive rule results need review.`, '',
    `Served HTML SHA-256: ${summary.htmlSha256 || 'unavailable'}`, `Browser: ${summary.browser || 'unavailable'}`, '',
    'Full diagnostics and font status: [audit-results.json](audit-results.json). Inconclusive nodes grouped by selector/type/theme/font: [audit-manual-review.json](audit-manual-review.json).', '',
    '| Failed state | Findings | Screenshot |', '| --- | --- | --- |',
    ...failed.map((s) => `| ${s.id} | ${[...new Set(s.blocking.map((b) => b.id || b.kind))].join(', ')} | ${s.screenshot ? `[open](${s.screenshot})` : 'none'} |`), '',
    '## Context/setup errors', '',
    ...summary.fatal.map((e) => '- ' + e),
    ...summary.contexts.filter((c) => c.errors.length || c.failedFonts.length || c.failedImages.length || c.blockedWrites.length).map((c) => `- ${Object.values(c.config).join('/')}: ${c.errors.length} runtime/setup errors, ${c.failedFonts.length} failed font requests, ${c.failedImages.length} failed local images, ${c.blockedWrites.length} blocked network requests; details in JSON.`), '',
    '## Limits of this audit', '', ...summary.limitations.map((s) => '- ' + s), ''];
  await writeFile(resolve(output, 'audit-summary.md'), lines.join('\n'));
  console.log(`\n${summary.counts.blocking ? 'FAILED' : 'PASSED'}: ${summary.counts.states} states; ${summary.counts.blocking} blocking findings; report ${resolve(output, 'audit-summary.md')}`);
  process.exitCode = summary.counts.blocking ? 1 : 0;
}
try {
  await mkdir(output, { recursive: true });
  const response = await deadline(fetch(base.href), opts.timeout, 'Local server preflight');
  if (!response.ok) throw new Error(`Local server returned HTTP ${response.status}; build and serve dist separately.`);
  summary.htmlSha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  browser = await chromium.launch({ headless: !opts.headed, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
  summary.browser = await browser.version();
  const fixture = await fixtures();
  await runMatrix(fixture);
} catch (error) { summary.fatal.push(briefError(error)); console.error(`FAIL setup: ${briefError(error)}`); }
finally { if (browser) await browser.close(); await mkdir(output, { recursive: true }); await saveReport(); }
