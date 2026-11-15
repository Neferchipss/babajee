import { test } from "node:test";
import assert from "node:assert/strict";
import { guessMapping, matchRows, parseNumber, type Candidate } from "./match.ts";

const catalogue: Candidate[] = [
  { variant_id: "v1", product: "Grinder", option: "4pc", sku: "GR-4" },
  { variant_id: "v2", product: "Grinder", option: "2pc", sku: "GR-2" },
  { variant_id: "v3", product: "Rolling Cone", option: "King", sku: "dup" },
  { variant_id: "v4", product: "Tray", option: "Small", sku: "dup" },
];

test("parseNumber", () => {
  assert.equal(parseNumber("1,250.00"), 1250);
  assert.equal(parseNumber("₹ 99"), 99);
  assert.equal(parseNumber(""), null);
});

test("guessMapping finds headers on row 3", () => {
  const rows = [
    ["Invoice from Acme"],
    [""],
    ["Item", "Variant", "SKU", "Quantity", "Rate", "GST %"],
    ["Grinder", "4pc", "GR-4", "5", "100", "18"],
  ];
  assert.deepEqual(guessMapping(rows), {
    name: 0,
    option: 1,
    sku: 2,
    qty: 3,
    price: 4,
    gst: 5,
    headerRow: 2,
  });
});

test("guessMapping returns null without a qty column", () => {
  assert.equal(guessMapping([["a", "b"], ["1", "2"]]), null);
});

const m = { name: 0, option: 1, sku: 2, qty: 3, price: 4, gst: 5, headerRow: 0 };
const head = ["Item", "Variant", "SKU", "Qty", "Rate", "GST"];

test("SKU match", () => {
  const [r] = matchRows([head, ["whatever", "", "gr-4", "5", "₹ 100", "18"]], m, catalogue);
  assert.equal(r.status, "matched");
  assert.equal(r.variant_id, "v1");
  assert.equal(r.qty, 5);
  assert.equal(r.price, 100);
  assert.equal(r.gst, 18);
  assert.equal(r.row, 1);
});

test("name + option match", () => {
  const [r] = matchRows([head, ["Grinder", "2pc", "", "1", "", ""]], m, catalogue);
  assert.equal(r.status, "matched");
  assert.equal(r.variant_id, "v2");
  assert.equal(r.price, null);
});

test("near name is unsure with options", () => {
  const [r] = matchRows([head, ["Grinder", "", "", "1", "", ""]], m, catalogue);
  assert.equal(r.status, "unsure");
  assert.equal(r.variant_id, null);
  assert.deepEqual(r.options.sort(), ["v1", "v2"]);
});

test("unknown is missing", () => {
  const [r] = matchRows([head, ["Zebra bong", "", "", "1", "", ""]], m, catalogue);
  assert.equal(r.status, "missing");
});

test("blank qty is skipped", () => {
  const [r] = matchRows([head, ["Grinder", "4pc", "GR-4", "", "", ""]], m, catalogue);
  assert.equal(r.status, "skip");
});

test("duplicate catalogue SKU never matches by SKU", () => {
  const [r] = matchRows([head, ["", "", "dup", "2", "", ""]], m, catalogue);
  assert.equal(r.status, "unsure");
  assert.equal(r.variant_id, null);
  assert.deepEqual(r.options, ["v3", "v4"]);
});

test("parseNumber handles currency prefixes, suffixes, accounting, grouping, scientific", () => {
  assert.equal(parseNumber("Rs. 99"), 99);
  assert.equal(parseNumber("Rs.1,250.00/-"), 1250);
  assert.equal(parseNumber("₹99/-"), 99);
  assert.equal(parseNumber("(5)"), -5);
  assert.equal(parseNumber("-5"), -5);
  assert.equal(parseNumber("1,25,000"), 125000);
  assert.equal(parseNumber("1E-05"), 0.00001);
  assert.equal(parseNumber(".5"), 0.5);
  assert.equal(parseNumber("n/a"), null);
});

test("guessMapping never reads MRP as the buying price", () => {
  const g = guessMapping([["Item", "MRP", "Rate", "Qty"]]);
  assert.equal(g?.price, 2);
  assert.equal(g?.qty, 3);
});
