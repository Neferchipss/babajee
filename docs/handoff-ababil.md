# Handoff: branch `ababil` (admin UI redesign + shop designs)

For the Claude session working on this project. Everything on `ababil` is merged into `main`, and the two match except for this note. Each commit message lists what it changed.

## Status

- **All migrations up to 0087 are applied live.**
  - 0081–0083 and 0084 (admin designs: Legacy and Aronium-style only) and 0085 (counter sales: the till at /admin/counter, cash drawer, orders.channel) on 24 Nov 2026.
  - 0086 (till part two: refunds, sales on account, voids, cashier, till reports) and 0087 (site_look.colours, the shop palette) later on 24 Nov 2026; colours stay null (Legacy) until someone saves.
- **The sub-category fill has been run on live data:**
  - 21 groups and 70 new sub-categories, across 8 types (papers, trays, storage, bongs, bong accessories, grinders, pipes, ashtrays);
  - 268 products tagged.
  - Before writing, 4 wrong matches were left out.
  - The other 12 types have no rules yet.
  - The hand-made "glass bong" sub-category (1 product) is still there, next to the new "Glass".
- **Still to decide: old columns.**
  - `products.subcategory`, the old text label, is still read by the shop's shelves and product cards.
  - `products.product_type` is still read by the admin.
  - `admin_purchase_gst` is unused.

## Live backend check (read-only or rolled back)

All of these ran on the live database without changing anything, except the two client-approved fixes at the end.

- **Database tests:** 31 of the 32 files in `supabase/tests` pass against live as it is.
  - 0050 and 0063 were updated to current behaviour: the 0057 price starting points, the 0083 low-stock rule, and the function dropped in 0076.
  - 0057 fails on live data only. "Fanta Cola Can · Default", a draft test product, has a buying price with no `purchase_corrections` starting point.
- **Order and bill lifecycle:** 18 of 18 steps pass, rolled back. The steps: phone order with a box, paid, invoice issued, packed, shipped, failed, sent again, delivered, return with credit note, bill, void.
  - The invoice and credit-note triggers are `deferrable initially deferred`, so a rolled-back test must run `set constraints all immediate` to see them fire.
  - The test overrides the `order_number` default inside the transaction so it doesn't use up a BJ number.
- **Security:** an anonymous visitor is refused every private table (25) and admin function (5). All 52 public tables have RLS on.
  - `store_settings` is readable by anyone, including the bank fields (by design since 0005, for paying customers) and internal settings.
- **Data health:**
  - Clean: no invoice gaps, every paid order invoiced, totals add up, no negative stock, no duplicate SKUs, box stock in step.
- **Scheduled jobs:** all 4 are on and succeeding, with no failures in 7 days.

**For you, from the client:**
- **Order numbers:** `order_number_seq` is at 1719 and the last real order is BJ-1555. Tests used up the numbers in between, because a sequence isn't rolled back. The client says you'll reset it.
- **Orders:** all 538 orders are test orders (534 flagged `is_test`). The client confirms none are real.
- **HSN:** 68 active products have none, so their invoice lines print without one and the GST returns warn. Fill per type in Finance › GST & HSN.
- **Prices:** 509 of 520 shown options are unpriced.

**Changed on live with the client's approval:**
- The sub-category fill above.
- All options switched on for Ring Joint Holder, Raw Drawstring Bag, Hemper Cones and Babajee Doob Tube (they had none on).
- Test products archived: blah blah, naya maal, pper box, rolling ppr of babajee.

## Taken live by us (client approved), merged to main

- **Customer profile:** each order has a one-click **Invoice** link, and a **Credit note** link when it has refunds. Both open the print page.
- **Products page:** the "Add a product" card opens `/admin/products/new` directly, carrying the open category. The old inline name form and `quickAdd` are gone.
- **Categories:** the toggle "Sold in boxes" is now labelled **"Comes in boxes"**. Boxes are how stock is bought and counted; selling a whole box stays optional per box (its switch on the product page).
- **Live data:** Rolling Paper switched to boxes.
  - 63 of its products got their box size from the stock sheet (mostly 50 and 24) in `product_box_sizes`.
  - Each loose option got a hidden box option (`unit_variant_id`, `pack_of`, priced at piece price × pieces, `is_visible` false).
  - 5 products have no size on the sheet and stay loose: 2 test products and the 2 pre-rolled cones, plus babajee 100's.
  - Boxes can now be added on Inventory › Stock (Add or adjust › Box of N › Add stock) or on purchase bills (Box of N line).
- **Sign-in emails don't reach staff.** Auth email goes through Resend's test sender (`onboarding@resend.dev`), which only delivers to the Resend account owner, so password-reset and sign-up emails never arrive for anyone else. Verify a sending domain in Resend and set the SMTP sender to it.

## What changed (by area)

- **Admin menu** (`components/admin/nav-data.tsx`): Home, Orders, Catalogue, Inventory, Customers, Finance, Storefront, Analytics, Settings. Page access goes through `lib/staff.ts` (PAGES → area).
- **Admin designs**: Current, Shopify-style, Ease and Studio shells (`components/admin/shells/`), chosen per person in Settings › Admin design. `?look=` previews one, `?role=` simulates a role, and `?demo=1` uses in-memory data (`lib/admin-api.ts`).
- **Shared kit** in `components/admin/kit.tsx`: SaveBar, useDraft, Toggle, Confirm, Tabs, GstPicker and similar.
- **Catalogue › Categories**: "type" means a top-level category, with its sub-categories inside it. On that page:
  - sub-categories in groups;
  - box presets, GST/HSN for each type;
  - deleting an empty type (`deleteCategory`).
- **Products**:
  - a full product page (`components/admin/product/ProductPage.tsx`, CSS prefix `prd-`);
  - one status per product: Draft, Active or Archived;
  - the side panel is now for quick edits only.
- **Inventory**:
  - **Stock** (`app/admin/inventory/stock`) is the only screen that changes stock or buying prices; it also has the counting switch (0078).
  - **Purchase bills** moved from `products/stock-in` to `inventory/purchases`.
- **Orders**: the order page has one "Notes and activity" card that merges events with `customer_notes` contacts. Other changes:
  - "Kept after refunds" replaces the old "Net profit" line;
  - a "Bill to" address shows when it differs;
  - a business customer's GSTIN is pre-filled on new orders;
  - edit, new-order and refund totals include cess.
- **Finance**:
  - GST & HSN moved from `products/tax`;
  - new Invoices & credit notes list;
  - GST returns, Tally and purchases CSV moved here from Reports;
  - the HSN summary counts box lines as pieces: `OrderItem.pack` comes from `product_variants.pack_of` in `FULL`, and a test covers it.
- **Settings**: split into topic tabs (`?t=`) with one Save. Also new:
  - bank and UPI fields (they already existed in the database);
  - a courier list, used by the ship forms through `CourierInput`;
  - a Team switch that keeps an account out of tracking.
- **Shop designs**:
  - `app/themes/shop-designs.css` sets the shop tokens per design and mode, for `html[data-design][data-mode]`.
  - `lib/shop-design.ts` holds the boot-script line, so the design is applied before first paint, plus `applyShopDesign`. The design is never applied under `/admin`.
  - The homepage dark versions are in `components/home/designs.css`.
- **Other shop changes**:
  - `/faq/` is the single help page (`/support` renders the same thing);
  - content-page classes renamed `cp-` → `cpg-` because they clashed with the shelf's `.cp-body`;
  - new `ProductDetails` component, shared by the desktop page and a phone "Details" panel;
  - box options show "₹x each".

## Conventions this branch kept

- Next 16 static export. Read `node_modules/next/dist/docs` before relying on framework behaviour, per AGENTS.md.
- Before each commit: `tsc --noEmit` (delete `.next/types` if it reports stale errors), eslint, `npm test`, and a postcss parse of changed CSS. All pass on the branch head, with 92 tests.
- User-facing text is plain and short. Commit messages say what changed for the shop.

## Since the merge

- Inventory has two new pages: Suppliers and Stock history.
- Settings changes:
  - each topic saves on its own;
  - the store account sees GST and Delivery read only;
  - Delivery problems (0081).
- Switches that save at once get an Undo on their notice for 5 seconds.
- Wording matches the plan: Void bill, New order, Low stock, Search keywords.
- Analytics Overview no longer repeats Traffic.
- Role check run against the database, in a rolled-back transaction: every page's reads and writes match its role.
- Fixed: page access ignores `#`/`?`. Before this, Profit and GST showed for every role.
- Shop buttons, fields and links take their colours from the design tokens, with one `.link` class.
- Homepage is always the painted walk-in (scrub scene), whatever storefront design is picked; HomeSwitch removed.
- Login window: hero art (beach or garden) picked at random on each opening, replacing the placeholders.
- Login window: redesigned as logo over the full artwork on the left and the form card on the right, 960 × 440, no pitch text.
- Login window: art runs to the window's left, top and bottom edges, pinned bottom-left, its right edge lined up with the form card.
- Login window: the art showing around the form card is blurred; the logo has no black tile behind it.
- Login on phones: art fills the whole header edge to edge, logo straight on it.
- Shop colours built: Storefront › Colours replaces the designs (11 parts, light and dark, presets Legacy/Haveli/Chai corner/Courtyard, live preview); 0087 applied to live. Spec and plan in `docs/superpowers/`.

## Not done

- Shop layout still uses Tailwind utilities alongside plain CSS. Buttons, fields and links are now one style; the layout utilities read the same tokens and were left.
- "Email sent / not sent" on an order: nothing records it yet (notifications are off).
- The side panel's Pricing section can still set a buying price on options whose stock isn't counted. Whether to make it read-only is the client's call.
- Product option weights/sizes, box sizes and "what's in the set" depend on data entered in the admin. There are no box options live yet, so "₹x each" hasn't been seen with real data.
