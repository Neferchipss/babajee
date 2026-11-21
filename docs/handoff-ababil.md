# Handoff: branch `ababil` (admin UI redesign + shop designs)

For the Claude session working on this project. Everything on `ababil` is merged into `main`, and the two match except for this note. Each commit message lists what it changed.

## Status

- **All migrations up to 0083 are applied live.**
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

## Not done

- Shop layout still uses Tailwind utilities alongside plain CSS. Buttons, fields and links are now one style; the layout utilities read the same tokens and were left.
- "Email sent / not sent" on an order: nothing records it yet (notifications are off).
- The side panel's Pricing section can still set a buying price on options whose stock isn't counted. Whether to make it read-only is the client's call.
- Product option weights/sizes, box sizes and "what's in the set" depend on data entered in the admin. There are no box options live yet, so "₹x each" hasn't been seen with real data.
