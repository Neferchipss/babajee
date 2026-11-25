import { test } from "node:test";
import assert from "node:assert/strict";
import { BODY_W, columnWidths, layout, linesFor, minWidths, needsLandscape, paginate, paper, sheetCsv, type SheetDoc } from "./print-sheet.ts";

test("pages fill up, and the next row starts a new page", () => {
  // 10 rows of 20px; 100px a page with a 20px header row: 4 rows a page
  assert.deepEqual(paginate(Array(10).fill(20), { first: 100, rest: 100, head: 20, tail: 0 }), [
    [0, 4],
    [4, 8],
    [8, 10],
  ]);
});

test("the first page is shorter: the title and details sit on it", () => {
  assert.deepEqual(paginate(Array(6).fill(20), { first: 60, rest: 100, head: 20, tail: 0 }), [
    [0, 2],
    [2, 6],
  ]);
});

test("the tail moves to its own page when it doesn't fit under the last rows", () => {
  assert.deepEqual(paginate(Array(4).fill(20), { first: 100, rest: 100, head: 20, tail: 30 }), [
    [0, 4],
    [4, 4],
  ]);
  // and stays when it fits
  assert.deepEqual(paginate(Array(3).fill(20), { first: 100, rest: 100, head: 20, tail: 20 }), [[0, 3]]);
});

test("a row taller than a page still gets printed, on a page of its own", () => {
  assert.deepEqual(paginate([20, 500, 20], { first: 100, rest: 100, head: 20, tail: 0 }), [
    [0, 1],
    [1, 2],
    [2, 3],
  ]);
});

test("no rows: one page", () => {
  assert.deepEqual(paginate([], { first: 100, rest: 100, head: 20, tail: 10 }), [[0, 0]]);
});

test("columns fill the page, numbers stay narrow, long text is capped", () => {
  const w = columnWidths(
    [{ label: "Product" }, { label: "Qty", align: "r" }],
    [{ cells: ["A".repeat(200), "12"] }, { cells: ["Short", "3"] }],
  );
  assert.ok(w.reduce((a, b) => a + b, 0) <= BODY_W);
  assert.ok(w.reduce((a, b) => a + b, 0) > BODY_W - 3);
  assert.ok(w[0] > w[1] * 4);
});

test("no column is narrower than its header's longest word", () => {
  // Sales by product's columns, with a long product name taking the room
  const cols = ["Product", "Option", "GST %", "Units sold", "Gross sales (at shelf price)", "Returns", "Net sales (after returns)", "Sales with GST (after returns)", "Sales without GST", "Cost price", "Profit", "Margin"].map((label, i) => ({ label, align: i < 2 ? ("l" as const) : ("r" as const) }));
  const rows = [{ cells: ["3 in 1 Aluminium Grinder with a very long name indeed", "Default", "40", "6", "₹17,000", "₹0", "₹17,000", "₹17,000", "₹12,812.50", "No cost", "₹4,187.50", "24.6%"] }];
  const min = minWidths(cols, rows);
  const land = needsLandscape(cols, rows);
  const w = columnWidths(cols, rows, paper(land).bodyW);
  w.forEach((x, i) => assert.ok(x >= min[i] - 1, `${cols[i].label}: ${x} < ${min[i]}`));
  // "Option", "Returns", "Margin" and "GST %" fit whole (6.6px a bold letter)
  for (const i of [1, 2, 5, 11]) assert.ok(w[i] >= cols[i].label.split(" ").reduce((m, x) => Math.max(m, x.length), 0) * 6.6);
  // the product column gave up the room
  assert.ok(w[0] < (paper(land).bodyW * 38) / 100);
});

test("a sheet too wide to stand upright turns sideways", () => {
  const narrow = [{ label: "Name" }, { label: "Qty" }];
  assert.equal(needsLandscape(narrow, [{ cells: ["x", "1"] }]), false);
  const wide = Array.from({ length: 14 }, (_, i) => ({ label: `Columnheading${i}` }));
  assert.equal(needsLandscape(wide, []), true);
  const { paper: p } = layout({ title: "T", cols: wide, rows: [] });
  assert.equal(p.land, true);
  assert.ok(p.bodyW > BODY_W);
});

test("words wrap whole", () => {
  // two 5-letter words in a 9-character line: two lines, not a split word
  assert.equal(linesFor("abcde fghij", 9 * 6 + 8), 2);
  assert.equal(linesFor("abcde fghij", 11 * 6 + 8), 1);
});

test("text wraps onto more lines in a narrow column", () => {
  assert.equal(linesFor("", 100), 1);
  assert.equal(linesFor("abc", 100), 1);
  assert.ok(linesFor("x".repeat(100), 100) > 5);
  assert.equal(linesFor("one\ntwo", 400), 2);
});

test("a long report breaks over pages; every row lands on exactly one page", () => {
  const doc: SheetDoc = { title: "T", meta: [["Period:", "x"]], cols: [{ label: "A" }, { label: "B", align: "r" }], rows: Array.from({ length: 300 }, (_, i) => ({ cells: [`Row ${i}`, String(i)] })), totals: [null, "1"] };
  const { pages } = layout(doc);
  assert.ok(pages.length > 3);
  let next = 0;
  for (const [s, e] of pages) {
    assert.equal(s, next);
    next = e;
  }
  assert.equal(next, 300);
});

test("the CSV has the header, the rows, group lines and the totals", () => {
  const csv = sheetCsv({ title: "T", cols: [{ label: "Name" }, { label: "Qty" }], rows: [{ group: "Pipes" }, { cells: ['Say "hi", ok', "2"] }], totals: [null, "2"] });
  assert.equal(csv, '﻿Name,Qty\r\nPipes\r\n"Say ""hi"", ok",2\r\n,2');
});
