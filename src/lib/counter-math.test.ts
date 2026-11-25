import { test } from "node:test";
import assert from "node:assert/strict";
import { discounted, evenly, gstSummary, pctForAmount, pctOff, priceProblem, quickCash, settle, withOrderDiscount } from "./counter-math.ts";

const open = { discounts: true, maxDiscount: 100, priceChange: true };

test("a percent off keeps the price to the paisa", () => {
  assert.equal(discounted(118, 10), 106.2);
  assert.equal(discounted(99.99, 33), 66.99);
  assert.equal(discounted(100, 150), 0);
  assert.equal(pctOff(118, 106.2), 10);
});

test("price rules: changes, discounts and their cap", () => {
  assert.equal(priceProblem(100, 100, { discounts: false, maxDiscount: 0, priceChange: false }), null);
  assert.match(priceProblem(100, 90, { discounts: false, maxDiscount: 0, priceChange: false }) ?? "", /can't be changed/);
  assert.equal(priceProblem(100, 90, { discounts: true, maxDiscount: 10, priceChange: false }), null);
  assert.match(priceProblem(100, 85, { discounts: true, maxDiscount: 10, priceChange: false }) ?? "", /10% at most/);
  assert.match(priceProblem(100, 120, { discounts: true, maxDiscount: 10, priceChange: false }) ?? "", /can't be changed/);
  assert.equal(priceProblem(100, 120, open), null);
  assert.match(priceProblem(100, 0, open) ?? "", /above zero/);
  // no list price: any price above zero
  assert.equal(priceProblem(0, 50, { discounts: false, maxDiscount: 0, priceChange: false }), null);
});

test("an order discount spreads over every line", () => {
  const out = withOrderDiscount([{ price: 100 }, { price: 50 }], 10);
  assert.deepEqual(out.map((l) => l.price), [90, 45]);
  assert.equal(pctForAmount(200, 50), 25);
  assert.equal(withOrderDiscount([{ price: 100 }], 0)[0].price, 100);
});

test("settling up: change only from cash", () => {
  assert.deepEqual(settle(236, [{ method: "Cash", amount: 300 }], "Cash"), { paid: 300, cash: 300, short: 0, change: 64, ok: true, overNotCash: false });
  const split = settle(100, [{ method: "UPI", amount: 60 }, { method: "cash", amount: 40 }], "Cash");
  assert.equal(split.ok, true);
  assert.equal(split.change, 0);
  const short = settle(100, [{ method: "Cash", amount: 50 }], "Cash");
  assert.equal(short.ok, false);
  assert.equal(short.short, 50);
  const card = settle(100, [{ method: "Card", amount: 150 }], "Cash");
  assert.equal(card.ok, false);
  assert.equal(card.overNotCash, true);
});

test("quick cash amounts round up from what's due", () => {
  assert.deepEqual(quickCash(236), [236, 240, 250, 300, 500]);
  assert.deepEqual(quickCash(500), [500, 2000]);
  assert.deepEqual(quickCash(0), []);
});

test("receipt GST: CGST and SGST halves per rate", () => {
  const inc = gstSummary([{ gross: 118, rate: 18 }, { gross: 118, rate: 18 }, { gross: 105, rate: 5 }], true);
  assert.deepEqual(inc, [
    { rate: 5, taxable: 100, tax: 5, cgst: 2.5, sgst: 2.5 },
    { rate: 18, taxable: 200, tax: 36, cgst: 18, sgst: 18 },
  ]);
  const exc = gstSummary([{ gross: 100, rate: 12 }], false);
  assert.deepEqual(exc, [{ rate: 12, taxable: 100, tax: 12, cgst: 6, sgst: 6 }]);
  // an odd paisa goes to SGST so the halves add up
  const odd = gstSummary([{ gross: 10.01, rate: 18 }], false);
  assert.equal(odd[0].cgst + odd[0].sgst, odd[0].tax);
});

test("evenly splits a bill into equal payments that add up exactly", () => {
  assert.deepEqual(evenly(100, 3), [33.33, 33.33, 33.34]);
  assert.deepEqual(evenly(99.99, 2), [49.99, 50]);
  assert.equal(evenly(500, 50).length, 12);
  assert.deepEqual(evenly(10, 0), [10]);
  const parts = evenly(1234.57, 7);
  assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100), 123457);
});
