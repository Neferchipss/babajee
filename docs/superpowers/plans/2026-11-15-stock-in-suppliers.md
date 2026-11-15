# Stock in, suppliers and supplier bills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every option's stock and buying price come from logged stock-in entries (supplier bills, opening count, quick adds), entered from the product panel or a Stock in page, with GST paid on bills reported as input credit.

**Architecture:** One migration (0050) adds suppliers, receipts and receipt lines, and `security definer` RPCs that post/void receipts, keep a running average buying price in `variant_costs.purchase`, and log every stock change in `stock_movements`. Pure TS modules (average cost preview, sheet reading, row matching) are unit-tested with `node --test`. The UI is a Stock section in `ProductEditor` and a new `/admin/products/stock-in` page.

**Tech Stack:** Next.js 16 (app router, client admin pages), Supabase Postgres (plpgsql RPCs via supabase-js), fflate (xlsx unzip), Node 24 `node --test` with type stripping.

**Spec:** `docs/superpowers/specs/2026-11-15-stock-in-suppliers-design.md`

## Global Constraints

- Read `node_modules/next/dist/docs/` before writing Next code (AGENTS.md: this Next has breaking changes).
- No new npm dependencies. `.xlsx` is read with `fflate` (already present).
- Money is `numeric(10,2)` rupees; round each line to the paisa like `lineGst` in `src/lib/gst.ts`.
- All new tables: RLS on, admins read, no direct writes; writes only through RPCs that start with `if not public.is_admin() then raise exception 'Admins only.' using errcode = '42501'`.
- Stock changes set `babajee.stock_reason` (and new `babajee.receipt_id`) with `set_config(..., true)` before updating `product_variants.stock_qty`, so `log_stock_movement()` writes the row.
- Copy in the admin: plain words, no jargon ("Add stock", "Bill no.", "Buying price before GST", "Correct count").
- Live DB is the client's production project. SQL tests run inside `begin; … rollback;` and must leave no rows behind.
- Migration is applied by Nefer with `bash scripts/apply-migration.sh supabase/migrations/0050_stock_in.sql` after he approves; never applied by the implementer.

## Review Focus

- Average cost when current stock is negative or zero (oversold option): treat stock as `max(stock,0)`; the new average equals the incoming price. Test in Task 1.
- Voiding a bill whose stock has already been sold (stock would go below 0): allowed, stock may go negative, and the void still recomputes the average from remaining lines. Test in Task 1.
- Same bill number from two different suppliers must be two bills; same supplier + same bill no. joins one bill; a voided bill's number can be reused. Test in Task 1.
- Uploaded sheets with header rows not on row 1, blank rows, numbers stored as text ("1,250.00"), and duplicate SKUs in the catalogue (ambiguous, never auto-matched). Tests in Task 2.
- "Start tracking all stock" pressed twice, or with zero uncounted options: idempotent, returns 0 the second time. Test in Task 1.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0050_stock_in.sql` | tables, reasons, RPCs, export list, purchase GST report |
| `supabase/tests/0050_stock_in.test.sql` | SQL assertions, run inside a rolled-back transaction |
| `scripts/test-sql.sh` | `begin` + migration + test file + `rollback` through the Management API |
| `src/lib/stock-in/average.ts` (+ `.test.ts`) | average buying price maths (preview in the UI) |
| `src/lib/stock-in/sheet.ts` (+ `.test.ts`) | read `.csv` / `.xlsx` into `string[][]` |
| `src/lib/stock-in/match.ts` (+ `.test.ts`) | map sheet rows to variants |
| `src/lib/stock-in/db.ts` | typed RPC wrappers for the UI |
| `src/components/admin/stock/ProductStock.tsx` | Stock section in the product panel |
| `src/components/admin/stock/LineEditor.tsx` | bill lines: product search, qty, price, GST |
| `src/components/admin/stock/SheetImport.tsx` | upload, column mapping, review table |
| `src/app/admin/products/stock-in/page.tsx` | Bills / Suppliers tabs, new bill, opening count, track-all |
| `src/app/admin/products/stock-in/bill/page.tsx` | one bill (`?id=`), totals, void |
| `src/components/admin/stock/stock.css` | styles, matching `admin-products.css` conventions |

---

### Task 1: Migration 0050 and SQL tests

**Files:**
- Create: `supabase/migrations/0050_stock_in.sql`, `supabase/tests/0050_stock_in.test.sql`, `scripts/test-sql.sh`

**Interfaces:**
- Produces (tables): `suppliers(id uuid, name text not null, gstin text not null default '', phone text not null default '', notes text not null default '', active boolean not null default true, created_at)`; `stock_receipts(id uuid, kind text check in ('bill','opening','quick'), supplier_id uuid null, bill_no text not null default '', bill_date date not null default current_date, notes text not null default '', status text check in ('posted','void') default 'posted', actor_id, created_at, voided_at)` with unique index on `(supplier_id, lower(bill_no)) where status='posted' and kind='bill'`; `stock_receipt_lines(id, receipt_id, variant_id, qty int check (qty>0), unit_price numeric(10,2) check (>=0), gst_rate numeric, gst, cgst, sgst, igst numeric(10,2), claimable boolean, created_at)`.
- Produces (columns): `stock_movements.receipt_id uuid null references stock_receipts`, `stock_movements.note text not null default ''`; reasons add `'stock_in','void','correction'`.
- Produces (RPCs, all admins only):
  - `admin_suppliers() returns setof suppliers` (active first, by name)
  - `admin_save_supplier(p jsonb) returns uuid` — insert when `p->>'id'` null, else update; GSTIN validated with the same regex as `store_settings_gstin_format` when non-empty
  - `admin_post_receipt(p_kind text, p_supplier uuid, p_bill_no text, p_bill_date date, p_notes text, p_lines jsonb) returns uuid` — `p_lines` = `[{variant_id, qty, unit_price, gst_rate}]`; kind `bill` requires supplier + bill no. and appends to the posted bill with the same supplier + bill no. if one exists; `opening` → `claimable=false`, no supplier; `quick` → `claimable=false`. Per line: GST = round(qty×unit_price×rate/100, 2); split by supplier GSTIN state vs shop GSTIN state (`store_settings.gstin` first two digits): same → cgst = round(gst/2,2), sgst = gst−cgst; different → igst = gst; either unknown → all three 0 (gst only). Then sets `track_stock = true`, recomputes average (below), adds qty to stock with reason `stock_in` and `receipt_id`.
  - `admin_void_receipt(p_receipt uuid) returns void` — status `void`, subtracts each line's qty (reason `void`), recomputes each affected variant's average.
  - `admin_correct_stock(p_variant uuid, p_count int, p_note text) returns void` — `p_note` required (non-blank), `p_count >= 0`, reason `correction`, sets `track_stock = true`.
  - `admin_receipts(p_from date, p_to date) returns jsonb` — `[{id, kind, status, supplier, bill_no, bill_date, lines, qty, taxable, gst}]` newest first.
  - `admin_receipt(p_id uuid) returns jsonb` — header + lines with product name and option label.
  - `admin_uncounted() returns int` — options with `track_stock = false`.
  - `admin_track_all_stock() returns int` — sets `track_stock = true` where false; returns rows changed.
  - `admin_purchase_gst(p_from date, p_to date) returns jsonb` — `[{month 'YYYY-MM', taxable, gst, cgst, sgst, igst, claimable_gst}]` from posted lines by `bill_date`.
  - internal `recost_variant(p_variant uuid) returns void` — replays posted lines for the variant ordered by (opening first, bill_date, created_at): `avg := (max(running,0)*avg + qty*price) / (max(running,0)+qty)` with `running += qty`; writes `variant_costs.purchase` (upsert); no posted lines → leaves the existing purchase untouched.
  - `export_table_list()` gains `'stock_receipt_lines','stock_receipts','suppliers'` (alphabetical with the rest).
  - All new functions: `revoke all … from public, anon; grant execute … to authenticated;` audited tables get the 0042 audit trigger like `products`.

- [ ] **Step 1: Write `scripts/test-sql.sh`** — args `<migration> <test>`; builds `begin;\n` + migration + test + `\nrollback;` and posts it exactly as `apply-migration.sh` does. Prints the API response.

- [ ] **Step 2: Write the failing tests** in `supabase/tests/0050_stock_in.test.sql`. Setup: `select id into admin from profiles where role='admin' limit 1`; `perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role','authenticated')::text, true)`; create a throwaway category, product (gst 18) and two variants (stock 0, track_stock false); store_settings gstin temporarily `'27AAAAA0000A1Z5'`. Each assertion is `if not (…) then raise exception 'FAIL: <name>'; end if;` inside one `do $$ … $$`:
  - `opening_sets_stock_and_avg`: post opening 10 @ 100 → stock 10, purchase 100, track_stock true, one movement reason `stock_in` with receipt_id, line claimable false.
  - `bill_moves_average`: then bill (supplier GSTIN `27…`) 10 @ 120 → stock 20, purchase 110.00, line gst 216.00, cgst 108.00, sgst 108.00, igst 0, claimable true.
  - `interstate_is_igst`: supplier GSTIN `29…` line 1 @ 100 → igst 18.00, cgst 0.
  - `same_bill_no_joins`: two posts same supplier + bill_no `"A-1"` and `"a-1"` → one receipt, two lines; different supplier same bill_no → second receipt.
  - `negative_stock_average`: variant at stock −3 (set via correction to 0 then sale simulated with `update … stock_qty = -3`), post bill 5 @ 50 → purchase 50.00.
  - `void_recomputes`: void the 120 bill → stock back by 10, purchase 100.00, movement reason `void`; voided bill_no reusable.
  - `void_after_sale_goes_negative`: stock 2, void a bill of 5 → stock −3, no error.
  - `correction_needs_note`: `admin_correct_stock(v, 4, '')` raises; with note → stock 4, reason `correction`, note stored.
  - `bill_needs_supplier_and_no`: kind bill without supplier or bill no raises.
  - `track_all_idempotent`: `admin_track_all_stock()` returns ≥ 1 then 0; `admin_uncounted()` = 0.
  - `purchase_gst_by_month`: `admin_purchase_gst` for the month returns claimable_gst excluding opening/quick.
  - `non_admin_blocked`: with claims of a non-admin uuid, `admin_post_receipt` raises 42501.
  - `export_lists_new_tables`: `'suppliers' = any(export_table_list())`.

- [ ] **Step 3: Run to see it fail** — `bash scripts/test-sql.sh supabase/migrations/0050_stock_in.sql supabase/tests/0050_stock_in.test.sql` with an empty migration file. Expected: error mentioning `admin_post_receipt` does not exist.

- [ ] **Step 4: Write the migration** to the Interfaces above. Comment header in the house style (what, why, "Depends on 0049. Safe to re-run.").

- [ ] **Step 5: Run the tests** — same command. Expected: no `FAIL:` and no error in the response (`[]`). Then confirm nothing persisted: `select count(*) from suppliers` via a read query errors with "relation does not exist" (migration rolled back).

- [ ] **Step 6: Commit** — `git add supabase/migrations/0050_stock_in.sql supabase/tests/0050_stock_in.test.sql scripts/test-sql.sh && git commit -m "Stock in: suppliers, bills, average buying price (migration 0050)"`

---

### Task 2: Pure TS — average, sheet reading, matching

**Files:**
- Create: `src/lib/stock-in/average.ts`, `sheet.ts`, `match.ts` and a `.test.ts` beside each
- Modify: `tsconfig.json` (add `"allowImportingTsExtensions": true`), `package.json` (script `"test": "node --test src/lib/stock-in/"`)

**Interfaces:**
- Produces: `nextAverage(stock: number, avg: number | null, qty: number, price: number): number` (rounded to paisa; null avg treated as price)
- Produces: `readSheet(file: { name: string; bytes: Uint8Array }): string[][]` — `.csv` (quotes, commas inside quotes, CRLF) or `.xlsx` (first worksheet; shared strings and inline strings; empty cells as `""`); throws `Error("Only .xlsx or .csv files")` otherwise
- Produces: `type Candidate = { variant_id: string; product: string; option: string; sku: string | null }`; `type Mapping = { name?: number; option?: number; sku?: number; qty: number; price?: number; gst?: number; headerRow: number }`; `guessMapping(rows: string[][]): Mapping | null`; `matchRows(rows: string[][], m: Mapping, catalogue: Candidate[]): MatchRow[]` where `MatchRow = { row: number; status: "matched" | "unsure" | "missing" | "skip"; variant_id: string | null; options: string[]; qty: number; price: number | null; gst: number | null; text: string }`; `parseNumber(s: string): number | null` ("1,250.00" → 1250, "₹ 99" → 99, "" → null)
- Matching rule (the one choice tests don't fix): normalise = lowercase, strip non-alphanumerics; SKU equal and unique → matched; else product name + option equal → matched; else candidates whose normalised name contains or is contained by the row text → `unsure` with up to 5 options; none → `missing`; qty blank/0 → `skip`. Duplicate SKUs in the catalogue never match by SKU.

- [ ] **Step 1: Write failing tests**
  - `average.test.ts`: `nextAverage(10,100,10,120) === 110`; `nextAverage(-3,80,5,50) === 50`; `nextAverage(0,null,4,99.99) === 99.99`; `nextAverage(3,10,0,50) === 10`.
  - `sheet.test.ts`: CSV `'Name,Qty\n"Grinder, 4pc",3\r\n'` → `[["Name","Qty"],["Grinder, 4pc","3"]]`; an xlsx fixture built in the test with fflate `zipSync` (workbook, sheet1 with a shared string and a number, sharedStrings) reads back as `[["Name","Qty"],["Cone","12"]]`; `.pdf` throws.
  - `match.test.ts`: `guessMapping` finds headers on row 3 when rows 1–2 are a title and a blank; `parseNumber("1,250.00") === 1250`; SKU match; name+option match; a near name → `unsure` with options; unknown → `missing`; qty `""` → `skip`; duplicate SKU in catalogue → not `matched` by SKU.

- [ ] **Step 2: Run to fail** — `npm test`. Expected: module not found.

- [ ] **Step 3: Implement** the three modules to the signatures. `sheet.ts` uses `unzipSync`/`strFromU8` from fflate and a small regex reader for `<c r=… t=…><v>`/`<is><t>` — no DOMParser (runs under node).

- [ ] **Step 4: Run** — `npm test` → all pass; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `git commit -m "Stock in: average, sheet reader, row matching"`

---

### Task 3: RPC wrappers

**Files:** Create `src/lib/stock-in/db.ts`; Modify `src/lib/orders-db.ts` (`StockMove.reason` gains `"stock_in" | "void" | "correction"`, select adds `receipt_id, note`)

**Interfaces:**
- Consumes: Task 1 RPC names and shapes.
- Produces: `listSuppliers(): Promise<Supplier[]>`, `saveSupplier(s: Partial<Supplier>): Promise<string>`, `postReceipt(input: { kind: "bill" | "opening" | "quick"; supplier_id?: string | null; bill_no?: string; bill_date?: string; notes?: string; lines: { variant_id: string; qty: number; unit_price: number; gst_rate: number }[] }): Promise<string>`, `voidReceipt(id: string)`, `correctStock(variant_id: string, count: number, note: string)`, `listReceipts(from: string, to: string): Promise<ReceiptRow[]>`, `getReceipt(id: string): Promise<Receipt>`, `uncounted(): Promise<number>`, `trackAllStock(): Promise<number>`, `purchaseGst(from: string, to: string): Promise<PurchaseGstMonth[]>`, `stockCatalogue(): Promise<Candidate[]>` (variants with product name, label, sku).
- Pattern: same `db()` / `getSupabase()` guard and `if (error) throw error` as `src/lib/team.ts`.

- [ ] **Step 1:** Write `db.ts` to the signatures; types mirror the jsonb shapes in Task 1.
- [ ] **Step 2:** `npx tsc --noEmit` → clean. (Exercised end to end in Tasks 4–6.)
- [ ] **Step 3: Commit** — `git commit -m "Stock in: data calls"`

---

### Task 4: Stock section in the product panel

**Files:** Create `src/components/admin/stock/ProductStock.tsx`, `src/components/admin/stock/stock.css`; Modify `src/components/admin/ProductEditor.tsx` (replace the "Stock counting" section at ~468–484 and the `StockLine` input at ~898–940; extend `REASON` with `stock_in: "Stock in"`, `void: "Bill voided"`, `correction: "Count corrected"`), `src/components/admin/ProductTable.tsx` (~306–316: remove the count/uncount toggles; untracked shows "Not counted yet")

**Interfaces:**
- Consumes: `postReceipt`, `correctStock`, `listSuppliers`, `nextAverage`, `stockHistory`.
- Produces: `<ProductStock product={AdminProduct} rules={{ rate: number }} onChanged={() => void} />`

Behaviour (from spec): per option row = count (or "Not counted yet"), average buying price, `+ Add stock`, `Correct count`. Add stock form: Quantity, Buying price before GST, GST % (default product bracket), Supplier (select + "New supplier" inline name), Bill no., Date (today). With supplier + bill no. → kind `bill`; otherwise `quick` with a hint "Without a supplier bill, the GST on this stock can't be claimed." Live preview line: "New average ₹X" via `nextAverage`. Correct count: new count + reason (required). History below with the extended reasons; "Stock in" rows show "bill 4471". Low-stock mark stays.

- [ ] **Step 1:** Build the component and wire it into `ProductEditor`; remove the switch and direct stock input.
- [ ] **Step 2: Verify in the app** — apply 0050 only after Nefer approves; until then verify with `?demo=1` that the panel renders (calls fail gracefully with the existing error toast). After apply: on localhost, add 5 @ ₹100 with a supplier + bill no. → count +5, history "Stock in · bill …", Analytics cost uses it. Phone width 390px screenshot, Light and Dark.
- [ ] **Step 3:** `npx tsc --noEmit` and `npm run lint` clean.
- [ ] **Step 4: Commit** — `git commit -m "Stock in from the product panel; no more stock switch"`

---

### Task 5: Stock in page — bills, bill view, suppliers, manual bill

**Files:** Create `src/app/admin/products/stock-in/page.tsx`, `src/app/admin/products/stock-in/bill/page.tsx`, `src/components/admin/stock/LineEditor.tsx`; Modify `src/components/admin/AdminNav.tsx` (Products sub-nav: `{ label: "Stock in", href: "/admin/products/stock-in" }` after "Out of stock")

**Interfaces:**
- Consumes: Task 3 calls, `nextAverage`.
- Produces: `<LineEditor catalogue={Candidate[]} lines={Line[]} onChange={(l: Line[]) => void} gstOf={(variant_id: string) => number} />` with `type Line = { variant_id: string; qty: number; unit_price: number; gst_rate: number }` (reused by Task 6).

Behaviour: tabs **Bills** (list with date range via existing `RangePicker`, status pill, totals; "New bill" and "Opening count" buttons) and **Suppliers** (list, add/edit inline, deactivate). New bill: supplier, bill no., date, notes, LineEditor (type to search product/option/SKU, Enter adds, qty and price inputs, running totals: taxable, GST, total, "Check this against the paper bill"), Post. Bill page: header, lines, CGST/SGST/IGST totals, Void (confirm in-page, not `window.confirm`), voided bills shown struck with the date.

- [ ] **Step 1:** Build the pages and LineEditor; nav entry.
- [ ] **Step 2: Verify** on localhost after 0050 is applied: create supplier (bad GSTIN rejected with the house message), post a 3-line bill, open it, totals match a hand sum, void it → stock returns, bill shows voided. 390px screenshots.
- [ ] **Step 3:** tsc + lint clean.
- [ ] **Step 4: Commit** — `git commit -m "Stock in page: bills, suppliers, manual bill entry"`

---

### Task 6: Upload, opening count, track all stock

**Files:** Create `src/components/admin/stock/SheetImport.tsx`; Modify `src/app/admin/products/stock-in/page.tsx`

**Interfaces:**
- Consumes: `readSheet`, `guessMapping`, `matchRows`, `parseNumber`, `stockCatalogue`, `postReceipt`, `uncounted`, `trackAllStock`, `LineEditor`'s `Line`.
- Produces: `<SheetImport catalogue={Candidate[]} onLines={(l: Line[]) => void} />` — hands matched lines to the bill/opening form.

Behaviour: drop or choose file → column mapping (pre-filled by `guessMapping`, editable selects, preview of 5 rows) → review table with filters Matched / Unsure / Not found / Skipped and counts; unsure rows pick from options or search; not found rows search or "Leave out"; then "Use N lines" fills the form. Opening count = same form with kind `opening`, no supplier fields, note "GST isn't claimed on opening stock". After any opening receipt exists and `uncounted() > 0`, show the card: "N options have no count. Start tracking all stock? They'll show as sold out until you add stock." → `trackAllStock()`; card disappears at 0.

- [ ] **Step 1:** Build SheetImport and the opening/track-all flow.
- [ ] **Step 2: Verify** with a real-shaped sheet (export a few rows of the catalogue to `.xlsx` from the "Download all data" products CSV opened in Excel): mapping guessed, matched rows correct, an altered name lands in Unsure, Post works. Then the track-all card shows the right count.
- [ ] **Step 3:** tsc + lint clean.
- [ ] **Step 4: Commit** — `git commit -m "Stock in: sheet upload, opening count, track all stock"`

---

### Task 7: Analytics — GST paid on supplier bills

**Files:** Modify `src/app/admin/analytics/page.tsx` (finance area near the existing GST figures), `src/app/admin/analytics/reports/page.tsx` (new "Purchases" CSV: one row per posted line — bill_date, supplier, supplier GSTIN, bill_no, product, option, qty, unit_price, taxable, rate, cgst, sgst, igst, claimable)

**Interfaces:** Consumes `purchaseGst`, `listReceipts`, `getReceipt` (or one `admin_receipt` per bill in range).

Behaviour: card "GST paid on supplier bills" for the selected range: claimable total, CGST/SGST/IGST, and per-month rows; footnote "This is the input credit to claim on GSTR-3B. Opening stock and entries without a bill aren't included." The existing "GST paid" (from goods sold) is relabelled "GST inside the cost of what sold".

- [ ] **Step 1:** Build the card and the CSV.
- [ ] **Step 2: Verify** after posting the Task 5 bill: card totals equal the bill's GST; CSV opens in Excel with one row per line.
- [ ] **Step 3:** tsc + lint clean; `next build` succeeds.
- [ ] **Step 4: Commit** — `git commit -m "Analytics: GST paid on supplier bills, purchases report"`
