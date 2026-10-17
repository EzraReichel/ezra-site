# ezrareichel.com

Personal site for Ezra Reichel. One page, no build step, no dependencies.
Open `index.html` and it runs.

## What's here

```
index.html          the whole page
styles.css          tokens, the book layout, sidenotes, the pipeline
js/ink.js           the ink: a WebGL2 fluid simulation rendered as sumi-e
js/main.js          reveals, nav state, the motion switch
assets/fonts/       Fraunces (variable) + Switzer, self-hosted; Noto Serif SC subset
                    holding only the numerals 一 to 八
assets/img/         headshot, its bled-edge mask, favicon, OG card
assets/clips/       two Aethelstan clips and their poster frames
```

## Design notes

- **The page is paper, and the ink is real.** `js/ink.js` runs a stable-fluids
  simulation (advect, project, advect) at low resolution and paints the dye
  field as ink: granulation from a fibre noise field, a darker rim where the
  ink dries at its edge. The cursor is a wet brush. Scrolling drags the sheet.
  On load it draws one horizontal stroke, 一, which is also chapter one.
  It needs WebGL2 and float render targets; without them, or under
  `prefers-reduced-motion`, the body gets `.no-ink` and a static CSS wash.
- **Chapters are numbered in Chinese numerals** in the left margin, set in a
  1.8 KB subset of Noto Serif SC. They are sticky, so the numeral stays while
  the chapter scrolls.
- **Sidenotes live in the right margin** (`.sn`), Tufte-style: the span sits
  inside the sentence it belongs to and floats out. Under 1140px they drop
  inline under the paragraph with a hairline on the left.
- **Aethelstan is shown by its results.** A pipeline graphic in plain HTML and
  CSS, links to the three Instagram accounts it runs with their 30-day numbers,
  and two AE-rendered clips hosted in `assets/clips/` (540px, about 1.3 MB
  each, poster frames alongside, nothing loads until play). Figures come from the 12 October 2026 performance reports in
  the AE repo (`reports/performance-2026-10/`). Update them from the next report.
- **Ink max darkness is capped** (0.52 of full ink in the display shader) so
  body text stays readable when a reader paints under it. Raise it and the
  page gets moodier and harder to read in equal measure.
- **No accent colour.** Links and focus rings use the deep indigo. Nothing
  else on the page is coloured.
- **No generated imagery.** The one picture is the real headshot, run through
  an SVG displacement filter so its edge bleeds into the paper.

## Running it

```bash
python3 -m http.server 4321      # then open http://localhost:4321
```

Fonts and the WebGL context need a server; `file://` will not do.
