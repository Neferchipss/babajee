# Shop colours: a master colour changer in place of designs

Date: 24 Nov 2026 · Branch: `aronium-design`

## Why

The shop had a fixed set of "designs" (Current, Shopfront, Haveli, Chai corner, Courtyard). Nefer doesn't want a menu of designs. He wants to set the shop's colours himself, part by part, starting from ready-made presets, and see the result before it goes live. Today's colours stay available as the **Legacy** preset.

## Goals

- In the admin, set the colour of each part of the shop: page background, panels, lines, text, secondary text, accent, text on the accent, sale/alert, green, header bar.
- Every palette has a **light** and a **dark** version. Visitors keep the light/dark toggle they have today (decision: option A).
- **Presets:** Legacy (today's colours), plus Shopfront, Haveli, Chai corner and Courtyard turned into palettes. Changing anything after picking a preset gives a "Custom" palette.
- **Live preview:** a window beside the editor shows the real shop with the unsaved colours, with its own light/dark switch. Nothing changes for visitors until Save.
- **Saving applies shop-wide** for every visitor, on every shop page. A browser that has seen the colours before applies them before the first paint. A first visit, or one after a change, may show Legacy for a moment until the live palette arrives (Nefer accepted this, option a).
- Remove the designs: the Design pickers in both admin designs, the `data-design` plumbing, `shop-designs.css`, and the design-specific homepage (already done: the homepage is always the painted walk-in).

## Non-goals

- The admin's own colours. The admin (Legacy and Aronium-style) keeps its look; shop colours never reach inside `.adm-frame`.
- Fonts, layout, spacing, art, the logo.
- Per-visitor colour choice. Visitors only choose light or dark.
- Order emails. They keep their fixed dark styling.

## Anti-goals

- A colour change that leaves text unreadable without warning.
- A flash on every page load. One brief flash per browser, after a change, is accepted.
- Breaking pages that use the colour settings indirectly: sheets, the cart pill, the product swirls, focus rings, the profile screen.

## Constraints

- The site can also build as a static export (GitHub Pages preview). Colours must be read at runtime from Supabase in the browser, as the designs and announcement are today (`getLook()` in `src/lib/content.ts`, applied in `SiteExtras.tsx`), not on the server.
- Local runs use the live Supabase. Migrations need a test (`supabase/tests/`) and pass `scripts/test-sql.sh`.
- The colours currently live in about 25 CSS custom properties, in `src/app/themes/modes.css` (light and dark blocks for `:root[data-mode]` and `html[data-theme="baba-poster"] … #site[data-scope="shop"]`) and `baba-poster.css`. Some are hex values; `--bb-fg`, `--bb-bg`, `--bbn-glow` and `--bbn-scrim` are bare `r g b` triplets used as `rgb(var(--x) / a)`.

## Approaches considered

1. **Plain-language slots (chosen).** About 10 named slots per mode, each setting one or more CSS properties. Shades like hover tints, darker edges and glows are derived automatically. A contrast warning appears when text is hard to read.
   - Gives real control without exposing CSS internals.
   - Derived shades stay consistent.
2. **Every CSS property exposed.** About 50 pickers with internal names; easy to break a page unnoticed. Rejected.
3. **Presets plus background and accent only.** Simplest, but text, lines and header can't be set separately. Rejected as too little control.

The preview was Nefer's addition. It shows the real shop rather than a mock-up, so what he sees is what visitors get.

## Design

### Slots and what they set

For each mode (light, dark):

| Slot | Sets | Derived |
|---|---|---|
| Page background | `--color-char`, `--bb-bg` (rgb), `--bbn-scrim` (rgb) | |
| Panels and cards | `--color-iron`, `--bb-sheet`, `--bbn-deep` | `--color-ash`, `--bb-blush`: panels mixed ~6% toward text |
| Lines | `--color-line`, `--bbn-edge` | |
| Text | `--color-paper`, `--bb-ink`, `--bb-fg` (rgb) | |
| Secondary text | `--color-muted` | |
| Product photo backdrop | `--color-plate`, and the light-mode backdrop now hard-coded `#f0f2f5` in `modes.css` (made to use the variable) | |
| Accent (buttons, links, highlights) | `--bb-maroon`, `--bb-rose`, `--color-rasta-gold`, `--plate-ink`, `--bbn-glow` (rgb) | `--bb-maroon-dk`: accent toward the text colour ~15% |
| Text on accent | `--bb-on-accent`, `--color-ink` (it is the text on primary buttons, selection and the cart badge, not a background) | |
| Cart and highlights (View cart bar, add buttons, chosen filters, hearts, stars, badges; was "Sale and alert") | `--bb-hot` | |
| Green (in stock, success) | `--bb-green` | `--bb-green-dk`: toward black ~25% |
| Header bar | new `--bb-bar` (rgb), used in place of `--bb-bg` where the top bars are painted: `.lb` and `.sb` in `shop-bar.css`, and the desktop bars in `baba-poster.css` (around lines 322 and 870). The category switch, store button, cart bar and frosted sheet panels keep `--bb-bg`. | defaults to page background |

Fixed per mode, not editable: `--bb-scrim` (derived from page background), `--bb-swirl`, `--bb-tex`, `--bbn-halo`.

Mapping calls (from the builder check): `--color-ink` is the text on accent fills, so it follows Text on accent; `--plate-ink` follows Accent (every preset but Legacy dark already does; Legacy dark stays exact because Legacy emits no style); the product-photo backdrop gets its own slot so the converted presets keep their cream plates in dark mode. The browser's own bar colour (`theme-color` meta, fixed today in `viewport.themeColor`) is updated at runtime to the header bar colour of the mode showing, so notched phones match.

The Legacy preset is today's exact values from `modes.css`. The other presets come from the existing `shop-designs.css` blocks, mapped onto the slots. Shopfront has the same values as Legacy, so it is dropped.

### Storage

- Migration `0087_shop_colours.sql`:
  - Adds `site_look.colours jsonb`, default null. Null means Legacy.
  - Shape: `{ "preset": "legacy" | "haveli" | … | "custom", "light": { slot: "#rrggbb" }, "dark": { … } }`.
  - A check constraint keeps only known slot keys and `#rrggbb` values.
  - Writable by the same staff permission as the rest of Storefront.
  - Includes a test.
- `site_look.design` stays in the table but is ignored. A later cleanup can drop it.
- No backfill: on release the shop shows Legacy whatever design was live (Nefer's call).

### Applying on the shop

- A pure function `paletteCss(colours)` (`src/lib/shop-colours.ts`) turns a saved palette into CSS text. It produces one block per mode, for the same selectors `modes.css` uses today, with derived shades worked out in JS. It is unit-tested.
- The text goes in a `<style id="bj-colours">`.
- Before first paint, the layout's boot script reads the last palette CSS from `localStorage` (`bj-colours`) and inserts it.
- `SiteExtras` reads the live palette with the look, as on every full page load today, then replaces the style and the cached copy.
- The `:not(:has(.adm-frame))` / shop-scope guard that `shop-designs.css` uses today keeps the colours out of the admin.
- Legacy or null means no style tag: the CSS files' own values apply.

### Editor (Admin › Storefront)

- It replaces the **Design** tab in Aronium-style and the Designs cards in Legacy, under the name **Colours**.
- **Layout:**
  - A preset row: swatches, with Legacy first.
  - A Light / Dark tab for which palette is being edited.
  - The slot list: name, colour swatch, hex field and a native colour picker.
  - The preview window.
  - Save, and Revert (back to what is live).
- **Contrast checks:**
  - Text on page background, text on panels, secondary text on page background, and text-on-accent on accent.
  - Each shows a warning below 4.5:1 (3:1 for the accent pair, since it's a large button label).
  - Warnings don't block Save.
- Picking a preset loads its values into the editor without saving. Editing any slot sets the preset to Custom.
- **Preview:**
  - An `<iframe>` of the shop (a page picker: home, a shelf, a product, the cart).
  - The editor sends the working palette by `postMessage`. A listener in `SiteExtras`, active only when the page is framed by the shop's own admin origin, applies the CSS and forces `data-mode` from the preview's own light/dark switch, without saving the mode.
- On narrow screens the preview stacks under the slot list.
- The framed preview skips the age gate and analytics (`SiteTracker`): local and admin runs use the live Supabase, and preview loads must not count as visits. It is recognised by a `?preview=colours` flag together with being framed by the shop's own origin.

### Removing designs

- Delete:
  - `src/lib/shop-design.ts` and its boot-script line in `layout.tsx`.
  - The `shop-designs.css` import and file.
  - The `applyShopDesign` calls in `SiteExtras`.
  - The `designed` logic in `SiteHeader.tsx`.
  - `DESIGNS` and the `Design` type in `content.ts`. `Look.design` stays only as a stored column.
  - `getSiteDesign` in `catalog-db.ts`.
  - The design CSS in `storefront.css`.
- Update the help guides (`guide-data.ts` storefront article, `legacy-data.ts` l-design section) to describe Colours instead of Designs.
- Out of this change, still to be decided: `ShopHome`, the homepage sections and banners admin, `/explore`, and the home hero art. They only served the designed homepage.

## Left to the builder

- Exact derivation percentages, tuned against the Legacy values so Legacy round-trips exactly. Legacy should produce no style at all, so that is safe either way.
- Preview iframe size and page picker details.
- Whether hex input accepts `#rgb` shorthand.
