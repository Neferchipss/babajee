# Stock in, suppliers and supplier bills — design

Approved by Nefer, 15 Nov 2026.

## Why

The client (Babajee's owner) wants stock entered where he enters product
details, and the shop's numbers to hold up for accounts: real stock, real
buying prices, and the GST paid to suppliers (input tax credit, his
"rebate") recorded from actual bills. Today 526 of 529 options have stock
tracking off and no count, each option has one hand-typed buying price, and
"GST paid" is estimated from the cost of goods sold, which doesn't match
what goes on the GST return.

## Goals

- Every option tracked. The per-option `track_stock` switch goes away.
- Stock only changes through a logged reason: stock in (bill or opening
  count), sale, cancel, refund, or a count correction with a reason.
- Supplier bills recorded line by line; posting adds stock, updates the
  option's average buying price, and records GST paid (CGST+SGST or IGST
  by supplier state).
- Two ways in: per product (product panel) and many products at once
  (Products › Stock in: manual bill entry, sheet upload, opening count).
- Analytics shows GST paid on supplier bills per month (the credit to
  claim).

## Non-goals

Purchase orders, goods-received notes, money owed to suppliers, supplier
payments, returns to suppliers, multiple stockrooms.

## Anti-goals

- The shop going "sold out" by surprise: tracking for all switches on only
  by an explicit action that first says how many options are uncounted.
- Bills edited in place. A wrong bill is voided and re-entered, so history
  and averages stay explainable.
- A storefront reachable in a broken state from normal admin use.

## Approaches considered

1. Bill totals only (number, date, supplier, amount, GST). Quick, gives
   input credit, but no stock or costing. Rejected: stock can't be accurate.
2. Line-by-line bills (chosen). Slower to enter, but gives stock, average
   cost and exact credit; entry made fast by product search and upload.
3. Stock only in the product panel (client's ask, alone). Rejected as the
   only route: opening count, uploads, whole-bill review and void don't fit
   one product's panel. Kept as the everyday route alongside the page.

## Design

### Data (one migration)

- `suppliers`: name, gstin (optional, validated; state code = first two
  digits), phone, notes, active.
- `stock_receipts`: kind (`bill` | `opening` | `quick`), supplier_id,
  bill_no, bill_date, notes, status (`posted` | `void`), actor, timestamps.
  Unique (supplier_id, bill_no) among non-void bills, so product-panel
  entries with the same supplier + bill number join one bill.
- `stock_receipt_lines`: receipt_id, variant_id, qty (> 0), unit_price
  (before GST), gst_rate, gst (amount), cgst, sgst, igst.
- `stock_movements.reason` gains `stock_in`, `void`, `correction`; a
  `receipt_id` column links the movement to its bill; corrections carry a
  note.
- Average buying price per option, written to `variant_costs.purchase`
  (the existing trigger then derives cost with GST):
  new = (max(stock,0) × old + qty × price) ÷ (max(stock,0) + qty).
  Voiding a bill removes its stock and recomputes the average by replaying
  the option's remaining posted lines in order (opening first).
- Opening stock: kind `opening`, no supplier, GST not claimable.
- `quick` entries (product panel without supplier/bill no.): stock and
  average update; GST recorded but flagged unclaimable (no bill).
- All writes through `security definer` RPCs, admins only, audited like the
  rest (0042 activity log).

### Admin UI

- **Product panel**, under price: a Stock section per option with count,
  average buying price, `+ Add stock` (qty, buying price before GST, GST
  defaulting to the product bracket, optional supplier + bill no. + date),
  `Correct count` (new count + reason), and the option's history. The raw
  stock-count field and the track-stock switch are removed (switch removal
  happens with "Start tracking all stock").
- **Products › Stock in**: tabs Bills and Suppliers.
  - Bills: list (date, supplier, bill no., lines, total, GST, status); a
    bill page with lines, totals, CGST/SGST/IGST, and Void.
  - New bill: supplier, bill no., date, lines by product search; or Upload.
  - Upload: `.xlsx` (read with fflate, already a dependency) or `.csv`;
    map columns (name, option/SKU, qty, price, optional GST); match by SKU,
    then name + option; review table (matched / unsure / not found) with
    fix-by-search; post as one receipt.
  - Opening count: same entry/upload, kind opening; after it is posted,
    `Start tracking all stock` shows the uncounted count, then sets
    `track_stock = true` everywhere and hides the switch.
  - Suppliers: list, add, edit, deactivate.
- **Analytics**: GST paid on supplier bills per month (CGST/SGST/IGST),
  claimable vs not; the GST report CSV gains a purchases section.
- **Download all data**: the three new tables added to the export list.

## Left to the builder

Exact component split, styling (match the existing admin CSS), RPC names,
how the review table pages on a phone, and the upload's fuzzy-match rule
(keep it simple and transparent; the review step is the safety net).
