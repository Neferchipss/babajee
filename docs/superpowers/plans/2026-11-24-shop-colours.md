# Shop Colours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the storefront designs with a master colour changer: 11 colour slots per mode (light, dark), presets with Legacy as today's colours, a live preview, saved shop-wide.

**Architecture:**
- A pure module (`src/lib/shop-colours.ts`) owns the slots, the presets, the derived shades and the CSS it generates. It is unit-tested.
- The palette is stored as `site_look.colours` (jsonb). The shop reads it at runtime with the announcement, as the designs were read, and puts the generated CSS in a `<style id="bj-colours">`. A cached copy is applied before first paint by the layout boot script.
- The admin editor is one shared component used by both admin designs. It previews by `postMessage` into an iframe of the real shop.

**Tech Stack:** Next.js (App Router, client components), Supabase (Postgres + RLS), plain CSS custom properties, `node --test` for unit tests, `scripts/test-sql.sh` for SQL tests.

**Spec:** `docs/superpowers/specs/2026-11-24-shop-colours-design.md`

## Global Constraints

- **Mode support:** every palette has `light` and `dark`. Visitors keep their light/dark toggle.
- **Admin is untouched:** shop colours never apply inside `.adm-frame`, and the admin's own colours don't change.
- **Legacy (or `colours` null):**
  - emits no `<style>`; the CSS files' own values apply;
  - Legacy must equal today's `modes.css` values exactly.
- **Release:** no backfill from `site_look.design`. Live shows Legacy until someone saves.
- **The one accepted flash:** a first visit, or one after a change, may show Legacy briefly. Every later load applies the cached palette before paint.
- **Preview stays out of the data:** the preview iframe never counts as a visit (`track`) and never shows the age gate. Local runs use the live Supabase; block `rpc/track_event` in any browser automation.
- **Contrast warnings:**
  - pairs: text/page, text/panels, secondary/page, onAccent/accent;
  - threshold: 4.5:1, or 3:1 for onAccent/accent;
  - they never block Save.
- **Removed:**
  - the storefront designs and their pickers;
  - `shop-design.ts` and `shop-designs.css`;
  - the `designed` logic in `SiteHeader.tsx`;
  - `DESIGNS` and the `Design` type;
  - `getSiteDesign`.
- **Not in scope:** `ShopHome`, the homepage sections and banners admin, `/explore`, the home hero art.
- **Copy:** plain words, no jargon. The tab is named **Colours**. Presets: Legacy, Haveli, Chai corner, Courtyard, plus Custom once edited.

## Review Focus

1. **A malformed or partial `colours` row** (a missing slot, a bad hex, an unknown preset) must fall back to Legacy for that mode, not to broken CSS. Test it in Task 2 (`paletteCss` with a partial palette).
2. **A stale localStorage cache after colours are reset to Legacy** must remove the style and clear the cache, not keep the old colours. Test it in Task 3 (`applyColours(null)`).
3. **The preview receiving messages from another origin** must ignore them. Test it in Task 5 (`isPreviewMessage`).
4. **Switching between light and dark on the live shop** must swap the browser bar colour to that mode's header colour. Test it in Task 2 (`themeBar`).
5. **An editor Save while another admin saved meanwhile** is last write wins, as the announcement is today. No test is needed, but Revert must reload from the database, not from memory. Test it in Task 6 by asserting that Revert calls `getLook`.

---

### Task 1: Store the palette (migration 0087)

**Files:**
- Create: `supabase/migrations/0087_shop_colours.sql`
- Test: `supabase/tests/0087_shop_colours.test.sql`

**Interfaces:**
- Produces:
  - column `public.site_look.colours jsonb`, null by default;
  - function `public.shop_colours_ok(c jsonb) returns boolean` (immutable);
  - check constraint `site_look_colours_ok check (colours is null or public.shop_colours_ok(colours))`.
- **Slot keys**, exactly: `page, panels, lines, text, secondary, backdrop, accent, onAccent, hot, green, bar`.
- **Valid value:**
  - `preset` is one of `legacy, haveli, chai, courtyard, custom`;
  - `light` and `dark` are objects whose keys are a subset of the slot keys;
  - every value matches `^#[0-9a-f]{6}$`.
- Writes are already allowed by the 0073 policy "look staff change the look" and `grant update on public.site_look to authenticated`. Don't add a new grant.

- [ ] **Step 1: Write the failing test.** It follows the style of `supabase/tests/0084_aronium_design.test.sql`: a `do $$` block, `raise exception 'FAIL: <name>'`, and an empty result means it passed.
  - **Setup:** impersonate an admin with `set_config('request.jwt.claims', …)` and `set local role authenticated`.
  - **Should be accepted:**
    - `colours_full_ok`: `{"preset":"haveli","light":{"page":"#fbf4e6",…all 11…},"dark":{…all 11…}}`
    - `colours_partial_ok`: `{"preset":"custom","light":{"accent":"#c3141a"},"dark":{}}`
    - `colours_null_ok`: setting `colours` back to null.
  - **Should fail with `check_violation`:**
    - `bad_hex_refused`: `"#C3141A"` (uppercase) and `"red"`
    - `bad_slot_refused`: key `"header"`
    - `bad_preset_refused`: `"shopfront"`
  - **Permissions:** `anon_cannot_write`. As `anon`, an update changes no rows (check with `get diagnostics`).
- [ ] **Step 2: Run it and check that it fails.** Run: `bash scripts/test-sql.sh supabase/migrations/0084_aronium_design.sql supabase/tests/0087_shop_colours.test.sql` (0084 is a harmless stand-in). Expected: an error that column "colours" does not exist.
- [ ] **Step 3: Write the migration.** The header comment says what 0087 does, in the house style. It adds the column, the function (pure SQL over `jsonb_object_keys` and `jsonb_each_text`) and the constraint.
- [ ] **Step 4: Run it and check that it passes.** Run: `bash scripts/test-sql.sh supabase/migrations/0087_shop_colours.sql supabase/tests/0087_shop_colours.test.sql`. Expected: `[]`.
- [ ] **Step 5: Commit** both files: "0087: site_look.colours, the shop's saved palette, with its test". Don't apply it to live. Add 0087 to the Migrations list in `docs/handoff-ababil.md` as pending.

### Task 2: The palette module

**Files:**
- Create: `src/lib/shop-colours.ts`
- Test: `src/lib/shop-colours.test.ts` (picked up by `npm test`)

**Interfaces:**
- Produces, all exported from `src/lib/shop-colours.ts`:
  - `type Slot = "page" | "panels" | "lines" | "text" | "secondary" | "backdrop" | "accent" | "onAccent" | "hot" | "green" | "bar"`
  - `const SLOTS: { id: Slot; label: string; hint: string }[]`. The labels, in order:
    1. "Page background"
    2. "Panels and cards"
    3. "Lines"
    4. "Text"
    5. "Secondary text"
    6. "Product photo backdrop"
    7. "Accent (buttons, links, highlights)"
    8. "Text on accent"
    9. "Sale and alert"
    10. "Green (in stock, success)"
    11. "Header bar"
  - `type Mode = "light" | "dark"`
  - `type Palette = Record<Slot, string>`
  - `type PresetId = "legacy" | "haveli" | "chai" | "courtyard" | "custom"`
  - `type ShopColours = { preset: PresetId; light: Partial<Palette>; dark: Partial<Palette> }`
  - `const PRESETS: { id: Exclude<PresetId, "custom">; name: string; light: Palette; dark: Palette }[]`, with Legacy first.
  - `const LEGACY: { light: Palette; dark: Palette }`
  - `function filled(c: ShopColours | null, mode: Mode): Palette`: missing or invalid slots are taken from Legacy.
  - `function isLegacy(c: ShopColours | null): boolean`: true when null, or when both modes, once filled, equal Legacy.
  - `function paletteCss(c: ShopColours | null): string`: returns `""` when `isLegacy`.
  - `function contrast(a: string, b: string): number`: the WCAG ratio, rounded to 2 decimals.
  - `function mix(a: string, b: string, pct: number): string`: `#rrggbb`, with `pct` of `b`.
  - `function themeBar(c: ShopColours | null, mode: Mode): string`: the header bar colour for `<meta name="theme-color">`.
  - `const CONTRAST_PAIRS: { a: Slot; b: Slot; min: number; label: string }[]`: text/page 4.5, text/panels 4.5, secondary/page 4.5, onAccent/accent 3.
- **Legacy values** (verbatim from `src/app/themes/modes.css`):

  | Slot | Light | Dark |
  |---|---|---|
  | page | #ffffff | #000000 |
  | panels | #ffffff | #121213 |
  | lines | #e7eaee | #272729 |
  | text | #0c0f14 | #f2f3f5 |
  | secondary | #686f78 | #96979d |
  | backdrop | #f0f2f5 | #121213 |
  | accent | #d3ab70 | #d3ab70 |
  | onAccent | #0c0f14 | #000000 |
  | hot | #d3ab70 | #d3ab70 |
  | green | #0f8a5f | #23a55a |
  | bar | #ffffff | #000000 |

- **Presets haveli, chai, courtyard:** read from `src/app/themes/shop-designs.css`, per mode, using the `html[data-theme="baba-poster"][data-design=…][data-mode=…] #site[data-scope="shop"]` block:

  | Slot | Source |
  |---|---|
  | page | `--color-char` |
  | panels | `--color-iron` |
  | lines | `--color-line` |
  | text | `--color-paper` |
  | secondary | `--color-muted` |
  | backdrop | `--color-plate` |
  | accent | `--bb-maroon` |
  | onAccent | `--bb-on-accent` |
  | hot | `--bb-hot` |
  | green | `--bb-green` |
  | bar | same as page |

  Copy the values into `PRESETS` before Task 4 deletes that file.
- **What `paletteCss` sets per mode:**

  | Slot | Sets |
  |---|---|
  | page | `--color-char`, `--bb-bg` (as `r g b`), `--bbn-scrim` (`r g b`) |
  | panels | `--color-iron`, `--bb-sheet`, `--bbn-deep` |
  | lines | `--color-line`, `--bbn-edge` |
  | text | `--color-paper`, `--bb-ink`, `--bb-fg` (`r g b`) |
  | secondary | `--color-muted` |
  | backdrop | `--color-plate` |
  | accent | `--bb-maroon`, `--bb-rose`, `--color-rasta-gold`, `--plate-ink`, `--bbn-glow` (`r g b`) |
  | onAccent | `--bb-on-accent`, `--color-ink` |
  | hot | `--bb-hot` |
  | green | `--bb-green` |
  | bar | `--bb-bar` (`r g b`) |

  Derived:
  - `--color-ash` and `--bb-blush` = `mix(panels, text, 6)`
  - `--bb-maroon-dk` = `mix(accent, text, 15)`
  - `--bb-green-dk` = `mix(green, "#000000", 25)`
  - `--bb-scrim`: light `rgb(<text rgb> / 0.36)`, dark `rgb(<page rgb> / 0.7)`

  Each mode's block uses the selectors `:root[data-mode="<m>"]:not(:has(.adm-frame))` and `html[data-theme="baba-poster"][data-mode="<m>"] #site[data-scope="shop"]`.

- [ ] **Step 1: Write the failing tests** with `node:test` and `assert/strict`, as in `src/lib/counter-math.test.ts`. Import from `./shop-colours.ts`.
  - `contrast black on white is 21`: `contrast("#000000","#ffffff") === 21`
  - `mix`: `mix("#000000","#ffffff",50) === "#808080"` and `mix("#123456","#123456",30) === "#123456"`
  - `legacy emits nothing`:
    - `paletteCss(null) === ""`
    - `paletteCss({preset:"legacy",light:{},dark:{}}) === ""`
    - `paletteCss({preset:"custom",light:{...LEGACY.light},dark:{...LEGACY.dark}}) === ""`
  - `partial palette falls back to Legacy per slot`:
    - `filled({preset:"custom",light:{accent:"#c3141a"},dark:{}},"light")` has accent `#c3141a` and page `#ffffff`
    - `filled({preset:"custom",light:{page:"red" as never},dark:{}},"light").page === "#ffffff"`
  - `css sets the mapped properties`: for a custom light palette with accent `#c3141a`, the CSS contains `--bb-maroon: #c3141a`, `--plate-ink: #c3141a`, `--bbn-glow: 195 20 26` and `:not(:has(.adm-frame))`.
  - `color-ink follows text on accent`: CSS for onAccent `#fffaf0` contains `--color-ink: #fffaf0`.
  - `themeBar`:
    - `themeBar(null,"dark") === "#000000"`
    - `themeBar({preset:"custom",light:{bar:"#2b1a12"},dark:{}},"light") === "#2b1a12"`
  - `presets are complete`: every preset has all 11 slots in both modes and passes `/^#[0-9a-f]{6}$/`, and `PRESETS[0].id === "legacy"`.
- [ ] **Step 2: Run them and check that they fail.** Run: `node --test src/lib/shop-colours.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/lib/shop-colours.ts`** with the interfaces above. Keep it pure, with no DOM and no imports from React or Supabase.
- [ ] **Step 4: Run them and check that they pass.** Run: `npm test`. Expected: all pass, including the existing counter-math and print-sheet tests.
- [ ] **Step 5: Commit** "Shop colours: slots, presets (Legacy, Haveli, Chai corner, Courtyard), derived shades and the CSS they make, with tests".

### Task 3: Apply the palette on the shop

**Files:**
- Create: `src/lib/shop-colours-apply.ts` (browser-only)
- Modify:
  - `src/lib/content.ts`: `Look`, `getLook`, `saveLook`, `LOOK_DEFAULT`
  - `src/components/home/SiteExtras.tsx`: the `Announcement` effect
  - `src/app/layout.tsx`: the boot script
  - `src/lib/mode.ts`: `applyMode` theme-color
  - `src/app/themes/modes.css`
  - `src/components/shop-bar.css`, lines 10, 518, 551
  - `src/app/themes/baba-poster.css`, lines 322, 870, 871
- Test: `src/lib/shop-colours-apply.test.ts`

**Interfaces:**
- Consumes from Task 2: `paletteCss`, `themeBar`, `ShopColours`, `isLegacy`.
- Produces:
  - `const COLOURS_KEY = "bj-colours"`
  - `function applyColours(c: ShopColours | null, opts?: { keep?: boolean }): void`. It writes or removes `<style id="bj-colours">`, then:
    - when `keep !== false`, it caches `{ css, bar: { light, dark } }` in localStorage, or removes the cache when Legacy;
    - it updates `meta[name=theme-color]` for the current `data-mode`.
  - `const coloursBootScript: string`: reads the cache, inserts the style and sets theme-color before paint.
  - `function cachedBar(mode: Mode): string | null`
  - `Look` gains `colours: ShopColours | null`. `getLook` selects `colours` too; on a database without 0087 it retries the old select and returns `colours: null`.
  - `saveLook(patch)` accepts `colours`.
- **CSS changes:**
  - In `modes.css`, `:root` gains `--bb-bar: var(--bb-bg);`.
  - The light-mode product backdrop `background: #f0f2f5;` (around line 99) becomes `background: var(--color-plate);`. The value is identical today.
  - At the six listed bar lines, `--bb-bg` becomes `--bb-bar`.

- [ ] **Step 1: Write the failing tests.** `node:test` has no DOM, so the module takes its document and storage through a small seam: `applyColours(c, opts, env = { doc: document, store: localStorage })`. The tests pass fakes.
  - `applying a custom palette writes the style and cache`
  - `applyColours(null) removes the style and clears the cache` (Review Focus 2)
  - `keep:false leaves the cache alone` (used by the preview)
  - `cachedBar("dark") returns the cached dark bar`
- [ ] **Step 2: Run them and check that they fail.** Run: `node --test src/lib/shop-colours-apply.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `shop-colours-apply.ts`, then wire it in:**
  - `layout.tsx`: add `${coloursBootScript}` to `bootScript`.
  - `SiteExtras.tsx`: the look cache (`LOOK_KEY`) also keeps `colours`, and both the cached and the live look call `applyColours(look.colours)`.
  - `mode.ts` `applyMode`: theme-color is `cachedBar(mode) ?? BAR[mode]`.
  - Make the CSS changes listed above.
- [ ] **Step 4: Run and check.** `npm test` passes, `npx tsc --noEmit -p .` is clean and `npx eslint` on the touched files is clean.
- [ ] **Step 5: Commit** "Shop colours applied on the shop: from the saved palette, before paint from the last one seen; header bar and the phone's browser bar follow it".

### Task 4: Remove the storefront designs

**Files:**
- Delete:
  - `src/lib/shop-design.ts`
  - `src/app/themes/shop-designs.css` (after Task 2 has copied its values)
- Modify:
  - `src/app/layout.tsx`: remove the `designBootScript` import and line, and the `shop-designs.css` import.
  - `src/components/home/SiteExtras.tsx`: remove the `applyShopDesign` calls and import, and the `design` in the cached look.
  - `src/components/SiteHeader.tsx`: remove `watchDesign`, `designNow` and `designed`. `cart` becomes `pathname !== "/"`, and the logo click guard becomes `if (pathname !== "/") return;`.
  - `src/lib/content.ts`: remove `Design`, `DESIGNS` and `design` from `Look` and `LOOK_DEFAULT`, and from the select.
  - `src/lib/catalog-db.ts`: remove `getSiteDesign`.
  - `src/components/home/ShopHome.tsx`: replace the imported `Design` type with a local `type Design = string`. It is unused but out of scope.
  - `src/components/admin/storefront.css`: remove the `.sfm-design*` and `.sfm-swatch*` rules.
- Test: the build itself.

**Interfaces:** none produced. After this task, no source file mentions `data-design` except `ShopHome.tsx` and `src/components/home/designs.css`.

- [ ] **Step 1: Delete and edit** as listed. The admin pickers are replaced in Task 6. Until then, leave `pick()` and the Design UI in both admin storefront files but drop their imports of `DESIGNS`, and render nothing in that tab, so the build stays green.
- [ ] **Step 2: Verify.** Run: `npx tsc --noEmit -p .`, `npm test`, `npx eslint src`. Expected: clean. Then run `grep -rn "data-design\|applyShopDesign\|DESIGNS\b" src`. Expected: only `ShopHome.tsx` and `designs.css`.
- [ ] **Step 3: Commit** "Storefront designs removed: no design is applied anywhere on the shop; colours come from the shop palette".

### Task 5: The preview mode on the shop

**Files:**
- Create: `src/lib/colours-preview.ts`
- Modify:
  - `src/app/layout.tsx`: the boot script sets `dataset.ageOk = "1"` and `dataset.preview = "colours"` when `?preview=colours` is present and `window.self !== window.top`.
  - `src/lib/track.ts`: `track()` returns at once when `document.documentElement.dataset.preview === "colours"`.
  - `src/components/home/SiteExtras.tsx`: in preview, the live look is not applied (so it can't overwrite the working palette), and the message listener is started.
- Test: `src/lib/colours-preview.test.ts`

**Interfaces:**
- Consumes from Task 3: `applyColours(c, { keep: false })`.
- Produces:
  - `type PreviewMessage = { type: "bj-colours-preview"; colours: ShopColours | null; mode: Mode }`
  - `function isPreviewMessage(e: { origin: string; data: unknown }, ownOrigin: string): e is { origin: string; data: PreviewMessage }`
  - `function startColoursPreview(): () => void`. It listens for messages and, for each valid one:
    - applies the colours with `keep: false`;
    - sets `document.documentElement.dataset.mode = msg.mode` without saving the mode pref;
    - returns a remover.

- [ ] **Step 1: Write the failing tests.**
  - `accepts own origin`: `isPreviewMessage({origin:"https://a.test",data:{type:"bj-colours-preview",colours:null,mode:"dark"}},"https://a.test") === true`
  - `rejects other origin` (Review Focus 3): the same message from `"https://evil.test"` returns false.
  - `rejects wrong shape`: `data: {type:"x"}` returns false, and `mode: "sepia"` returns false.
- [ ] **Step 2: Run it and check that it fails.** Run: `node --test src/lib/colours-preview.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it and wire it** into the layout boot script, `track.ts` and `SiteExtras` as listed.
- [ ] **Step 4: Run and check.** `npm test`, `tsc` and `eslint` are clean.
- [ ] **Step 5: Commit** "Colours preview: the shop framed with ?preview=colours takes a working palette and mode by message from its own origin, skips the age gate and isn't counted as a visit".

### Task 6: The Colours editor in the admin

**Files:**
- Create:
  - `src/components/admin/colours/ColourEditor.tsx`
  - `src/components/admin/colours/colours.css`
- Modify:
  - `src/app/admin/storefront/page.tsx`: the Legacy design. Replace the Designs cards section, `pick()` and the head copy with `<ColourEditor />`.
  - `src/components/admin/shells/AroniumStorefront.tsx`: the Design tab becomes the **Colours** tab (`Tab = "colours" | "line" | "sections"`, default `"colours"`), rendering `<ColourEditor aronium />`. Remove `selD`, `designCols`, `designMenu`, `lookAt` and the design tools. Help text: "Colours: how the shop looks, light and dark. Pick a preset, change any part, look at it in the preview, then Save."
  - `src/components/admin/help/guide-data.ts`: the storefront article's first step and the figure's strip label "Design" become Colours. The step text: "**Colours** sets the shop's colours, light and dark: pick a preset, change any part, check it in the preview, then **Save**. **Revert** goes back to what is live."
  - `src/components/admin/help/legacy-data.ts`: in the l-design section, the controls row "Designs" becomes "Colours" with the same sentence.
- Test: `src/components/admin/colours/editor-state.test.ts`, which covers the editor's pure state logic. Extract that logic to `src/components/admin/colours/editor-state.ts`.

**Interfaces:**
- Consumes:
  - from Task 2: `SLOTS`, `PRESETS`, `filled`, `contrast`, `CONTRAST_PAIRS`;
  - from Task 3: `getLook`, `saveLook({ colours })`;
  - from Task 5: the `PreviewMessage` shape.
- Produces:
  - `export default function ColourEditor({ aronium }: { aronium?: boolean })`
  - In `editor-state.ts`:
    - `function pickPreset(id): ShopColours` (all 11 slots in both modes)
    - `function setSlot(c: ShopColours, mode: Mode, slot: Slot, hex: string): ShopColours`: sets `preset: "custom"` unless the result equals a preset exactly.
    - `function warnings(c: ShopColours, mode: Mode): { label: string; ratio: number; min: number }[]`
    - `function normaliseHex(s: string): string | null`: accepts `#rgb` or `#rrggbb` in any case and returns lowercase `#rrggbb`.
- **Behaviour:**
  - **Layout:**
    - a preset row of swatches, Legacy first, with the current one marked;
    - a Light | Dark switch for which palette is being edited;
    - the 11 slot rows: label, hint, swatch, hex field, and `<input type="color">`;
    - warnings under the list;
    - the preview pane, with a page picker (Home `/`, a shelf `/shop/<first category slug>/`, a product `/shop/<category>/<first product slug>/` from `adminApi().listProducts()` or equivalent, the cart `/cart/`) and its own Light | Dark switch;
    - Save and Revert.
  - **Preview:**
    - the iframe `src` is `${BASE}${path}?preview=colours`;
    - on every edit, and on iframe `load`, the editor posts `{ type: "bj-colours-preview", colours, mode: previewMode }` to `iframe.contentWindow` with `targetOrigin = location.origin`.
  - **Save** calls `saveLook({ colours })`, toasts "Saved: the shop's colours are live", and keeps the editor state.
  - **Revert** calls `getLook()` and resets the editor state (Review Focus 5).
  - **Permissions:** without `can(staff, "look")`, the editor is read-only and Save is hidden. Same rule as the rest of Storefront.
  - **Layout by width:** side by side on wide screens; the preview stacks under the list below 900px.
  - **Styling:** in Aronium-style, the editor uses the kit's look (`aronium-kit` fields, buttons and `ArSection`). In Legacy, it uses `adm-card`, `adm-btn` and `adm-input`.

- [ ] **Step 1: Write the failing tests** for `editor-state.ts`:
  - `pickPreset("haveli")` equals the Haveli preset in both modes.
  - `setSlot` on a Haveli palette changing the light accent gives `preset: "custom"`.
  - Setting it back to Haveli's value gives `preset: "haveli"` again.
  - `warnings` on a palette with text `#777777` on page `#888888` returns one warning with label "Text on page background" and `ratio < 4.5`.
  - `normaliseHex("#ABC") === "#aabbcc"`, `normaliseHex("c3141a") === null` (it needs the `#`), and `normaliseHex("#c3141a") === "#c3141a"`.
  - Revert loads from the database: with `getLook` injected as a stub, `revert(stub)` calls it once and returns its colours.
- [ ] **Step 2: Run them and check that they fail.** Run: `node --test src/components/admin/colours/editor-state.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `editor-state.ts`, then `ColourEditor.tsx` and `colours.css`,** and swap it into both storefront screens and both guides.
- [ ] **Step 4: Run and check.** `npm test`, `tsc` and `eslint` are clean.
- [ ] **Step 5: Commit** "Admin › Storefront › Colours: presets, the shop's colours part by part for light and dark, readability warnings, a live preview of the real shop; replaces Design in both admin designs and the guides".

### Task 7: Check it end to end

**Files:**
- Modify: `docs/handoff-ababil.md` (one line under "Since the merge", plus 0087 under Migrations as pending)

- [ ] **Step 1: Run the SQL test against live** (rolled back): `bash scripts/test-sql.sh supabase/migrations/0087_shop_colours.sql supabase/tests/0087_shop_colours.test.sql`. Expected: `[]`.
- [ ] **Step 2: Screenshots with Playwright** against the running dev server (port 3000), with `rpc/track_event` routed to a 204 and the age key `bj-age-ok` set:
  - (a) The shop home, light and dark, with no palette. It should look the same as before this branch, and no `#bj-colours` element should exist.
  - (b) `/admin/storefront` in Aronium-style, with Haveli picked (not saved) and the preview's dark switch on. The preview should show Haveli dark, and the live shop in another tab should be unchanged.
  - (c) `/?preview=colours` framed: no age gate, and no `track_event` request in the network log.

  0087 isn't on live, so saving is checked through the admin demo (`?demo=1`). If `getLook` and `saveLook` have no demo path for `colours`, add one to `memLook`.
- [ ] **Step 3: Write the handoff line and commit** "Handoff note: shop colours built; 0087 pending".
