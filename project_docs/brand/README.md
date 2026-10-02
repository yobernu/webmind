# Gloss AI brand

A *gloss* is the note a reader writes in a book's margin to explain the text. Gloss AI does that for the web: it explains the page you are reading and keeps your notes and highlights with it.

## Mark

A Newsreader lowercase **g** crossed by a highlighter swipe, on an ink tile. Where the letter runs under the swipe it turns to ink, as text does under a real highlighter.

| File | Use |
| --- | --- |
| `mark.svg` | Master, 64 grid. App icon at 48px and up, favicon. |
| `mark-32.svg` | 32px: heavier weight, tighter padding. |
| `mark-16.svg` | 16px: heaviest weight. The swipe is thinner and only crosses the link, so the bowl and loop stay whole. |
| `mark-bare.svg` | No tile: ink **g** over the swipe. Used inside the product, next to the wordmark. |

Each small size is drawn for its size, not scaled down from the master. Chrome shows `icon-16.png` and `icon-32.png` in the toolbar, so check both sizes on light and dark toolbars after any change.

- **Clear space:** at least a quarter of the tile's width on every side.
- **Minimum size:** 16px for the tile, 14px for the bare mark.
- **Don't:** recolour the swipe, rotate the letter, put the mark on a busy photo, or add effects (shadow, glow, gradient).

## Wordmark

**gloss** set in Newsreader at display optical size (opsz 72, weight 480). **AI** is set as small caps: its cap height matches the x-height of "gloss", it sits 0.3em after the word, and it is tracked +0.1em in the secondary ink.

- `wordmark.svg` / `wordmark-dark.svg`: the wordmark alone, for light and dark backgrounds.
- `lockup-light.svg` / `lockup-dark.svg`: the mark and the wordmark together. The wordmark's x-height is 0.42 of the tile.

In running text the product is **Gloss AI**, capitalised, with a space. The lowercase form belongs only to the wordmark.

## Palette

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| Paper | `#FAF8F3` | `#191816` | Background |
| Surface | `#FFFFFF` | `#22211E` | Inputs, raised sheets |
| Sunken | `#F2EFE7` | `#121110` | Wells, user turns |
| Ink | `#1C1B19` | `#EDE9E0` | Text, primary actions, focus |
| Ink 2 | `#55524B` | `#B5B0A5` | Secondary text |
| Ink 3 | `#8A867C` | `#7D786E` | Metadata, placeholders |
| Rule | `#E4DFD3` | `#34322D` | Hairlines |
| Highlighter | `#F5D547` | `#E3C440` | Accent: highlights, rails, marks |

Highlighter yellow is only ever a **fill behind ink text**, never a text or line colour on paper, where its contrast is about 1.2:1. Focus rings, selected tabs and primary buttons are ink.

## Type

- **Newsreader** (Production Type, SIL Open Font License, bundled Latin subset): the wordmark, headings, quotes, highlights and assistant answers. The serif lives in the content, not just the logo.
- **System UI font**: controls, labels and metadata. It matches each platform and costs nothing to load.
- Scale: 11 / 12 / 13 / 15 / 18 / 22px. Numbers in counts and times use tabular figures.

## Regenerating

The mark and wordmark are outlined from the Newsreader font files, so they render the same everywhere and never wait for a web font.

```sh
pip install fonttools brotli
python project_docs/brand/generate.py   # SVGs here + apps/extension/src/ui/brand/paths.ts
```

The PNG icons in `apps/extension/public/icons/` are rendered from `mark-16.svg`, `mark-32.svg` and `mark.svg` (48 and 128) with headless Chrome at exact pixel sizes. `public/favicon.svg` is a copy of `mark.svg`.
