/* Persistent decorative pixel world. Images are supplied by the self-contained build.
   No route content, game documents, GPU context or per-frame JavaScript is owned here. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  const RATIO = 1672 / 941;
  const pixels = (points) => points.map(([x,y]) => [x / 1672 * 100,y / 941 * 100]);
  const ROUTES = Object.freeze({
    home:     { island: 'overview', x: .50, y: .50, zoom: 1,    focus: .50 },
    explore:  { island: 'castle',   x: .87, y: .29, zoom: 1.60, focus: .70 },
    create:   { island: 'forest',   x: .55, y: .29, zoom: 1.75, focus: .70 },
    game:     { island: 'city',     x: .86, y: .73, zoom: 1.75, focus: .70 },
    maker:    { island: 'forest',   x: .48, y: .30, zoom: 1.65, focus: .68 },
    group:    { island: 'castle',   x: .83, y: .30, zoom: 1.80, focus: .68 },
    wallet:   { island: 'race',     x: .48, y: .72, zoom: 1.70, focus: .70 },
    ledger:   { island: 'city',     x: .89, y: .77, zoom: 1.85, focus: .68 },
    economy:  { island: 'race',     x: .49, y: .69, zoom: 1.55, focus: .70 },
    business: { island: 'castle',   x: .89, y: .26, zoom: 1.95, focus: .72 },
  });
  const CSS = `
  .world-background{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;contain:strict;background:#77c7ee;isolation:isolate}
  .world-background *{pointer-events:none;box-sizing:border-box}
  .world-background .world-viewport,.world-background .world-atlas{position:absolute;inset:0;overflow:hidden}
  .world-background .world-camera{position:absolute;left:50%;top:50%;transform-origin:50% 50%;will-change:transform}
  .world-background .world-atlas{overflow:visible}
  .world-background .world-sky{position:absolute;inset:-5%;background-image:var(--world-sky,var(--world-art));background-size:100% 100%;background-repeat:no-repeat}
  .world-background .world-still{position:absolute;inset:0;background-image:var(--world-art);background-size:100% 100%}
  .world-background .world-island{position:absolute}
  .world-background .world-island-float,.world-background .world-island-art{position:absolute;inset:0}
  .world-background .world-island-float{animation:world-island-float var(--world-period,9s) ease-in-out infinite alternate;animation-delay:var(--world-delay,-3s);will-change:transform}
  .world-background .world-island-art{background-image:var(--world-art);background-repeat:no-repeat}
  .world-background .world-clouds-back,.world-background .world-clouds-front,.world-background .world-flights,.world-background .world-waterfalls,.world-background .world-sparks{position:absolute;inset:0}
  .world-background .world-clouds-back{z-index:0;opacity:.68}
  .world-background .world-island{z-index:1}
  .world-background .world-waterfalls,.world-background .world-sparks{z-index:2}
  .world-background .world-flights{z-index:3}
  .world-background .world-clouds-front{z-index:4;opacity:.64}
  .world-background .world-cloud{position:absolute;width:var(--cloud-width,9%);height:2.8%;background:#f8fcff;box-shadow:14px 9px 0 #e6f2fc,-12px 5px 0 #f8fcff;animation:world-cloud-drift var(--cloud-period,110s) linear infinite;animation-delay:var(--cloud-delay,-30s);will-change:transform}
  .world-background .world-cloud:before,.world-background .world-cloud:after{content:'';position:absolute;background:inherit;bottom:95%;width:41%;height:85%;left:13%;box-shadow:10px -6px 0 #f8fcff}
  .world-background .world-cloud:after{left:49%;width:30%;height:140%;box-shadow:none}
  .world-background .world-vehicle{position:absolute;left:0;top:var(--flight-y,18%);width:7%;height:7%;animation:world-flight var(--flight-period,72s) linear infinite;animation-delay:var(--flight-delay,-25s);will-change:transform}
  .world-background .world-vehicle.reverse{animation-name:world-flight-return}
  .world-background .world-craft{position:absolute;inset:0;animation:world-craft-bob 3.8s ease-in-out infinite alternate;filter:drop-shadow(0 5px 0 #28475b22)}
  .world-background .world-craft.hoverskiff{width:80%;height:43%;left:10%;top:36%;background:#f7794b;clip-path:polygon(0 39%,14% 39%,14% 19%,39% 19%,39% 0,65% 0,65% 20%,88% 20%,88% 40%,100% 40%,100% 80%,84% 80%,84% 100%,16% 100%,16% 80%,0 80%)}
  .world-background .world-craft.hoverskiff:before{content:'';position:absolute;left:43%;top:2%;width:21%;height:32%;background:#a0e8ff;box-shadow:-17px 9px 0 #fff4bc,13px 11px 0 #fff4bc,0 26px 0 #ffe4a5}
  .world-background .world-craft.hoverskiff:after{content:'';position:absolute;left:21%;right:14%;bottom:10%;height:15%;background:#526b88;box-shadow:0 4px 0 #bbeaff}
  .world-background .world-craft.airship{width:95%;height:55%;top:10%;background:#fff4c8;clip-path:polygon(0 35%,11% 35%,11% 16%,27% 16%,27% 0,73% 0,73% 16%,89% 16%,89% 35%,100% 35%,100% 67%,89% 67%,89% 84%,62% 84%,62% 100%,38% 100%,38% 84%,11% 84%,11% 67%,0 67%)}
  .world-background .world-craft.airship:before{content:'';position:absolute;left:25%;top:0;bottom:15%;width:12%;background:#efa666;box-shadow:26px 0 0 #efa666}
  .world-background .world-craft.airship:after{content:'';position:absolute;left:37%;bottom:0;width:27%;height:20%;background:#547d98;box-shadow:0 -3px 0 #92d9eb}
  .world-background .world-craft.glider{width:96%;height:52%;top:22%;background:#63dce4;clip-path:polygon(0 40%,35% 40%,43% 0,56% 0,64% 40%,100% 40%,100% 62%,64% 62%,56% 100%,43% 100%,35% 62%,0 62%)}
  .world-background .world-craft.glider:after{content:'';position:absolute;left:43%;top:31%;width:15%;height:38%;background:#f8f1be}
  .world-background .world-waterfall{position:absolute;width:.35%;height:var(--fall-height,12%);opacity:.72;background:repeating-linear-gradient(180deg,#d5fbff00 0 9px,#e1ffff 9px 14px,#d5fbff00 14px 31px);animation:world-waterfall 1.7s linear infinite;mask-image:linear-gradient(transparent,#000 17%,#000 83%,transparent)}
  .world-background .world-spark{position:absolute;width:.48%;aspect-ratio:1;background:#fff2a8;clip-path:polygon(36% 0,64% 0,64% 36%,100% 36%,100% 64%,64% 64%,64% 100%,36% 100%,36% 64%,0 64%,0 36%,36% 36%);animation:world-spark 4s ease-in-out infinite;animation-delay:var(--spark-delay,-1s)}
  .world-background .world-wash{position:absolute;inset:0;z-index:6;background:#fff6df;opacity:.045;transition:opacity 180ms linear}
  .world-background[data-world-theme="dark"] .world-wash{background:#0b2038;opacity:.23}
  .world-background[data-world-theme="dark"]{background:#294c6b}
  .world-background[data-world-theme="contrast"]{background:#000}
  .world-background[data-world-theme="contrast"] .world-viewport,.world-background[data-world-theme="contrast"] .world-wash{visibility:hidden}
  .world-background[data-world-motion="paused"] *{animation-play-state:paused!important}
  .world-background[data-world-motion="static"] *{animation:none!important;transition:none!important;will-change:auto!important}
  .world-background[data-world-motion="static"] .world-vehicle{opacity:0}
  @keyframes world-island-float{from{transform:translate3d(0,calc(var(--world-float,7px) * -1),0) rotate(-.09deg)}to{transform:translate3d(0,var(--world-float,7px),0) rotate(.09deg)}}
  @keyframes world-cloud-drift{from{transform:translate3d(-180%,0,0)}to{transform:translate3d(1350%,0,0)}}
  @keyframes world-flight{0%{transform:translate3d(-180%,-25%,0) rotate(-4deg)}22%{transform:translate3d(260%,55%,0) rotate(3deg)}54%{transform:translate3d(780%,-45%,0) rotate(-3deg)}78%{transform:translate3d(1120%,18%,0) rotate(2deg)}100%{transform:translate3d(1600%,-25%,0) rotate(-4deg)}}
  @keyframes world-flight-return{0%{transform:translate3d(1600%,15%,0) scaleX(-1) rotate(3deg)}30%{transform:translate3d(1100%,-40%,0) scaleX(-1) rotate(-3deg)}65%{transform:translate3d(500%,60%,0) scaleX(-1) rotate(4deg)}100%{transform:translate3d(-180%,15%,0) scaleX(-1) rotate(3deg)}}
  @keyframes world-craft-bob{from{translate:0 -3px}to{translate:0 3px}}
  @keyframes world-waterfall{to{background-position:0 62px}}
  @keyframes world-spark{0%,65%,100%{opacity:0;transform:scale(.4) translateY(3px)}23%,43%{opacity:.85;transform:scale(1) translateY(-3px)}}
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
    const query = (value) => window.matchMedia ? window.matchMedia(value) : null;
    const reduced = query('(prefers-reduced-motion: reduce)'), forced = query('(forced-colors: active)');
    const contrast = query('(prefers-contrast: more)'), dark = query('(prefers-color-scheme: dark)');
    let dead = false, requestedReduce = !!options.reducedMotion, visible = true, route = 'home', cameraAnimation = null, cameraFinish = null;
    let width = 1, height = 1, atlasWidth = 1, atlasHeight = 1;
    host.classList.add('world-background'); host.setAttribute('aria-hidden', 'true');
    const style = document.createElement('style'); style.textContent = CSS; host.appendChild(style); owned.push(style);
    const viewport = element('world-viewport', host), camera = element('world-camera', viewport), atlas = element('world-atlas', camera);
    owned.push(viewport);
    const sky = element('world-sky', atlas);
    const clipped = !window.CSS || !window.CSS.supports || window.CSS.supports('clip-path', 'polygon(0 0,100% 0,100% 100%)');
    const back = element('world-clouds-back', atlas);
    const fragment = (name, bounds, points, period, delay, amount) => {
      const island = element('world-island world-island-' + name, atlas);
      const [x, y, w, h] = bounds;
      Object.assign(island.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
      island.style.setProperty('--world-period', period + 's'); island.style.setProperty('--world-delay', delay + 's'); island.style.setProperty('--world-float', amount + 'px');
      const float = element('world-island-float', island), art = element('world-island-art', float);
      art.style.backgroundSize = (10000 / w) + '% ' + (10000 / h) + '%';
      art.style.backgroundPosition = (x / (100 - w) * 100) + '% ' + (y / (100 - h) * 100) + '%';
      const contour = points.map(([px,py]) => [((px-x)/w*100).toFixed(3),((py-y)/h*100).toFixed(3)]);
      art.style.clipPath = 'polygon(' + contour.map(([px,py]) => px + '% ' + py + '%').join(',') + ')';
      // Feather only the runtime silhouette edge by roughly one original pixel.
      // The texture remains the accepted, byte-identical original illustration.
      const mask = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><filter id="edge" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".14"/></filter></defs><polygon fill="white" filter="url(#edge)" points="' + contour.map((point) => point.join(',')).join(' ') + '"/></svg>';
      const maskUrl = 'url("data:image/svg+xml,' + encodeURIComponent(mask) + '")';
      art.style.maskImage = maskUrl; art.style.webkitMaskImage = maskUrl; art.style.maskSize = art.style.webkitMaskSize = '100% 100%';
      return island;
    };
    if (clipped) {
      fragment('forest', [39, 2, 34, 55], [
        [39.9,28],[40.6,24],[42,24],[42,20],[41.7,16],[41.9,12],[43,8],[44.7,7],[44.9,4],[47,3.7],[48.8,4.8],[49.1,8],[51,8.9],[51.9,12],[51.2,16],[52.2,18],[53.9,20],[54.3,24.4],[55,25.3],[55,31.4],[57.2,33.2],[58.1,28],[59,26],[60.8,25.4],[61.2,19],[62,14],[63,13],[63,10],[65,8.9],[66.3,9.7],[66.6,13.5],[67.4,14.3],[67.4,6.4],[68,6.4],[68.4,9.3],[68,9.4],[68,14.5],[69.1,14.1],[69,21],[69.1,24.9],[71.9,25.7],[72.2,29],
        ...pixels([[1202,282],[1198,320],[1196,336],[1187,335],[1183,351],[1168,357],[1192,379],[1195,397],[1189,411],[1174,426],[1158,426],[1153,439],[1134,446],[1134,450],[1118,450],[1110,465],[1094,461],[1093,469],[1080,473],[1063,472],[1064,482],[1056,492],[1048,489],[1048,499],[1039,506],[1034,491],[1022,490],[1017,489],[1005,494],[1000,486],[986,493],[978,508],[961,510],[949,527],[929,532],[929,513],[919,521],[909,513],[899,506],[898,498],[886,500],[873,485],[865,482],[856,471],[842,469],[835,465],[829,472],[828,482],[817,490],[810,478],[800,472],[793,450],[791,499],[756,499],[762,446],[751,439],[743,422],[731,421],[731,405],[713,390],[704,381],[696,379],[693,363],[681,358],[675,342],[675,332],[669,320],[667,303],[666,275]])
      ], 9.7, -4.4, 7);
      fragment('castle', [75.8, 1.5, 24.2, 57.5], [
        [76.5,36],[77.6,34],[77.3,28],[78.6,26],[80.2,25.2],[80.1,21],[80.9,18],[82.2,15],[84.3,14.1],[85.9,15],[86,12.3],[86.3,12.3],[86.3,8],[86.7,8],[86.7,12],[88,12.4],[88,18.4],[88.4,18.4],[88.4,8.9],[89.1,8.9],[89.1,2.2],[89.5,2.2],[89.7,4.1],[90.3,3.4],[90.7,4.3],[89.5,4.8],[89.5,5.8],[91,8.9],[91.1,15.5],[92,17],[92,12],[92.3,12],[92.3,8.5],[92.7,8.5],[92.7,12],[93.5,12.4],[93.5,18],[94.7,18.6],[95.5,17.5],[97,19],[97,22],[98.6,25],[99.8,28.8],[99,32],[98,34],[99.5,36.2],
        ...pixels([[1658,345],[1647,367],[1649,386],[1632,394],[1629,404],[1618,413],[1616,437],[1603,444],[1593,438],[1593,417],[1584,426],[1579,442],[1570,438],[1560,424],[1554,448],[1545,464],[1537,470],[1536,496],[1523,515],[1510,520],[1499,526],[1491,519],[1477,525],[1470,509],[1458,516],[1453,527],[1440,520],[1426,523],[1416,514],[1408,491],[1391,484],[1388,470],[1375,469],[1370,450],[1356,449],[1343,432],[1340,419],[1332,412],[1329,399],[1310,398],[1300,381],[1287,383],[1285,373],[1278,376],[1278,359],[1266,357],[1267,340]])
      ], 11.8, -8, 5);
      fragment('race', [33, 49.7, 32.1, 47], [
        [33.5,76],[33.9,71],[34.6,68],[35.4,64],[36.5,64],[36.7,58.7],[38.5,56.2],[39.2,51.6],[40.5,50.7],[41.7,52.4],[42.1,56],[43.4,54.8],[44.2,54],[46.1,53.4],[48.1,54.2],[50.2,57.9],[51.4,64.2],[53.6,63.8],[53.8,57.7],[54.7,55.6],[56.1,56.8],[57,59],[57.2,63],[58.4,63],[58.4,61.5],[60,61.4],
        ...pixels([[1001,582],[1003,610],[1000,632],[1022,654],[1030,645],[1033,650],[1032,666],[1044,668],[1050,683],[1050,703],[1038,701],[1035,716],[1024,724],[1019,751],[1006,762],[1000,773],[982,778],[981,794],[961,803],[958,813],[951,812],[950,825],[936,825],[935,846],[924,848],[924,866],[913,880],[909,864],[896,862],[895,839],[887,835],[886,823],[879,837],[860,845],[849,852],[824,856],[824,869],[809,873],[806,895],[790,903],[775,898],[760,885],[760,868],[752,857],[728,852],[690,835],[690,819],[665,813],[665,800],[642,795],[625,787],[617,793],[601,790],[591,779],[588,765],[576,760],[573,743],[574,730],[561,728],[561,717]])
      ], 10.9, -2.1, 8);
      fragment('city', [69.7, 45, 30.3, 55], [
        [70.2,80],[71.8,76],[72.6,72],[72.1,68],[73,65],[74.5,65.7],[75.1,64.7],[75.4,61],[76.8,58.8],[77.5,56.8],[79.9,56.4],[80.6,54.8],[81.4,51.5],[81.4,49.5],[81.8,49.5],[81.8,51.5],[82.6,53],[83.1,56.2],[83.1,58],[85.9,57.7],[87,59.2],[87,63],[89,61],[90.2,59],[91.1,56.8],[91.1,51.4],[91.5,51.4],[91.5,47.4],[91.9,47.4],[91.9,51.4],[92.6,52.3],[93.8,56],[94.5,54.4],[94.5,52],[94.9,52],[94.9,45.9],[95.2,45.9],[95.2,51.6],[96.2,52.5],[97,54],[96.4,57],[97.4,61],[98,65.4],[99.6,68],[100,69],[99.1,80],[98,86],[96.1,88],[95.4,91],[93,93.2],[90.2,94.6],[89.4,99.6],[86.8,100],[83,96.4],[80,94.7],[77,92.5],[73.8,90.4],[71.4,87]
      ], 12.4, -6.2, 6);
      // Two original stepping platforms stay between the large forest islands.
      fragment('steps', [52.8, 26.3, 5.4, 6.2], [[53.7,27.8],[55,27.5],[56.6,28.2],[56.8,29.3],[56.3,31.1],[54.4,32],[53.4,31],[53.5,29]], 7.4, -3.9, 4);
      fragment('coins', [55.5, 13.6, 5.7, 8.4], [[56.4,17.2],[56.4,15],[57,14.9],[57.3,16.9],[57.9,17],[57.9,15],[58.5,14.9],[58.7,17],[59,17],[59.1,15],[59.7,15],[60,17],[60.6,17.5],[60.5,20.5],[59.3,21.5],[57.5,21.2],[56,20.7],[55.7,18]], 8.5, -6, 5);
    } else {
      sky.style.backgroundImage = 'var(--world-sky,var(--world-art))'; element('world-still', atlas);
    }
    const clouds = (parent, values) => values.forEach(([top, width, seconds, delay]) => {
      const cloud = element('world-cloud', parent); cloud.style.top = top + '%';
      cloud.style.setProperty('--cloud-width', width + '%'); cloud.style.setProperty('--cloud-period', seconds + 's'); cloud.style.setProperty('--cloud-delay', delay + 's');
    });
    clouds(back, [[12,5,154,-102],[38,7,178,-47],[66,8,201,-139]]);
    const flights = element('world-flights', atlas);
    [['hoverskiff',23,76,-28,false],['airship',9,118,-73,true],['glider',48,93,-12,false]].forEach(([type, y, seconds, delay, reverse]) => {
      const flight = element('world-vehicle' + (reverse ? ' reverse' : ''), flights);
      flight.style.setProperty('--flight-y', y + '%'); flight.style.setProperty('--flight-period', seconds + 's'); flight.style.setProperty('--flight-delay', delay + 's'); element('world-craft ' + type, flight);
    });
    const falls = element('world-waterfalls', atlas);
    [[46.4,39,14],[47.8,40,12],[89.8,42,13],[81.7,85.4,13]].forEach(([x,y,h]) => {
      const fall = element('world-waterfall', falls); fall.style.left = x + '%'; fall.style.top = y + '%'; fall.style.setProperty('--fall-height', h + '%');
    });
    const sparks = element('world-sparks', atlas);
    [[57.7,17,-.7],[59.2,16.2,-2.5],[78.5,71,-1.8],[88.1,68.1,-3.1]].forEach(([x,y,delay]) => {
      const spark = element('world-spark', sparks); spark.style.left = x + '%'; spark.style.top = y + '%'; spark.style.setProperty('--spark-delay', delay + 's');
    });
    const front = element('world-clouds-front', atlas);
    clouds(front, [[87,11,158,-71],[55,6,127,-99]]);
    owned.push(element('world-wash', host));

    const listen = (target, name, fn, settings) => { target.addEventListener(name, fn, settings); cleanups.push(() => target.removeEventListener(name, fn, settings)); };
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
      const target = ROUTES[route], zoom = target.zoom;
      const x = width * (target.focus - .5) - zoom * (target.x - .5) * atlasWidth;
      const y = height * -.01 - zoom * (target.y - .5) * atlasHeight;
      const px = route === 'home' ? 0 : x, py = route === 'home' ? 0 : y;
      camera.style.setProperty('--world-x', px.toFixed(3) + 'px'); camera.style.setProperty('--world-y', py.toFixed(3) + 'px'); camera.style.setProperty('--world-zoom', String(zoom));
      host.dataset.worldRoute = route; host.dataset.worldIsland = target.island; host.dataset.worldZoom = String(zoom);
      return 'translate3d(-50%,-50%,0) translate3d(' + px.toFixed(3) + 'px,' + py.toFixed(3) + 'px,0) scale(' + zoom + ')';
    }
    function updateState() {
      if (dead) return;
      if (!host.isConnected) { stop(); return; }
      host.dataset.worldTheme = theme();
      const state = calm() ? 'static' : blocked() ? 'paused' : 'running';
      host.dataset.worldMotion = state;
      if (cameraAnimation) {
        if (state === 'static') cancelCamera();
        else if (state === 'paused') cameraAnimation.pause();
        else if (cameraAnimation.playState === 'paused') cameraAnimation.play();
      }
    }
    function resize() {
      if (dead) return;
      const bounds = host.getBoundingClientRect(); width = Math.max(1,bounds.width); height = Math.max(1,bounds.height);
      atlasWidth = Math.max(width,height * RATIO); atlasHeight = atlasWidth / RATIO;
      camera.style.width = atlasWidth.toFixed(3) + 'px'; camera.style.height = atlasHeight.toFixed(3) + 'px';
      cancelCamera(); camera.style.transform = cameraTarget(); updateState();
    }
    function setRoute(value) {
      if (dead) return;
      const next = routeKey(value); if (next === route) return;
      const previous = getComputedStyle(camera).transform;
      cancelCamera(); route = next;
      const target = cameraTarget(); camera.style.transform = target; updateState();
      if (!calm() && !blocked() && camera.animate && previous !== 'none') {
        cameraAnimation = camera.animate([{ transform:previous },{ transform:target }], { duration:1450,easing:'cubic-bezier(.22,.68,.2,1)',fill:'none' });
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
    const handle = Object.freeze({ setRoute,setMotion,retheme,stop,destroy:stop }); mounted.set(host,handle);
    listen(document,'visibilitychange',updateState);
    listen(document,'focusin',updateState);
    listen(document,'focusout',() => queueMicrotask(updateState));
    // Entering a game frame blurs its parent document without dispatching parent focusin.
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
        // Ignore decorative attribute writes; respond to dialog state and route DOM replacement.
        if (records.some((record) => record.type === 'childList' || record.target === root || record.attributeName === 'open' || record.attributeName === 'aria-modal' || record.attributeName === 'role')) updateState();
      });
      observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['data-gp-theme','data-theme','data-gp-motion','open','aria-modal','role']}); cleanups.push(() => observer.disconnect());
    }
    resize(); return handle;
  }
  window.PPWorldBackground = Object.freeze({ mount });
})();
