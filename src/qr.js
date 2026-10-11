/* ClaudePlay QR codes: a small QR Code encoder (byte mode, error correction level M, versions 1 to 15),
   so a game page can show a code that opens the game on a phone. No libraries; it follows the
   QR Code spec (ISO/IEC 18004): Reed-Solomon over GF(256), interleaved blocks, eight masks scored
   with the standard penalty rules. Exposed as window.PPQR. */
(function (root) {
  'use strict';

  // Error correction level M, indexed by version (index 0 unused).
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];
  const MAX_VERSION = 15;
  const FORMAT_M = 0;

  function rawModules(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
    return n;
  }
  const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    const out = new Array(degree).fill(0); out[degree - 1] = 1;
    let r = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) { out[j] = gfMul(out[j], r); if (j + 1 < degree) out[j] ^= out[j + 1]; }
      r = gfMul(r, 0x02);
    }
    return out;
  }
  function rsRemainder(data, div) {
    const out = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ out.shift(); out.push(0);
      for (let i = 0; i < div.length; i++) out[i] ^= gfMul(div[i], f);
    }
    return out;
  }

  /* bytes: Uint8Array or array of bytes. Returns { size, modules: boolean[][] } (true = dark). */
  function encodeBytes(bytes, opts) {
    opts = opts || {};
    let ver = 0;
    for (let v = opts.minVersion || 1; v <= MAX_VERSION; v++) {
      const bits = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
      if (bits <= dataCodewords(v) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('Too long for a QR code');
    // Data bits: byte mode, length, the bytes, terminator, then pad bytes.
    const bb = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bb.length));
    put(0, (8 - bb.length % 8) % 8);
    for (let p = 0xec; bb.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
    const data = [];
    for (let i = 0; i < bb.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j]; data.push(v); }

    // Split into blocks, add error correction, interleave.
    const nb = NUM_BLOCKS[ver], ecc = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
    const shortCount = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecc);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecc + (i < shortCount ? 0 : 1));
      k += dat.length;
      const blk = dat.concat(rsRemainder(dat, div));
      if (i < shortCount) blk.splice(shortLen - ecc, 0, -1);
      blocks.push(blk);
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) if (blocks[j][i] !== -1) all.push(blocks[j][i]);

    const size = ver * 4 + 17;
    const mod = [], fn = [];
    for (let y = 0; y < size; y++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const setFn = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = [];
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      align.push(6);
      for (let pos = size - 7; align.length < n; pos -= step) align.splice(1, 0, pos);
    }
    for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask) => {
      const d = (FORMAT_M << 3) | mask;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const bits = ((d << 10) | r) ^ 0x5412, bit = (i) => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let r = ver;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const bits = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const b = ((bits >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); setFn(a, c, b); setFn(c, a, b); }
    }
    // Codewords in the zigzag order, two columns at a time from the bottom right.
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    let mask = opts.mask;
    if (mask == null) {
      let best = Infinity;
      for (let m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        const p = penalty(mod, size);
        if (p < best) { best = p; mask = m; }
        applyMask(m);
      }
    }
    applyMask(mask); drawFormat(mask);
    return { size, version: ver, mask, modules: mod };
  }

  /* The standard penalty: long runs, 2x2 blocks, finder-like patterns and dark/light balance. */
  function penalty(mod, size) {
    let score = 0;
    const addHistory = (len, h) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
    const countPatterns = (h) => {
      const n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    const terminate = (color, len, h) => { if (color) { addHistory(len, h); len = 0; } len += size; addHistory(len, h); return countPatterns(h); };
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let color = false, run = 0;
        const h = [0, 0, 0, 0, 0, 0, 0];
        for (let b = 0; b < size; b++) {
          const v = pass ? mod[b][a] : mod[a][b];
          if (v === color) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else { addHistory(run, h); if (!color) score += countPatterns(h) * 40; color = v; run = 1; }
        }
        score += terminate(color, run, h) * 40;
      }
    }
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (mod[y][x]) dark++;
      if (y < size - 1 && x < size - 1) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3; }
    }
    const total = size * size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }

  const utf8 = (s) => (typeof TextEncoder === 'function' ? new TextEncoder().encode(String(s)) : Uint8Array.from(unescape(encodeURIComponent(String(s))), (c) => c.charCodeAt(0)));
  function encodeText(text, opts) { return encodeBytes(utf8(text), opts); }

  /* An SVG of the code with a 4-module quiet zone. Colors are CSS values, so a page can pass tokens. */
  function svg(text, o) {
    o = o || {};
    const q = encodeText(text), n = q.size + 8;
    let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges"' + (o.label ? ' role="img" aria-label="' + String(o.label).replace(/[&<>"]/g, '') + '"' : ' aria-hidden="true"') + '>'
      + '<rect width="' + n + '" height="' + n + '" fill="' + (o.light || '#ffffff') + '"/><path d="' + d + '" fill="' + (o.dark || '#000000') + '"/></svg>';
  }

  root.PPQR = { encodeBytes, encodeText, svg, MAX_VERSION };
})(typeof window !== 'undefined' ? window : globalThis);
