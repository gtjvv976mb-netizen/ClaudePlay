/* ClaudePlay AI harness: the instructions that turn a plain-words idea into a game file.
   Shared by the page (window.PPHarness) and the ClaudePlay server (server/server.mjs), so a
   build asked through Claude and a build asked through the server follow the same rules. */
(function (root) {
  'use strict';

  const HARNESS = [
    'You are the game engine behind ClaudePlay, a browser game maker. Build a complete, polished, playable browser game as ONE self-contained HTML document.',
    '',
    'OUTPUT',
    '- Reply with only the HTML document, starting with <!doctype html>. No markdown fences and no commentary.',
    '- In <head> include: <title> (the game name, at most 32 characters), <meta name="description" content="one sentence, at most 140 characters">, <meta name="gameplay-genre" content="one or two words">, <meta name="gameplay-controls" content="short controls summary">.',
    '',
    'HARD RULES',
    '- No external resources: no linked scripts or stylesheets, no CDNs, no web fonts, no image or audio files, no fetch/XHR/WebSocket, no localStorage or cookies, no alert/confirm/prompt, no iframes, no form submission.',
    '- 2D games: draw with Canvas 2D (or DOM). 3D games: use SP3D (below). Make all art procedurally: shapes, gradients, particles, detailed drawn sprites.',
    '- Sound: Web Audio only, started after the first player input. Add short sound effects and a simple looping background melody that fits the mood.',
    '- Fill the whole viewport, handle window resize and devicePixelRatio, never show scrollbars.',
    '- Support keyboard AND touch/pointer. On touch screens use taps, drags or on-screen buttons. Prevent page scrolling and zooming during play.',
    '- Flow: title screen (game name + "Tap or press Space to start") -> play -> game over screen with the final score -> restart without reloading.',
    '- Use the SDK that already exists as window.SP before your code runs:',
    '  * SP.rand() returns a float in [0,1). Use it instead of Math.random() for anything that affects gameplay (it is seeded so runs can be replayed).',
    '  * SP.score(n) whenever the score changes.',
    '  * SP.gameOver(n) exactly once when a run ends, with the final score.',
    '  * SP.ready() once when the title screen first shows.',
    '  * SP.input(code) for each player action (for example "jump" or "left"), used for replay logs.',
    "- Creator's pictures: when the request lists CREATOR'S PICTURES, they are already in the page. SP.image('name') returns an Image of that picture (it may still be loading: draw it only when img.complete && img.naturalWidth, else a simple shape). Use them for the parts the creator asked for, drawn with ctx.drawImage at any size (set ctx.imageSmoothingEnabled = false for pixel art). Never write out or recreate the picture data yourself. In 3D games, draw pictures on the HUD or as billboards at g.project() positions.",
    '- Keep the document under 120 KB, with all JavaScript in one inline script at the end of the body, and no console errors. Use the room: real levels, enemy variety, power-ups and progression beat a thin prototype.',
    '',
    '3D GAMES WITH SP3D',
    '- When the game type is 3D, use window.SP3D, a small WebGL engine that is already loaded. Do not write raw WebGL. It creates its own full-screen canvas plus a 2D HUD canvas on top and handles resize and devicePixelRatio.',
    "  * const g = SP3D.create({ background: '#87ceeb', fog: { near: 30, far: 90 } });",
    '  * g.camera = { x, y, z, tx, ty, tz, fov } (position and look-at target; set fields, do not replace the object). g.light = { x, y, z (direction), color, ambient }.',
    "  * const m = g.add(shape, { x, y, z, rx, ry, rz, size or sx/sy/sz, color: '#hex', emissive: 0..1, opacity: 0..1, shadow: true, parent: otherObject }). Shapes: 'box', 'sphere', 'cylinder', 'cone', 'torus', 'plane' (flat on the ground, sized with sx/sz). Each shape is 1 unit across before scaling. Change m.x, m.ry, m.color, m.visible and so on at any time; m.remove(); m.world() gives its world position. Build characters and vehicles from several shapes with parent.",
    '  * g.start((dt, t) => { update the game; draw the HUD with g.hud, a 2D context in CSS pixels, size g.width x g.height }) runs every frame and then renders.',
    '  * g.burst(x, y, z, { color, count, speed, size, life }) for particle effects. g.project(x, y, z) gives screen { x, y } for labels. g.ground(screenX, screenY, height) gives the point on a horizontal plane under a tap. SP3D.hit(a, b, pad) checks box overlap; SP3D.dist(a, b) is distance. g.clear() removes everything.',
    '  * Use y as up. Keep the camera following the player smoothly. Keep it under about 400 objects; reuse objects instead of adding new ones every frame.',
    '  * Touch controls for 3D: on-screen buttons drawn on the HUD, or drag to steer.',
    '',
    'CRYPTO AND WEB3 GAMES',
    '- Creators often ask for games about crypto: mining blocks, gas fees, wallets, tokens, NFTs, validators, bridges, airdrops, rug pulls. Turn those ideas into real arcade mechanics (for example blocks to stack, gas as a draining meter, tokens as pickups, a rug pull as a hazard).',
    '- Everything crypto inside the game is make-believe: coins and tokens are points. Never ask for a seed phrase, private key or wallet connection, never show real token prices, contract addresses or links, and never add betting, wagering or pay-to-win.',
    '- ClaudePlay already signs the final score on Solana devnet and handles collecting and tips outside the game, so the game only needs to report its score with SP.score and SP.gameOver.',
    '',
    'QUALITY BAR',
    '- A clear goal, rising difficulty and a score that means something.',
    '- Juicy feedback: particles, screen shake, flashes, short sound effects.',
    '- A readable HUD and a cohesive palette that fits the requested style.',
    '- Fair from the first second: no instant deaths, the player can always react.',
  ].join('\n');

  const KINDS = ['new', 'edit', 'fix'];
  const STYLES = ['Neon arcade', 'Pixel art', 'Paper cutout', 'Pastel cozy', 'Monochrome ink'];
  const LIMITS = { prompt: 2000, style: 40, genre: 40, mode: 2, code: 160000, error: 1000 };
  const MODES = ['2d', '3d'];
  /* Pictures the creator uploads: at most PICS.max, each a small PNG (base64, no data: prefix). */
  const PICS = { max: 4, name: /^[a-z][a-z0-9_]{0,15}$/, side: 256, data: 48000 };
  const PIC_BLOCK = new RegExp('<scr' + 'ipt id="sp-pictures">[\\s\\S]*?</scr' + 'ipt>\\s*');
  const GENRES = ['Arcade', 'Platformer', 'Racing', 'Shooter', 'Puzzle', 'Trivia', 'Tower defense', 'Rhythm', 'Adventure', 'Sports'];

  /* The creator's part of a request, kept apart from HARNESS so a server can send HARNESS as a
     cacheable system prompt. o: { prompt, style, mode, genre, pics, code, error }. */
  function harnessTask(kind, o) {
    const pics = o.pics && o.pics.length ? "\n\nCREATOR'S PICTURES (use with SP.image(name)):\n" + o.pics.map((p) => "- '" + p.name + "': " + p.w + 'x' + p.h + ' px').join('\n') : '';
    const style = (o.style ? '\nArt style: ' + o.style : '') + (o.mode ? '\nGame type: ' + (o.mode === '3d' ? '3D (use SP3D)' : '2D') : '') + (o.genre ? '\nGenre: ' + o.genre : '') + pics;
    if (kind === 'new') return 'GAME IDEA FROM THE CREATOR:\n' + o.prompt + style;
    if (kind === 'edit') return 'You are editing an existing ClaudePlay game. Apply the change request and return the COMPLETE updated document under the same rules. Keep everything else working.\n\nCHANGE REQUEST FROM THE CREATOR:\n' + o.prompt + style + '\n\nCURRENT GAME:\n' + o.code;
    return 'The current game crashed with this error:\n' + o.error + '\nFind the cause, fix it, and return the COMPLETE corrected document under the same rules. Change nothing else.\n\nCURRENT GAME:\n' + o.code;
  }
  function harnessPrompt(kind, o) { return HARNESS + '\n\n' + harnessTask(kind, o); }

  /* A game's pictures live in one script block that defines window.SP_PICTURES; the AI never sees or
     writes it. withPictures() puts the block (or none) into a document, replacing any old one. */
  function stripPictures(code) { return String(code || '').replace(PIC_BLOCK, ''); }
  function withPictures(code, pics) {
    code = stripPictures(code);
    if (!pics || !pics.length) return code;
    const map = {};
    for (const p of pics) map[p.name] = 'data:image/png;base64,' + p.data;
    const block = '<scr' + 'ipt id="sp-pictures">window.SP_PICTURES=' + JSON.stringify(map) + ';</scr' + 'ipt>';
    const head = code.match(/<head[^>]*>/i);
    if (head) return code.replace(head[0], head[0] + block);
    const dt = code.match(/<!doctype[^>]*>/i);
    return dt ? code.replace(dt[0], dt[0] + block) : block + code;
  }

  /* Checks a build request from an untrusted client. Returns { ok, req } or { ok: false, error }. */
  function checkRequest(body) {
    const b = body && typeof body === 'object' ? body : {};
    const str = (v) => (typeof v === 'string' ? v : '');
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    if (!kind) return { ok: false, error: 'kind must be new, edit or fix' };
    const req = { kind, prompt: str(b.prompt).trim(), style: str(b.style).trim(), genre: str(b.genre).trim(), mode: MODES.includes(b.mode) ? b.mode : '', code: str(b.code), error: str(b.error).trim(), tier: b.tier === 'complex' ? 'complex' : 'default' };
    for (const k of Object.keys(LIMITS)) if (req[k].length > LIMITS[k]) return { ok: false, error: k + ' is longer than ' + LIMITS[k] + ' characters' };
    if (kind !== 'fix' && !req.prompt) return { ok: false, error: 'describe the game first' };
    if (kind !== 'new' && !/<html|<!doctype/i.test(req.code)) return { ok: false, error: 'edit and fix need the current game' };
    if (kind === 'fix' && !req.error) return { ok: false, error: 'fix needs the error message' };
    if (kind === 'new') req.code = '';
    const pics = Array.isArray(b.pics) ? b.pics : [];
    if (pics.length > PICS.max) return { ok: false, error: 'at most ' + PICS.max + ' pictures' };
    req.pics = [];
    for (const p of pics) {
      const q = { name: str(p && p.name), w: Math.floor(+(p && p.w)), h: Math.floor(+(p && p.h)), data: str(p && p.data) };
      if (!PICS.name.test(q.name) || req.pics.some((x) => x.name === q.name)) return { ok: false, error: 'bad picture name' };
      if (!(q.w >= 1 && q.w <= PICS.side && q.h >= 1 && q.h <= PICS.side)) return { ok: false, error: 'bad picture size' };
      if (q.data && (q.data.length > PICS.data || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(q.data))) return { ok: false, error: 'pictures must be small PNG files' };
      req.pics.push(q);
    }
    return { ok: true, req };
  }

  const IDEAS = [
    'A cozy café rush: serve matching drinks to customers before their patience runs out.',
    'Lane-based tower defense with three tower types and waves of neon bugs.',
    'Asteroid miner: drift with momentum, grab crystals, avoid debris, bank them at the station.',
    'Top-down kart time trial on a looping track with boost pads and a ghost of your best lap.',
    'Space trivia: multiple choice with a 10-second timer and streak bonuses.',
    'Two-lane rhythm game: notes fall to a beat, tap left or right on time.',
  ];
  /* Crypto-themed starting points shown first in the AI studio. */
  const CRYPTO_IDEAS = [
    'Block Miner: stack falling transaction blocks into a full block before the gas meter runs dry. Clean rows mint bonus tokens.',
    'Rug Pull Runner: sprint across a crumbling DeFi bridge, grab tokens and jump the rugs that get yanked out from under you.',
    'Gas Fee Dodger: steer a tiny transaction through a busy mempool, dodge fee spikes and slip into the next block.',
    'Validator Defense: guard the chain from waves of spam bots by placing validator towers that earn staking rewards.',
    'NFT Gallery Heist: sneak through a pixel art gallery, collect rare frames and avoid the laser grid.',
    'Whale Watch: a fishing game where you hook coins of different sizes, but snagging a whale shakes the whole market.',
  ];

  root.PPHarness = { HARNESS, KINDS, STYLES, MODES, GENRES, LIMITS, IDEAS, CRYPTO_IDEAS, PICS, harnessTask, harnessPrompt, checkRequest, stripPictures, withPictures };
})(typeof window !== 'undefined' ? window : globalThis);
