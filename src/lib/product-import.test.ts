import { test } from "node:test";
import assert from "node:assert/strict";
import { mapHeaders, money, planImport, planSummary, type ExistingCategory, type ExistingProduct } from "./product-import.ts";

// a made-up shop: two categories, three products
const cats: ExistingCategory[] = [
  { id: "c-pap", slug: "rolling-paper", name: "Rolling Papers" },
  { id: "c-gr", slug: "grinder", name: "Grinders" },
];
const v = (id: string, label: string, price: number, extra: Partial<ExistingProduct["variants"][0]> = {}) => ({ id, label, price, compare_at: null, stock_qty: 10, track_stock: true, sku: null, barcode: null, weight_g: null, ...extra });
const products: ExistingProduct[] = [
  { id: "p-raw", name: "Raw Classic King Size", category_id: "c-pap", brand: "Raw", description: "", hsn: "4813", gst_rate: 18, tags: [], variants: [v("v-raw", "Default", 120, { sku: "RAW-KS" })] },
  { id: "p-ocb", name: "OCB Slim", category_id: "c-pap", brand: "OCB", description: "", hsn: "", gst_rate: null, tags: [], variants: [v("v-ocb-s", "Single", 60), v("v-ocb-b", "Box of 50", 2500, { unit_variant_id: "v-ocb-s" })] },
  { id: "p-gr", name: "Metal Grinder", category_id: "c-gr", brand: "", description: "", hsn: "", gst_rate: null, tags: [], variants: [v("v-gr-40", "40mm", 300), v("v-gr-50", "50mm", 400, { track_stock: false })] },
];

test("headers: usual names, any order", () => {
  const m = mapHeaders(["Item Name", "MRP", "Qty", "Variant", "Category", "HSN Code", "GST %", "Cost Price", "unknown"]);
  assert.deepEqual(m, { name: 0, price: 1, stock: 2, option: 3, category: 4, hsn: 5, gst_rate: 6, purchase: 7 });
});

test("money: rupee signs and commas", () => {
  assert.equal(money("₹1,299.00"), 1299);
  assert.equal(money("Rs. 45"), 45);
  assert.equal(money(""), null);
  assert.ok(Number.isNaN(money("abc")));
});

test("updates by SKU and by name, only what differs", () => {
  const rows = [
    ["SKU", "Product", "Category", "Option", "Selling price", "Stock"],
    ["RAW-KS", "", "", "", "130", "10"], // price changes, stock same
    ["", "ocb slim", "Rolling Papers", "single", "60", "25"], // stock only (case + spacing ignored)
    ["", "Metal Grinder", "Grinders", "40mm", "300", "10"], // all the same
  ];
  const p = planImport(rows, products, cats);
  assert.equal(p.problems.length, 0, JSON.stringify(p.problems));
  assert.equal(p.unchanged, 1);
  assert.equal(p.updates.length, 2);
  const raw = p.updates.find((u) => u.variantId === "v-raw")!;
  assert.deepEqual(raw.variant, { price: 130 });
  assert.equal(raw.stock, null);
  const ocb = p.updates.find((u) => u.variantId === "v-ocb-s")!;
  assert.equal(ocb.stock, 25);
  assert.deepEqual(ocb.variant, {});
});

test("new products gather their options; new option on an existing product", () => {
  const rows = [
    ["Product", "Category", "Option", "Price", "Stock", "GST %", "Brand"],
    ["Glass Ashtray Zq", "Grinders", "Small", "199", "5", "18", "Babajee"],
    ["Glass Ashtray Zq", "Grinders", "Large", "299", "3", "18", "Babajee"],
    ["Metal Grinder", "Grinders", "63mm", "550", "4", "", ""],
  ];
  const p = planImport(rows, products, cats);
  assert.equal(p.problems.length, 0, JSON.stringify(p.problems));
  assert.equal(p.newProducts.length, 1);
  assert.equal(p.newProducts[0].options.length, 2);
  assert.deepEqual(p.newProducts[0].product, { brand: "Babajee", gst_rate: 18 });
  assert.equal(p.newOptions.length, 1);
  assert.equal(p.newOptions[0].variant.label, "63mm");
  assert.equal(planSummary(p), "1 new option, 1 new product");
});

test("problems are named by row and nothing is guessed", () => {
  const rows = [
    ["Product", "Category", "Option", "Price", "Stock", "GST %", "SKU", "Was price"],
    ["Thing", "Lighters", "", "10", "", "", "", ""], // unknown category
    ["OCB Slim", "", "", "60", "", "", "", ""], // two loose options? no: one loose (box excluded) -> fine
    ["Metal Grinder", "", "", "300", "", "", "", ""], // two options, none named
    ["Raw Classic King Size", "", "", "abc", "", "", "", ""], // bad price
    ["Raw Classic King Size", "", "", "120", "1.5", "", "", ""], // bad stock
    ["Raw Classic King Size", "", "", "120", "", "17", "", ""], // bad GST
    ["", "", "", "50", "", "", "NOPE-1", ""], // unknown SKU, no name
    ["New Thing Zq", "", "", "50", "", "", "", ""], // new, no category
    ["Metal Grinder", "", "50mm", "400", "9", "", "", ""], // stock on an uncounted option: left alone, flagged
    ["Metal Grinder", "", "40mm", "300", "", "", "", "250"], // was price below price
    ["X1", "Grinders", "", "10", "", "", "DUP", ""],
    ["X2", "Grinders", "", "10", "", "", "dup", ""], // same SKU twice
  ];
  const p = planImport(rows, products, cats);
  const at = (r: number) => p.problems.filter((x) => x.row === r).map((x) => x.message).join(" | ");
  assert.match(at(2), /No category called “Lighters”/);
  assert.equal(at(3), "");
  assert.match(at(4), /has 2 options/);
  assert.match(at(5), /isn't a number/);
  assert.match(at(6), /whole number/);
  assert.match(at(7), /isn't a GST rate/);
  assert.match(at(8), /No product has SKU NOPE-1/);
  assert.match(at(9), /add its category/);
  assert.match(at(10), /doesn't count stock/);
  assert.match(at(11), /was price should be above/);
  assert.match(at(13), /earlier row/);
  assert.equal(p.newProducts.length, 1); // X1
});

test("no name or SKU column: one clear problem", () => {
  const p = planImport([["Price", "Stock"], ["10", "2"]], products, cats);
  assert.equal(p.problems.length, 1);
  assert.match(p.problems[0].message, /No column for the product name or SKU/);
});

test("a big made-up sheet plans quickly", () => {
  const rows: string[][] = [["Product", "Category", "Option", "Price", "Stock", "SKU"]];
  for (let i = 0; i < 3000; i++) rows.push([`Fake product ${i % 600}`, i % 2 ? "Grinders" : "Rolling Papers", `Opt ${i}`, String(100 + i), String(i % 40), `FK-${i}`]);
  const t = Date.now();
  const p = planImport(rows, products, cats);
  assert.ok(Date.now() - t < 2000);
  assert.equal(p.problems.length, 0);
  assert.equal(p.newProducts.reduce((n, x) => n + x.options.length, 0), 3000);
});
