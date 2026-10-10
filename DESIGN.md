# Design

ClaudePlay looks like a night arcade. A 3D game plays itself behind the front page, headings are tall arcade-marquee capitals, surfaces are solid with hairline borders, and one hot orange carries every action. Tokens live in `src/index.html`; every colour on the page comes from them.

## World

- **Ground** (`--bg`, `--sheet`, `--panel`): near-black with a violet cast in dark mode, warm paper in light mode ("day arcade").
- **Hot orange** (`--pack`, `--pack-ink`): primary buttons, the "Own it." marquee block, the active nav bar, the cabinet's top edge. Text on it is always `--pack-ink`. In the contrast theme it turns yellow on black.
- **Surfaces over the game** (`--die`, `--die-ink`, `--die-ink-2`): the solid panels that sit on the background game (the copy cabinet, the console, the game rail labels). Dark panel in dark mode, white in light mode.
- **Accent** (`--accent`): orange tuned for text contrast in each theme. Focus rings, link underlines, score pops, hover titles.
- **World** (`--w-*`): the background game's palette. A synthwave night in dark mode (orange grid, magenta haze, teal kart), a sunny day arcade in light mode.

## Type

- **Big Shoulders Display** (800 and 900) for headings, game titles and numbers. Always uppercase with a little tracking, set tight (line-height around .9 to 1).
- **Atkinson Hyperlegible** for everything else. Labels are bold body text.
- System mono only for real data: hashes, addresses, signed bytes.

## Shape and depth

- Radii: `--r-s` 6px (controls, chips, tabs), `--r-m` 10px (tiles, inputs), `--r-l` 14px (panels, the console). No pills.
- Surfaces have a 1px `--line` border and soft dark shadows. Primary buttons cast a faint orange glow.
- Game art sits in a hairline frame (`.sticker`, a historical class name). On hover it lifts, the border turns orange, and a light sweep crosses the art.

## Motion

- **One screen**: on screens wider than 960px the front page is the header, the cabinet over the game and a one-line footer, sized from the window height (`:root[data-route="home"]`). Phones scroll.
- **The background is a game**: a kart races down a neon track through a city of cartridges, grabbing coins and jumping blocks (`homeWorld()` in app.js, raw WebGL). It drives itself; moving the mouse steers it and clicking an empty spot jumps. It holds still while the console game has focus, draws one still frame in calm motion, and is skipped in the contrast theme and on software rendering. Text never sits on it directly.
- **Depth**: the copy cabinet, the console (tilted in 3D), Cart and the score pops (GG, +1 SOL, New best!) shift with the pointer by their own depth (`packDepth()`, `--px`/`--py`, `--d`).
- **Entrances**: panels and tiles rise and fade in (`@keyframes pop`, `rise`); the console powers on.
- Calm motion and `prefers-reduced-motion` switch every animation and transition off; content is visible without them.

## Components

- `.pack`: the front page layout over the background game. `.hero-copy` is the cabinet (orange top edge); the open middle column is where the kart races; `.pack-shelf` is the game rail.
- `.console`: the playable game in a framed panel.
- `.mascot`: Cart, with its white die-cut border baked into `src/assets/mascot*.webp`.
- `.flow-list`, `.ways`: label-and-text rows, used instead of rows of equal cards.

## Rules

- No eyebrow labels above page headings, no numbered steps, no rows of three equal cards.
- No em dashes in copy.
- Every theme (light, dark, contrast) must pass the e2e contrast audit, and nothing may scroll sideways at 390px with the largest text.
