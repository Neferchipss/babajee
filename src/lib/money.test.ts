import { test } from "node:test";
import assert from "node:assert/strict";
import { cartCount, cartSums, lineTotal, type CartLine } from "./cart.ts";
import { formatPrice, toNumber } from "./currency.ts";
import { paisa, priceOf, priceTyping } from "./stock-in/price.ts";

const line = (price: number | undefined, qty: number): CartLine => ({ key: `p${price}::x`, slug: `p${price}`, href: "/", name: "x", tone: "", variant: "x", price, qty }) as CartLine;

test("cart: a line is its price times its quantity", () => {
  assert.equal(lineTotal(line(350, 3)), 1050);
  assert.equal(lineTotal(line(undefined, 3)), undefined);
});

test("cart: totals and counts", () => {
  assert.deepEqual(cartSums([line(350, 2), line(29.5, 1)]), { count: 3, total: 729.5 });
  assert.deepEqual(cartSums([]), { count: 0, total: 0 });
  assert.equal(cartCount([line(10, 2), line(20, 5)]), 7);
});

test("cart: one unpriced line means no total yet", () => {
  assert.deepEqual(cartSums([line(350, 2), line(undefined, 1)]), { count: 3, total: undefined });
});

test("prices: rupee sign, Indian grouping, paise only when there are any", () => {
  assert.equal(formatPrice(29), "₹29");
  assert.equal(formatPrice(29.5), "₹29.50");
  assert.equal(formatPrice(124999), "₹1,24,999");
  assert.equal(formatPrice(1250000.75), "₹12,50,000.75");
  assert.equal(formatPrice(42, { paise: true }), "₹42.00");
  assert.equal(formatPrice(null), "xx.xx");
  assert.equal(formatPrice(undefined), "xx.xx");
});

test("prices: database numbers arrive as text", () => {
  assert.equal(toNumber("349.50"), 349.5);
  assert.equal(toNumber(12), 12);
  assert.equal(toNumber(null), 0);
  assert.equal(formatPrice("1999"), "₹1,999");
});

test("buying prices: what a price box accepts while typing", () => {
  for (const ok of ["", "1", "12.", "12.5", "12.55", ".5"]) assert.equal(priceTyping(ok), true, ok);
  for (const bad of ["12.555", "1.2.3", "-1", "1e3", "abc"]) assert.equal(priceTyping(bad), false, bad);
  assert.ok(Number.isNaN(priceOf("")));
  assert.ok(Number.isNaN(priceOf(".")));
  assert.equal(priceOf("12.5"), 12.5);
});

test("buying prices: kept to the paisa, rounding halves up", () => {
  assert.equal(paisa(1.005), 1.01);
  assert.equal(paisa(2.675), 2.68);
  assert.equal(paisa(10), 10);
});
