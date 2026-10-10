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
    '- Draw with Canvas 2D (preferred) or DOM. Make all art procedurally: shapes, gradients, particles, simple drawn sprites. Sound is optional: Web Audio only, started after the first player input.',
    '- Fill the whole viewport, handle window resize and devicePixelRatio, never show scrollbars.',
    '- Support keyboard AND touch/pointer. On touch screens use taps, drags or on-screen buttons. Prevent page scrolling and zooming during play.',
    '- Flow: title screen (game name + "Tap or press Space to start") -> play -> game over screen with the final score -> restart without reloading.',
    '- Use the SDK that already exists as window.SP before your code runs:',
    '  * SP.rand() returns a float in [0,1). Use it instead of Math.random() for anything that affects gameplay (it is seeded so runs can be replayed).',
    '  * SP.score(n) whenever the score changes.',
    '  * SP.gameOver(n) exactly once when a run ends, with the final score.',
    '  * SP.ready() once when the title screen first shows.',
    '  * SP.input(code) for each player action (for example "jump" or "left"), used for replay logs.',
    '- Keep the document under 40 KB, with all JavaScript in one inline script at the end of the body, and no console errors.',
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
  const LIMITS = { prompt: 2000, style: 40, code: 60000, error: 1000 };

  /* The creator's part of a request, kept apart from HARNESS so a server can send HARNESS as a
     cacheable system prompt. o: { prompt, style, code, error }. */
  function harnessTask(kind, o) {
    const style = o.style ? '\nArt style: ' + o.style : '';
    if (kind === 'new') return 'GAME IDEA FROM THE CREATOR:\n' + o.prompt + style;
    if (kind === 'edit') return 'You are editing an existing ClaudePlay game. Apply the change request and return the COMPLETE updated document under the same rules. Keep everything else working.\n\nCHANGE REQUEST FROM THE CREATOR:\n' + o.prompt + style + '\n\nCURRENT GAME:\n' + o.code;
    return 'The current game crashed with this error:\n' + o.error + '\nFind the cause, fix it, and return the COMPLETE corrected document under the same rules. Change nothing else.\n\nCURRENT GAME:\n' + o.code;
  }
  function harnessPrompt(kind, o) { return HARNESS + '\n\n' + harnessTask(kind, o); }

  /* Checks a build request from an untrusted client. Returns { ok, req } or { ok: false, error }. */
  function checkRequest(body) {
    const b = body && typeof body === 'object' ? body : {};
    const str = (v) => (typeof v === 'string' ? v : '');
    const kind = KINDS.includes(b.kind) ? b.kind : null;
    if (!kind) return { ok: false, error: 'kind must be new, edit or fix' };
    const req = { kind, prompt: str(b.prompt).trim(), style: str(b.style).trim(), code: str(b.code), error: str(b.error).trim(), tier: b.tier === 'complex' ? 'complex' : 'default' };
    for (const k of Object.keys(LIMITS)) if (req[k].length > LIMITS[k]) return { ok: false, error: k + ' is longer than ' + LIMITS[k] + ' characters' };
    if (kind !== 'fix' && !req.prompt) return { ok: false, error: 'describe the game first' };
    if (kind !== 'new' && !/<html|<!doctype/i.test(req.code)) return { ok: false, error: 'edit and fix need the current game' };
    if (kind === 'fix' && !req.error) return { ok: false, error: 'fix needs the error message' };
    if (kind === 'new') req.code = '';
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

  root.PPHarness = { HARNESS, KINDS, STYLES, LIMITS, IDEAS, CRYPTO_IDEAS, harnessTask, harnessPrompt, checkRequest };
})(typeof window !== 'undefined' ? window : globalThis);
