import { test } from "node:test";
import assert from "node:assert/strict";
import { creditNoteOf, type CreditNoteRow } from "./credit-note.ts";
import type { Order } from "./orders-db.ts";

// the same cases as supabase/tests/0051 (refund_tax), so the printed note
// and the database agree
const order = (refundItems: { order_item_id: string; quantity: number }[], gst_inclusive = true) =>
  ({
    id: "o",
    address_state: "Maharashtra",
    gst_inclusive,
    gst_rate: null,
    order_items: [
      { id: "a", product_name: "A", variant_label: "", unit_price: 100, quantity: 1, gst_rate: 5, hsn: "4813" },
      { id: "b", product_name: "B", variant_label: "", unit_price: 200, quantity: 1, gst_rate: 18, hsn: "4820" },
    ],
    order_refunds: [{ id: "r", amount: 0, subtotal: 0, shipping: 0, tax: 0, order_refund_items: refundItems.map((x) => ({ refund_id: "r", ...x })) }],
  }) as unknown as Order;
const note = (amount: number, shipping = 0): CreditNoteRow => ({ id: "n", number: "CN/26-27/0001", order_id: "o", refund_id: "r", issued_at: "", amount, tax: 0, shipping });

test("a whole item at its own rate", () => {
  const cn = creditNoteOf(note(200), order([{ order_item_id: "b", quantity: 1 }]), "Maharashtra");
  assert.equal(cn.gst, 30.51);
  assert.equal(Math.round((cn.cgst + cn.sgst) * 100) / 100, 30.51);
  assert.equal(cn.total, 200);
});

test("less than an item's value scales it down", () => {
  const cn = creditNoteOf(note(50), order([{ order_item_id: "a", quantity: 1 }]), "Maharashtra");
  assert.equal(cn.gst, 2.38);
  assert.equal(cn.total, 50);
});

test("goodwill splits across the order's rates by goods", () => {
  const cn = creditNoteOf(note(30), order([]), "Karnataka");
  // 10 at 5% (100 of 300), 20 at 18%
  assert.deepEqual(cn.lines.map((l) => [l.rate, l.total]), [[5, 10], [18, 20]]);
  assert.equal(cn.igst, 3.53);
});

test("refunded shipping carries no GST", () => {
  const cn = creditNoteOf(note(250, 50), order([{ order_item_id: "b", quantity: 1 }]), "Maharashtra");
  assert.equal(cn.gst, 30.51);
  assert.equal(cn.total, 250);
});
