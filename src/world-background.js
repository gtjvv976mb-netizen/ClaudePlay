/* Persistent HD world made from independent alpha images. No route content,
   game documents, GPU context or per-frame JavaScript is owned here. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  const ISLANDS = Object.freeze(['forest','castle','race','city']);
  const ROUTES = Object.freeze({
    home:'overview', explore:'castle', create:'forest', game:'city', maker:'forest',
    group:'castle', wallet:'race', ledger:'city', economy:'race', business:'castle',
  });
  // Each frame contains a complete standalone image, never a slice of an atlas.
  // Navigation shares these exact frames so island labels cannot drift on resize.
  function layout(width, height) {
    const compact = width <= 900 || height <= 600;
    const values = compact
      ? [[.02,.10,.46,.35],[.52,.10,.46,.35],[.02,.53,.46,.35],[.52,.53,.46,.35]]
      : [[.39,.05,.28,.43],[.69,.05,.29,.43],[.39,.51,.28,.43],[.69,.51,.29,.43]];
    const frames = {};
    ISLANDS.forEach((name,i) => {
      const [x,y,w,h] = values[i];
      frames[name] = Object.freeze({ x,y,width:w,height:h,
        anchor:Object.freeze({x:x+w/2,y:y+h*.48}),
        secondary:Object.freeze({x:x+w/2,y:y+h*.12}) });
    });
    return Object.freeze({compact,frames:Object.freeze(frames)});
  }
  const CSS = `
  .world-background{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;contain:strict;background:#77c7ee;isolation:isolate}
  .world-background *{pointer-events:none;box-sizing:border-box}
  .world-background .world-viewport,.world-background .world-atlas{position:absolute;inset:0;overflow:hidden}
  .world-background .world-camera{position:absolute;inset:0;transform-origin:0 0;will-change:transform}
  .world-background .world-atlas{overflow:visible}
  .world-background .world-sky{position:absolute;inset:0;background:radial-gradient(ellipse at 72% 20%,#d9f5ff90,transparent 55%),linear-gradient(180deg,#5aaede 0%,#9ad9f2 48%,#e3f4f9 100%)}
  .world-background .world-sky img{width:100%;height:100%;display:block;object-fit:cover;image-rendering:auto}
  .world-background .world-island{position:absolute;z-index:1;opacity:1;transition:opacity 480ms ease}
  .world-background .world-island-float{position:absolute;inset:0;animation:world-island-float var(--world-period,9s) ease-in-out infinite alternate;animation-delay:var(--world-delay,-3s);will-change:transform}
  .world-background .world-island-art{position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;object-fit:contain;image-rendering:auto}
  .world-background[data-world-island]:not([data-world-island="overview"]) .world-island:not([data-world-selected]){opacity:.10}
  .world-background .world-clouds-back,.world-background .world-clouds-front,.world-background .world-flights{position:absolute;inset:0}
  .world-background .world-clouds-back{z-index:0;opacity:.70}
  .world-background .world-camera{z-index:1}
  .world-background .world-flights{z-index:2}
  .world-background .world-clouds-front{z-index:3;opacity:.52}
  .world-background .world-cloud{position:absolute;left:0;width:var(--cloud-width,15%);aspect-ratio:2.3;animation:world-cloud-drift var(--cloud-period,110s) linear infinite;animation-delay:var(--cloud-delay,-30s);will-change:transform}
  .world-background .world-cloud-art,.world-background .world-craft{display:block;width:100%;height:100%;object-fit:contain;image-rendering:auto}
  .world-background .world-vehicle{position:absolute;left:0;top:var(--flight-y,18%);width:clamp(90px,10vw,210px);aspect-ratio:1.8;animation:world-flight var(--flight-period,72s) linear infinite;animation-delay:var(--flight-delay,-25s);will-change:transform}
  .world-background .world-vehicle.reverse{animation-name:world-flight-return}
  .world-background .world-craft{animation:world-craft-bob 3.8s ease-in-out infinite alternate;filter:drop-shadow(0 6px 8px #28475b22)}
  .world-background .world-wash{position:absolute;inset:0;z-index:6;background:#fff6df;opacity:.035;transition:opacity 180ms linear}
  .world-background[data-world-theme="dark"] .world-wash{background:#0b2038;opacity:.23}
  .world-background[data-world-theme="dark"]{background:#294c6b}
  .world-background[data-world-theme="contrast"]{background:#000}
  .world-background[data-world-theme="contrast"] .world-viewport,.world-background[data-world-theme="contrast"] .world-wash{visibility:hidden}
  .world-background[data-world-motion="paused"] *{animation-play-state:paused!important}
  .world-background[data-world-motion="static"] *{animation:none!important;transition:none!important;will-change:auto!important}
  .world-background[data-world-motion="static"] .world-vehicle{opacity:0}
  @keyframes world-island-float{from{transform:translate3d(0,calc(var(--world-float,7px) * -1),0) rotate(-.09deg)}to{transform:translate3d(0,var(--world-float,7px),0) rotate(.09deg)}}
  @keyframes world-cloud-drift{from{transform:translate3d(-180%,0,0)}to{transform:translate3d(900%,0,0)}}
  @keyframes world-flight{0%{transform:translate3d(-180%,-25%,0) rotate(-4deg)}22%{transform:translate3d(calc(22vw - 60%),55%,0) rotate(3deg)}54%{transform:translate3d(calc(54vw - 20%),-45%,0) rotate(-3deg)}78%{transform:translate3d(calc(78vw + 20%),18%,0) rotate(2deg)}100%{transform:translate3d(calc(100vw + 180%),-25%,0) rotate(-4deg)}}
  @keyframes world-flight-return{0%{transform:translate3d(calc(100vw + 180%),15%,0) scaleX(-1) rotate(3deg)}30%{transform:translate3d(calc(70vw + 50%),-40%,0) scaleX(-1) rotate(-3deg)}65%{transform:translate3d(calc(35vw - 50%),60%,0) scaleX(-1) rotate(4deg)}100%{transform:translate3d(-180%,15%,0) scaleX(-1) rotate(3deg)}}
  @keyframes world-craft-bob{from{translate:0 -3px}to{translate:0 3px}}
  @media(max-width:900px),(max-height:600px){.world-background .world-vehicle{width:clamp(68px,18vw,160px)}.world-background .world-cloud{width:calc(var(--cloud-width,15%) * 1.65)}}
  @media(prefers-reduced-motion:reduce){:root:not([data-gp-motion="full"]) .world-background *{animation:none!important;transition:none!important;will-change:auto!important}}
  @media(forced-colors:active),(prefers-contrast:more){.world-background *{animation:none!important;transition:none!important;will-change:auto!important}}
  @media(forced-colors:active){.world-background{background:Canvas}.world-background .world-viewport,.world-background .world-wash{visibility:hidden}}
  `;

  function element(name, parent) {
    const node = document.createElement('div'); node.className = name;
    if (parent) parent.appendChild(node);
    return node;
  }
  function routeKey(value) {
    const key = String(value || 'home').replace(/^#/, '').split(/[\-?&/]/)[0];
    return Object.prototype.hasOwnProperty.call(ROUTES, key) ? key : 'home';
  }
  function mount(host, options = {}) {
    if (!host || host.nodeType !== 1) return null;
    if (mounted.has(host)) return mounted.get(host);
    const root = document.documentElement;
    const cleanups = [], owned = [], prior = { hidden: host.getAttribute('aria-hidden'), className: host.className };
    const assets = options.assets || window.GP_WORLD_ASSETS || {};
    const query = (value) => window.matchMedia ? window.matchMedia(value) : null;
    const reduced = query('(prefers-reduced-motion: reduce)'), forced = query('(forced-colors: active)');
    const contrast = query('(prefers-contrast: more)'), dark = query('(prefers-color-scheme: dark)');
    let dead = false, requestedReduce = !!options.reducedMotion, visible = true, route = 'home', cameraAnimation = null, cameraFinish = null;
    let width = 1, height = 1, scene = layout(1,1), geometry = null;
    const listen = (target, name, fn, settings) => { target.addEventListener(name, fn, settings); cleanups.push(() => target.removeEventListener(name, fn, settings)); };
    host.classList.add('world-background'); host.setAttribute('aria-hidden', 'true');
    const style = document.createElement('style'); style.textContent = CSS; host.appendChild(style); owned.push(style);
    const viewport = element('world-viewport', host); owned.push(viewport);
    const sky = element('world-sky', viewport);
    const image = (className, parent, key) => {
      const node = document.createElement('img'); node.className = className; node.alt = ''; node.decoding = 'async'; node.draggable = false;
      const asset = assets[key];
      // Width descriptors let a static host add smaller variants without changing
      // this renderer. Artifacts use their self-contained single data image.
      if (asset && typeof asset === 'object') { node.src = asset.src; if (asset.srcset) { node.srcset = asset.srcset; node.sizes = asset.sizes || '100vw'; } }
      else node.src = asset || ('world-hd/' + (ISLANDS.includes(key) ? 'island-' + key : key === 'car' ? 'flying-car' : key) + '.webp');
      parent.appendChild(node); return node;
    };
    if (assets.sky) image('world-sky-art', sky, 'sky');
    const back = element('world-clouds-back', viewport);
    const camera = element('world-camera', viewport), atlas = element('world-atlas', camera), islands = {}, islandArt = {};
    ISLANDS.forEach((name,i) => {
      const island = islands[name] = element('world-island world-island-' + name, atlas);
      island.dataset.worldAsset = name;
      island.style.setProperty('--world-period',[9.7,11.8,10.9,12.4][i] + 's');
      island.style.setProperty('--world-delay',[-4.4,-8,-2.1,-6.2][i] + 's');
      island.style.setProperty('--world-float',[7,5,8,6][i] + 'px');
      islandArt[name] = image('world-island-art',element('world-island-float',island),name);
      listen(islandArt[name],'load',resize);
    });
    const clouds = (parent, values) => values.forEach(([top, cloudWidth, seconds, delay]) => {
      const cloud = element('world-cloud', parent); cloud.style.top = top + '%';
      cloud.style.setProperty('--cloud-width',cloudWidth + '%'); cloud.style.setProperty('--cloud-period',seconds + 's'); cloud.style.setProperty('--cloud-delay',delay + 's');
      image('world-cloud-art',cloud,'cloud');
    });
    clouds(back,[[8,14,154,-102],[36,17,178,-47],[68,19,201,-139]]);
    const flights = element('world-flights',viewport);
    [[23,76,-28,false],[9,118,-73,true],[48,93,-12,false]].forEach(([y,seconds,delay,reverse]) => {
      const flight = element('world-vehicle' + (reverse ? ' reverse' : ''),flights);
      flight.style.setProperty('--flight-y',y + '%'); flight.style.setProperty('--flight-period',seconds + 's'); flight.style.setProperty('--flight-delay',delay + 's');
      image('world-craft',flight,'car');
    });
    clouds(element('world-clouds-front',viewport),[[84,24,158,-71],[54,14,127,-99]]);
    owned.push(element('world-wash',host));

    const theme = () => {
      const choice = root.getAttribute('data-gp-theme') || root.getAttribute('data-theme');
      if (choice === 'contrast' || (forced && forced.matches) || (contrast && contrast.matches)) return 'contrast';
      if (choice === 'dark' || (!choice && dark && dark.matches)) return 'dark';
      return 'light';
    };
    const calm = () => requestedReduce || root.getAttribute('data-gp-motion') === 'reduce' || (root.getAttribute('data-gp-motion') !== 'full' && !!(reduced && reduced.matches)) || theme() === 'contrast';
    const focused = () => {
      const active = document.activeElement;
      return active && (/^(IFRAME|INPUT|TEXTAREA|SELECT)$/.test(active.tagName) || active.isContentEditable);
    };
    const blocked = () => document.hidden || !visible || focused() || !!document.querySelector('[role="dialog"][aria-modal="true"],dialog[open]');
    const cancelCamera = () => {
      if (cameraAnimation) { if (cameraFinish) cameraAnimation.removeEventListener('finish',cameraFinish); cameraAnimation.cancel(); }
      cameraAnimation = null; cameraFinish = null;
    };
    function cameraTarget() {
      const island = ROUTES[route], frame = scene.frames[island];
      let zoom = 1, x = 0, y = 0;
      if (frame) {
        // Fit the entire image frame with room for its ambient float. Wide screens
        // reserve the left tool area; compact screens center the complete island.
        const fitWidth = width * (scene.compact ? .94 : .50) - 32;
        const fitHeight = height * (scene.compact ? .70 : .78) - 32;
        zoom = Math.max(.1,Math.min(fitWidth / (frame.width * width),fitHeight / (frame.height * height)));
        const art = islandArt[island];
        if (art.naturalWidth && art.naturalHeight) {
          const sourceScale = Math.min(frame.width * width / art.naturalWidth,frame.height * height / art.naturalHeight);
          zoom = Math.min(zoom,1 / sourceScale);
        }
        const centerX = width * (scene.compact ? .50 : .72), centerY = height * (scene.compact ? .54 : .51);
        x = centerX - (frame.x + frame.width / 2) * width * zoom;
        y = centerY - (frame.y + frame.height / 2) * height * zoom;
      }
      ISLANDS.forEach((name) => { if (name === island) islands[name].setAttribute('data-world-selected',''); else islands[name].removeAttribute('data-world-selected'); });
      host.dataset.worldRoute = route; host.dataset.worldIsland = island; host.dataset.worldZoom = zoom.toFixed(6);
      camera.style.setProperty('--world-x',x.toFixed(3) + 'px'); camera.style.setProperty('--world-y',y.toFixed(3) + 'px'); camera.style.setProperty('--world-zoom',String(zoom));
      geometry = Object.freeze({width,height,route,island,zoom,x,y,compact:scene.compact,frames:scene.frames});
      return 'translate3d(' + x.toFixed(3) + 'px,' + y.toFixed(3) + 'px,0) scale(' + zoom + ')';
    }
    function updateState() {
      if (dead) return;
      if (!host.isConnected) { stop(); return; }
      host.dataset.worldTheme = theme();
      const state = calm() ? 'static' : blocked() ? 'paused' : 'running'; host.dataset.worldMotion = state;
      if (cameraAnimation) {
        if (state === 'static') cancelCamera();
        else if (state === 'paused') cameraAnimation.pause();
        else if (cameraAnimation.playState === 'paused') cameraAnimation.play();
      }
    }
    function resize() {
      if (dead) return;
      const bounds = host.getBoundingClientRect(); width = Math.max(1,bounds.width); height = Math.max(1,bounds.height); scene = layout(width,height);
      ISLANDS.forEach((name) => { const frame = scene.frames[name]; Object.assign(islands[name].style,{left:frame.x*100+'%',top:frame.y*100+'%',width:frame.width*100+'%',height:frame.height*100+'%'}); });
      cancelCamera(); camera.style.transform = cameraTarget(); updateState();
    }
    function setRoute(value) {
      if (dead) return;
      const next = routeKey(value); if (next === route) return;
      const previous = getComputedStyle(camera).transform;
      cancelCamera(); route = next;
      const target = cameraTarget(); camera.style.transform = target; updateState();
      if (!calm() && !blocked() && camera.animate && previous !== 'none') {
        cameraAnimation = camera.animate([{transform:previous},{transform:target}],{duration:1450,easing:'cubic-bezier(.22,.68,.2,1)',fill:'none'});
        const animation = cameraAnimation;
        cameraFinish = () => { animation.removeEventListener('finish',cameraFinish); if (cameraAnimation === animation) { cameraAnimation = null; cameraFinish = null; } };
        animation.addEventListener('finish',cameraFinish);
      }
    }
    function retheme() { updateState(); }
    function setMotion(value) { if (!dead) { requestedReduce = !!value; updateState(); } }
    function stop() {
      if (dead) return; dead = true; cancelCamera(); cleanups.splice(0).forEach((fn) => fn()); owned.splice(0).forEach((node) => node.remove());
      ['worldMotion','worldTheme','worldRoute','worldIsland','worldZoom'].forEach((name) => { delete host.dataset[name]; });
      if (prior.hidden === null) host.removeAttribute('aria-hidden'); else host.setAttribute('aria-hidden',prior.hidden);
      if (!String(prior.className).split(/\s+/).includes('world-background')) host.classList.remove('world-background');
      if (mounted.get(host) === handle) mounted.delete(host);
    }
    const handle = Object.freeze({setRoute,setMotion,retheme,stop,destroy:stop,getGeometry:() => geometry}); mounted.set(host,handle);
    listen(document,'visibilitychange',updateState); listen(document,'focusin',updateState); listen(document,'focusout',() => queueMicrotask(updateState));
    listen(window,'blur',() => queueMicrotask(updateState)); listen(window,'focus',updateState);
    [reduced,forced,contrast,dark].filter(Boolean).forEach((media) => {
      if (media.addEventListener) listen(media,'change',updateState);
      else if (media.addListener) { media.addListener(updateState); cleanups.push(() => media.removeListener(updateState)); }
    });
    if (window.ResizeObserver) { const observer = new ResizeObserver(resize); observer.observe(host); cleanups.push(() => observer.disconnect()); }
    else listen(window,'resize',resize,{passive:true});
    if (window.IntersectionObserver) { const observer = new IntersectionObserver((entries) => { visible = !!entries[0].isIntersecting; updateState(); }); observer.observe(host); cleanups.push(() => observer.disconnect()); }
    if (window.MutationObserver) {
      const observer = new MutationObserver((records) => {
        if (dead) return;
        if (!host.isConnected) { stop(); return; }
        if (records.some((record) => record.type === 'childList' || record.target === root || record.attributeName === 'open' || record.attributeName === 'aria-modal' || record.attributeName === 'role')) updateState();
      });
      observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gp-theme','data-theme','data-gp-motion','open','aria-modal','role']}); cleanups.push(() => observer.disconnect());
    }
    resize(); return handle;
  }
  window.PPWorldBackground = Object.freeze({mount,layout});
})();
