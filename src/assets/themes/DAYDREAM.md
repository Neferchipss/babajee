# Daydream artwork

Generated with Codex's built-in image tool. No Higgsfield credits used. Source PNGs were converted to WebP for delivery without changing the artwork. Both illustrations were visually checked; neither contains products, smoking objects or cannabis imagery.

## Saved assets

- `src/assets/themes/daydream-garden.webp` — 1024 × 1536, 423 KB.
- `src/assets/themes/daydream-landscape.webp` — 2172 × 724, 494 KB.
- `src/assets/themes/daydream-display.woff2` — Bagel Fat One, Latin subset, SIL OFL (adjacent license).
- `src/assets/themes/daydream-body.woff2` — Figtree, Latin subset, SIL OFL (adjacent license).

Original generated PNGs are retained in `C:/Work/babajee/work/daydream/src/assets/themes/`.

## Garden prompt

Create a finished decorative illustration asset for an adult boutique website, NOT a website mockup. Portrait 2:3 composition. Psychedelic 1970s underground screenprint comic ink drawing with confident irregular thick black contours, dense halftone dots and paper-print texture. Joyful cyan blue scalloped clouds pile up at the bottom, two fabulous tall hot-pink spotted mushrooms with cream stems and violet gills, lush emerald botanical leaves (ordinary smooth leaves, absolutely no cannabis), golden four-point stars, a golden sun with a single expressive eye peeking behind the mushrooms, a small pink ringed planet floating above. Arrange like a tall exuberant corner garden, large mushroom center left, tiny mushroom at right, clouds across bottom. Uppermost fifth largely empty with just 3 sparse stars. Strong saturated cyan #12b7e9, magenta #f65baf, emerald #169d75, golden yellow #ffcf33, ink black #171814. Flat colour separations, subtle imperfect offset printing, hand-drawn grown-up concert-poster illustration, not glossy or 3D, not soft pastel. Background solid warm ivory #faf6ec, absolutely uniform outside the illustrated shapes so it can blend into a matching website. No text, no logo, no typography, no borders, no product photos, no merchandise, no smoking objects. Keep the entire drawing visible with a small ivory margin.

## Landscape prompt

A wide panoramic decorative border illustration for an adult boutique website, illustration only, NO website UI. Aspect ratio 3:1. Hand-inked 1970s underground psychedelic concert-poster screenprint. Dense halftone dots, imperfect confident black contours, warm ivory paper #faf6ec, saturated cyan blue #16b8df, hot pink #f466af, golden yellow #ffcf33, emerald #198c6a. A fantastic little imaginary landscape along bottom two thirds: scalloped cyan clouds in foreground, rolling emerald and pink hills, meandering yellow river, giant friendly cream daisies with sun faces on both sides, a tiny ringed pink planet and hand-drawn golden stars suspended above, distant mountains with graphic stripe patterns. Bold playful shapes, flat ink separations, small hatch marks, grown-up editorial drawing. Upper third ivory negative space with scattered tiny stars. Draw flowing border with irregular organic silhouette, no straight rectangular frame. All shapes visible, no text, no logos, no products, no merchandise, no smoking, no cigarettes, no pipes, absolutely no cannabis or cannabis shaped leaves, no drugs. Not a soft pastel nursery picture, not 3D, not photorealism. Website footer decorative scene.

## Frontend

Daydream is scoped to `html[data-theme="daydream"] #site[data-scope="shop"]`. Sunshine, Refined and non-shop pages keep their existing styling. Products keep their existing data and purchase behaviour; their image plates are blank in Daydream. The independent CSS bundles its own fonts so an offline Google Fonts request cannot silently change the design.

Interactions: subtle pointer-follow on the garden, a keyboard/touch-accessible sparkle toggle, random-category detour, hover response on category panels, existing search/sort/navigation. Reduced-motion preference disables decorative animation.

Validation: desktop 1440px and mobile 390px; no horizontal overflow on index, category or product detail; theme persistence and isolation; sparkle on/off; search empty state; A–Z sort; category detour; blank product image plates; reduced-motion behaviour; no browser exceptions.
