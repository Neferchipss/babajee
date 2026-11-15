import { test } from "node:test";
import assert from "node:assert/strict";
import { costOf, unitProfit } from "./gst.ts";

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
