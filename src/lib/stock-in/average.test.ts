import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAverage } from "./average.ts";

test("weighted average of stock and bill line", () => {
  assert.equal(nextAverage(10, 100, 10, 120), 110);
});
test("negative stock counts as zero", () => {
  assert.equal(nextAverage(-3, 80, 5, 50), 50);
});
test("no average yet uses the incoming price", () => {
  assert.equal(nextAverage(0, null, 4, 99.99), 99.99);
});
test("zero quantity leaves the average alone", () => {
  assert.equal(nextAverage(3, 10, 0, 50), 10);
});
test("rounds to the paisa", () => {
  assert.equal(nextAverage(1, 10, 2, 10.01), 10.01);
  assert.equal(nextAverage(2, 10, 1, 10.01), 10);
});
test("ties round half away from zero like Postgres numeric", () => {
  assert.equal(nextAverage(1, 10, 1, 10.01), 10.01);
  assert.equal(nextAverage(1, 0.1, 1, 0.12), 0.11);
});
