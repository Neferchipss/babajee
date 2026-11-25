import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFacets } from "./shelf-facets.ts";

const tags = [
  { slug: "king", name: "King size", group: "Size" },
  { slug: "rolls", name: "Rolls", group: "Size" },
  { slug: "hemp", name: "Hemp", group: "Paper" },
  { slug: "rice", name: "Rice", group: "Paper" },
];
const products = [
  { id: "a", tags: ["king", "hemp"] },
  { id: "b", tags: ["king", "rice"] },
  { id: "c", tags: ["rolls", "hemp"] },
  { id: "d", tags: [] },
];

test("rows by group, each tag counted, nothing chosen keeps everything", () => {
  const f = buildFacets(tags, products, []);
  assert.deepEqual(f.rows.map((r) => r.group), ["Size", "Paper"]);
  assert.deepEqual(f.rows[0].tags.map((t) => [t.slug, t.n, t.on]), [["king", 2, false], ["rolls", 1, false]]);
  assert.equal(f.matching.length, 4);
  assert.equal(f.count, 0);
});

test("within a row any chosen tag will do; across rows each must match", () => {
  assert.deepEqual(buildFacets(tags, products, ["king", "rolls"]).matching.map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual(buildFacets(tags, products, ["king", "hemp"]).matching.map((p) => p.id), ["a"]);
});

test("a row's counts follow the other rows' choices, not its own", () => {
  const f = buildFacets(tags, products, ["hemp"]);
  // Size counts among hemp products: king 1 (a), rolls 1 (c)
  assert.deepEqual(f.rows[0].tags.map((t) => t.n), [1, 1]);
  // Paper counts ignore Paper's own choice: hemp 2, rice 1
  assert.deepEqual(f.rows[1].tags.map((t) => [t.n, t.on]), [[2, true], [1, false]]);
  assert.equal(f.count, 1);
});

test("tags no product carries are left out", () => {
  const f = buildFacets([...tags, { slug: "slim", name: "Slim", group: "Extras" }], products, []);
  assert.deepEqual(f.rows.map((r) => r.group), ["Size", "Paper"]);
});
