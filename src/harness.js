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
    '- 2D games: use SP2D (below) for most games (platformers, top-down, shooters, puzzles on a grid); plain Canvas 2D or DOM is fine for unusual ones. 3D games: use SP3D (below). Make all art procedurally: shapes, gradients, particles, detailed drawn sprites, or the creator\'s pictures.',
    '- Sound: use SPSound (below) for sound effects and looping background music that fits the mood; raw Web Audio only for something it cannot do.',
    '- Fill the whole viewport, handle window resize and devicePixelRatio, never show scrollbars.',
    '- Support keyboard AND touch/pointer. On touch screens use taps, drags or on-screen buttons. Prevent page scrolling and zooming during play.',
    '- Flow: title screen (game name + "Tap or press Space to start") -> play -> game over screen with the final score -> restart without reloading.',
    '- Use the SDK that already exists as window.SP before your code runs:',
    '  * SP.rand() returns a float in [0,1). Use it instead of Math.random() for anything that affects gameplay (it is seeded so runs can be replayed).',
    '  * SP.score(n) whenever the score changes.',
    '  * SP.gameOver(n) exactly once when a run ends, with the final score.',
    '  * SP.ready() once when the title screen first shows.',
    '  * SP.input(code) for each player action (for example "jump" or "left"), used for replay logs.',
    "- Creator's pictures: when the request lists CREATOR'S PICTURES, they are already in the page. SP.image('name') returns an Image of that picture (it may still be loading: draw it only when img.complete && img.naturalWidth, else a simple shape). Use them for the parts the creator asked for, drawn with ctx.drawImage at any size (set ctx.imageSmoothingEnabled = false for pixel art). Never write out or recreate the picture data yourself. With SP2D pass image: 'name' to g.add; with SP3D use image: 'name' on a 'sprite' (or any shape as a texture).",
    '- Keep the document under 120 KB, with all JavaScript in one inline script at the end of the body, and no console errors. Use the room: real levels, enemy variety, power-ups and progression beat a thin prototype.',
    '',
    '3D GAMES WITH SP3D',
    '- When the game type is 3D, use window.SP3D, a small WebGL engine that is already loaded. Do not write raw WebGL. It creates its own full-screen canvas plus a 2D HUD canvas on top and handles resize and devicePixelRatio.',
    "  * const g = SP3D.create({ background: '#87ceeb', fog: { near: 30, far: 90 } });",
    '  * g.camera = { x, y, z, tx, ty, tz, fov } (position and look-at target; set fields, do not replace the object). g.light = { x, y, z (direction), color, ambient }.',
    "  * const m = g.add(shape, { x, y, z, rx, ry, rz, size or sx/sy/sz, color: '#hex', emissive: 0..1, opacity: 0..1, shadow: true, parent: otherObject, image: 'pictureName' or a canvas, repeat: n }). Shapes: 'box', 'sphere', 'cylinder', 'cone', 'torus', 'plane' (flat on the ground, sized with sx/sz), 'sprite' (an upright picture that always faces the camera, good for characters and items made from the creator's pictures). image textures the shape (repeat tiles it); transparent parts of a picture are cut out. Each shape is 1 unit across before scaling. Change m.x, m.ry, m.color, m.visible and so on at any time; m.remove(); m.world() gives its world position. Build characters and vehicles from several shapes with parent.",
    '  * g.start((dt, t) => { update the game; draw the HUD with g.hud, a 2D context in CSS pixels, size g.width x g.height }) runs every frame and then renders.',
    '  * g.burst(x, y, z, { color, count, speed, size, life }) for particle effects. g.project(x, y, z) gives screen { x, y } for labels. g.ground(screenX, screenY, height) gives the point on a horizontal plane under a tap. SP3D.hit(a, b, pad) checks box overlap; SP3D.dist(a, b) is distance. g.clear() removes everything.',
    '  * Use y as up. Keep the camera following the player smoothly. Keep it under about 400 objects; reuse objects instead of adding new ones every frame.',
    '  * Touch controls for 3D: on-screen buttons drawn on the HUD, or drag to steer.',
    '',
    '2D GAMES WITH SP2D',
    '- window.SP2D is a small 2D engine that is already loaded when your code mentions it. It creates its own full-screen canvas.',
    "  * const g = SP2D.create({ width: 480, height: 270, background: '#hex', gravity: 1400, pixelArt: true }). width/height set a fixed game resolution scaled to fit any screen (omit both to use the window size). All positions are in game pixels, y down.",
    "  * const o = g.add({ x, y, w, h (or size), shape: 'rect'|'circle'|'triangle'|'text', color, image: 'pictureName' or a canvas, text, font, radius, tag: 'player' (or tags: 'a b'), body: true (moves with gravity and collides with solids), solid: true (a wall others stand on), vx, vy, ax, ay, gravity: 1, bounce: 0..1, drag, maxSpeed, z, alpha, rotation, scale, flipX, hud: true (fixed on screen), draw: (ctx, o) => {...} (custom drawing centered on the object) }). o.onGround, o.hitWall, o.remove(), o.hits('tag'), o.is('tag'), o.center(), o.moveTo(x, y, speed). Change any field at any time.",
    "  * g.level(['#....C', '#P...#', '######'], 32, { '#': { color: '#hex' or image, solid: true, oneWay: false }, P: (x, y) => spawn the player there, C: (x, y) => spawn a coin }) builds a tile level from strings (one character per tile; solid tiles collide with bodies, oneWay tiles only from above) and sets the camera bounds. g.tiles.at(x, y) and g.tiles.remove(cell) for breakable tiles.",
    "  * g.overlap('player', 'coin', (p, c) => {...}) runs every frame two tagged objects overlap. g.all('tag'), g.first('tag').",
    "  * g.camera.follow(obj), g.camera.zoom, g.camera.shake(px, seconds). g.tween(obj, { y: 100, alpha: 0 }, ms, 'out'|'in'|'inOut'|'back'|'bounce'|'linear', done). g.after(seconds, fn), g.every(seconds, fn). g.burst(x, y, { color, count, speed, size, life, gravity }) for particles.",
    "  * Input: g.keys.left/right/up/down/jump/action/action2/start are true while held (arrows/WASD, Space = jump, Z/J = action, X/K = action2); g.pressed.<name> is true only on the frame it went down. g.pointer { x, y (world), sx, sy (screen), down, pressed }. g.buttons(['left', 'right', 'jump']) adds on-screen touch buttons that press the same keys on phones; use them for any game that needs keys.",
    "  * g.scene('title', (data) => {...}) and g.go('play', data) clear the world and build a scene. g.start((dt, t) => { game logic; then draw the HUD with g.hud, a 2D context in game pixels }) runs every frame after the world is drawn. g.paused stops physics and timers.",
    '',
    'MULTIPLAYER WITH SP.room',
    '- When the request says Players: multiplayer, make a game 2 to 8 people play together over the internet through SP.room. ClaudePlay handles rooms and invite links; the game only exchanges small JSON messages.',
    "  * SP.room.online is true in a room. SP.room.me is your player id, SP.room.players is [{ id, name }], SP.room.host is the id of the player whose game is the authority (SP.room.isHost), SP.room.name(id) gives a name.",
    "  * SP.room.send(data, toId) sends a small JSON object to everyone else (or to one player). SP.room.on('message', (data, fromId) => {}), on('join', p), on('leave', p), on('host', id) when the host changes.",
    '  * Design: the host runs the shared world (enemies, pickups, timers) and sends snapshots about 10 to 15 times a second; every player sends their own inputs or position about 15 times a second. Smooth other players toward their latest positions. Keep each message under 1 KB. Everyone in a room gets the same SP.rand() seed, so levels built from it match.',
    "  * Show every player's name and score, handle players joining and leaving mid-game, and when SP.room.online is false (playing alone) still make the game fun: computer opponents or a solo mode, plus a hint to use Play with friends.",
    '',
    'SOUND AND MUSIC WITH SPSound',
    "- window.SPSound is already loaded when your code mentions it, and starts after the first tap or key press. SPSound.sfx('jump'|'coin'|'hit'|'explode'|'shoot'|'powerup'|'lose'|'win'|'click'|'step', { pitch }) plays an effect. SPSound.music({ mood: 'happy'|'chill'|'tense'|'epic'|'spooky'|'retro', key: semitones, bpm, seed }) loops a composed track with bass, chords, melody and drums; call it again to change songs (for example a tense track for a boss) and SPSound.stop() to stop. SPSound.volume('music', 0..1).",
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
    const style = (o.style ? '\nArt style: ' + o.style : '') + (o.mode ? '\nGame type: ' + (o.mode === '3d' ? '3D (use SP3D)' : '2D') : '') + (o.genre ? '\nGenre: ' + o.genre : '') + (o.players === 'multi' ? '\nPlayers: multiplayer (use SP.room)' : '') + pics;
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

  /* ---------------- safety check before publishing ----------------
     Every game is checked before it joins the public arcade: quick pattern checks here (shared by
     the page and the server), then a review by Claude of the code, title, description and pictures. */
  const SCREEN_PROMPT = [
    'You review browser games before they are published on ClaudePlay, a public arcade where anyone, including teenagers, can play. You get the game title, description, any pictures the creator added, and the game code.',
    'Block the game if it contains or does any of these:',
    '- sexual content or nudity;',
    '- hate, slurs, or harassment of real people or of groups;',
    '- graphic gore or cruelty beyond cartoon arcade action;',
    '- encouragement of self-harm, eating disorders, or illegal drugs;',
    '- phishing or scams: asking for a seed phrase, private key, password, payment, wallet connection, or personal details;',
    '- real-money gambling or betting;',
    '- trying to escape its sandbox, reach the internet, track players, or mine crypto;',
    '- passing itself off as a real company, product or person in a misleading way.',
    'Allow everything else, including cartoon violence, spooky themes, and make-believe crypto (points called tokens, mining blocks, rug pulls as hazards).',
    'Reply with only JSON: {"verdict": "allow" or "block", "reasons": ["short reason a creator can act on", ...]} (reasons empty when allowed).',
  ].join('\n');
  /* Pattern checks that need no AI. Returns a list of reasons (empty = fine). */
  function staticScreen(code) {
    const c = stripPictures(code), out = [];
    if (/(seed|recovery|secret)\s+phrase|private\s+key|mnemonic/i.test(c) && /<input|<textarea|prompt\s*\(|contenteditable/i.test(c)) out.push('It asks players to type a seed phrase or private key.');
    if (/window\s*\.\s*(solana|ethereum|phantom|solflare|backpack)\b|ethereum\s*\.\s*request|solana\s*\.\s*connect/i.test(c)) out.push('It tries to connect to a crypto wallet. ClaudePlay handles wallets outside the game.');
    if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection)\s*\(|navigator\s*\.\s*sendBeacon|new\s+(XMLHttpRequest|WebSocket|EventSource|RTCPeerConnection)\b/.test(c)) out.push('It tries to reach the internet. Games must be self-contained.');
    if (/\b(top|parent)\s*\.\s*location|window\s*\.\s*open\s*\(/.test(c)) out.push('It tries to open or change other pages.');
    return out;
  }
  /* Reads Claude's verdict. Anything unclear counts as a block, so a confused review never lets a game through. */
  function parseScreen(text) {
    const m = String(text || '').match(/\{[\s\S]*\}/);
    try {
      const j = JSON.parse(m ? m[0] : '');
      const reasons = (Array.isArray(j.reasons) ? j.reasons : []).map((r) => String(r).slice(0, 200)).filter(Boolean).slice(0, 5);
      if (j.verdict === 'allow') return { ok: true, reasons: [] };
      if (j.verdict === 'block') return { ok: false, reasons: reasons.length ? reasons : ['The safety review did not allow this game.'] };
    } catch (e) { /* not JSON */ }
    return { ok: false, reasons: ['The safety review gave an unclear answer. Try again.'], unclear: true };
  }
  /* The pictures inside a game file, as [{ name, data }] (PNG base64), for the safety review. */
  function picturesOf(code) {
    const m = String(code || '').match(PIC_BLOCK);
    if (!m) return [];
    try {
      const map = JSON.parse(m[0].replace(/^[\s\S]*?window\.SP_PICTURES=/, '').replace(/;<\/scr[\s\S]*$/, ''));
      return Object.keys(map).slice(0, PICS.max).map((name) => ({ name, data: String(map[name]).replace(/^data:image\/png;base64,/, '') })).filter((p) => /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(p.data) && p.data.length <= PICS.data);
    } catch (e) { return []; }
  }

  /* Checks a build request from an untrusted client. Returns { ok, req } or { ok: false, error }. */
  function checkRequest(body) {
    const b = body && typeof body === 'object' ? body : {};
    const str = (v) => (typeof v === 'string' ? v : '');
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    if (!kind) return { ok: false, error: 'kind must be new, edit or fix' };
    const req = { kind, prompt: str(b.prompt).trim(), style: str(b.style).trim(), genre: str(b.genre).trim(), mode: MODES.includes(b.mode) ? b.mode : '', players: b.players === 'multi' ? 'multi' : '', code: str(b.code), error: str(b.error).trim(), tier: b.tier === 'complex' ? 'complex' : 'default' };
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

  root.PPHarness = { HARNESS, KINDS, STYLES, MODES, GENRES, LIMITS, IDEAS, CRYPTO_IDEAS, PICS, SCREEN_PROMPT, harnessTask, harnessPrompt, checkRequest, stripPictures, withPictures, staticScreen, parseScreen, picturesOf };
})(typeof window !== 'undefined' ? window : globalThis);
