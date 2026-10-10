# Design skills

Website and UI design skills that every Claude session in this repo can load.

| Skill folder | Source | License |
| --- | --- | --- |
| `impeccable/` (run as `/impeccable <command>`) | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) v4.5.2, commit `d631a88` | Apache 2.0 |
| `taste-skill/`, `taste-skill-v1/`, `gpt-tasteskill/`, `soft-skill/`, `minimalist-skill/`, `brutalist-skill/`, `redesign-skill/`, `output-skill/`, `brandkit/`, `stitch-skill/`, `image-to-code-skill/`, `imagegen-frontend-web/`, `imagegen-frontend-mobile/` | [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill), commit `717446e` | MIT |

The files are copied unchanged. To update, copy the newer skill folders over these.

These skills often suggest React, Tailwind, web fonts or CDN scripts. The rules in `CLAUDE.md` win for ClaudePlay: no external scripts or libraries, colors only from the design tokens, sizes in `rem`, and every theme must still pass the accessibility audit.

Impeccable's launcher (`impeccable/scripts/impeccable`) downloads its engine from the project's GitHub releases on first run and checks it against a published SHA-256. If that fails, the skill reads the project files directly instead. Its automatic edit hooks (`/impeccable hooks on`) are not installed.
