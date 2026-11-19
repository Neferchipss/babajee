# Handoff: branch `ababil` (admin UI redesign + shop designs)

For the Claude session reviewing or merging this branch. Since the last merge, `ababil` is 12 commits ahead of `origin/main` (first: `bdd27f1`) and 0 behind, so it merges as a fast-forward. Each commit message lists what it changed.

## Please check first

1. **Review migrations 0081, 0082 and 0083** (below) and their tests before applying them to live. Each passes with `scripts/test-sql.sh <migration> <test>` and fails without its migration. None has been applied anywhere live.
2. **Apply them in order:** 0081, 0082, 0083. None depends on another.
3. **Run "Fill from product names"** on live data once (Catalogue › Categories, for each type). This is still left over from the 0077–0080 session.
4. **Decide on the old columns** listed below before anything removes them.

## Migrations

0077 to 0080 are applied live. Still to do from that session: run Catalogue › Categories › "Fill from product names" on each type.

**Pending, not applied anywhere live:**

| Migration | What it does | Test |
|---|---|---|
| `0081_delivery_rules.sql` | `store_settings.fail_reasons text[]` (1 to 12, no empty) and `late_days int` (1 to 60, default 7). Settings › Delivery edits them; the order page's failed-delivery reasons and the late-deliveries report read them. | `0081_delivery_rules.test.sql` |
| `0082_look_staff_read.sql` | Front-end staff (`staff_can('look')`) can read every collection, collection item and category, hidden ones included, for the homepage pickers. Read only. | `0082_look_staff_read.test.sql` |
| `0083_one_low_stock_rule.sql` | `admin_home_counts()` counts out-of-stock and low-stock options only on active products, the same rule as `admin_low_stock()` and Inventory › Stock. | `0083_one_low_stock_rule.test.sql` |

- Each test passes with `scripts/test-sql.sh <migration> <test>` (rolled back, `[]` = pass) and fails without its migration.
- **Before they're applied:** the code reads 0081's columns separately and falls back to its defaults (Settings shows a "needs 0081" note); without 0082, front-end pickers simply don't list hidden shelves; without 0083, Home's out-of-stock count still includes drafts.

**Not removed, needs a decision:**
- `products.subcategory` (the old text label) is still read by the shop's shelves and product cards.
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
