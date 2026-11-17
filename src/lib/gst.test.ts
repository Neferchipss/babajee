import { test } from "node:test";
import assert from "node:assert/strict";
import { bill, costOf, lineCess, lineGst, supplierGst, unitProfit } from "./gst.ts";

// the same cases as supabase/tests/0059 (profit_uses_paid_and_claimable), so
// the product panel and Analytics agree
const on = { rate: 18, inclusive: true, credit: true };

test("GST paid follows the typed amount, else the rate", () => {
  assert.equal(supplierGst(60, 18), 10.8);
  assert.equal(supplierGst(60, 12), 7.2);
  assert.equal(supplierGst(60, 12, 7.25), 7.25);
});

test("claims back only the claimable part", () => {
  const u = unitProfit(118, 115, on, { paid: 15, claimable: 6 });
  assert.equal(u.net, 100);
  assert.equal(u.collected, 18);
  assert.equal(u.itc, 6);
  assert.equal(u.kept, -9);
  assert.equal(u.keptNoItc, -15);
  assert.equal(u.owed, 12);
});

test("credit off claims nothing", () => {
  const u = unitProfit(118, 115, { ...on, credit: false }, { paid: 15, claimable: 6 });
  assert.equal(u.itc, 0);
  assert.equal(u.kept, -15);
  assert.equal(u.owed, 18);
});

test("supplier at a different rate from the sale", () => {
  // bought 60 + 12% (7.20), sold 118 incl 18%
  const u = unitProfit(118, 67.2, on, { paid: 7.2 });
  assert.equal(u.itc, 7.2);
  assert.equal(u.kept, 40);
  assert.equal(u.owed, 10.8);
});

test("without the GST paid, it is estimated at the selling rate (as before)", () => {
  const u = unitProfit(118, 70.8, on);
  assert.equal(u.estimated, true);
  assert.equal(u.paid, 10.8);
  assert.equal(u.kept, 40);
});

test("a claim never exceeds what was paid", () => {
  assert.equal(unitProfit(118, 70.8, on, { paid: 10.8, claimable: 99 }).itc, 10.8);
});

// CESS (0060): the same cases as supabase/tests/0060
test("no cess: GST exactly as before", () => {
  for (const g of [118, 99.99, 1, 250.5]) {
    assert.equal(lineGst(g, 18, true, 0), lineGst(g, 18, true));
    assert.equal(lineGst(g, 18, false, 0), lineGst(g, 18, false));
    assert.equal(lineCess(g, 18, 0, true), 0);
  }
});

test("cess inside an inclusive price: 140 = 100 + 28 GST + 12 cess", () => {
  assert.equal(lineGst(140, 28, true, 12), 28);
  assert.equal(lineCess(140, 28, 12, true), 12);
  const b = bill([{ gross: 140, rate: 28, cess: 12 }], 50, true);
  assert.deepEqual([b.tax, b.cess, b.total], [28, 12, 190]);
});

test("cess on top of an exclusive price", () => {
  const b = bill([{ gross: 100, rate: 28, cess: 12 }], 50, false);
  assert.deepEqual([b.tax, b.cess, b.total], [28, 12, 190]);
});

test("profit leaves the cess out of the sale", () => {
  const u = unitProfit(100, 64, { rate: 28, inclusive: false, credit: true, cess: 12 }, { paid: 14 });
  assert.equal(u.sale, 140);
  assert.equal(u.net, 100);
  assert.equal(u.collected, 28);
  assert.equal(u.cess, 12);
  assert.equal(u.kept, 50);
});

// The grinder case (0057): sold at ₹3,500 incl. 40% GST, bought at ₹2,002.66.
const sell = { rate: 40, inclusive: true };

test("no input tax credit: the GST paid on the bill is a cost", () => {
  const cost = costOf(2002.66, 40);
  assert.equal(cost, 2803.72);
  const u = unitProfit(3500, cost, { ...sell, credit: false });
  assert.equal(u.net, 2500);
  assert.equal(u.kept, -303.72);
});

test("input tax credit at the selling rate: the bill's GST comes back", () => {
  const u = unitProfit(3500, costOf(2002.66, 40), { ...sell, credit: true });
  assert.equal(u.kept, 497.34);
});

test("bought at 18%, sold at 40%: the cost carries the GST actually paid", () => {
  const gst = Math.round(2002.66 * 18) / 100; // 360.48
  const cost = Math.round((2002.66 + gst) * 100) / 100; // 2363.14
  const off = unitProfit(3500, cost, { ...sell, credit: false }, gst);
  assert.equal(off.kept, 136.86);
  // claiming it back takes back exactly the ₹360.48 paid, not 40% of the cost
  const on = unitProfit(3500, cost, { ...sell, credit: true }, gst);
  assert.equal(on.kept, 497.34);
});
