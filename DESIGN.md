# Design

ClaudePlay is calm and professional: soft silver-grey surfaces, one muted slate-blue accent, Geist type, pill controls and quiet depth. A 3D game drives itself behind the front page in muted colors. The owner asked for "visually appealing but not saturated" and "professional" (2026-10-10), after turning down a loud night arcade and a chartreuse sticker pack. Tokens live in `src/index.html`; every colour on the page comes from them.

## World

- **Ground** (`--bg`, `--sheet`, `--panel`, `--panel-2`): cool silver-grey and white in light mode, graphite in dark mode. No saturated fields anywhere.
- **Ink fill** (`--pack`, `--pack-ink`): primary buttons and the logo square are filled with the ink colour (near-black in light, near-white in dark). In the contrast theme it turns yellow on black.
- **Surfaces over the game** (`--die`, `--die-ink`, `--die-ink-2`): the panels that sit on the background game (the copy card, the console, the game rail labels).
- **Accent** (`--accent`, `--accent-soft`): a muted slate blue tuned for text contrast in each theme. "Own it.", focus rings, link underlines, the focused prompt, list dots.
- **World** (`--w-*`): the background game's palette. Pale sky, soft grid, dusty pastels in light mode; a graphite night with muted pastels in dark mode.

## Type

- **Geist** (400 to 700) for everything. Headings are weight 600, sentence case, tight tracking (about -.02em to -.035em). Labels and controls are weight 500. No uppercase display type.
- **Geist Mono** only for real data: hashes, addresses, signed bytes.

## Shape and depth

- Radii: `--r-s` 8px (inputs, small controls), `--r-m` 12px (tiles), `--r-l` 20px (panels, the console, tables). Buttons, chips, tabs, segmented controls, nav items and the footer bar are pills.
- Surfaces have a 1px `--line` border and diffuse two-layer shadows (`--shadow` is faint). No glows.
- The front page's copy card and console use a double bezel: a translucent 6px ring and a hairline outside the panel.
- The active nav item, tab and segment is a raised white pill with a hairline ring.
- Game art sits in a hairline frame (`.sticker`, a historical class name). On hover it lifts a few pixels and a faint light sweep crosses the art.
- The header is translucent with a backdrop blur.

## Motion

- Easing is `cubic-bezier(.32, .72, 0, 1)` or `(.16, 1, .3, 1)`; nothing bounces.
- **One screen, every page**: the window never scrolls (`:root[data-fit]`, the default Page layout). `fitPanes()` in app.js groups a page's blocks into panes that fit the window and adds a pager (dots, the part's name, up and down buttons); the wheel, a vertical swipe and Page Up/Down flip parts with a short slide. On phones, single-column layouts split into their columns, and game shelves become a sideways swipe row. The game page and the studio stay with their title and let each column hold its own overflow; any other block taller than the window keeps its own scroll box. The Page layout setting ("Scrolling pages") brings back long pages.
- The front page on wide screens is the header, the copy card and console over the game, the game rail and a one-line footer, sized from the window height (`:root[data-route="home"]`).
- **The background is a game**: a kart cruises down a track through a city of cartridges, grabbing coins and jumping blocks (`homeWorld()` in app.js, raw WebGL). It is tuned slow (speed 14 to 20), with small bursts and little camera shake. It drives itself; moving the mouse steers it and clicking an empty spot jumps. It holds still while the console game has focus, draws one still frame in calm motion, and is skipped in the contrast theme and on software rendering. Text never sits on it directly.
- **Depth**: the copy card, the console (a slight 3D tilt) and Cart shift gently with the pointer (`packDepth()`, `--px`/`--py`).
- **Entrances**: panels and tiles rise and fade in (`@keyframes pop`, `rise`); the console fades in.
- Calm motion and `prefers-reduced-motion` switch every animation and transition off; content is visible without them.

## Components

- `.pack`: the front page layout over the background game. `.hero-copy` is the copy card; the open middle column is where the kart drives; `.pack-shelf` is the game rail.
- `.console`: the playable game in a framed panel.
- `.mascot`: Cart, with its white die-cut border baked into `src/assets/mascot*.webp`.
- `.flow-list`, `.ways`: label-and-text rows, used instead of rows of equal cards.

## Rules

- No eyebrow labels above page headings, no numbered steps, no rows of three equal cards.
- No em dashes in copy.
- Every theme (light, dark, contrast) must pass the e2e contrast audit, and nothing may scroll sideways at 390px with the largest text.
