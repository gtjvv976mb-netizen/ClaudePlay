# Design

ClaudePlay looks like a sticker pack. The page is the liner sheet, games are die-cut stickers, and the front page opens on a retail header card with a hang tab. Tokens live in `src/index.html`; every colour on the page comes from them.

## World

- **Liner sheet** (`--bg`, `--sheet`): a cool grey-white ground in light mode, near-black charcoal in dark mode.
- **World** (`--w-*`): the background game's palette. A sunny day arcade in light mode (sky blue, peach haze, pink grid), a synthwave night in dark mode (chartreuse grid, magenta haze).
- **Pack colour** (`--pack`, `--pack-ink`): one chartreuse that owns whole fields (the header card, primary buttons, the ClaudePlay column of the comparison, the "you" share of a split). Text on it is always `--pack-ink`. In the contrast theme it turns yellow on black.
- **Die-cut white** (`--die`, `--die-ink`): the thick border of every sticker, the console, the prompt label and the "Own it." label. It stays light in dark mode, like a real sticker, so text on it uses `--die-ink`.
- **Accent** (`--accent`): deep green in light mode, chartreuse in dark mode. Used for focus rings, link underlines and small status chips, never for large fills.

## Type

- **Dela Gothic One** for headings, sticker titles and numbers. One weight; always `font-weight: 400`. Sentence case, never uppercase.
- **Atkinson Hyperlegible** for everything else. Labels are bold body text, not mono and not uppercase.
- System mono only for real data: hashes, addresses, signed bytes.

## Shape and depth

- Radii: `--r-s` 10px (inputs), `--r-m` 16px (panels, tables), `--r-l` 26px (the pack, sheets, the earn panel). Controls are pills (999px). Stickers use 20px outside, 14px on the art.
- Shadows are soft lift shadows tinted from `--shadow`. No hard offset shadows, no glows, no black outlines.
- Stickers sit a few degrees off straight (`--r`, from the game's hash in `cartHTML()`), and straighten when pointed at.

## Motion

- **One screen**: on screens wider than 960px the front page is the header, the pack and a one-line footer, sized from the window height (`:root[data-route="home"]`). Phones scroll.
- **The background is a game**: behind the front page, a 3D kart races down a neon track through a city of cartridges, grabbing coins and jumping blocks (`homeWorld()` in app.js, raw WebGL). It drives itself; moving the mouse steers it and clicking an empty spot jumps. Its colors are the `--w-*` tokens. It holds still while the console game has focus, draws one still frame in calm motion, and is skipped in the contrast theme and on software rendering. Text never sits on it directly: the copy card, the shelf labels and the footer all have solid backgrounds.
- **Depth**: the pack follows the pointer (`packDepth()` sets `--px`/`--py`). The console tilts in 3D, and the peeking stickers, tag stickers (GG, +1 SOL, New best!) and Cart shift by their own depth `--d`. Loose stickers bob on their own clocks.

- **Slap**: stickers, the console, Cart and toasts land with a short overshoot (`@keyframes slap`).
- **Peel**: on hover or focus a sticker lifts and its bottom-right corner peels back, showing the sticker's back and the sheet under it (`.sticker::after`).
- Calm motion and `prefers-reduced-motion` switch every animation and transition off; content is visible without them.

## Components

- `.pack`: the front page layout over the background game. Its `.hero-copy` is the chartreuse card with the hang tab (`::before`); the open middle column is where the kart races.
- `.sticker`: a die-cut image. `.peek` stickers tuck behind the console on wide screens and hide on phones.
- `.mascot`: Cart, with the white die-cut border baked into `src/assets/mascot*.webp`.
- `.console`: the playable game, set into a large white sticker.
- `.flow-list`, `.earn-list`, `.ways`: label-and-text rows, used instead of rows of equal cards.

## Rules

- No eyebrow labels above page headings, no numbered steps, no rows of three equal cards.
- No em dashes in copy.
- Every theme (light, dark, contrast) must pass the e2e contrast audit, and nothing may scroll sideways at 390px with the largest text.
