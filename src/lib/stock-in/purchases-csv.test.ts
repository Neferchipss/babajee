import { test } from "node:test";
import assert from "node:assert/strict";
import { PURCHASES_HEAD, purchaseRows, purchasesCsv } from "./purchases-csv.ts";
import type { Receipt } from "./db.ts";

const line = (o: Partial<Receipt["lines"][number]>) => ({
  id: "l", variant_id: "v", product: "Grinder", option: "Default", qty: 2, unit_price: 100.5, gst_rate: 18, gst: 36.18, cgst: 18.09, sgst: 18.09, igst: 0, claimable: true, ...o,
});
const bill = (o: Partial<Receipt>): Receipt => ({
  id: "r", kind: "bill", status: "posted", supplier_id: "s", supplier: "Acme, Ltd", supplier_gstin: "33ABCDE1234F1Z5",
  bill_no: "B-1", bill_date: "2026-11-03", notes: "", created_at: "", voided_at: null, lines: [], ...o,
});

test("one row per line, voided bill excluded", () => {
  const rows = purchaseRows([
    bill({ lines: [line({}), line({ product: 'Paper "king"', option: "Large", qty: 1, unit_price: 10, claimable: false })] }),
    bill({ id: "r3", kind: "opening", supplier: null, supplier_gstin: null, bill_no: "", lines: [line({ gst: 0, cgst: 0, sgst: 0, igst: 0, gst_rate: 0, claimable: false })] }),
    bill({ id: "r2", status: "void", bill_no: "B-2", lines: [line({})] }),
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["2026-11-03", "Acme, Ltd", "33ABCDE1234F1Z5", "B-1", "Grinder", "", 2, 100.5, 201, 18, 36.18, 18.09, 18.09, 0, "true", "bill"]);
  assert.equal(rows[1][8], 10);
  assert.equal(rows[1][14], "false");
  assert.deepEqual([rows[2][1], rows[2][2], rows[2][3], rows[2][14], rows[2][15]], ["", "", "", "false", "opening"]);
});

test("gst column carries GST that has no CGST/SGST/IGST split", () => {
  const rows = purchaseRows([bill({ supplier_gstin: "", lines: [line({ gst: 36.18, cgst: 0, sgst: 0, igst: 0, claimable: false })] })]);
  assert.equal(PURCHASES_HEAD.length, 16);
  assert.equal(PURCHASES_HEAD[10], "gst");
  assert.deepEqual(rows[0].slice(10, 14), [36.18, 0, 0, 0]);
  for (const r of rows) assert.equal(r.length, PURCHASES_HEAD.length);
});

test("csv quotes and has a header", () => {
  const t = purchasesCsv([bill({ lines: [line({})] })]);
  const [head, row] = t.slice(1).split("\r\n");
  assert.ok(head.startsWith("bill_date,supplier,"));
  assert.ok(row.includes('"Acme, Ltd"'));
});
