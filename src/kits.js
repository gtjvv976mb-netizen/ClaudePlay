/* GamePlay game kits: a tiny canvas engine, five tunable genre kits, the player SDK
   and procedural cover art. Kits are written as real functions and serialized with
   toString() into standalone HTML game files. */
(function (root) {
  'use strict';

  const PALETTES = {
    neon:   { name: 'Neon',   bg1: '#0b0f2a', bg2: '#22104a', fg: '#eef3ff', a1: '#22e6ff', a2: '#ff3ad6', danger: '#ff5468', gold: '#ffd84d' },
    sunset: { name: 'Sunset', bg1: '#2a0f22', bg2: '#7a2a3f', fg: '#fff3e8', a1: '#ffb347', a2: '#ff6f8e', danger: '#ff3b30', gold: '#ffe27a' },
    mint:   { name: 'Mint',   bg1: '#08241f', bg2: '#11493c', fg: '#effff9', a1: '#62f5c8', a2: '#f6f86e', danger: '#ff6b6b', gold: '#ffd166' },
    paper:  { name: 'Paper',  bg1: '#f1eee6', bg2: '#ddd6c8', fg: '#1d1d1f', a1: '#2b40f0', a2: '#ff6a3d', danger: '#d7263d', gold: '#b88a00' },
    candy:  { name: 'Candy',  bg1: '#ffe2f1', bg2: '#ffc3df', fg: '#3b1032', a1: '#7b2ff7', a2: '#ff4f9a', danger: '#e0004d', gold: '#e09a00' },
    forest: { name: 'Forest', bg1: '#0e1a12', bg2: '#22402b', fg: '#ecf6e6', a1: '#8bd450', a2: '#f2a541', danger: '#e4572e', gold: '#f4d35e' },
  };
  const SHAPES = { block: 'Block', orb: 'Orb', diamond: 'Diamond', star: 'Star' };

  /* Custom (brand) palettes: three picked colors expand into a full game palette. */
  const CUSTOM_DEFAULT = { bg: '#0f1b3d', main: '#ffb703', alt: '#3ad1ff' };
  const hexOk = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mixHex = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  function lum(h) {
    const c = rgbOf(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function cleanColors(c) {
    c = c || {};
    return { bg: hexOk(c.bg) ? c.bg.toLowerCase() : CUSTOM_DEFAULT.bg, main: hexOk(c.main) ? c.main.toLowerCase() : CUSTOM_DEFAULT.main, alt: hexOk(c.alt) ? c.alt.toLowerCase() : CUSTOM_DEFAULT.alt };
  }
  function derivePalette(colors) {
    const c = cleanColors(colors);
    const dark = lum(c.bg) < 0.3;
    return {
      name: 'Custom', bg1: c.bg, bg2: mixHex(c.bg, c.main, 0.22), fg: dark ? '#f4f6fb' : '#15171c',
      a1: c.main, a2: c.alt, danger: dark ? '#ff5468' : '#d7263d', gold: dark ? '#ffd84d' : '#a87400',
    };
  }

  /* ---------------- engine (runs inside the game file) ---------------- */
  function ENGINE() {
    var P = window.P;
    var C = document.getElementById('c'), X = C.getContext('2d');
    var E = window.E = { W: 0, H: 0, t: 0, playT: 0, keys: {}, pointer: { x: 0, y: 0, down: false }, state: 'title', score: 0, best: 0, shake: 0, parts: [], pal: P.pal, overAt: 0, X: X };
    function fit() {
      var d = Math.min(2, window.devicePixelRatio || 1);
      E.W = innerWidth; E.H = innerHeight;
      C.width = Math.max(1, Math.round(E.W * d)); C.height = Math.max(1, Math.round(E.H * d));
      C.style.width = E.W + 'px'; C.style.height = E.H + 'px';
      X.setTransform(d, 0, 0, d, 0, 0);
      if (window.G && G.resize) G.resize();
    }
    addEventListener('resize', fit); fit();
    var BLOCK = { Space: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
    addEventListener('keydown', function (e) { if (BLOCK[e.code]) e.preventDefault(); if (e.repeat) return; E.keys[e.code] = true; press(e.code); });
    addEventListener('keyup', function (e) { E.keys[e.code] = false; });
    C.addEventListener('pointerdown', function (e) { E.pointer.down = true; E.pointer.x = e.clientX; E.pointer.y = e.clientY; try { C.setPointerCapture(e.pointerId); } catch (_) {} press('Tap'); });
    C.addEventListener('pointermove', function (e) { E.pointer.x = e.clientX; E.pointer.y = e.clientY; });
    addEventListener('pointerup', function () { E.pointer.down = false; });
    addEventListener('pointercancel', function () { E.pointer.down = false; });
    function sp(fn, v) { try { if (window.SP && SP[fn]) SP[fn](v); } catch (_) {} }
    function press(code) {
      if (E.state !== 'play') {
        if (E.state === 'over' && E.t - E.overAt < 0.7) return;
        if (code === 'Tap' || code === 'Space' || code === 'Enter' || code === 'ArrowUp') start();
        return;
      }
      if (G.press) G.press(code);
      sp('input', code);
    }
    function start() { E.score = 0; E.parts = []; E.state = 'play'; E.playT = 0; G.reset(); sp('score', 0); audio(); beep(440, 0.06, 'triangle'); }
    E.end = function () {
      if (E.state !== 'play') return;
      E.state = 'over'; E.overAt = E.t; E.best = Math.max(E.best, Math.floor(E.score));
      sp('gameOver', Math.floor(E.score)); beep(120, 0.3, 'sawtooth', 0.05); E.shake = 14;
    };
    E.add = function (n) { E.score += n; sp('score', Math.floor(E.score)); };
    E.rand = function () { return window.SP ? SP.rand() : Math.random(); };
    E.burst = function (x, y, col, n, v0) {
      n = n || 14; v0 = v0 || 220;
      for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = v0 * (0.3 + Math.random() * 0.7); E.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, col: col }); }
    };
    var AC = null;
    function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} } }
    function beep(f, d, type, vol) {
      if (!AC) return;
      try {
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(vol || 0.035, AC.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (d || 0.08));
        o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + (d || 0.08));
      } catch (_) {}
    }
    E.beep = beep;
    function rr(x, y, w, h, k) { X.beginPath(); X.moveTo(x + k, y); X.arcTo(x + w, y, x + w, y + h, k); X.arcTo(x + w, y + h, x, y + h, k); X.arcTo(x, y + h, x, y, k); X.arcTo(x, y, x + w, y, k); X.closePath(); }
    E.rr = function (ctx, x, y, w, h, k) { rr(x, y, w, h, k); };
    E.shape = function (x, y, r, col, rot) {
      X.save(); X.translate(x, y); if (rot) X.rotate(rot); X.fillStyle = col;
      var s = P.shape;
      if (s === 'orb') { X.beginPath(); X.arc(0, 0, r, 0, 6.283); X.fill(); X.fillStyle = 'rgba(255,255,255,.55)'; X.beginPath(); X.arc(-r * 0.35, -r * 0.35, r * 0.3, 0, 6.283); X.fill(); }
      else if (s === 'diamond') { X.beginPath(); X.moveTo(0, -r * 1.15); X.lineTo(r, 0); X.lineTo(0, r * 1.15); X.lineTo(-r, 0); X.closePath(); X.fill(); }
      else if (s === 'star') { X.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.48 : r * 1.1; X.lineTo(Math.cos(a) * q, Math.sin(a) * q); } X.closePath(); X.fill(); }
      else { rr(-r, -r, r * 2, r * 2, r * 0.3); X.fill(); X.fillStyle = E.pal.bg1; X.fillRect(r * 0.2, -r * 0.45, r * 0.32, r * 0.32); }
      X.restore();
    };
    E.bg = function () { var g = X.createLinearGradient(0, 0, 0, E.H); g.addColorStop(0, E.pal.bg1); g.addColorStop(1, E.pal.bg2); X.fillStyle = g; X.fillRect(-20, -20, E.W + 40, E.H + 40); };
    E.text = function (s, x, y, size, col, align, weight) {
      X.font = (weight || 800) + ' ' + Math.round(size) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      X.textAlign = align || 'center'; X.textBaseline = 'middle'; X.fillStyle = col; X.fillText(s, x, y);
    };
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.033, (now - last) / 1000); last = now; E.t += dt;
      if (E.state === 'play') { E.playT += dt; G.update(dt); }
      for (var i = 0; i < E.parts.length; i++) { var p = E.parts[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt; }
      E.parts = E.parts.filter(function (p) { return p.life > 0; });
      X.save();
      if (E.shake > 0) { X.translate((Math.random() - 0.5) * E.shake, (Math.random() - 0.5) * E.shake); E.shake *= 0.86; if (E.shake < 0.5) E.shake = 0; }
      G.draw(X);
      for (var j = 0; j < E.parts.length; j++) { var q = E.parts[j]; X.globalAlpha = Math.max(0, Math.min(1, q.life * 1.6)); X.fillStyle = q.col; X.fillRect(q.x - 2.5, q.y - 2.5, 5, 5); }
      X.globalAlpha = 1; X.restore();
      hud();
      requestAnimationFrame(frame);
    }
    function hud() {
      var W = E.W, H = E.H, pal = E.pal;
      if (E.state === 'play') { E.text(String(Math.floor(E.score)), W / 2, 34, 30, pal.fg); if (G.hud) G.hud(X); return; }
      X.fillStyle = 'rgba(0,0,0,.45)'; X.fillRect(0, 0, W, H);
      var big = Math.max(26, Math.min(64, W / 9));
      if (E.state === 'title') {
        E.text(String(P.title || 'Untitled').toUpperCase(), W / 2, H * 0.38, big, '#ffffff', 'center', 900);
        E.text(G.hint || 'Tap or press Space', W / 2, H * 0.38 + big * 0.95, Math.max(13, big * 0.28), pal.a1, 'center', 700);
        X.globalAlpha = 0.55 + 0.45 * Math.sin(E.t * 4);
        E.text('TAP OR PRESS SPACE TO START', W / 2, H * 0.68, Math.max(12, big * 0.26), '#ffffff', 'center', 800);
        X.globalAlpha = 1;
        if (E.best) E.text('BEST ' + E.best, W / 2, H * 0.76, 14, '#ffffff', 'center', 700);
      } else {
        E.text('GAME OVER', W / 2, H * 0.34, big, pal.danger, 'center', 900);
        E.text(String(Math.floor(E.score)), W / 2, H * 0.34 + big * 1.05, big * 0.8, '#ffffff', 'center', 900);
        E.text('BEST ' + E.best, W / 2, H * 0.34 + big * 1.75, 15, '#ffffff', 'center', 700);
        if (E.t - E.overAt > 0.7) { X.globalAlpha = 0.55 + 0.45 * Math.sin(E.t * 4); E.text('TAP OR PRESS SPACE TO RETRY', W / 2, H * 0.74, Math.max(12, big * 0.26), pal.a1, 'center', 800); X.globalAlpha = 1; }
      }
    }
    E.boot = function () { G.reset(); if (window.SP && SP.ready) SP.ready(); requestAnimationFrame(frame); };
  }

  /* ---------------- kits ---------------- */
  function KIT_RUNNER() {
    var P = window.P;
    window.G = {
      hint: 'Jump the blocks. Grab the coins.',
      reset: function () {
        this.gy = E.H * 0.78; this.px = Math.max(60, E.W * 0.2); this.y = 0; this.vy = 0; this.jumps = 0;
        this.obs = []; this.coins = []; this.speed = 300 * P.speed; this.next = 320; this.dist = 0; this.stars = [];
        for (var i = 0; i < 40; i++) this.stars.push({ x: Math.random() * E.W, y: Math.random() * this.gy, z: 0.2 + Math.random() * 0.8 });
      },
      resize: function () { this.gy = E.H * 0.78; },
      press: function (code) {
        if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW' || code === 'Tap') {
          var max = P.doubleJump ? 2 : 1;
          if (this.jumps < max) { this.vy = -660 * P.jump; this.jumps++; E.beep(500 + this.jumps * 160, 0.07, 'square'); E.burst(this.px, this.gy + this.y, E.pal.a1, 8, 140); }
        }
      },
      update: function (dt) {
        this.vy += 2000 * P.gravity * dt; this.y += this.vy * dt;
        if (this.y >= 0) { if (this.vy > 300) E.burst(this.px, this.gy, E.pal.a2, 6, 90); this.y = 0; this.vy = 0; this.jumps = 0; }
        this.speed += 9 * P.ramp * dt;
        var dx = this.speed * dt; this.dist += dx; this.next -= dx;
        if (this.next <= 0) {
          var h = Math.min(92, 26 + E.rand() * (34 + 30 * P.density)), w = 22 + E.rand() * 30;
          this.obs.push({ x: E.W + 30, w: w, h: h });
          if (E.rand() < 0.55) this.coins.push({ x: E.W + 30 + w / 2, y: this.gy - h - 50 - E.rand() * 40 });
          this.next = Math.max(this.speed * 0.62, this.speed * (0.75 + E.rand() * 0.9) / P.density);
        }
        var r = 16, py = this.gy + this.y - r;
        for (var i = 0; i < this.obs.length; i++) {
          var o = this.obs[i]; o.x -= dx;
          if (!o.passed && o.x + o.w < this.px - r) { o.passed = true; E.add(5); }
          if (this.px + r * 0.8 > o.x && this.px - r * 0.8 < o.x + o.w && py + r * 0.8 > this.gy - o.h) { E.burst(this.px, py, E.pal.danger, 24, 300); E.end(); return; }
        }
        for (var j = 0; j < this.coins.length; j++) {
          var c = this.coins[j]; c.x -= dx;
          if (!c.got && Math.abs(c.x - this.px) < r + 10 && Math.abs(c.y - py) < r + 10) { c.got = true; E.add(10); E.beep(980, 0.08, 'triangle'); E.burst(c.x, c.y, E.pal.gold, 12, 180); }
        }
        this.obs = this.obs.filter(function (o) { return o.x + o.w > -40; });
        this.coins = this.coins.filter(function (c) { return c.x > -40 && !c.got; });
        E.add(dt * this.speed / 60);
        for (var k = 0; k < this.stars.length; k++) { var s = this.stars[k]; s.x -= dx * s.z * 0.25; if (s.x < 0) s.x += E.W; }
      },
      draw: function (X) {
        E.bg(); var pal = E.pal;
        for (var k = 0; k < this.stars.length; k++) { var s = this.stars[k]; X.globalAlpha = 0.25 + s.z * 0.5; X.fillStyle = pal.fg; X.fillRect(s.x, s.y, 2 * s.z, 2 * s.z); }
        X.globalAlpha = 1;
        X.fillStyle = pal.a2; X.fillRect(0, this.gy, E.W, 3);
        X.globalAlpha = 0.16; X.fillRect(0, this.gy + 3, E.W, E.H - this.gy); X.globalAlpha = 0.28;
        X.strokeStyle = pal.a2; var off = this.dist % 48;
        for (var x = -off; x < E.W + 48; x += 48) { X.beginPath(); X.moveTo(x, this.gy + 3); X.lineTo(x - 40, E.H); X.stroke(); }
        X.globalAlpha = 1;
        for (var i = 0; i < this.obs.length; i++) { var o = this.obs[i]; X.fillStyle = pal.danger; E.rr(X, o.x, this.gy - o.h, o.w, o.h, 4); X.fill(); X.fillStyle = 'rgba(255,255,255,.25)'; X.fillRect(o.x + 3, this.gy - o.h + 3, o.w - 6, 4); }
        for (var j = 0; j < this.coins.length; j++) { var c = this.coins[j]; X.fillStyle = pal.gold; X.beginPath(); X.arc(c.x, c.y + Math.sin(E.t * 6 + c.x * 0.02) * 4, 8, 0, 6.283); X.fill(); }
        E.shape(this.px, this.gy + this.y - 16, 16, pal.a1, this.jumps ? E.t * 8 : 0);
      },
    };
  }

  function KIT_FLAP() {
    var P = window.P;
    window.G = {
      hint: 'Tap to flap through the gaps.',
      reset: function () {
        this.px = Math.max(70, E.W * 0.28); this.y = E.H * 0.45; this.vy = 0; this.pipes = []; this.next = 0;
        this.speed = 190 * P.speed; this.gap = Math.max(130, E.H * 0.27 * P.gap); this.clouds = [];
        for (var i = 0; i < 7; i++) this.clouds.push({ x: Math.random() * E.W, y: Math.random() * E.H * 0.7, r: 20 + Math.random() * 40 });
      },
      press: function () { this.vy = -440 * P.flap; E.beep(700, 0.05, 'triangle'); E.burst(this.px - 10, this.y + 8, E.pal.fg, 5, 80); },
      update: function (dt) {
        this.vy = Math.min(900, this.vy + 1350 * P.gravity * dt); this.y += this.vy * dt;
        var dx = this.speed * dt; this.speed += 3 * P.ramp * dt; this.next -= dx;
        if (this.next <= 0) {
          var m = E.H * 0.12, top = m + E.rand() * Math.max(10, E.H - 2 * m - this.gap);
          this.pipes.push({ x: E.W + 40, top: top, gap: this.gap });
          this.next = Math.max(170, 260 * P.spacing); this.gap = Math.max(110, this.gap - 1.6 * P.ramp);
        }
        var r = 15;
        for (var i = 0; i < this.pipes.length; i++) {
          var p = this.pipes[i]; p.x -= dx;
          if (!p.passed && p.x + 64 < this.px - r) { p.passed = true; E.add(1); E.beep(880, 0.06, 'square'); }
          if (this.px + r > p.x && this.px - r < p.x + 64 && (this.y - r < p.top || this.y + r > p.top + p.gap)) { E.burst(this.px, this.y, E.pal.danger, 26, 280); E.end(); return; }
        }
        this.pipes = this.pipes.filter(function (p) { return p.x > -80; });
        if (this.y + r > E.H || this.y - r < 0) { E.burst(this.px, this.y, E.pal.danger, 26, 280); E.end(); }
        for (var k = 0; k < this.clouds.length; k++) { var c = this.clouds[k]; c.x -= dx * 0.3; if (c.x < -c.r * 2) c.x = E.W + c.r; }
      },
      draw: function (X) {
        E.bg(); var pal = E.pal;
        X.fillStyle = pal.fg; X.globalAlpha = 0.08;
        for (var k = 0; k < this.clouds.length; k++) { var c = this.clouds[k]; X.beginPath(); X.arc(c.x, c.y, c.r, 0, 6.283); X.arc(c.x + c.r * 0.9, c.y + 6, c.r * 0.7, 0, 6.283); X.fill(); }
        X.globalAlpha = 1;
        for (var i = 0; i < this.pipes.length; i++) {
          var p = this.pipes[i]; X.fillStyle = pal.a2;
          E.rr(X, p.x, -10, 64, p.top + 10, 8); X.fill(); E.rr(X, p.x, p.top + p.gap, 64, E.H - p.top - p.gap + 10, 8); X.fill();
          X.fillStyle = 'rgba(255,255,255,.18)'; X.fillRect(p.x + 8, 0, 6, Math.max(0, p.top - 6)); X.fillRect(p.x + 8, p.top + p.gap + 6, 6, E.H);
        }
        E.shape(this.px, this.y, 15, pal.a1, Math.max(-0.5, Math.min(1.1, this.vy / 700)));
      },
    };
  }

  function KIT_SHOOTER() {
    var P = window.P;
    window.G = {
      hint: 'Drag or use arrow keys. You fire automatically.',
      reset: function () {
        this.x = E.W / 2; this.y = E.H - 70; this.shots = []; this.foes = []; this.timer = 1; this.cool = 0;
        this.lives = Math.round(P.lives); this.inv = 0; this.time = 0; this.stars = [];
        for (var i = 0; i < 60; i++) this.stars.push({ x: Math.random() * E.W, y: Math.random() * E.H, z: 0.2 + Math.random() });
      },
      resize: function () { this.y = E.H - 70; },
      update: function (dt) {
        this.time += dt; var sp = 460 * P.speed;
        if (E.keys.ArrowLeft || E.keys.KeyA) this.x -= sp * dt;
        if (E.keys.ArrowRight || E.keys.KeyD) this.x += sp * dt;
        if (E.pointer.down) this.x += (E.pointer.x - this.x) * Math.min(1, dt * 12);
        this.x = Math.max(20, Math.min(E.W - 20, this.x));
        this.cool -= dt;
        if (this.cool <= 0) { this.cool = 0.26 / P.fireRate; this.shots.push({ x: this.x, y: this.y - 18 }); E.beep(1200, 0.025, 'triangle', 0.015); }
        var level = 1 + this.time / 20;
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = Math.max(0.22, 1.05 - level * 0.06) / P.density;
          var big = E.rand() < 0.12 + level * 0.02;
          this.foes.push({ x: 24 + E.rand() * (E.W - 48), y: -30, vy: (60 + E.rand() * 70) * P.enemySpeed * (0.9 + level * 0.12), ph: E.rand() * 6.28, r: big ? 22 : 14, hp: big ? 3 : 1 });
        }
        for (var i = 0; i < this.shots.length; i++) this.shots[i].y -= 720 * dt;
        for (var j = 0; j < this.foes.length; j++) {
          var f = this.foes[j]; f.y += f.vy * dt; f.x += Math.sin(this.time * 2 + f.ph) * 40 * dt;
          for (var k = 0; k < this.shots.length; k++) {
            var s = this.shots[k];
            if (!s.dead && Math.abs(s.x - f.x) < f.r + 3 && Math.abs(s.y - f.y) < f.r + 8) {
              s.dead = true; f.hp--; E.burst(s.x, s.y, E.pal.a2, 5, 120);
              if (f.hp <= 0) { f.dead = true; E.add(f.r > 20 ? 30 : 10); E.beep(220, 0.08, 'square'); E.burst(f.x, f.y, E.pal.gold, 16, 220); break; }
            }
          }
          if (!f.dead && this.inv <= 0 && Math.abs(f.x - this.x) < f.r + 14 && Math.abs(f.y - this.y) < f.r + 14) { f.dead = true; this.hit(); }
          if (!f.dead && f.y > E.H + 30) { f.dead = true; this.hit(); }
          if (E.state !== 'play') return;
        }
        this.inv -= dt;
        this.shots = this.shots.filter(function (s) { return !s.dead && s.y > -20; });
        this.foes = this.foes.filter(function (f) { return !f.dead; });
        for (var q = 0; q < this.stars.length; q++) { var st = this.stars[q]; st.y += 60 * st.z * dt; if (st.y > E.H) { st.y = 0; st.x = Math.random() * E.W; } }
      },
      hit: function () {
        this.lives--; this.inv = 1.2; E.shake = 10; E.beep(90, 0.2, 'sawtooth', 0.05); E.burst(this.x, this.y, E.pal.danger, 20, 260);
        if (this.lives <= 0) E.end();
      },
      hud: function () { for (var i = 0; i < this.lives; i++) E.shape(22 + i * 24, 34, 7, E.pal.a1); },
      draw: function (X) {
        E.bg(); var pal = E.pal;
        for (var q = 0; q < this.stars.length; q++) { var st = this.stars[q]; X.globalAlpha = 0.3 + st.z * 0.5; X.fillStyle = pal.fg; X.fillRect(st.x, st.y, 1.5 * st.z, 3 * st.z); }
        X.globalAlpha = 1; X.fillStyle = pal.gold;
        for (var i = 0; i < this.shots.length; i++) { var s = this.shots[i]; X.fillRect(s.x - 2, s.y - 8, 4, 14); }
        for (var j = 0; j < this.foes.length; j++) {
          var f = this.foes[j]; X.fillStyle = f.r > 20 ? pal.danger : pal.a2;
          X.beginPath(); X.moveTo(f.x, f.y + f.r); X.lineTo(f.x + f.r, f.y - f.r * 0.6); X.lineTo(f.x, f.y - f.r * 0.2); X.lineTo(f.x - f.r, f.y - f.r * 0.6); X.closePath(); X.fill();
        }
        if (this.inv <= 0 || Math.floor(E.t * 12) % 2) E.shape(this.x, this.y, 16, pal.a1, 0);
      },
    };
  }

  function KIT_BREAKER() {
    var P = window.P;
    window.G = {
      hint: 'Move the paddle. Tap to launch.',
      reset: function () { this.level = 1; this.lives = 3; this.pw = Math.max(70, Math.min(190, E.W * 0.18 * P.paddle)); this.px = E.W / 2; this.build(); this.serve(); },
      build: function () {
        var rows = Math.min(9, Math.round(P.rows) + this.level - 1), cols = Math.max(6, Math.min(12, Math.floor(E.W / 72)));
        var m = 16, gap = 6, w = (E.W - 2 * m - (cols - 1) * gap) / cols, h = 20;
        this.bricks = [];
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) this.bricks.push({ x: m + c * (w + gap), y: 70 + r * (h + gap), w: w, h: h, hp: r < 2 && this.level > 1 ? 2 : 1, row: r });
      },
      serve: function () { this.stuck = true; this.bs = 340 * P.speed * (1 + (this.level - 1) * 0.08); this.br = 8; this.bx = this.px; this.by = E.H - 66; this.bvx = 0; this.bvy = 0; },
      press: function () {
        if (this.stuck) { this.stuck = false; var a = -Math.PI / 2 + (E.rand() - 0.5) * 0.9; this.bvx = Math.cos(a) * this.bs; this.bvy = Math.sin(a) * this.bs; E.beep(520, 0.05, 'triangle'); }
      },
      update: function (dt) {
        if (E.keys.ArrowLeft || E.keys.KeyA) this.px -= 620 * dt;
        if (E.keys.ArrowRight || E.keys.KeyD) this.px += 620 * dt;
        if (E.pointer.down) this.px += (E.pointer.x - this.px) * Math.min(1, dt * 16);
        this.px = Math.max(this.pw / 2, Math.min(E.W - this.pw / 2, this.px));
        var py = E.H - 56;
        if (this.stuck) { this.bx = this.px; this.by = py - this.br - 2; return; }
        var steps = 4, h = dt / steps;
        for (var s = 0; s < steps; s++) {
          this.bx += this.bvx * h; this.by += this.bvy * h;
          if (this.bx < this.br) { this.bx = this.br; this.bvx = Math.abs(this.bvx); }
          if (this.bx > E.W - this.br) { this.bx = E.W - this.br; this.bvx = -Math.abs(this.bvx); }
          if (this.by < this.br) { this.by = this.br; this.bvy = Math.abs(this.bvy); }
          if (this.bvy > 0 && this.by + this.br >= py && this.by + this.br <= py + 16 && Math.abs(this.bx - this.px) <= this.pw / 2 + this.br) {
            var off = (this.bx - this.px) / (this.pw / 2), a = -Math.PI / 2 + off * 1.05, v = Math.hypot(this.bvx, this.bvy);
            this.bvx = Math.cos(a) * v; this.bvy = Math.sin(a) * v; this.by = py - this.br; E.beep(300, 0.04, 'square');
          }
          for (var i = 0; i < this.bricks.length; i++) {
            var b = this.bricks[i]; if (b.dead) continue;
            if (this.bx + this.br > b.x && this.bx - this.br < b.x + b.w && this.by + this.br > b.y && this.by - this.br < b.y + b.h) {
              var ox = Math.min(this.bx + this.br - b.x, b.x + b.w - (this.bx - this.br)), oy = Math.min(this.by + this.br - b.y, b.y + b.h - (this.by - this.br));
              if (ox < oy) this.bvx = -this.bvx; else this.bvy = -this.bvy;
              b.hp--;
              if (b.hp <= 0) { b.dead = true; E.add(10 * this.level); E.burst(b.x + b.w / 2, b.y + b.h / 2, b.row % 2 ? E.pal.a2 : E.pal.a1, 10, 160); E.beep(640 + b.row * 40, 0.04, 'square'); }
              else E.beep(420, 0.04, 'square');
              break;
            }
          }
        }
        var v2 = Math.hypot(this.bvx, this.bvy), target = this.bs * (1 + E.playT * 0.004 * P.ramp);
        if (v2 > 0 && v2 < target) { this.bvx *= target / v2; this.bvy *= target / v2; }
        if (Math.abs(this.bvy) < 60) this.bvy = this.bvy < 0 ? -60 : 60;
        if (this.by > E.H + 20) {
          this.lives--; E.shake = 10; E.beep(110, 0.2, 'sawtooth', 0.05);
          if (this.lives <= 0) { E.end(); return; }
          this.serve();
        }
        if (this.bricks.every(function (b) { return b.dead; })) { this.level++; E.add(100); E.beep(990, 0.15, 'triangle'); this.build(); this.serve(); }
      },
      hud: function (X) {
        E.text('LV ' + this.level, E.W - 40, 34, 16, E.pal.fg, 'center', 800);
        for (var i = 0; i < this.lives; i++) { X.fillStyle = E.pal.a1; X.beginPath(); X.arc(22 + i * 20, 34, 6, 0, 6.283); X.fill(); }
      },
      draw: function (X) {
        E.bg(); var pal = E.pal;
        for (var i = 0; i < this.bricks.length; i++) {
          var b = this.bricks[i]; if (b.dead) continue;
          X.fillStyle = b.hp > 1 ? pal.gold : (b.row % 2 ? pal.a2 : pal.a1); E.rr(X, b.x, b.y, b.w, b.h, 4); X.fill();
          X.fillStyle = 'rgba(255,255,255,.22)'; X.fillRect(b.x + 3, b.y + 3, b.w - 6, 3);
        }
        X.fillStyle = pal.fg; E.rr(X, this.px - this.pw / 2, E.H - 56, this.pw, 12, 6); X.fill();
        X.fillStyle = pal.fg; X.beginPath(); X.arc(this.bx, this.by, this.br, 0, 6.283); X.fill();
      },
    };
  }

  function KIT_DODGE() {
    var P = window.P;
    window.G = {
      hint: 'Dodge the meteors. Catch the stars.',
      reset: function () { this.x = E.W / 2; this.rocks = []; this.gems = []; this.t1 = 0.6; this.t2 = 2; this.time = 0; },
      update: function (dt) {
        this.time += dt; var sp = 480 * P.speed, y = E.H - 70;
        if (E.keys.ArrowLeft || E.keys.KeyA) this.x -= sp * dt;
        if (E.keys.ArrowRight || E.keys.KeyD) this.x += sp * dt;
        if (E.pointer.down) this.x += (E.pointer.x - this.x) * Math.min(1, dt * 12);
        this.x = Math.max(18, Math.min(E.W - 18, this.x));
        var lvl = 1 + this.time / 15;
        this.t1 -= dt;
        if (this.t1 <= 0) { this.t1 = Math.max(0.12, 0.7 / lvl) / P.density; var r = 10 + E.rand() * 18; this.rocks.push({ x: E.rand() * E.W, y: -r, r: r, vy: (160 + E.rand() * 120) * P.fall * (0.85 + lvl * 0.15), vx: (E.rand() - 0.5) * 60, rot: E.rand() * 6, vr: (E.rand() - 0.5) * 4 }); }
        this.t2 -= dt;
        if (this.t2 <= 0) { this.t2 = (1.4 + E.rand() * 1.6) / P.gems; this.gems.push({ x: 20 + E.rand() * (E.W - 40), y: -10, vy: 140 + E.rand() * 60 }); }
        for (var i = 0; i < this.rocks.length; i++) {
          var k = this.rocks[i]; k.y += k.vy * dt; k.x += k.vx * dt; k.rot += k.vr * dt;
          if (Math.hypot(k.x - this.x, k.y - y) < k.r + 12) { E.burst(this.x, y, E.pal.danger, 28, 300); E.end(); return; }
        }
        for (var j = 0; j < this.gems.length; j++) {
          var g = this.gems[j]; g.y += g.vy * dt;
          if (!g.got && Math.hypot(g.x - this.x, g.y - y) < 26) { g.got = true; E.add(25); E.beep(1046, 0.08, 'triangle'); E.burst(g.x, g.y, E.pal.gold, 14, 200); }
        }
        this.rocks = this.rocks.filter(function (k) { return k.y < E.H + 40; });
        this.gems = this.gems.filter(function (g) { return !g.got && g.y < E.H + 20; });
        E.add(dt * 10);
      },
      draw: function (X) {
        E.bg(); var pal = E.pal, y = E.H - 70;
        X.fillStyle = pal.fg; X.globalAlpha = 0.06; X.fillRect(0, y + 22, E.W, E.H); X.globalAlpha = 1;
        for (var i = 0; i < this.rocks.length; i++) {
          var k = this.rocks[i]; X.save(); X.translate(k.x, k.y); X.rotate(k.rot); X.fillStyle = pal.danger; X.beginPath();
          for (var a = 0; a < 7; a++) { var ang = a / 7 * 6.283, q = k.r * (0.75 + ((a * 37) % 10) / 30); X.lineTo(Math.cos(ang) * q, Math.sin(ang) * q); }
          X.closePath(); X.fill(); X.restore();
        }
        for (var j = 0; j < this.gems.length; j++) {
          var g = this.gems[j]; X.save(); X.translate(g.x, g.y); X.rotate(E.t * 2); X.fillStyle = pal.gold; X.beginPath();
          for (var b = 0; b < 10; b++) { var an = -Math.PI / 2 + b * Math.PI / 5, r2 = b % 2 ? 4.5 : 10; X.lineTo(Math.cos(an) * r2, Math.sin(an) * r2); }
          X.closePath(); X.fill(); X.restore();
        }
        E.shape(this.x, y, 15, pal.a1, 0);
      },
    };
  }

  const K = (key, label, min, max, step) => ({ key, label, min, max, step, type: 'range' });
  const KITS = {
    runner:  { id: 'runner',  name: 'Runner',  genre: 'Runner',  fn: KIT_RUNNER,  blurb: 'Auto-run, jump obstacles, collect coins.',
      knobs: [K('speed', 'Run speed', 0.6, 1.8, 0.05), K('jump', 'Jump power', 0.7, 1.4, 0.05), K('gravity', 'Gravity', 0.6, 1.6, 0.05), K('density', 'Obstacle density', 0.6, 1.8, 0.05), K('ramp', 'Difficulty ramp', 0, 2, 0.1), { key: 'doubleJump', label: 'Double jump', type: 'bool' }],
      defaults: { speed: 1, jump: 1, gravity: 1, density: 1, ramp: 1, doubleJump: true } },
    flap:    { id: 'flap',    name: 'Flapper', genre: 'Flapper', fn: KIT_FLAP,    blurb: 'One button. Thread the gaps.',
      knobs: [K('speed', 'Scroll speed', 0.6, 1.8, 0.05), K('flap', 'Flap strength', 0.7, 1.4, 0.05), K('gravity', 'Gravity', 0.6, 1.6, 0.05), K('gap', 'Gap size', 0.7, 1.4, 0.05), K('spacing', 'Pipe spacing', 0.7, 1.5, 0.05), K('ramp', 'Difficulty ramp', 0, 2, 0.1)],
      defaults: { speed: 1, flap: 1, gravity: 1, gap: 1, spacing: 1, ramp: 1 } },
    shooter: { id: 'shooter', name: 'Shooter', genre: 'Shooter', fn: KIT_SHOOTER, blurb: 'Hold the line against descending waves.',
      knobs: [K('speed', 'Ship speed', 0.6, 1.8, 0.05), K('fireRate', 'Fire rate', 0.6, 2, 0.05), K('enemySpeed', 'Enemy speed', 0.6, 1.8, 0.05), K('density', 'Enemy density', 0.6, 2, 0.05), K('lives', 'Lives', 1, 5, 1)],
      defaults: { speed: 1, fireRate: 1, enemySpeed: 1, density: 1, lives: 3 } },
    breaker: { id: 'breaker', name: 'Breaker', genre: 'Breaker', fn: KIT_BREAKER, blurb: 'Paddle, ball, bricks. Clear the board.',
      knobs: [K('speed', 'Ball speed', 0.7, 1.6, 0.05), K('paddle', 'Paddle width', 0.6, 1.6, 0.05), K('rows', 'Brick rows', 2, 7, 1), K('ramp', 'Speed ramp', 0, 2, 0.1)],
      defaults: { speed: 1, paddle: 1, rows: 4, ramp: 1 } },
    dodge:   { id: 'dodge',   name: 'Dodger',  genre: 'Dodger',  fn: KIT_DODGE,   blurb: 'Slide through hazards, catch the bonuses.',
      knobs: [K('speed', 'Move speed', 0.6, 1.8, 0.05), K('fall', 'Meteor speed', 0.6, 1.8, 0.05), K('density', 'Meteor density', 0.6, 2, 0.05), K('gems', 'Star frequency', 0.5, 2, 0.05)],
      defaults: { speed: 1, fall: 1, density: 1, gems: 1 } },
  };

  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SCRIPT_OPEN = '<scr' + 'ipt>';
  const SCRIPT_CLOSE = '</scr' + 'ipt>';

  function normalizeParams(kitId, params) {
    const k = KITS[kitId];
    const p = Object.assign({ title: 'Untitled', palette: 'neon', shape: 'block' }, k.defaults, params || {});
    p.title = String(p.title || 'Untitled').slice(0, 40);
    if (p.palette === 'custom') p.colors = cleanColors(p.colors);
    else {
      if (!PALETTES[p.palette]) p.palette = 'neon';
      delete p.colors;
    }
    if (!SHAPES[p.shape]) p.shape = 'block';
    for (const kn of k.knobs) {
      if (kn.type === 'bool') p[kn.key] = !!p[kn.key];
      else { let v = Number(p[kn.key]); if (!isFinite(v)) v = k.defaults[kn.key]; p[kn.key] = Math.min(kn.max, Math.max(kn.min, v)); }
    }
    return p;
  }

  /* A complete, standalone HTML game file for a kit + params. */
  function kitDoc(kitId, params) {
    const k = KITS[kitId];
    const p = normalizeParams(kitId, params);
    const pal = p.palette === 'custom' ? derivePalette(p.colors) : PALETTES[p.palette];
    const json = JSON.stringify(Object.assign({}, p, { pal })).replace(/</g, '\\u003c');
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">'
      + '<meta name="generator" content="GamePlay kit ' + k.id + ' v1">'
      + '<title>' + escHtml(p.title) + '</title>'
      + '<style>html,body{margin:0;height:100%;overflow:hidden;background:' + pal.bg1 + ';touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}canvas{display:block}</style>'
      + '</head><body><canvas id="c"></canvas>' + SCRIPT_OPEN + '\n'
      + 'window.P=' + json + ';\n'
      + '(' + ENGINE.toString() + ')();\n'
      + '(' + k.fn.toString() + ')();\n'
      + 'E.boot();\n'
      + SCRIPT_CLOSE + '</body></html>\n';
  }

  /* ---------------- SDK injected into every game at play time ---------------- */
  function SDK(seed, o) {
    o = o || {};
    var s = seed >>> 0;
    function rand() { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    var n = 0, ih = 2166136261 >>> 0, t0 = Date.now(), last = -1;
    function post(m) { try { m.__pp = 1; parent.postMessage(m, '*'); } catch (e) {} }
    /* Assist mode: run the game clock slower by scaling the time every frame sees. */
    var speed = +o.speed > 0 && +o.speed < 1 ? +o.speed : 1;
    if (speed < 1) {
      try {
        var pn = performance.now.bind(performance), r0 = pn();
        var vt = function (t) { return r0 + (t - r0) * speed; };
        performance.now = function () { return vt(pn()); };
        var raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = function (cb) { return raf(function (t) { cb(vt(t)); }); };
      } catch (e) {}
    }
    /* Calm motion: kit games read their screen shake from E.shake, so pin it at zero. */
    if (o.calm) {
      try {
        var eng;
        Object.defineProperty(window, 'E', { configurable: true, get: function () { return eng; }, set: function (v) {
          eng = v;
          try { if (v && typeof v === 'object') Object.defineProperty(v, 'shake', { configurable: true, get: function () { return 0; }, set: function () {} }); } catch (e) {}
        } });
      } catch (e) {}
    }
    /* Sound off: route every Web Audio graph through a silent gain and mute media elements. */
    if (o.mute) {
      try {
        var BAC = window.BaseAudioContext || window.AudioContext || window.webkitAudioContext;
        var proto = BAC && BAC.prototype, desc = proto && Object.getOwnPropertyDescriptor(proto, 'destination'), mk = proto && proto.createGain;
        if (desc && desc.get && mk) {
          Object.defineProperty(proto, 'destination', { configurable: true, get: function () {
            if (!this.__gpMute) { var g = mk.call(this); g.gain.value = 0; g.connect(desc.get.call(this)); this.__gpMute = g; }
            return this.__gpMute;
          } });
        }
        var play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { this.muted = true; return play.apply(this, arguments); };
      } catch (e) {}
    }
    window.SP = {
      seed: seed,
      rand: rand,
      assist: speed,
      calm: !!o.calm,
      muted: !!o.mute,
      score: function (v) { v = Math.floor(+v || 0); if (v !== last) { last = v; post({ t: 'score', v: v }); } },
      gameOver: function (v) { post({ t: 'over', v: Math.floor(+v || 0), inputs: n, ih: (ih >>> 0).toString(16), dur: Date.now() - t0, assist: speed }); n = 0; ih = 2166136261 >>> 0; t0 = Date.now(); last = -1; },
      ready: function () { post({ t: 'ready' }); },
      input: function (code) { n++; code = String(code); for (var i = 0; i < code.length; i++) { ih ^= code.charCodeAt(i); ih = Math.imul(ih, 16777619) >>> 0; } },
    };
    /* The creator's pictures (window.SP_PICTURES, a block in the game file): one Image per name, or an
       empty Image that draws nothing when the name is unknown. */
    var pics = {};
    window.SP.image = function (name) {
      name = String(name);
      if (!pics[name]) { var im = new Image(), src = window.SP_PICTURES && Object.prototype.hasOwnProperty.call(window.SP_PICTURES, name) ? window.SP_PICTURES[name] : ''; if (/^data:image\/png;base64,/.test(src)) im.src = src; pics[name] = im; }
      return pics[name];
    };
    /* Pixel art drawn in code: SP.sprite(rows, legend, scale) turns strings (one character per pixel,
       '.' or a space is clear) into a canvas; an array of frames gives an array of canvases.
       SP.paint(w, h, fn) paints a canvas once, for backgrounds. Both canvases pass the usual
       "img.complete && img.naturalWidth" check and stay crisp when scaled up. */
    function canvasOf(w, h) {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.min(4096, Math.round(+w || 1))); c.height = Math.max(1, Math.min(4096, Math.round(+h || 1)));
      c.complete = true; c.naturalWidth = c.width; c.naturalHeight = c.height;
      return c;
    }
    window.SP.sprite = function sprite(rows, legend, scale) {
      if (Array.isArray(rows) && Array.isArray(rows[0])) return rows.map(function (f) { return sprite(f, legend, scale); });
      rows = [].concat(rows || []).map(String); legend = legend || {}; scale = Math.max(1, Math.min(16, Math.floor(+scale || 1)));
      var w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
      var c = canvasOf(w * scale, rows.length * scale), x = c.getContext('2d');
      for (var r = 0; r < rows.length; r++) for (var k = 0; k < rows[r].length; k++) {
        var ch = rows[r][k], col = ch === '.' || ch === ' ' ? null : legend[ch];
        if (col) { x.fillStyle = col; x.fillRect(k * scale, r * scale, scale, scale); }
      }
      c.pixel = true;
      return c;
    };
    window.SP.paint = function (w, h, fn) { var c = canvasOf(w, h); if (fn) fn(c.getContext('2d'), c.width, c.height); return c; };
    /* Multiplayer: when the page opened this game in a room (o.room), SP.room relays messages between
       the players through the page. Offline it is a room of one that sends nothing. */
    var room = o.room || null, handlers = {};
    function emit(ev, a, b) { (handlers[ev] || []).forEach(function (f) { try { f(a, b); } catch (e) { setTimeout(function () { throw e; }); } }); }
    window.SP.room = {
      online: !!room,
      me: room ? room.me : 'me',
      host: room ? room.host : 'me',
      players: room ? room.players.slice() : [{ id: 'me', name: 'You' }],
      get isHost() { return this.me === this.host; },
      send: function (data, to) { if (room) post({ t: 'net', d: data, to: to || null }); },
      on: function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
      name: function (id) { for (var i = 0; i < this.players.length; i++) if (this.players[i].id === id) return this.players[i].name; return 'Player'; },
    };
    if (room) {
      window.addEventListener('message', function (e) {
        var m = e.data;
        if (e.source !== parent || !m || m.__ppnet !== 1) return;
        var R = window.SP.room;
        if (m.t === 'msg') emit('message', m.d, m.from);
        else if (m.t === 'join') { if (!R.players.some(function (p) { return p.id === m.id; })) R.players.push({ id: m.id, name: m.name }); emit('join', { id: m.id, name: m.name }); }
        else if (m.t === 'leave') { R.players = R.players.filter(function (p) { return p.id !== m.id; }); emit('leave', { id: m.id }); }
        else if (m.t === 'host') { R.host = m.id; emit('host', m.id); }
        else if (m.t === 'closed') { R.online = false; emit('closed'); }
      });
      post({ t: 'net-ready' });
    }
    /* Play-test mode (o.test): ClaudePlay plays the game for a few seconds before the creator sees it,
       pressing keys and tapping like a restless player, and posts screenshots of the title screen and of
       play, plus whether the screen was blank or never moved. The page sends them to Claude to review. */
    if (o.test) {
      var KEYS = [['Space', ' ', 32], ['ArrowLeft', 'ArrowLeft', 37], ['ArrowRight', 'ArrowRight', 39], ['ArrowUp', 'ArrowUp', 38], ['ArrowDown', 'ArrowDown', 40], ['KeyZ', 'z', 90], ['KeyX', 'x', 88], ['KeyA', 'a', 65], ['KeyD', 'd', 68], ['KeyW', 'w', 87], ['Enter', 'Enter', 13]];
      var keyEv = function (type, k) {
        var ev; try { ev = new KeyboardEvent(type, { code: k[0], key: k[1], bubbles: true, cancelable: true }); } catch (e) { return; }
        try { Object.defineProperty(ev, 'keyCode', { get: function () { return k[2]; } }); Object.defineProperty(ev, 'which', { get: function () { return k[2]; } }); } catch (e) {}
        (document.activeElement || document.body || document).dispatchEvent(ev);
      };
      var ptr = function (type, x, y) {
        var el = document.elementFromPoint(x, y) || document.body, init = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', isPrimary: true, buttons: /down|move/.test(type) ? 1 : 0, button: 0 };
        try { el.dispatchEvent(new PointerEvent('pointer' + type, init)); } catch (e) {}
        try { el.dispatchEvent(new MouseEvent(type === 'down' ? 'mousedown' : type === 'up' ? 'mouseup' : 'mousemove', init)); } catch (e) {}
        try { if (type !== 'move' || init.buttons) { var t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y }); el.dispatchEvent(new TouchEvent(type === 'down' ? 'touchstart' : type === 'up' ? 'touchend' : 'touchmove', { touches: type === 'up' ? [] : [t], targetTouches: type === 'up' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })); } } catch (e) {}
        if (type === 'up') try { el.dispatchEvent(new MouseEvent('click', init)); } catch (e) {}
      };
      var tap = function (x, y) { ptr('down', x, y); setTimeout(function () { ptr('up', x, y); }, 60); };
      var press = function (k, ms) { keyEv('keydown', k); setTimeout(function () { keyEv('keyup', k); }, ms || 90); };
      // A screenshot: every visible canvas drawn into one small picture, plus a tiny thumbnail to compare frames.
      var shot = function () {
        var W = innerWidth || 1, H = innerHeight || 1, k = Math.min(1, 400 / Math.max(W, H));
        var out = document.createElement('canvas'); out.width = Math.max(1, Math.round(W * k)); out.height = Math.max(1, Math.round(H * k));
        var x = out.getContext('2d'), bg = getComputedStyle(document.body).backgroundColor;
        x.fillStyle = !bg || bg === 'rgba(0, 0, 0, 0)' ? '#000' : bg; x.fillRect(0, 0, out.width, out.height);
        var cs = [].slice.call(document.querySelectorAll('canvas')).filter(function (c) { return c !== out && c.width && c.height && c.getClientRects().length; });
        cs.forEach(function (c) { var r = c.getBoundingClientRect(); try { x.drawImage(c, r.left * k, r.top * k, r.width * k, r.height * k); } catch (e) {} });
        var th = document.createElement('canvas'); th.width = 32; th.height = 18;
        var tx = th.getContext('2d'); tx.drawImage(out, 0, 0, 32, 18);
        var px = tx.getImageData(0, 0, 32, 18).data, seen = {}, colors = 0, thumb = [];
        for (var i = 0; i < px.length; i += 4) { var q = (px[i] >> 4) + '.' + (px[i + 1] >> 4) + '.' + (px[i + 2] >> 4); if (!seen[q]) { seen[q] = 1; colors++; } thumb.push(px[i], px[i + 1], px[i + 2]); }
        return { img: out.toDataURL('image/jpeg', 0.7), colors: colors, thumb: thumb, canvases: cs.length };
      };
      // Read the canvases right after the game draws a frame, so WebGL buffers are still filled in.
      var snap = function (fn) { requestAnimationFrame(function () { requestAnimationFrame(function () { var s; try { s = shot(); } catch (e) { s = null; } fn(s); }); }); };
      var shots = [];
      window.addEventListener('load', function () {
        var W = function () { return innerWidth || 1; }, H = function () { return innerHeight || 1; };
        setTimeout(function () { snap(function (s) { shots[0] = s; }); }, 900);
        setTimeout(function () { press(KEYS[0]); press(KEYS[10]); tap(W() / 2, H() / 2); }, 1150);
        var t0 = Date.now(), busy = setInterval(function () {
          if (Date.now() - t0 > 3300) { clearInterval(busy); return; }
          var r = Math.random();
          if (r < 0.55) press(KEYS[Math.floor(Math.random() * KEYS.length)], 80 + Math.random() * 320);
          else if (r < 0.85) tap(W() * (0.1 + Math.random() * 0.8), H() * (0.15 + Math.random() * 0.75));
          else { var y = H() * (0.3 + Math.random() * 0.5); ptr('down', W() * 0.3, y); ptr('move', W() * 0.7, y); setTimeout(function () { ptr('up', W() * 0.7, y); }, 120); }
        }, 140);
        setTimeout(function () { snap(function (s) { shots[1] = s; }); }, 2700);
        setTimeout(function () {
          snap(function (s) {
            shots[2] = s;
            var ok = shots.filter(Boolean), diff = 0;
            if (shots[1] && shots[2]) { for (var i = 0; i < shots[1].thumb.length; i++) diff += Math.abs(shots[1].thumb[i] - shots[2].thumb[i]); diff /= shots[1].thumb.length; }
            post({ t: 'test', shots: ok.map(function (x) { return x.img; }), colors: ok.map(function (x) { return x.colors; }), canvases: ok.length ? ok[ok.length - 1].canvases : 0, moved: diff > 1.5, text: String(document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) });
          });
        }, 4500);
      });
    }
    window.addEventListener('error', function (e) { post({ t: 'error', v: String(e.message || 'Script error') + (e.lineno ? ' (line ' + e.lineno + ')' : '') }); });
    window.addEventListener('unhandledrejection', function (e) { post({ t: 'error', v: 'Unhandled promise rejection: ' + String((e.reason && e.reason.message) || e.reason) }); });
    window.addEventListener('pointerdown', function () { try { window.focus(); } catch (e) {} });
  }
  /* ---------------- SP3D: a small WebGL 3D engine for AI-built games ----------------
     Injected (with the SDK, not hashed) into any game whose code mentions SP3D, so a 3D game stays
     a small self-contained file. Shapes, a camera, one sun light with ambient fog, transform parents,
     blob shadows, particle bursts, a 2D HUD canvas on top, and helpers for picking and collisions. */
  function SP3D_LIB() {
    var SHAPES = {};
    function geo(name) {
      if (SHAPES[name]) return SHAPES[name];
      var p = [], n = [], uv = [], idx = [];
      function v(x, y, z, nx, ny, nz, u, w) { p.push(x, y, z); n.push(nx, ny, nz); uv.push(u || 0, w || 0); return p.length / 3 - 1; }
      function quad(a, b, c, d) { idx.push(a, b, c, a, c, d); }
      var i, j, S = 24, R = 12;
      if (name === 'box') {
        var F = [[0, 0, 1, 1, 0, 0, 0, 1, 0], [0, 0, -1, -1, 0, 0, 0, 1, 0], [1, 0, 0, 0, 0, -1, 0, 1, 0], [-1, 0, 0, 0, 0, 1, 0, 1, 0], [0, 1, 0, 1, 0, 0, 0, 0, -1], [0, -1, 0, 1, 0, 0, 0, 0, 1]];
        for (i = 0; i < 6; i++) {
          var f = F[i], b = p.length / 3;
          for (j = 0; j < 4; j++) {
            var su = (j === 1 || j === 2) ? 0.5 : -0.5, sv = j >= 2 ? 0.5 : -0.5;
            v(f[0] * 0.5 + f[3] * su + f[6] * sv, f[1] * 0.5 + f[4] * su + f[7] * sv, f[2] * 0.5 + f[5] * su + f[8] * sv, f[0], f[1], f[2], su + 0.5, 0.5 - sv);
          }
          quad(b, b + 1, b + 2, b + 3);
        }
      } else if (name === 'plane') {
        v(-0.5, 0, 0.5, 0, 1, 0, 0, 1); v(0.5, 0, 0.5, 0, 1, 0, 1, 1); v(0.5, 0, -0.5, 0, 1, 0, 1, 0); v(-0.5, 0, -0.5, 0, 1, 0, 0, 0); quad(0, 1, 2, 3);
      } else if (name === 'sprite') {
        v(-0.5, -0.5, 0, 0, 0, 1, 0, 1); v(0.5, -0.5, 0, 0, 0, 1, 1, 1); v(0.5, 0.5, 0, 0, 0, 1, 1, 0); v(-0.5, 0.5, 0, 0, 0, 1, 0, 0); quad(0, 1, 2, 3);
      } else if (name === 'sphere') {
        for (i = 0; i <= R; i++) for (j = 0; j <= S; j++) {
          var th = i * Math.PI / R, ph = j * 2 * Math.PI / S, x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
          v(x * 0.5, y * 0.5, z * 0.5, x, y, z, j / S, i / R);
        }
        for (i = 0; i < R; i++) for (j = 0; j < S; j++) { var a = i * (S + 1) + j; quad(a, a + 1, a + S + 2, a + S + 1); }
      } else if (name === 'cylinder' || name === 'cone') {
        var top = name === 'cone' ? 0 : 0.5, sl = name === 'cone' ? 0.5 : 0;
        for (j = 0; j <= S; j++) {
          var an = j * 2 * Math.PI / S, c = Math.cos(an), s = Math.sin(an), l = Math.sqrt(1 + sl * sl);
          v(c * 0.5, -0.5, s * 0.5, c / l, sl / l, s / l, j / S, 1); v(c * top, 0.5, s * top, c / l, sl / l, s / l, j / S, 0);
        }
        for (j = 0; j < S; j++) quad(j * 2, j * 2 + 2, j * 2 + 3, j * 2 + 1);
        var cb = v(0, -0.5, 0, 0, -1, 0), ct = top ? v(0, 0.5, 0, 0, 1, 0) : -1;
        for (j = 0; j <= S; j++) {
          var a2 = j * 2 * Math.PI / S;
          v(Math.cos(a2) * 0.5, -0.5, Math.sin(a2) * 0.5, 0, -1, 0);
          if (top) v(Math.cos(a2) * top, 0.5, Math.sin(a2) * top, 0, 1, 0);
        }
        var st = top ? 2 : 1, base = ct >= 0 ? ct + 1 : cb + 1;
        for (j = 0; j < S; j++) {
          idx.push(cb, base + j * st, base + (j + 1) * st);
          if (top) idx.push(ct, base + (j + 1) * st + 1, base + j * st + 1);
        }
      } else if (name === 'torus') {
        for (i = 0; i <= R; i++) for (j = 0; j <= S; j++) {
          var u = i * 2 * Math.PI / R, w = j * 2 * Math.PI / S, cx = Math.cos(w), sx = Math.sin(w), cu = Math.cos(u), su2 = Math.sin(u);
          v((0.35 + 0.15 * cu) * cx, 0.15 * su2, (0.35 + 0.15 * cu) * sx, cu * cx, su2, cu * sx, j / S, i / R);
        }
        for (i = 0; i < R; i++) for (j = 0; j < S; j++) { var t = i * (S + 1) + j; quad(t, t + S + 1, t + S + 2, t + 1); }
      } else return geo('box');
      SHAPES[name] = { p: new Float32Array(p), n: new Float32Array(n), u: new Float32Array(uv), i: new Uint16Array(idx) };
      return SHAPES[name];
    }
    function hex(c) {
      if (Array.isArray(c)) return c;
      var m = String(c || '#ffffff').replace('#', '');
      if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
      var k = parseInt(m, 16) || 0;
      return [(k >> 16 & 255) / 255, (k >> 8 & 255) / 255, (k & 255) / 255];
    }
    function mul(a, b) {
      var o = new Float32Array(16);
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
      return o;
    }
    function trs(m) {
      var cx = Math.cos(m.rx || 0), sx = Math.sin(m.rx || 0), cy = Math.cos(m.ry || 0), sy = Math.sin(m.ry || 0), cz = Math.cos(m.rz || 0), sz = Math.sin(m.rz || 0);
      // R = Ry * Rx * Rz (yaw, then pitch, then roll)
      var r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
      var r10 = cx * sz, r11 = cx * cz, r12 = -sx;
      var r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
      var a = m.sx == null ? (m.size == null ? 1 : m.size) : m.sx, b = m.sy == null ? (m.size == null ? 1 : m.size) : m.sy, c = m.sz == null ? (m.size == null ? 1 : m.size) : m.sz;
      return new Float32Array([r00 * a, r10 * a, r20 * a, 0, r01 * b, r11 * b, r21 * b, 0, r02 * c, r12 * c, r22 * c, 0, m.x || 0, m.y || 0, m.z || 0, 1]);
    }
    function world(m) { var w = trs(m); return m.parent ? mul(world(m.parent), w) : w; }
    function normalMat(w) {
      var a = w[0], b = w[1], c = w[2], d = w[4], e = w[5], f = w[6], g = w[8], h = w[9], k = w[10];
      var A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
      return new Float32Array([A / det, B / det, C / det, -(b * k - c * h) / det, (a * k - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]);
    }
    function look(eye, at, up) {
      var zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2], zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
      var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx, xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
      var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
    }
    function persp(fov, asp, near, far) {
      var f = 1 / Math.tan(fov * Math.PI / 360), nf = 1 / (near - far);
      return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    }
    var VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;uniform mat4 uVP;uniform mat4 uM;uniform mat3 uNM;uniform vec2 uR;varying vec3 vN;varying float vD;varying vec2 vU;void main(){vec4 w=uM*vec4(aP,1.0);vN=normalize(uNM*aN);vU=aU*uR;gl_Position=uVP*w;vD=gl_Position.w;}';
    var FS = 'precision mediump float;varying vec3 vN;varying float vD;varying vec2 vU;uniform vec3 uC;uniform vec3 uL;uniform vec3 uLC;uniform vec3 uA;uniform float uE;uniform float uO;uniform vec3 uF;uniform vec2 uFR;uniform sampler2D uT;uniform float uTx;void main(){vec4 t=uTx>0.5?texture2D(uT,fract(vU)):vec4(1.0);if(t.a<0.05)discard;vec3 b=uC*t.rgb;float d=max(dot(normalize(vN),-uL),0.0);vec3 c=b*(uA+uLC*d*(1.0-uE))+b*uE;float f=clamp((vD-uFR.x)/max(uFR.y-uFR.x,0.001),0.0,1.0);gl_FragColor=vec4(mix(c,uF,f),uO*t.a);}';

    function create(opts) {
      opts = opts || {};
      var canvas = opts.canvas || document.createElement('canvas'), hudC = document.createElement('canvas');
      if (!opts.canvas) document.body.appendChild(canvas);
      document.body.appendChild(hudC);
      var css = 'position:fixed;left:0;top:0;width:100%;height:100%;display:block;';
      canvas.style.cssText = css + 'touch-action:none;'; hudC.style.cssText = css + 'pointer-events:none;';
      document.documentElement.style.cssText += ';margin:0;height:100%;overflow:hidden;'; document.body.style.cssText += ';margin:0;height:100%;overflow:hidden;';
      var gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('This device cannot show 3D games (WebGL is off).');
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
      var prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
      var L = {}; ['uVP', 'uM', 'uNM', 'uC', 'uL', 'uLC', 'uA', 'uE', 'uO', 'uF', 'uFR', 'uT', 'uTx', 'uR'].forEach(function (k) { L[k] = gl.getUniformLocation(prog, k); });
      var aP = gl.getAttribLocation(prog, 'aP'), aN = gl.getAttribLocation(prog, 'aN'), aU = gl.getAttribLocation(prog, 'aU');
      /* Pictures as textures: m.image is a picture name (SP.image) or an Image/canvas. Uploaded once it has loaded. */
      var texCache = typeof Map === 'function' ? new Map() : null;
      function texOf(img) {
        if (typeof img === 'string') img = SP.image(img);
        if (!img || !texCache || !(img.width || img.naturalWidth) || img.complete === false) return null;
        var t = texCache.get(img);
        if (t) return t;
        t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.pixelArt || img.pixel ? gl.NEAREST : gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        texCache.set(img, t); return t;
      }
      var bufs = {};
      function buf(name) {
        if (bufs[name]) return bufs[name];
        var g = geo(name), b = { p: gl.createBuffer(), n: gl.createBuffer(), u: gl.createBuffer(), i: gl.createBuffer(), count: g.i.length };
        gl.bindBuffer(gl.ARRAY_BUFFER, b.u); gl.bufferData(gl.ARRAY_BUFFER, g.u, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.bufferData(gl.ARRAY_BUFFER, g.p, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.bufferData(gl.ARRAY_BUFFER, g.n, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.i, gl.STATIC_DRAW);
        return (bufs[name] = b);
      }
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      var W = 1, H = 1, dpr = 1, vp = null, list = [], parts = [];
      var G = {
        canvas: canvas,
        hud: hudC.getContext('2d'),
        width: 1, height: 1,
        background: opts.background || '#0b0f2a',
        camera: { x: 0, y: 6, z: 10, tx: 0, ty: 0, tz: 0, fov: 60, near: 0.1, far: 400 },
        light: { x: -0.4, y: -1, z: -0.3, color: '#ffffff', ambient: 0.35 },
        fog: opts.fog || null,
        add: function (shape, o) {
          var m = { shape: shape || 'box', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, color: '#ffffff', emissive: 0, opacity: 1, visible: true, shadow: false, parent: null };
          for (var k in o) m[k] = o[k];
          m.remove = function () { var i = list.indexOf(m); if (i >= 0) list.splice(i, 1); };
          m.world = function () { var w = world(m); return { x: w[12], y: w[13], z: w[14] }; };
          list.push(m); return m;
        },
        clear: function () { list.length = 0; parts.length = 0; },
        get objects() { return list.slice(); },
        burst: function (x, y, z, o) {
          o = o || {};
          for (var i = 0; i < (o.count || 16); i++) {
            var sp = o.speed || 4;
            parts.push({ m: { shape: 'box', x: x, y: y, z: z, size: o.size || 0.15, color: o.color || '#ffd84d', emissive: 0.6, opacity: 1, rx: SP.rand() * 6, ry: SP.rand() * 6 },
              vx: (SP.rand() - 0.5) * sp * 2, vy: SP.rand() * sp * 1.4, vz: (SP.rand() - 0.5) * sp * 2, life: o.life || 0.8, t: 0 });
          }
        },
        project: function (x, y, z) {
          if (!vp) return null;
          var X = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], Y = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], Wc = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
          if (Wc <= 0) return null;
          return { x: (X / Wc * 0.5 + 0.5) * W, y: (0.5 - Y / Wc * 0.5) * H };
        },
        ground: function (sx, sy, h) {
          var c = G.camera, f = 1 / Math.tan(c.fov * Math.PI / 360), nx = (sx / W) * 2 - 1, ny = 1 - (sy / H) * 2;
          var e = [c.x, c.y, c.z], zx = c.x - c.tx, zy = c.y - c.ty, zz = c.z - c.tz, zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
          var xx = zz, xz = -zx, xl = Math.hypot(xx, xz) || 1; xx /= xl; xz /= xl;
          var yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
          var dx = nx * (W / H) / f * xx + ny / f * yx - zx, dy = ny / f * yy - zy, dz = nx * (W / H) / f * xz + ny / f * yz - zz;
          if (Math.abs(dy) < 1e-6) return null;
          var t = ((h || 0) - e[1]) / dy;
          return t > 0 ? { x: e[0] + dx * t, y: h || 0, z: e[2] + dz * t } : null;
        },
        render: function (dt) {
          resize();
          dt = Math.min(dt || 0.016, 0.1);
          for (var i = parts.length - 1; i >= 0; i--) {
            var q = parts[i]; q.t += dt; q.vy -= 12 * dt; q.m.x += q.vx * dt; q.m.y += q.vy * dt; q.m.z += q.vz * dt; q.m.opacity = Math.max(0, 1 - q.t / q.life);
            if (q.t >= q.life) parts.splice(i, 1);
          }
          var bg = hex(G.background), c = G.camera;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          vp = mul(persp(c.fov, W / H, c.near, c.far), look([c.x, c.y, c.z], [c.tx, c.ty, c.tz], [0, 1, 0]));
          gl.uniformMatrix4fv(L.uVP, false, vp);
          var lt = G.light, ll = Math.hypot(lt.x, lt.y, lt.z) || 1, lc = hex(lt.color), fog = G.fog;
          gl.uniform3f(L.uL, lt.x / ll, lt.y / ll, lt.z / ll); gl.uniform3fv(L.uLC, lc); gl.uniform3f(L.uA, lt.ambient, lt.ambient, lt.ambient);
          gl.uniform3fv(L.uF, fog ? hex(fog.color || G.background) : bg); gl.uniform2f(L.uFR, fog ? fog.near : 1e6, fog ? fog.far : 1e7);
          var draw = [], shadows = [];
          for (i = 0; i < list.length; i++) { var m = list[i]; if (!m.visible) continue; if (m.shape === 'sprite' && !m.parent) m.ry = Math.atan2(c.x - m.x, c.z - m.z); var vis = true; for (var p = m.parent; p; p = p.parent) if (!p.visible) vis = false; if (!vis) continue; var w = world(m); draw.push([m, w]); if (m.shadow) shadows.push([m, w]); }
          for (i = 0; i < parts.length; i++) draw.push([parts[i].m, trs(parts[i].m)]);
          for (i = 0; i < shadows.length; i++) {
            var sm = shadows[i][1], sx = Math.hypot(sm[0], sm[1], sm[2]), sz = Math.hypot(sm[8], sm[9], sm[10]);
            draw.push([{ shape: 'cylinder', color: '#000000', emissive: 1, opacity: 0.28 }, trs({ shape: 'cylinder', x: sm[12], y: (shadows[i][0].shadowY || 0) + 0.01, z: sm[14], sx: sx * 0.9, sy: 0.001, sz: sz * 0.9 })]);
          }
          draw.sort(function (a, b) { return (a[0].opacity < 1) - (b[0].opacity < 1); });
          var cur = null;
          for (i = 0; i < draw.length; i++) {
            var o = draw[i][0], wm = draw[i][1], b2 = buf(o.shape);
            if (cur !== b2) {
              gl.bindBuffer(gl.ARRAY_BUFFER, b2.p); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
              gl.bindBuffer(gl.ARRAY_BUFFER, b2.n); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
              gl.bindBuffer(gl.ARRAY_BUFFER, b2.u); gl.enableVertexAttribArray(aU); gl.vertexAttribPointer(aU, 2, gl.FLOAT, false, 0, 0);
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b2.i); cur = b2;
            }
            var tx = o.image ? texOf(o.image) : null;
            if (tx) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tx); gl.uniform1i(L.uT, 0); }
            gl.uniform1f(L.uTx, tx ? 1 : 0); gl.uniform2f(L.uR, o.repeat || 1, o.repeat || 1);
            gl.uniformMatrix4fv(L.uM, false, wm); gl.uniformMatrix3fv(L.uNM, false, normalMat(wm));
            gl.uniform3fv(L.uC, hex(o.image && o.color == null ? '#ffffff' : o.color)); gl.uniform1f(L.uE, o.emissive || 0); gl.uniform1f(L.uO, o.opacity == null ? 1 : o.opacity);
            gl.depthMask(!(o.opacity < 1));
            if (o.shape === 'plane' || o.shape === 'sprite') gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
            gl.drawElements(gl.TRIANGLES, b2.count, gl.UNSIGNED_SHORT, 0);
          }
          gl.depthMask(true);
        },
        /* Runs update(dt, t) then draws, every frame. Clear and draw the HUD inside update. */
        start: function (update) {
          var last = performance.now();
          function frame(now) {
            var dt = Math.min((now - last) / 1000, 0.1); last = now;
            resize(); G.hud.setTransform(dpr, 0, 0, dpr, 0, 0); G.hud.clearRect(0, 0, W, H);
            if (update) update(dt, now / 1000);
            G.render(dt);
            requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        },
      };
      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = window.innerWidth || 1, h = window.innerHeight || 1;
        if (w !== W || h !== H || canvas.width !== Math.round(w * dpr)) {
          W = G.width = w; H = G.height = h;
          canvas.width = hudC.width = Math.round(w * dpr); canvas.height = hudC.height = Math.round(h * dpr);
        }
      }
      resize();
      return G;
    }
    /* Overlap of two objects' boxes (scale only, rotation ignored), with an optional margin. */
    function hit(a, b, pad) {
      pad = pad || 0;
      function ext(m, k) { var v = m['s' + k]; return (v == null ? (m.size == null ? 1 : m.size) : v) / 2; }
      var A = a.world ? a.world() : a, B = b.world ? b.world() : b;
      return Math.abs(A.x - B.x) < ext(a, 'x') + ext(b, 'x') + pad && Math.abs(A.y - B.y) < ext(a, 'y') + ext(b, 'y') + pad && Math.abs(A.z - B.z) < ext(a, 'z') + ext(b, 'z') + pad;
    }
    function dist(a, b) { var A = a.world ? a.world() : a, B = b.world ? b.world() : b; return Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z); }
    window.SP3D = { create: create, hit: hit, dist: dist, color: hex };
  }
  /* Games run offline: this policy blocks every network request a game could make (fetch, images,
     fonts, form posts), so a game cannot send anything a player types or does to another site. */
  /* ---------------- SP2D: a small 2D game engine for AI-built games ----------------
     Injected (with the SDK, not hashed) into any game whose code mentions SP2D. The best ideas of
     Phaser and KAPLAY in a few KB: objects with sprites, shapes or text, arcade physics against
     solid tiles, tile-map levels from strings, a following camera with shake, overlap callbacks,
     tweens, timers, particles, scenes, keyboard + pointer input with on-screen touch buttons, a HUD. */
  function SP2D_LIB() {
    var EASE = {
      linear: function (t) { return t; },
      in: function (t) { return t * t; },
      out: function (t) { return 1 - (1 - t) * (1 - t); },
      inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
      back: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
      bounce: function (t) { var n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
    };
    var KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyZ: 'action', KeyX: 'action2', Enter: 'start', KeyJ: 'action', KeyK: 'action2', ShiftLeft: 'action2' };
    function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    /* A picture is ready once it has pixels: a loaded Image, or any canvas (SP.sprite, SP.paint or your own). */
    function ready(im) { return !!im && im.complete !== false && !!(im.naturalWidth || im.width); }
    function create(opts) {
      opts = opts || {};
      var canvas = document.createElement('canvas'), x = canvas.getContext('2d');
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;display:block;touch-action:none;';
      document.body.appendChild(canvas);
      document.documentElement.style.cssText += ';margin:0;height:100%;overflow:hidden;'; document.body.style.cssText += ';margin:0;height:100%;overflow:hidden;';
      var list = [], tiles = null, tweens = [], timers = [], parts = [], pairs = [], scenes = {}, btns = [], layers = [], frameFn = null, shakeT = 0, shakeA = 0;
      var dpr = 1, sw = 1, sh = 1, scale = 1, ox = 0, oy = 0, lastT = 0, acc = 0, STEP = 1 / 120;
      var held = {}, pressed = {}, pointer = { x: 0, y: 0, sx: 0, sy: 0, down: false, pressed: false };
      var G = {
        canvas: canvas, ctx: x, hud: x,
        width: opts.width || 0, height: opts.height || 0,
        background: opts.background || '#101828',
        gravity: opts.gravity == null ? 0 : opts.gravity,
        pixelArt: opts.pixelArt !== false, // crisp pixels unless a game turns it off
        camera: { x: 0, y: 0, zoom: 1, target: null, lerp: 0.12, bounds: null,
          follow: function (o, lerp) { this.target = o; if (lerp != null) this.lerp = lerp; },
          shake: function (amount, secs) { shakeA = Math.max(shakeA, amount || 6); shakeT = Math.max(shakeT, secs || 0.25); } },
        keys: held, pressed: pressed, pointer: pointer, time: 0, paused: false,
        add: function (o) {
          var m = { x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, ax: 0, ay: 0, shape: 'rect', color: '#ffffff', alpha: 1, rotation: 0, scale: 1, flipX: false, z: 0,
            visible: true, body: false, solid: false, gravity: 1, bounce: 0, drag: 0, maxSpeed: 0, onGround: false, hud: false, tags: [], alive: true, anchor: 0 };
          for (var k in o) m[k] = o[k];
          if (typeof m.tags === 'string') m.tags = m.tags.split(/\s+/);
          if (m.tag) m.tags.push(m.tag);
          if (typeof m.image === 'string') m.image = SP.image(m.image);
          if (m.size) { m.w = m.w || m.size; m.h = m.h || m.size; }
          if (m.shape === 'text') { m.font = m.font || 'bold 20px system-ui,sans-serif'; m.align = m.align || 'center'; }
          if (!m.w) m.w = m.r ? m.r * 2 : 16; if (!m.h) m.h = m.r ? m.r * 2 : 16;
          m.is = function (t) { return m.tags.indexOf(t) >= 0; };
          m.remove = function () { m.alive = false; };
          m.hits = function (t) { var all = typeof t === 'string' ? G.all(t) : [t]; for (var i = 0; i < all.length; i++) if (all[i] !== m && all[i].alive && overlap(m, all[i])) return all[i]; return null; };
          m.center = function () { return { x: m.x + m.w / 2, y: m.y + m.h / 2 }; };
          m.moveTo = function (px, py, speed) { var dx = px - (m.x + m.w / 2), dy = py - (m.y + m.h / 2), d = Math.hypot(dx, dy) || 1; m.vx = dx / d * speed; m.vy = dy / d * speed; };
          list.push(m); return m;
        },
        all: function (tag) { var out = []; for (var i = 0; i < list.length; i++) if (list[i].alive && (!tag || list[i].is(tag))) out.push(list[i]); return out; },
        first: function (tag) { for (var i = 0; i < list.length; i++) if (list[i].alive && list[i].is(tag)) return list[i]; return null; },
        /* A level from strings: one character per tile. legend maps a character to tile settings
           ({ color, image, solid, oneWay, tag }) or to a function (x, y) that spawns objects there. */
        level: function (rows, size, legend) {
          size = size || 32; legend = legend || {};
          var t = { size: size, rows: rows.length, cols: 0, grid: [], list: [] };
          for (var r = 0; r < rows.length; r++) {
            t.grid.push([]); t.cols = Math.max(t.cols, rows[r].length);
            for (var c = 0; c < rows[r].length; c++) {
              var ch = rows[r][c], d = legend[ch], cell = null;
              if (typeof d === 'function') d(c * size, r * size, ch);
              else if (d) { cell = { x: c * size, y: r * size, w: size, h: size, col: c, row: r, ch: ch, color: d.color || '#5b6b8c', image: typeof d.image === 'string' ? SP.image(d.image) : d.image || null, solid: d.solid !== false, oneWay: !!d.oneWay, tags: d.tag ? [d.tag] : [], draw: d.draw || null }; t.list.push(cell); }
              t.grid[r].push(cell);
            }
          }
          t.at = function (px, py) { var row = t.grid[Math.floor(py / size)]; return row ? row[Math.floor(px / size)] || null : null; };
          t.remove = function (cell) { if (!cell) return; t.grid[cell.row][cell.col] = null; var i = t.list.indexOf(cell); if (i >= 0) t.list.splice(i, 1); };
          t.width = t.cols * size; t.height = t.rows * size;
          G.camera.bounds = { x: 0, y: 0, w: t.width, h: t.height };
          tiles = t; return t;
        },
        get tiles() { return tiles; },
        /* A background layer that scrolls at factor x the camera (0 stays put, 1 moves with the world) and
           repeats sideways: image is a canvas (SP.paint, SP.sprite) or a picture; y is its top in screen pixels. */
        parallax: function (image, factor, y, o) {
          var l = { image: typeof image === 'string' ? SP.image(image) : image, factor: factor == null ? 0.5 : +factor, y: y || 0, scale: (o && o.scale) || 1, factorY: (o && o.factorY) || 0, alive: true };
          l.remove = function () { l.alive = false; var i = layers.indexOf(l); if (i >= 0) layers.splice(i, 1); };
          layers.push(l); return l;
        },
        /* Calls fn(a, b) every frame that an object tagged a overlaps one tagged b. */
        overlap: function (a, b, fn) { pairs.push({ a: a, b: b, fn: fn }); },
        tween: function (o, to, ms, ease, done) {
          var tw = { o: o, from: {}, to: to, ms: ms || 300, t: 0, ease: EASE[ease] || (typeof ease === 'function' ? ease : EASE.out), done: done };
          for (var k in to) tw.from[k] = o[k];
          tweens.push(tw); return tw;
        },
        after: function (secs, fn) { var t = { t: secs, fn: fn, every: 0 }; timers.push(t); return t; },
        every: function (secs, fn) { var t = { t: secs, fn: fn, every: secs }; timers.push(t); return t; },
        burst: function (px, py, o) {
          o = o || {};
          for (var i = 0; i < (o.count || 14); i++) {
            var a = SP.rand() * Math.PI * 2, s = (o.speed || 160) * (0.4 + SP.rand() * 0.8);
            parts.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: o.life || 0.6, t: 0, size: o.size || 4, color: o.color || '#ffd84d', g: o.gravity || 0, hud: !!o.hud });
          }
        },
        /* On-screen touch buttons that press the same keys as the keyboard, shown on touch screens:
           names from 'left', 'right', 'up', 'down', 'jump', 'action', 'action2'. */
        buttons: function (names) { btns = (names || ['left', 'right', 'jump']).map(function (n) { return { name: n, x: 0, y: 0, r: 0, ids: {} }; }); layoutButtons(); },
        scene: function (name, fn) { scenes[name] = fn; },
        go: function (name, data) { G.clear(); if (scenes[name]) scenes[name](data); },
        clear: function () { list.length = 0; layers.length = 0; tiles = null; tweens.length = 0; timers.length = 0; parts.length = 0; pairs.length = 0; G.camera.target = null; G.camera.bounds = null; G.camera.x = 0; G.camera.y = 0; },
        toWorld: function (px, py) { return { x: (px - G.width / 2) / G.camera.zoom + G.camera.x + G.width / 2, y: (py - G.height / 2) / G.camera.zoom + G.camera.y + G.height / 2 }; },
        start: function (fn) { frameFn = fn; lastT = 0; if (!G.running) { G.running = true; requestAnimationFrame(loop); } },
      };
      var touchy = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        sw = window.innerWidth || 1; sh = window.innerHeight || 1;
        canvas.width = Math.round(sw * dpr); canvas.height = Math.round(sh * dpr);
        if (opts.width && opts.height) { scale = Math.min(sw / opts.width, sh / opts.height); ox = (sw - opts.width * scale) / 2; oy = (sh - opts.height * scale) / 2; G.width = opts.width; G.height = opts.height; }
        else { scale = 1; ox = 0; oy = 0; G.width = sw; G.height = sh; }
        layoutButtons();
      }
      function layoutButtons() {
        var r = Math.max(28, Math.min(46, Math.min(G.width, G.height) * 0.08)), pad = r * 0.5;
        var left = btns.filter(function (b) { return /^(left|right|up|down)$/.test(b.name); }), right = btns.filter(function (b) { return !/^(left|right|up|down)$/.test(b.name); });
        left.forEach(function (b, i) { b.r = r; b.x = pad + r + i * (r * 2.3); b.y = G.height - pad - r; });
        right.forEach(function (b, i) { b.r = r; b.x = G.width - pad - r - i * (r * 2.3); b.y = G.height - pad - r; });
      }
      function toGame(e) { return { x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale }; }
      function press(name) { if (!held[name]) pressed[name] = true; held[name] = true; }
      function hitButtons(id, p, on) {
        var any = false;
        btns.forEach(function (b) {
          var inside = touchy && Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.25;
          if (on && inside) { b.ids[id] = 1; press(b.name); any = true; }
          if (!on || !inside) { if (b.ids[id]) { delete b.ids[id]; if (!Object.keys(b.ids).length) held[b.name] = false; } }
        });
        return any;
      }
      addEventListener('keydown', function (e) { var k = KEYMAP[e.code]; if (k) { press(k); e.preventDefault(); } if (e.code === 'Space' || e.code === 'Enter') press('start'); });
      addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) held[k] = false; if (e.code === 'Space' || e.code === 'Enter') held.start = false; });
      addEventListener('blur', function () { for (var k in held) held[k] = false; });
      canvas.addEventListener('pointerdown', function (e) {
        var p = toGame(e); pointer.sx = p.x; pointer.sy = p.y;
        if (hitButtons(e.pointerId, p, true)) return;
        var w = G.toWorld(p.x, p.y); pointer.x = w.x; pointer.y = w.y; pointer.down = true; pointer.pressed = true; press('start');
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      });
      canvas.addEventListener('pointermove', function (e) { var p = toGame(e); pointer.sx = p.x; pointer.sy = p.y; var w = G.toWorld(p.x, p.y); pointer.x = w.x; pointer.y = w.y; if (btns.length && e.pointerType !== 'mouse') hitButtons(e.pointerId, p, e.buttons > 0); });
      function up(e) { hitButtons(e.pointerId, toGame(e), false); pointer.down = false; held.start = false; }
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      addEventListener('resize', resize);
      resize();

      function solidAt(m, axis) {
        if (!tiles) return null;
        var s = tiles.size, c0 = Math.floor(m.x / s), c1 = Math.floor((m.x + m.w - 0.01) / s), r0 = Math.floor(m.y / s), r1 = Math.floor((m.y + m.h - 0.01) / s);
        for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
          var cell = tiles.grid[r] && tiles.grid[r][c];
          if (!cell || !cell.solid) continue;
          if (cell.oneWay && !(axis === 'y' && m.vy > 0 && m.prevBottom <= cell.y + 0.01)) continue;
          return cell;
        }
        return null;
      }
      function solids() { var out = []; for (var i = 0; i < list.length; i++) if (list[i].alive && list[i].solid) out.push(list[i]); return out; }
      function physics(dt) {
        var walls = solids();
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (!m.alive) continue;
          m.vx += m.ax * dt; m.vy += (m.ay + (m.body ? G.gravity * m.gravity : 0)) * dt;
          if (m.drag) { var f = Math.max(0, 1 - m.drag * dt); m.vx *= f; if (!m.body || !G.gravity) m.vy *= f; }
          if (m.maxSpeed) { var sp = Math.hypot(m.vx, m.vy); if (sp > m.maxSpeed) { m.vx *= m.maxSpeed / sp; m.vy *= m.maxSpeed / sp; } }
          if (!m.body) { m.x += m.vx * dt; m.y += m.vy * dt; continue; }
          m.prevBottom = m.y + m.h;
          m.x += m.vx * dt;
          var hit = solidAt(m, 'x') || hitWall(m, walls);
          if (hit) { if (m.vx > 0) m.x = hit.x - m.w; else if (m.vx < 0) m.x = hit.x + hit.w; m.vx = -m.vx * m.bounce; m.hitWall = hit; } else m.hitWall = null;
          m.y += m.vy * dt; m.onGround = false;
          hit = solidAt(m, 'y') || hitWall(m, walls);
          if (hit) {
            if (m.vy > 0) { m.y = hit.y - m.h; m.onGround = true; } else if (m.vy < 0) m.y = hit.y + hit.h;
            m.vy = Math.abs(m.vy) < 40 ? 0 : -m.vy * m.bounce; m.hitTile = hit;
          }
        }
      }
      function hitWall(m, walls) { for (var i = 0; i < walls.length; i++) if (walls[i] !== m && overlap(m, walls[i])) return walls[i]; return null; }
      function update(dt) {
        G.time += dt;
        for (var s = 0; s < 4 && acc >= STEP; s++, acc -= STEP) physics(STEP);
        if (acc > STEP * 4) acc = 0;
        for (var p = 0; p < pairs.length; p++) {
          var A = G.all(pairs[p].a), B = G.all(pairs[p].b);
          for (var i = 0; i < A.length; i++) for (var j = 0; j < B.length; j++) if (A[i] !== B[j] && A[i].alive && B[j].alive && overlap(A[i], B[j])) pairs[p].fn(A[i], B[j]);
        }
        for (var t = tweens.length - 1; t >= 0; t--) {
          var tw = tweens[t]; tw.t += dt * 1000; var k = Math.min(1, tw.t / tw.ms), e = tw.ease(k);
          for (var key in tw.to) tw.o[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
          if (k >= 1) { tweens.splice(t, 1); if (tw.done) tw.done(); }
        }
        for (var n = timers.length - 1; n >= 0; n--) { var tm = timers[n]; tm.t -= dt; if (tm.t <= 0) { if (tm.every) tm.t += tm.every; else timers.splice(n, 1); tm.fn(); } }
        for (var q = parts.length - 1; q >= 0; q--) { var pa = parts[q]; pa.t += dt; pa.vy += pa.g * dt; pa.x += pa.vx * dt; pa.y += pa.vy * dt; if (pa.t >= pa.life) parts.splice(q, 1); }
        for (var r = list.length - 1; r >= 0; r--) if (!list[r].alive) list.splice(r, 1);
        var c = G.camera;
        if (c.target) {
          var tx = c.target.x + c.target.w / 2 - G.width / 2, ty = c.target.y + c.target.h / 2 - G.height / 2;
          c.x += (tx - c.x) * Math.min(1, c.lerp * 60 * dt); c.y += (ty - c.y) * Math.min(1, c.lerp * 60 * dt);
        }
        if (c.bounds) {
          var vw = G.width / c.zoom, vh = G.height / c.zoom, cx = c.x + G.width / 2, cy = c.y + G.height / 2;
          cx = c.bounds.w <= vw ? c.bounds.x + c.bounds.w / 2 : Math.max(c.bounds.x + vw / 2, Math.min(c.bounds.x + c.bounds.w - vw / 2, cx));
          cy = c.bounds.h <= vh ? c.bounds.y + c.bounds.h / 2 : Math.max(c.bounds.y + vh / 2, Math.min(c.bounds.y + c.bounds.h - vh / 2, cy));
          c.x = cx - G.width / 2; c.y = cy - G.height / 2;
        }
        if (shakeT > 0) shakeT -= dt; else shakeA = 0;
      }
      function drawObj(m) {
        if (!m.visible || m.alpha <= 0) return;
        x.save(); x.globalAlpha = Math.max(0, Math.min(1, m.alpha));
        x.translate(m.x + m.w / 2, m.y + m.h / 2);
        if (m.rotation) x.rotate(m.rotation);
        if (m.scale !== 1) x.scale(m.scale, m.scale);
        if (m.flipX) x.scale(-1, 1);
        if (m.draw) m.draw(x, m);
        else if (m.anim || m.image) {
          // anim: [frames] plays at fps (default 8); image is one picture or canvas.
          var im = m.anim && m.anim.length ? m.anim[Math.floor(G.time * (m.fps || 8)) % m.anim.length] : m.image;
          if (ready(im)) x.drawImage(im, -m.w / 2, -m.h / 2, m.w, m.h); else { x.fillStyle = m.color; x.fillRect(-m.w / 2, -m.h / 2, m.w, m.h); }
        }
        else if (m.shape === 'circle') { x.fillStyle = m.color; x.beginPath(); x.arc(0, 0, Math.min(m.w, m.h) / 2, 0, Math.PI * 2); x.fill(); }
        else if (m.shape === 'text') { x.fillStyle = m.color; x.font = m.font; x.textAlign = m.align; x.textBaseline = 'middle'; x.fillText(String(m.text == null ? '' : m.text), 0, 0); }
        else if (m.shape === 'triangle') { x.fillStyle = m.color; x.beginPath(); x.moveTo(0, -m.h / 2); x.lineTo(m.w / 2, m.h / 2); x.lineTo(-m.w / 2, m.h / 2); x.closePath(); x.fill(); }
        else { x.fillStyle = m.color; if (m.radius) { x.beginPath(); if (x.roundRect) x.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, m.radius); else x.rect(-m.w / 2, -m.h / 2, m.w, m.h); x.fill(); } else x.fillRect(-m.w / 2, -m.h / 2, m.w, m.h); }
        x.restore();
      }
      function render() {
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.imageSmoothingEnabled = !G.pixelArt;
        x.fillStyle = opts.letterbox || '#000'; x.fillRect(0, 0, sw, sh);
        x.translate(ox, oy); x.scale(scale, scale);
        x.save(); x.beginPath(); x.rect(0, 0, G.width, G.height); x.clip();
        x.fillStyle = G.background; x.fillRect(0, 0, G.width, G.height);
        for (var li = 0; li < layers.length; li++) {
          var ly = layers[li], lim = ly.image;
          if (!ready(lim)) continue;
          var lw = (lim.naturalWidth || lim.width) * ly.scale, lh = (lim.naturalHeight || lim.height) * ly.scale;
          var lx = -((G.camera.x * ly.factor) % lw); if (lx > 0) lx -= lw;
          for (var px = lx; px < G.width; px += lw) x.drawImage(lim, Math.floor(px), Math.floor(ly.y - G.camera.y * ly.factorY), Math.ceil(lw), lh);
        }
        var c = G.camera, kx = shakeA ? (SP.rand() - 0.5) * shakeA * 2 : 0, ky = shakeA ? (SP.rand() - 0.5) * shakeA * 2 : 0;
        x.save();
        x.translate(G.width / 2 + kx, G.height / 2 + ky); x.scale(c.zoom, c.zoom); x.translate(-G.width / 2 - c.x, -G.height / 2 - c.y);
        var vx0 = c.x - G.width, vy0 = c.y - G.height, vx1 = c.x + G.width * 2, vy1 = c.y + G.height * 2;
        if (tiles) for (var i = 0; i < tiles.list.length; i++) {
          var t = tiles.list[i];
          if (t.x + t.w < vx0 || t.x > vx1 || t.y + t.h < vy0 || t.y > vy1) continue;
          if (t.draw) t.draw(x, t);
          else if (ready(t.image)) x.drawImage(t.image, t.x, t.y, t.w, t.h);
          else { x.fillStyle = t.color; x.fillRect(t.x, t.y, t.w + 0.5, t.h + 0.5); }
        }
        var world = list.filter(function (m) { return !m.hud; }).sort(function (a, b) { return a.z - b.z; });
        for (var j = 0; j < world.length; j++) drawObj(world[j]);
        for (var p = 0; p < parts.length; p++) { var pa = parts[p]; if (pa.hud) continue; x.globalAlpha = 1 - pa.t / pa.life; x.fillStyle = pa.color; x.fillRect(pa.x - pa.size / 2, pa.y - pa.size / 2, pa.size, pa.size); }
        x.globalAlpha = 1;
        x.restore();
        var hud = list.filter(function (m) { return m.hud; }).sort(function (a, b) { return a.z - b.z; });
        for (var h = 0; h < hud.length; h++) drawObj(hud[h]);
        for (var q = 0; q < parts.length; q++) { var pb = parts[q]; if (!pb.hud) continue; x.globalAlpha = 1 - pb.t / pb.life; x.fillStyle = pb.color; x.fillRect(pb.x - pb.size / 2, pb.y - pb.size / 2, pb.size, pb.size); }
        x.globalAlpha = 1;
      }
      function drawButtons() {
        if (!touchy || !btns.length) return;
        var label = { left: '◀', right: '▶', up: '▲', down: '▼', jump: '⤒', action: 'A', action2: 'B' };
        btns.forEach(function (b) {
          x.globalAlpha = held[b.name] ? 0.55 : 0.32; x.fillStyle = '#ffffff'; x.beginPath(); x.arc(b.x, b.y, b.r, 0, Math.PI * 2); x.fill();
          x.globalAlpha = 0.9; x.fillStyle = '#111111'; x.font = 'bold ' + Math.round(b.r * 0.8) + 'px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label[b.name] || b.name[0].toUpperCase(), b.x, b.y + 1);
        });
        x.globalAlpha = 1;
      }
      function loop(now) {
        requestAnimationFrame(loop);
        var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60; lastT = now;
        if (!G.paused) { acc += dt; update(dt); }
        render();
        if (frameFn) { x.save(); frameFn(G.paused ? 0 : dt, G.time); x.restore(); }
        drawButtons();
        x.restore();
        for (var k in pressed) pressed[k] = false;
        pointer.pressed = false;
      }
      return G;
    }
    window.SP2D = { create: create, ease: EASE, overlap: overlap, dist: function (a, b) { return Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2); } };
  }
  /* ---------------- SPSound: sound effects and music made in code ----------------
     Injected into any game whose code mentions SPSound. Ready-made effects and a procedural music
     maker (bass, chords, melody and drums from a mood), all Web Audio, started on the first input. */
  function SPSOUND_LIB() {
    var AC = window.AudioContext || window.webkitAudioContext, ctx = null, master = null, musicBus = null, sfxBus = null, song = null, vol = { master: 0.8, music: 0.45, sfx: 0.8 };
    function ensure() {
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC(); master = ctx.createGain(); master.gain.value = vol.master; master.connect(ctx.destination);
        musicBus = ctx.createGain(); musicBus.gain.value = vol.music; musicBus.connect(master);
        sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { addEventListener(ev, function () { ensure(); if (song && !song.timer) schedule(song); }, { capture: true }); });
    var noiseBuf = null;
    function noise() {
      if (noiseBuf) return noiseBuf;
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return noiseBuf;
    }
    function tone(bus, t, o) {
      var g = ctx.createGain(), dur = o.dur || 0.15, peak = o.vol == null ? 0.3 : o.vol;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var src;
      if (o.wave === 'noise') { src = ctx.createBufferSource(); src.buffer = noise(); }
      else { src = ctx.createOscillator(); src.type = o.wave || 'square'; src.frequency.setValueAtTime(o.freq || 440, t); if (o.to) src.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur); }
      var out = g;
      if (o.filter) { var f = ctx.createBiquadFilter(); f.type = o.filterType || 'lowpass'; f.frequency.value = o.filter; src.connect(f); f.connect(g); } else src.connect(g);
      g.connect(bus); src.start(t); src.stop(t + dur + 0.05);
      return out;
    }
    var SFX = {
      jump: [{ wave: 'square', freq: 300, to: 700, dur: 0.16, vol: 0.2 }],
      coin: [{ wave: 'square', freq: 988, dur: 0.07, vol: 0.18 }, { wave: 'square', freq: 1319, dur: 0.22, vol: 0.18, at: 0.07 }],
      hit: [{ wave: 'sawtooth', freq: 220, to: 60, dur: 0.18, vol: 0.25 }, { wave: 'noise', dur: 0.12, vol: 0.2, filter: 1800 }],
      explode: [{ wave: 'noise', dur: 0.6, vol: 0.45, filter: 900 }, { wave: 'sine', freq: 120, to: 30, dur: 0.5, vol: 0.4 }],
      shoot: [{ wave: 'square', freq: 880, to: 220, dur: 0.12, vol: 0.14 }],
      powerup: [0, 1, 2, 3].map(function (i) { return { wave: 'triangle', freq: 523 * Math.pow(1.26, i), dur: 0.12, vol: 0.22, at: i * 0.07 }; }),
      lose: [0, 1, 2].map(function (i) { return { wave: 'triangle', freq: 392 / Math.pow(1.19, i), dur: 0.28, vol: 0.25, at: i * 0.2 }; }),
      win: [0, 1, 2, 3].map(function (i) { return { wave: 'square', freq: [523, 659, 784, 1047][i], dur: i === 3 ? 0.45 : 0.12, vol: 0.18, at: i * 0.1 }; }),
      click: [{ wave: 'sine', freq: 1200, dur: 0.04, vol: 0.15 }],
      step: [{ wave: 'noise', dur: 0.05, vol: 0.08, filter: 600 }],
    };
    /* Plays a named effect ('jump', 'coin', 'hit', 'explode', 'shoot', 'powerup', 'lose', 'win',
       'click', 'step') or a custom one ({ wave, freq, to, dur, vol }). opts.pitch scales the pitch. */
    function sfx(name, opts) {
      if (!ensure() || window.SP && SP.muted) return;
      var parts = typeof name === 'string' ? SFX[name] : [].concat(name);
      if (!parts) return;
      var p = (opts && opts.pitch) || 1, t = ctx.currentTime + 0.005;
      parts.forEach(function (o) { var q = {}; for (var k in o) q[k] = o[k]; if (q.freq) q.freq *= p; if (q.to) q.to *= p; tone(sfxBus, t + (o.at || 0), q); });
    }
    var NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    function freqOf(n) { if (typeof n === 'number') return 440 * Math.pow(2, (n - 69) / 12); var m = /^([A-G])(#|b)?(-?\d)$/.exec(n); if (!m) return 0; return freqOf(12 * (+m[3] + 1) + NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)); }
    var MOODS = {
      happy: { bpm: 128, scale: [0, 2, 4, 5, 7, 9, 11], prog: [0, 4, 5, 3], root: 60, lead: 'square', drums: 'four' },
      chill: { bpm: 88, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4], root: 57, lead: 'triangle', drums: 'soft' },
      tense: { bpm: 140, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6], root: 52, lead: 'sawtooth', drums: 'drive' },
      epic: { bpm: 112, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], root: 50, lead: 'sawtooth', drums: 'four' },
      spooky: { bpm: 96, scale: [0, 1, 4, 5, 7, 8, 11], prog: [0, 1, 0, 5], root: 50, lead: 'sine', drums: 'soft' },
      retro: { bpm: 150, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 3], root: 60, lead: 'square', drums: 'drive' },
    };
    /* Builds a 4-bar loop from a mood with a seeded random melody, so a game's song is the same every run. */
    function compose(o) {
      var m = MOODS[o.mood] || MOODS.happy, seed = (o.seed == null ? 7 : o.seed) >>> 0;
      function rnd() { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
      var root = m.root + (o.key || 0), deg = function (d, oct) { var s = m.scale, n = s.length; return root + s[((d % n) + n) % n] + 12 * (Math.floor(d / n) + (oct || 0)); };
      var steps = [], degs = m.prog.map(function (p) { return Math.round(p * m.scale.length / 7); });
      var pos = 2;
      for (var bar = 0; bar < 4; bar++) {
        var chord = degs[bar];
        for (var s = 0; s < 16; s++) {
          var st = { bass: s % 4 === 0 ? deg(chord, -2) : null, chord: s === 0 ? [deg(chord), deg(chord + 2), deg(chord + 4)] : null, lead: null, kick: false, snare: false, hat: false };
          if (s % 2 === 0 && rnd() < 0.62) { pos += Math.round((rnd() - 0.5) * 4); pos = Math.max(-2, Math.min(9, pos)); if (s % 8 === 0) pos = chord + [0, 2, 4][Math.floor(rnd() * 3)]; st.lead = deg(pos, 1); }
          if (m.drums === 'four') { st.kick = s % 4 === 0; st.snare = s % 8 === 4; st.hat = s % 2 === 0; }
          else if (m.drums === 'drive') { st.kick = s % 4 === 0 || s === 10; st.snare = s % 8 === 4; st.hat = true; }
          else { st.kick = s === 0 || s === 8; st.hat = s % 4 === 2; }
          steps.push(st);
        }
      }
      return { bpm: o.bpm || m.bpm, steps: steps, lead: o.lead || m.lead };
    }
    function playStep(st, t, len, s) {
      if (st.bass) tone(musicBus, t, { wave: 'triangle', freq: freqOf(st.bass), dur: len * 3.5, vol: 0.32 });
      if (st.chord) st.chord.forEach(function (n) { tone(musicBus, t, { wave: 'sine', freq: freqOf(n), dur: len * 15, vol: 0.06, attack: 0.08 }); });
      if (st.lead) tone(musicBus, t, { wave: s.lead, freq: freqOf(st.lead), dur: len * 1.8, vol: 0.09, filter: 2600 });
      if (st.kick) tone(musicBus, t, { wave: 'sine', freq: 150, to: 40, dur: 0.16, vol: 0.5 });
      if (st.snare) tone(musicBus, t, { wave: 'noise', dur: 0.12, vol: 0.18, filter: 3000, filterType: 'highpass' });
      if (st.hat) tone(musicBus, t, { wave: 'noise', dur: 0.03, vol: 0.06, filter: 7000, filterType: 'highpass' });
    }
    function schedule(s) {
      if (!ensure() || s.timer) return;
      var len = 60 / s.bpm / 4, next = ctx.currentTime + 0.06, i = 0;
      s.timer = setInterval(function () {
        if (song !== s) { clearInterval(s.timer); return; }
        while (next < ctx.currentTime + 0.2) { playStep(s.steps[i % s.steps.length], next, len, s); next += len; i++; }
      }, 40);
    }
    /* Starts looping music: { mood: 'happy'|'chill'|'tense'|'epic'|'spooky'|'retro', key (semitones), bpm, seed }
       or your own song { bpm, steps: [{ bass, lead, chord: [notes], kick, snare, hat }, ...] } with
       notes as names ('C4', 'F#3') or MIDI numbers. Music starts once the player first taps or presses a key. */
    function music(o) {
      stop();
      o = o || {};
      song = o.steps ? { bpm: o.bpm || 120, steps: o.steps.map(function (st) { return st || {}; }), lead: o.lead || 'square' } : compose(o);
      if (ctx && ctx.state === 'running') schedule(song);
      return song;
    }
    function stop() { if (song && song.timer) clearInterval(song.timer); song = null; }
    function volume(kind, v) { if (v == null) { v = kind; kind = 'master'; } vol[kind] = Math.max(0, Math.min(1, +v || 0)); if (ctx) { var b = kind === 'music' ? musicBus : kind === 'sfx' ? sfxBus : master; b.gain.value = vol[kind]; } }
    window.SPSound = { sfx: sfx, music: music, stop: stop, volume: volume, note: freqOf, moods: Object.keys(MOODS), effects: Object.keys(SFX), get playing() { return !!(song && song.timer); }, get context() { return ctx; } };
  }
  const GAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; form-action 'none'";
  function withSDK(code, seed, opts) {
    const o = opts || {};
    const room = o.room ? { me: String(o.room.me), host: String(o.room.host), players: (o.room.players || []).map((p) => ({ id: String(p.id), name: String(p.name) })) } : null;
    const conf = JSON.stringify({ speed: +o.speed > 0 && +o.speed < 1 ? +o.speed : 1, calm: !!o.calm, mute: !!o.mute, room, test: !!o.test }).replace(/</g, '\\u003c');
    const tag = '<meta http-equiv="Content-Security-Policy" content="' + GAME_CSP + '">'
      + SCRIPT_OPEN + '(' + SDK.toString() + ')(' + (seed >>> 0) + ',' + conf + ');' + (/SP3D/.test(code) ? '(' + SP3D_LIB.toString() + ')();' : '') + (/SP2D/.test(code) ? '(' + SP2D_LIB.toString() + ')();' : '') + (/SPSound/.test(code) ? '(' + SPSOUND_LIB.toString() + ')();' : '') + SCRIPT_CLOSE;
    const head = code.match(/<head[^>]*>/i);
    if (head) return code.replace(head[0], head[0] + tag);
    const dt = code.match(/<!doctype[^>]*>/i);
    if (dt) return code.replace(dt[0], dt[0] + tag);
    return tag + code;
  }

  /* ---------------- starters ---------------- */
  const STARTERS = [
    { gid: 'kit-neon-dash',    kit: 'runner',  params: { title: 'Neon Dash',    palette: 'neon',   shape: 'block' },   desc: 'Sprint across a synth grid. Jump the blocks and chain the coins.' },
    { gid: 'kit-sky-hop',      kit: 'flap',    params: { title: 'Sky Hop',      palette: 'sunset', shape: 'orb' },     desc: 'One button. Thread the gaps as the sky speeds up.' },
    { gid: 'kit-star-siege',   kit: 'shooter', params: { title: 'Star Siege',   palette: 'mint',   shape: 'diamond' }, desc: 'Hold the line against descending waves. Big ones take three hits.' },
    { gid: 'kit-brickfall',    kit: 'breaker', params: { title: 'Brickfall',    palette: 'candy',  shape: 'orb' },     desc: 'Paddle and ball. Gold bricks take two hits, every level adds a row.' },
    { gid: 'kit-meteor-drift', kit: 'dodge',   params: { title: 'Meteor Drift', palette: 'forest', shape: 'star' },    desc: 'Slide through a meteor shower and catch the falling stars.' },
  ];
  async function starterGames(sha256hex) {
    const out = [];
    for (const s of STARTERS) {
      const params = normalizeParams(s.kit, s.params);
      const code = kitDoc(s.kit, params);
      out.push({ gid: s.gid, kit: s.kit, params, title: params.title, genre: KITS[s.kit].genre, desc: s.desc, code, hash: await sha256hex(code), size: code.length });
    }
    return out;
  }

  /* ---------------- procedural cover art ---------------- */
  const coverCache = new Map();
  function seeded(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function paletteFor(game) {
    if (game.params && game.params.palette === 'custom') return derivePalette(game.params.colors);
    if (game.params && PALETTES[game.params.palette]) return PALETTES[game.params.palette];
    const keys = Object.keys(PALETTES);
    const r = seeded(game.hash || game.gid || 'x');
    return PALETTES[keys[Math.floor(r() * keys.length)]];
  }
  function cover(game, w, h) {
    w = w || 480; h = h || 300;
    const key = (game.gid || '') + ':' + (game.hash || '') + ':' + w;
    if (coverCache.has(key)) return coverCache.get(key);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    const pal = paletteFor(game), r = seeded(game.hash || game.gid || 'x');
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, pal.bg1); g.addColorStop(1, pal.bg2);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = pal.fg;
    for (let i = 0; i < 40; i++) { x.globalAlpha = 0.15 + r() * 0.4; const s = 1 + r() * 2; x.fillRect(r() * w, r() * h * 0.7, s, s); }
    x.globalAlpha = 1;
    const kit = game.kit;
    const gy = h * 0.78;
    const star = (cx, cy, rad, col) => { x.fillStyle = col; x.beginPath(); for (let b = 0; b < 10; b++) { const an = -Math.PI / 2 + b * Math.PI / 5, rr = b % 2 ? rad * 0.45 : rad; x.lineTo(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr); } x.closePath(); x.fill(); };
    if (kit === 'runner') {
      x.fillStyle = pal.a2; x.fillRect(0, gy, w, 4); x.globalAlpha = 0.25; x.strokeStyle = pal.a2;
      for (let i = 0; i < w + 60; i += 40) { x.beginPath(); x.moveTo(i, gy + 4); x.lineTo(i - 50, h); x.stroke(); }
      x.globalAlpha = 1; x.fillStyle = pal.danger;
      for (let i = 0; i < 3; i++) { const bh = 30 + r() * 50; x.fillRect(w * (0.45 + i * 0.18), gy - bh, 26, bh); }
      x.fillStyle = pal.gold; x.beginPath(); x.arc(w * 0.55, gy - 110, 9, 0, 6.283); x.fill();
      x.fillStyle = pal.a1; x.fillRect(w * 0.18, gy - 70, 34, 34);
    } else if (kit === 'flap') {
      x.fillStyle = pal.a2;
      for (let i = 0; i < 3; i++) { const px = w * (0.38 + i * 0.24), top = h * (0.18 + r() * 0.3); x.fillRect(px, 0, 52, top); x.fillRect(px, top + h * 0.36, 52, h); }
      x.fillStyle = pal.a1; x.beginPath(); x.arc(w * 0.2, h * 0.48, 17, 0, 6.283); x.fill();
    } else if (kit === 'shooter') {
      for (let i = 0; i < 7; i++) { const fx = w * (0.12 + r() * 0.76), fy = h * (0.12 + r() * 0.4), fr = 10 + r() * 12; x.fillStyle = r() < 0.3 ? pal.danger : pal.a2; x.beginPath(); x.moveTo(fx, fy + fr); x.lineTo(fx + fr, fy - fr * 0.6); x.lineTo(fx, fy - fr * 0.2); x.lineTo(fx - fr, fy - fr * 0.6); x.closePath(); x.fill(); }
      x.fillStyle = pal.gold; for (let i = 0; i < 4; i++) x.fillRect(w * 0.5 - 2, h * (0.52 + i * 0.07), 4, 12);
      x.fillStyle = pal.a1; x.beginPath(); x.moveTo(w * 0.5, h * 0.74); x.lineTo(w * 0.5 + 20, h * 0.86); x.lineTo(w * 0.5, h * 0.82); x.lineTo(w * 0.5 - 20, h * 0.86); x.closePath(); x.fill();
    } else if (kit === 'breaker') {
      const cols = 8, bw = (w - 40 - (cols - 1) * 6) / cols;
      for (let row = 0; row < 4; row++) for (let c = 0; c < cols; c++) { if (r() < 0.15) continue; x.fillStyle = row % 2 ? pal.a2 : pal.a1; if (r() < 0.1) x.fillStyle = pal.gold; x.fillRect(20 + c * (bw + 6), 30 + row * 26, bw, 18); }
      x.fillStyle = pal.fg; x.fillRect(w * 0.4, h * 0.86, w * 0.2, 10); x.beginPath(); x.arc(w * 0.56, h * 0.62, 8, 0, 6.283); x.fill();
    } else if (kit === 'dodge') {
      for (let i = 0; i < 8; i++) { const cx = r() * w, cy = r() * h * 0.7, cr = 10 + r() * 16; x.fillStyle = pal.danger; x.beginPath(); for (let a = 0; a < 7; a++) { const an = a / 7 * 6.283, q = cr * (0.75 + ((a * 37) % 10) / 30); x.lineTo(cx + Math.cos(an) * q, cy + Math.sin(an) * q); } x.closePath(); x.fill(); }
      star(w * 0.7, h * 0.5, 13, pal.gold);
      star(w * 0.5, h * 0.84, 18, pal.a1);
    } else {
      x.globalAlpha = 0.35; x.strokeStyle = pal.a2;
      for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(0, gy + i * i * 3); x.lineTo(w, gy + i * i * 3); x.stroke(); }
      for (let i = -6; i <= 6; i++) { x.beginPath(); x.moveTo(w / 2 + i * 20, gy); x.lineTo(w / 2 + i * 90, h); x.stroke(); }
      x.globalAlpha = 1;
      x.fillStyle = pal.gold; x.beginPath(); x.arc(w * (0.25 + r() * 0.5), h * 0.36, 34 + r() * 20, 0, 6.283); x.fill();
      x.fillStyle = pal.bg2; for (let i = 0; i < 5; i++) x.fillRect(0, h * 0.3 + i * 9, w, 3);
      for (let i = 0; i < 4; i++) { const sx = r() * w, sy = gy - 30 - r() * 60, sr = 8 + r() * 14; x.fillStyle = [pal.a1, pal.a2, pal.danger][i % 3]; if (r() < 0.5) { x.beginPath(); x.arc(sx, sy, sr, 0, 6.283); x.fill(); } else x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
    }
    let url = '';
    try { url = cv.toDataURL('image/png'); } catch (e) { url = ''; }
    coverCache.set(key, url);
    return url;
  }

  root.PPKits = { PALETTES, SHAPES, KITS, STARTERS, CUSTOM_DEFAULT, kitDoc, normalizeParams, withSDK, starterGames, cover, paletteFor, derivePalette, cleanColors };
})(typeof window !== 'undefined' ? window : globalThis);
