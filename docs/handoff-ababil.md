# Handoff: branch `ababil` (admin UI redesign + shop designs)

For the Claude session reviewing or merging this branch. `ababil` is 19 commits ahead of `origin/main` (first: `7dd5c11`) and 0 behind; it merges as a fast-forward. Read the commit messages: each one lists what it changed.

## Before merging: four migrations, not applied anywhere live

| Migration | What it does | Test |
|---|---|---|
| `0077_catalog_staff.sql` | Storefront/catalogue staff (`staff_can('catalog')`) get box sizes/presets, read on costs, stock movements, suppliers and bills; ~15 stock/purchase RPCs switch from `is_admin()` to `staff_can('catalog')` (DO block rewrites their bodies via `pg_get_functiondef`). Adds `profiles.admin_design` (current/shopify/ease/studio) with `grant update (admin_design)`. | `supabase/tests/0077_catalog_staff.test.sql` |
| `0078_stock_counting.sql` | `admin_set_counting(variant, on, note)`: start/stop counting stock per option; keeps the number; refuses boxes and bundles; logs a `stock_movements` line. | `0078_stock_counting.test.sql` |
| `0079_settings_screens.sql` | `store_settings.couriers text[]` (default list, max 20, no empty names); `admin_set_hidden(profile, bool)` for the 0046 hidden flag, `staff_can('team')` only. | `0079_settings_screens.test.sql` |
| `0080_one_customer.sql` | `admin_customer(p_id)`: one row of `admin_customers()` (same columns and rules). | `0080_one_customer.test.sql` |

- Each test passes with `scripts/test-sql.sh <migration> <test>`: one transaction, always rolled back, and `[]` means pass. Each test also fails when run against an empty migration (negative control).
- `supabase/tests/0072_staff_roles.test.sql` line 59 was changed. The client decided the storefront role sees costs, so that line no longer asserts they can't.
- The client wants these applied together with you, not by this branch. After applying them, run Catalogue › Categories › "Fill from product names" for each type to create sub-categories from the live product names.

**The UI is safe before the migrations are applied:**
- the courier list (0079) reads and saves separately and shows a "needs 0079" note when the column is missing;
- `getCustomer` (0080) falls back to `listCustomers()` when it gets PGRST202 or 42883;
- `admin_design` (0077) falls back to localStorage.

Screens that call 0078's RPC or 0079's `admin_set_hidden` show the database error until those migrations are applied.

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

## Not done

- One styling approach for shop buttons and fields: about 15 shop files mix Tailwind utilities with plain CSS. This needs its own pass with before/after screenshots.
- The side panel's Pricing section can still set a buying price on options whose stock isn't counted. Whether to make it read-only is the client's call.
- Product option weights/sizes, box sizes and "what's in the set" depend on data entered in the admin. There are no box options live yet, so "₹x each" hasn't been seen with real data.
