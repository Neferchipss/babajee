import { test } from "node:test";
import assert from "node:assert/strict";
import { amountInWords, invoiceOf, stateCode } from "./invoice.ts";
import type { Order } from "./orders-db.ts";

// An order as the database records it; only what the invoice reads.
type Item = { product_name: string; variant_label: string; sku: string | null; hsn: string | null; quantity: number; unit_price: number; gst_rate: number | null; cess_rate?: number | null };
const order = (items: Item[], extra: Partial<Order> = {}) =>
  ({ gst_inclusive: true, gst_rate: 18, address_state: "Maharashtra", shipping: 0, total: 0, order_refunds: [], order_items: items, ...extra }) as unknown as Order;
const item = (unit_price: number, quantity = 1, gst_rate: number | null = 18, hsn = "9614"): Item => ({ product_name: "Grinder", variant_label: "Black", sku: null, hsn, quantity, unit_price, gst_rate });

test("price includes GST: ₹118 at 18% is ₹100 taxable and ₹18 GST", () => {
  const inv = invoiceOf(order([item(118)]), "Maharashtra");
  assert.equal(inv.lines[0].taxable, 100);
  assert.equal(inv.lines[0].gst, 18);
  assert.equal(inv.lines[0].total, 118);
  assert.equal(inv.taxable, 100);
  assert.equal(inv.gst, 18);
});

test("price before GST: ₹100 at 18% adds ₹18", () => {
  const inv = invoiceOf(order([item(100)], { gst_inclusive: false }), "Maharashtra");
  assert.equal(inv.lines[0].taxable, 100);
  assert.equal(inv.lines[0].gst, 18);
  assert.equal(inv.lines[0].total, 118);
});

test("buyer in the shop's state: CGST and SGST, half each", () => {
  const inv = invoiceOf(order([item(118)]), "Maharashtra");
  assert.equal(inv.split, "intra");
  assert.equal(inv.cgst, 9);
  assert.equal(inv.sgst, 9);
  assert.equal(inv.igst, 0);
});

test("an odd paisa of GST goes to SGST, so the halves add up", () => {
  // ₹100.01 including 18%: GST 15.26 → CGST 7.63 + SGST 7.63
  // ₹100.03 including 18%: GST 15.26 too; use 5% on ₹10.71 → GST 0.51 → 0.26 + 0.25
  const inv = invoiceOf(order([item(10.71, 1, 5)]), "Maharashtra");
  assert.equal(inv.lines[0].gst, 0.51);
  assert.equal(inv.lines[0].cgst + inv.lines[0].sgst, 0.51);
});

test("buyer in another state: all IGST", () => {
  const inv = invoiceOf(order([item(118)], { address_state: "Karnataka" } as Partial<Order>), "Maharashtra");
  assert.equal(inv.split, "inter");
  assert.equal(inv.igst, 18);
  assert.equal(inv.cgst, 0);
  assert.equal(inv.sgst, 0);
  assert.equal(inv.placeOfSupply, "Karnataka (29)");
});

test("shop's state not set: plain GST, no split", () => {
  const inv = invoiceOf(order([item(118)]), "");
  assert.equal(inv.split, "unknown");
  assert.equal(inv.igst, 18);
});

test("state names match whatever the spacing, case or '&'", () => {
  const inv = invoiceOf(order([item(118)], { address_state: "  maharashtra " } as Partial<Order>), "Maharashtra");
  assert.equal(inv.split, "intra");
  assert.equal(stateCode("Jammu & Kashmir"), "01");
  assert.equal(stateCode("Atlantis"), "");
});

test("quantity: the unit price before tax is per piece", () => {
  const inv = invoiceOf(order([item(59, 4)]), "Maharashtra");
  // 4 x ₹59 = ₹236 incl. 18% → taxable 200, GST 36, ₹50 a piece before tax
  assert.equal(inv.lines[0].taxable, 200);
  assert.equal(inv.lines[0].gst, 36);
  assert.equal(inv.lines[0].unit, 50);
});

test("the tax summary groups lines by bracket and HSN, lowest bracket first", () => {
  const inv = invoiceOf(order([item(118, 1, 18, "9614"), item(112, 1, 12, "4813"), item(118, 1, 18, "9614")]), "Maharashtra");
  assert.deepEqual(inv.summary.map((r) => [r.rate, r.hsn, r.taxable, r.gst]), [
    [12, "4813", 100, 12],
    [18, "9614", 200, 36],
  ]);
  assert.equal(inv.taxable, 300);
  assert.equal(inv.gst, 48);
});

test("a line's own GST rate wins over the order's", () => {
  const inv = invoiceOf(order([item(105, 1, 5)], { gst_rate: 18 } as Partial<Order>), "Maharashtra");
  assert.equal(inv.lines[0].rate, 5);
  assert.equal(inv.lines[0].gst, 5);
});

test("cess sits on the same taxable value, beside GST", () => {
  // ₹128 including 18% GST and 10% cess: taxable 100, GST 18, cess 10
  const inv = invoiceOf(order([{ ...item(128), cess_rate: 10 }]), "Maharashtra");
  assert.equal(inv.lines[0].taxable, 100);
  assert.equal(inv.lines[0].gst, 18);
  assert.equal(inv.lines[0].cess, 10);
  assert.equal(inv.cess, 10);
});

test("refunds add up; shipping and total come from the order", () => {
  const inv = invoiceOf(order([item(118)], { shipping: 49, total: 167, order_refunds: [{ amount: "20.50" }, { amount: 10 }] } as unknown as Partial<Order>), "Maharashtra");
  assert.equal(inv.refunded, 30.5);
  assert.equal(inv.shipping, 49);
  assert.equal(inv.total, 167);
});

test("amount in words, Indian style", () => {
  assert.equal(amountInWords(0), "Rupees Zero Only");
  assert.equal(amountInWords(7), "Rupees Seven Only");
  assert.equal(amountInWords(1249.5), "Rupees One Thousand Two Hundred and Forty-Nine and Fifty Paise Only");
  assert.equal(amountInWords(100000), "Rupees One Lakh Only");
  assert.equal(amountInWords(2345678.05), "Rupees Twenty-Three Lakh Forty-Five Thousand Six Hundred and Seventy-Eight and Five Paise Only");
  assert.equal(amountInWords(12500000), "Rupees One Crore Twenty-Five Lakh Only");
  assert.equal(amountInWords(99.99), "Rupees Ninety-Nine and Ninety-Nine Paise Only");
});
