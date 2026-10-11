/* Accessible island destinations live beside the decorative world, outside its
   hidden accessibility subtree and the fitted, replaceable route content. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  const DESTINATIONS = Object.freeze([
    { route: 'create', label: 'Make a game', place: 'Builder Grove', x: .53, y: .2564, island: 'forest' },
    { route: 'explore', label: 'Play games', place: 'Arcade Citadel', x: .835, y: .2564, island: 'castle' },
    { route: 'wallet', label: 'Your wallet', place: 'Rally Ridge', x: .53, y: .7164, island: 'race' },
    { route: 'ledger', label: 'World ledger', place: 'Neon Harbour', x: .835, y: .7164, island: 'city' },
    { route: 'economy', label: 'World economy', place: 'Rally Ridge', x: .53, y: .5616, island: 'race', secondary: true },
    { route: 'business', label: 'For business', place: 'Arcade Citadel', x: .835, y: .1016, island: 'castle', secondary: true },
  ]);
  const CSS = `
  .island-nav{position:fixed;inset:0;z-index:6;pointer-events:none;font:400 1rem/1.4 var(--body,sans-serif);color:var(--ink,#14334b)}
  .island-nav *{box-sizing:border-box}
  .island-nav a,.island-nav button{pointer-events:auto}
  .island-nav [hidden]{display:none!important}
  .island-nav-destinations{position:absolute;inset:0;pointer-events:none}
  .island-nav-marker{--island-letter-ink:#fffdf0;--island-letter-edge:#14334b;position:absolute;left:clamp(125px,var(--island-x,50%),calc(100% - 125px));top:clamp(40px,var(--island-y,50%),calc(100% - 60px));translate:-50% -50%;display:grid;justify-items:center;gap:3px;min-height:44px;max-width:230px;width:max-content;padding:10px 16px;text-align:center;text-decoration:none;color:var(--ink,#14334b);background:none;border:0;border-radius:12px;box-shadow:none;transition:scale 180ms ease}
  .island-nav-marker:after{content:'';position:absolute;left:calc(50% - 4px);top:calc(100% + 8px);width:8px;height:8px;background:var(--panel,#fffdf0);border:1px solid color-mix(in srgb,var(--ink,#14334b) 45%,transparent);box-shadow:0 5px 0 -1px var(--ink,#14334b)}
  .island-nav-marker strong{font:700 1rem/1.3 var(--display,sans-serif);letter-spacing:-.015em;overflow-wrap:anywhere;color:var(--island-letter-ink);text-shadow:-2px -2px 0 var(--island-letter-edge),0 -2px 0 var(--island-letter-edge),2px -2px 0 var(--island-letter-edge),-2px 0 0 var(--island-letter-edge),2px 0 0 var(--island-letter-edge),-2px 2px 0 var(--island-letter-edge),0 2px 0 var(--island-letter-edge),0 3px 0 var(--island-letter-edge),2px 2px 0 var(--island-letter-edge)}
  .island-nav-place{font:600 .6875rem/1.4 var(--body,sans-serif);color:var(--ink-2,#2b4f67);letter-spacing:.035em}
  .island-nav-marker .island-nav-place{padding:2px 7px;border-radius:4px;background:var(--panel,#fffdf0);background:color-mix(in srgb,var(--panel,#fffdf0) 89%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .island-nav-marker:hover{scale:1.04}
  .island-nav-marker:hover strong{text-decoration:underline;text-underline-offset:.2em;text-decoration-thickness:2px}
  .island-nav-marker:active{scale:.98}
  .island-nav-marker.island-nav-secondary{padding:8px 12px;max-width:180px;border-radius:10px}
  .island-nav-marker.island-nav-secondary strong{font:700 .8125rem/1.3 var(--display,sans-serif);letter-spacing:-.015em}
  .island-nav-secondary .island-nav-place{display:none}
  .island-nav-secondary:after{width:6px;height:6px;left:calc(50% - 3px);top:calc(100% + 5px)}
  .island-nav-dock{position:absolute;left:max(20px,env(safe-area-inset-left));bottom:max(20px,env(safe-area-inset-bottom));display:flex;gap:8px;align-items:center;max-width:calc(100vw - 40px)}
  .island-nav-home,.island-nav-toggle{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;border:1px solid color-mix(in srgb,var(--ink,#14334b) 25%,transparent);border-radius:13px;padding:10px 13px;background:var(--panel,#fffdf0);background:color-mix(in srgb,var(--panel,#fffdf0) 89%,transparent);color:var(--ink,#14334b);text-decoration:none;font:600 .8125rem/1.2 var(--body,sans-serif);cursor:pointer;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 4px 18px #15304c15}
  .island-nav-home:hover,.island-nav-toggle:hover,.island-nav-toggle[aria-expanded="true"]{background:var(--panel,#fffdf0);border-color:var(--ink,#14334b)}
  .island-nav-glyph{display:grid;grid-template-columns:repeat(2,4px);grid-template-rows:repeat(2,4px);gap:2px;flex:none}
  .island-nav-glyph i{background:currentColor}
  .island-nav-overlay{position:absolute;left:max(20px,env(safe-area-inset-left));bottom:calc(max(20px,env(safe-area-inset-bottom)) + 56px);width:min(440px,calc(100vw - 40px));max-height:calc(100dvh - 110px);overflow:auto;overscroll-behavior:contain;padding:20px;display:grid;gap:14px;border:1px solid color-mix(in srgb,var(--ink,#14334b) 30%,transparent);border-radius:20px;background:var(--panel,#fffdf0);background:color-mix(in srgb,var(--panel,#fffdf0) 94%,transparent);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 18px 56px #09284244;pointer-events:auto}
  .island-nav-caption{margin:0;display:grid;gap:4px;line-height:1.4}
  .island-nav-caption strong{font:700 1rem/1.35 var(--display,sans-serif);letter-spacing:-.015em}
  .island-nav-caption span{font:400 .8125rem/1.4 var(--body,sans-serif);color:var(--ink-2,#2b4f67)}
  .island-nav-map{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}
  .island-nav-map a{display:grid;align-content:center;gap:6px;min-height:90px;min-width:0;text-decoration:none;padding:14px 12px;border:1px solid color-mix(in srgb,var(--ink,#14334b) 25%,transparent);border-radius:14px;background:color-mix(in srgb,var(--panel-2,var(--panel,#fffdf0)) 85%,transparent);color:var(--ink,#14334b)}
  .island-nav-map strong{font:700 .8125rem/1.35 var(--display,sans-serif);letter-spacing:-.015em;overflow-wrap:anywhere}
  .island-nav-map .island-nav-place{font-size:.75rem;letter-spacing:0}
  .island-nav-map a:hover,.island-nav-map a[aria-current="page"]{background:var(--accent-soft,var(--panel,#fffdf0));border-color:var(--accent,var(--ink,#14334b))}
  .island-nav-map a[aria-current="page"] strong:after{content:' · Here';font:600 .75rem var(--body,sans-serif)}
  .island-nav-map .island-nav-secondary{min-height:52px;padding:10px 12px;align-content:center}
  .island-nav[data-island-route="home"] .island-nav-dock,.island-nav:not([data-island-route="home"]) .island-nav-destinations{display:none}
  .island-nav:not([data-island-route="home"]) .island-nav-dock{display:flex}
  .island-nav[data-island-route="home"][data-island-home-mode="compact"] .island-nav-destinations{display:none}
  .island-nav[data-island-route="home"][data-island-home-mode="compact"] .island-nav-dock{display:flex}
  .island-nav[data-island-route="home"][data-island-home-mode="compact"] .island-nav-home{display:none}
  .island-nav a:focus-visible,.island-nav button:focus-visible{outline:3px solid var(--accent,#08628b);outline-offset:4px;background:var(--panel,#fffdf0)}
  .island-nav-marker:focus-visible strong{color:var(--ink,#14334b);text-shadow:none}
  .island-nav[data-island-theme="contrast"] a,.island-nav[data-island-theme="contrast"] button,.island-nav[data-island-theme="contrast"] .island-nav-overlay{background:var(--panel,#000);border-color:var(--ink,#fff);backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}
  .island-nav[data-island-theme="contrast"] .island-nav-place,.island-nav[data-island-theme="contrast"] .island-nav-caption span{color:var(--ink,#fff)}
  .island-nav[data-island-theme="contrast"] .island-nav-marker strong{color:var(--ink,#fff);text-shadow:none}
  @media(max-width:900px),(max-height:600px){
    .island-nav[data-island-route="home"] .island-nav-destinations{display:none}
    .island-nav[data-island-route="home"] .island-nav-dock{display:flex}
    .island-nav[data-island-route="home"] .island-nav-home{display:none}
    .island-nav-dock{left:max(14px,env(safe-area-inset-left));bottom:max(14px,env(safe-area-inset-bottom));gap:6px;max-width:calc(100vw - 28px)}
    .island-nav-home,.island-nav-toggle{font-size:.75rem;padding:9px 11px;gap:6px}
    .island-nav-overlay{left:max(14px,env(safe-area-inset-left));bottom:calc(max(14px,env(safe-area-inset-bottom)) + 56px);width:min(440px,calc(100vw - 28px));padding:16px;max-height:calc(100dvh - 100px)}
  }
  @media(max-width:360px){.island-nav-map{grid-template-columns:minmax(0,1fr)}.island-nav-map a{min-height:64px}}
  @media(prefers-reduced-motion:reduce){:root:not([data-gp-motion="full"]) .island-nav *{transition:none!important}}
  @media(prefers-reduced-transparency:reduce){.island-nav-home,.island-nav-toggle,.island-nav-overlay,.island-nav-map a,.island-nav-marker .island-nav-place{background:var(--panel,#fffdf0);backdrop-filter:none;-webkit-backdrop-filter:none}}
  @media(forced-colors:active){.island-nav a,.island-nav button,.island-nav-overlay{background:Canvas!important;color:CanvasText!important;border-color:CanvasText!important;backdrop-filter:none;-webkit-backdrop-filter:none}.island-nav-place,.island-nav-caption span,.island-nav-marker strong{color:CanvasText!important;text-shadow:none!important}.island-nav-marker:after{background:Canvas;border-color:CanvasText;box-shadow:none}}
  `;

  function routeKey(value) {
    const key = String(value || 'home').replace(/^#/, '').split(/[\-?&/]/)[0];
    return ['home','create','explore','game','maker','group','wallet','ledger','economy','business'].includes(key) ? key : 'home';
  }
  function destinationLink(destination, marker) {
    const link = document.createElement('a');
    link.href = '#' + destination.route; link.dataset.nav = destination.route;
    link.dataset.island = destination.island;
    link.className = (marker ? 'island-nav-marker ' : '') + (destination.secondary ? 'island-nav-secondary' : 'island-nav-primary');
    const title = document.createElement('strong'); title.textContent = destination.label;
    const place = document.createElement('span'); place.className = 'island-nav-place'; place.textContent = destination.place;
    link.append(title,place); return link;
  }
  function mount(host) {
    if (!host || host.nodeType !== 1) return null;
    if (mounted.has(host)) return mounted.get(host);
    const root = document.documentElement, cleanups = [], owned = [];
    const previous = { className:host.className, route:host.getAttribute('data-island-route'), theme:host.getAttribute('data-island-theme'), homeMode:host.getAttribute('data-island-home-mode') };
    let dead = false, route = 'home', hero = null, heroObserver = null, homePanes = [];
    host.classList.add('island-nav'); host.dataset.islandRoute = route;
    const style = document.createElement('style'); style.textContent = CSS; host.appendChild(style); owned.push(style);
    const destinations = document.createElement('nav'); destinations.className = 'island-nav-destinations'; destinations.setAttribute('aria-label','Main');
    const markers = DESTINATIONS.map((destination) => { const link = destinationLink(destination,true); destinations.appendChild(link); return link; });
    host.appendChild(destinations); owned.push(destinations);
    const dock = document.createElement('div'); dock.className = 'island-nav-dock';
    const home = document.createElement('a'); home.className = 'island-nav-home'; home.href = '#home'; home.dataset.nav = 'home'; home.textContent = '← World map';
    const toggle = document.createElement('button'); toggle.className = 'island-nav-toggle'; toggle.type = 'button'; toggle.setAttribute('aria-expanded','false');
    const glyph = document.createElement('span'); glyph.className = 'island-nav-glyph'; glyph.setAttribute('aria-hidden','true');
    for (let n = 0; n < 4; n++) glyph.appendChild(document.createElement('i'));
    const toggleText = document.createElement('span'); toggleText.textContent = 'Visit island'; toggle.append(glyph,toggleText); dock.append(home,toggle);
    host.appendChild(dock); owned.push(dock);
    const panel = document.createElement('div'); panel.className = 'island-nav-overlay'; panel.hidden = true;
    let panelId = 'island-destination-map', suffix = 1;
    while (document.getElementById(panelId)) panelId = 'island-destination-map-' + suffix++;
    panel.id = panelId; toggle.setAttribute('aria-controls',panelId);
    const caption = document.createElement('p'); caption.className = 'island-nav-caption';
    const heading = document.createElement('strong'); heading.textContent = 'Where to next?';
    const help = document.createElement('span'); help.textContent = 'Choose an island. Your camera will follow.'; caption.append(heading,help);
    const map = document.createElement('nav'); map.className = 'island-nav-map'; map.setAttribute('aria-label','Main');
    const mapLinks = DESTINATIONS.map((destination) => { const link = destinationLink(destination,false); map.appendChild(link); return link; });
    panel.append(caption,map); host.appendChild(panel); owned.push(panel);
    const listen = (target,name,fn,options) => { target.addEventListener(name,fn,options); cleanups.push(() => target.removeEventListener(name,fn,options)); };
    function close(restoreFocus) {
      if (panel.hidden) return;
      panel.hidden = true; toggle.setAttribute('aria-expanded','false');
      if (restoreFocus && host.isConnected) toggle.focus({preventScroll:true});
    }
    function keepFocusVisible() {
      const active = document.activeElement;
      if (destinations.contains(active) && !active.getClientRects().length && toggle.getClientRects().length) toggle.focus({preventScroll:true});
      if (!toggle.getClientRects().length) {
        const ownedFocus = panel.contains(active) || active === toggle || active === home;
        close(false); if (ownedFocus && markers[0].getClientRects().length) markers[0].focus({preventScroll:true});
      }
    }
    function setHomeMode(compact) {
      if (dead) return;
      const next = compact ? 'compact' : 'map';
      if (host.dataset.islandHomeMode !== next) host.dataset.islandHomeMode = next;
      keepFocusVisible();
    }
    function syncHero() {
      if (dead) return;
      const next = route === 'home' ? document.querySelector('#view .pack .hero-copy') : null;
      const panes = next ? [...document.querySelectorAll('#view .pack > *, #view > :not(.pack):not(.pager)')] : [];
      if (hero !== next || panes.length !== homePanes.length || panes.some((pane,index) => pane !== homePanes[index])) {
        if (heroObserver) { heroObserver.disconnect(); panes.forEach((pane) => heroObserver.observe(pane)); }
        hero = next; homePanes = panes;
      }
      if (!hero) { setHomeMode(false); return; }
      const laterPaneVisible = homePanes.some((pane) => {
        if (pane === hero || !pane.getClientRects().length) return false;
        const bounds = pane.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
      });
      if (root.hasAttribute('data-fit')) { setHomeMode(!hero.getClientRects().length || laterPaneVisible); return; }
      const rect = hero.getBoundingClientRect();
      setHomeMode(laterPaneVisible || !hero.getClientRects().length || rect.top < 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth);
    }
    function resize() {
      if (dead) return;
      const bounds = host.getBoundingClientRect(), width = Math.max(1,bounds.width), height = Math.max(1,bounds.height);
      const scene = window.PPWorldBackground && window.PPWorldBackground.layout(width,height);
      markers.forEach((link,index) => {
        const destination = DESTINATIONS[index];
        const frame = scene && scene.frames[destination.island];
        const anchor = frame ? (destination.secondary ? frame.secondary : frame.anchor) : destination;
        link.style.setProperty('--island-x',(anchor.x * width).toFixed(3) + 'px');
        link.style.setProperty('--island-y',(anchor.y * height).toFixed(3) + 'px');
      });
      syncHero(); keepFocusVisible();
    }
    function retheme() {
      if (dead) return;
      const choice = root.getAttribute('data-gp-theme') || root.getAttribute('data-theme');
      host.dataset.islandTheme = choice === 'contrast' ? 'contrast' : choice === 'dark' ? 'dark' : 'light';
    }
    function setRoute(value) {
      if (dead) return;
      const next = routeKey(value), changed = next !== route;
      route = next; host.dataset.islandRoute = route;
      const selected = route === 'game' || route === 'group' ? 'explore' : route === 'maker' ? 'create' : route;
      [...markers,...mapLinks].forEach((link) => {
        if (link.dataset.nav === selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      });
      if (route === 'home') home.setAttribute('aria-current','page'); else home.removeAttribute('aria-current');
      if (changed) close(false); retheme(); syncHero();
    }
    function destroy() {
      if (dead) return; dead = true;
      cleanups.splice(0).forEach((fn) => fn()); owned.splice(0).forEach((node) => node.remove());
      if (!String(previous.className).split(/\s+/).includes('island-nav')) host.classList.remove('island-nav');
      if (previous.route === null) host.removeAttribute('data-island-route'); else host.setAttribute('data-island-route',previous.route);
      if (previous.theme === null) host.removeAttribute('data-island-theme'); else host.setAttribute('data-island-theme',previous.theme);
      if (previous.homeMode === null) host.removeAttribute('data-island-home-mode'); else host.setAttribute('data-island-home-mode',previous.homeMode);
      if (mounted.get(host) === handle) mounted.delete(host);
    }
    const handle = Object.freeze({setRoute,retheme,destroy}); mounted.set(host,handle);
    listen(toggle,'click',() => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded',String(!panel.hidden)); });
    listen(host,'click',(event) => { if (event.target.closest('[data-nav]')) close(true); });
    listen(document,'click',(event) => { if (!panel.hidden && !host.contains(event.target)) close(false); });
    listen(document,'keydown',(event) => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); } });
    listen(document,'focusin',(event) => { if (!panel.hidden && !host.contains(event.target)) close(false); });
    if (window.ResizeObserver) { const observer = new ResizeObserver(resize); observer.observe(host); cleanups.push(() => observer.disconnect()); }
    else listen(window,'resize',resize,{passive:true});
    if (window.IntersectionObserver) {
      heroObserver = new IntersectionObserver((entries) => {
        if (dead || route !== 'home') return;
        if (entries.some((entry) => homePanes.includes(entry.target))) syncHero();
      },{threshold:[0,.1,.25,.5,.75,.9,1]});
      cleanups.push(() => heroObserver.disconnect());
    } else listen(window,'scroll',syncHero,{passive:true});
    if (window.MutationObserver) {
      const observer = new MutationObserver((records) => {
        if (records.some((record) => record.target === root)) retheme();
        if (records.some((record) => record.type === 'childList' || record.target === root || record.target.nodeType === 1 && record.target.closest('#view'))) syncHero();
      });
      observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gp-theme','data-theme','data-fit','class']}); cleanups.push(() => observer.disconnect());
    }
    resize(); setRoute('home'); return handle;
  }
  window.PPWorldNavigation = Object.freeze({mount});
})();
