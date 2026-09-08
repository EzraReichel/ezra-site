# ezrareichel.com

Personal site for Ezra Reichel. One page, no build step, no dependencies.
Open `index.html` and it runs.

## What's here

```
index.html          the whole page
styles.css          tokens, glass, layout
js/flow.js          the WebGL surface (fragment shader)
js/main.js          reveals, specular highlight, nav state, motion switch
assets/fonts/       Fraunces (variable) + Switzer, self-hosted woff2
assets/img/         favicon and the OG card
```

## Design notes

- **Ground stays porcelain.** All the colour lives in the moving surface behind
  the glass, so the panels have something real to bend. If you brighten the
  page background, the glass stops reading as glass.
- **Type carries the personality.** Fraunces for display (variable, with the
  `opsz` axis set per size), Switzer for everything else. Two families, no
  more. Display weights sit around 420 to 480, not 300: at these sizes a
  hairline weight reads as delicate rather than confident.
- **One accent**, the deep navy-indigo `--regal: #26317F`, on links, focus
  rings and the live dot. Nothing else is coloured. The surface palette runs
  pale gold, sea glass, steel blue, bronze; no pinks or violets.
- **The bevel is the signature.** `.glass::after` is a masked ring that blurs
  and brightens the backdrop at the pane's edge, the way the outer millimetre
  of a real lens does. Its thickness scales per pane through `--bevel`.
- Motion respects `prefers-reduced-motion`, and the footer switch turns the
  surface off for anyone who wants it still.

## Running it

```bash
python3 -m http.server 4321      # then open http://localhost:4321
```

A plain `open index.html` also works, though fonts load faster over HTTP.

## Screenshots / debugging

Two query params exist for capturing stills (they do nothing in normal use):

- `?still=1`: freezes the surface, skips reveals and transitions
- `&scroll=1150`: offsets the page content so a headless capture can frame a
  section below the fold

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --use-angle=metal --hide-scrollbars \
  --window-size=1440,900 --virtual-time-budget=9000 \
  --screenshot=shot.png "http://localhost:4321/?still=1&scroll=0"
```

## Deploying

Static files, so anything works. Vercel: `vercel --prod`. Netlify: drag the
folder in. GitHub Pages: push to a `*.github.io` repo.

Two things to change when the domain is live:

1. `og:image` in `index.html` needs an absolute URL (`https://yourdomain.com/assets/img/og.png`);
   most scrapers ignore relative ones.
2. Regenerate `assets/img/og.png` if the hero copy changes; it is a headless
   capture of the hero at 1200×630.

## Third-party logos

The three marks in `assets/img/logos/` belong to their companies and are used
to reference where Ezra has worked:

- `gtmos.svg` from gtmos.run
- `advan.png` cropped from the Advan Research mark at advan.us
- `westfield.png` cropped from the Westfield Academy mark at westfieldacademy.net

Swap or drop any of them if a company would rather not appear.

## House rules

No em dashes, anywhere, including in these notes and the code comments.

## Content to verify

- The two **gtm/os Insights** posts under Writing link to `gtmos.ai` and are
  attributed to gtm/os, not to Ezra personally. Swap them for Substack posts
  once there are some published.
- The Substack bio says *Head of Digital Media Strategy at GTM/OS*; the résumé
  says *Business Development Intern*. The site uses the résumé title.
