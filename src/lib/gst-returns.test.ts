import { test } from "node:test";
import assert from "node:assert/strict";
import { gstr1, gstr3b, purchaseRegister, salesRegister, toCsv, type SaleDoc } from "./gst-returns.ts";

const line = (rate: number, taxable: number, inter: boolean, hsn = "4813", qty = 1) => {
  const gst = Math.round(taxable * rate) / 100;
  const half = Math.round((gst / 2) * 100) / 100;
  return { hsn, name: "x", qty, rate, taxable, gst, cgst: inter ? 0 : half, sgst: inter ? 0 : Math.round((gst - half) * 100) / 100, igst: inter ? gst : 0 };
};
const doc = (p: Partial<SaleDoc> & Pick<SaleDoc, "number" | "lines">): SaleDoc => ({
  kind: "invoice",
  date: "2026-11-10",
  party: "P",
  gstin: "",
  pos: "27-Maharashtra",
  inter: false,
  value: p.lines.reduce((n, l) => n + l.taxable + l.gst, 0),
  ...p,
});

const docs: SaleDoc[] = [
  doc({ number: "BJ/26-27/0001", gstin: "29ABCDE1234F1Z5", party: "Cafe", pos: "29-Karnataka", inter: true, lines: [line(18, 1000, true), line(5, 200, true)] }),
  doc({ number: "BJ/26-27/0002", lines: [line(18, 500, false)] }),
  doc({ number: "BJ/26-27/0003", pos: "07-Delhi", inter: true, lines: [line(18, 120000, true)] }),
  doc({ number: "BJ/26-27/0004", lines: [line(18, 300, false)] }),
  doc({ kind: "credit", number: "BJ-CN/26-27/0001", against: { number: "BJ/26-27/0004", date: "2026-11-10" }, lines: [line(18, 100, false)] }),
];

test("b2b gets one row per rate of an invoice with a buyer GSTIN", () => {
  const b2b = gstr1(docs).find((t) => t.name === "gstr1-b2b")!;
  assert.equal(b2b.rows.length, 2);
  assert.deepEqual(b2b.rows.map((r) => r[8]), [5, 18]);
  assert.equal(b2b.rows[0][0], "29ABCDE1234F1Z5");
});

test("b2cl only for inter-state consumer invoices over the limit", () => {
  const b2cl = gstr1(docs).find((t) => t.name === "gstr1-b2cl")!;
  assert.equal(b2cl.rows.length, 1);
  assert.equal(b2cl.rows[0][0], "BJ/26-27/0003");
});

test("b2cs nets credit notes off by place and rate", () => {
  const b2cs = gstr1(docs).find((t) => t.name === "gstr1-b2cs")!;
  assert.deepEqual(b2cs.rows, [["OE", "27-Maharashtra", 18, 700, 0]]);
});

test("hsn summary is invoices less credit notes", () => {
  const hsn = gstr1(docs).find((t) => t.name === "gstr1-hsn")!;
  const r18 = hsn.rows.find((r) => r[0] === "4813" && r[4] === 18)!;
  assert.equal(r18[5], 1000 + 500 + 120000 + 300 - 100);
});

test("document summary gives each series' range and count", () => {
  const d = gstr1(docs).find((t) => t.name === "gstr1-docs")!;
  assert.deepEqual(d.rows[0], ["Invoices for outward supply", "BJ/26-27/0001", "BJ/26-27/0004", 4, 0]);
  assert.deepEqual(d.rows[1], ["Credit note", "BJ-CN/26-27/0001", "BJ-CN/26-27/0001", 1, 0]);
});

test("3b counts ITC only from claimable bills in 2B", () => {
  const bills = [
    { date: "2026-11-02", number: "S1", supplier: "A", gstin: "27AAAAA0000A1Z5", in2b: true, claimable: true, lines: [{ rate: 18, taxable: 100, cgst: 9, sgst: 9, igst: 0 }] },
    { date: "2026-11-03", number: "S2", supplier: "B", gstin: "27AAAAA0000A1Z5", in2b: false, claimable: true, lines: [{ rate: 18, taxable: 100, cgst: 9, sgst: 9, igst: 0 }] },
  ];
  const t = gstr3b(docs, bills);
  assert.deepEqual(t.rows[1].slice(2, 5), [0, 9, 9]);
  assert.equal(t.rows[0][1], 1000 + 200 + 500 + 120000 + 300 - 100);
});

test("registers sign credit notes negative and csv escapes", () => {
  const s = salesRegister(docs);
  const cn = s.rows.find((r) => r[1] === "Credit Note")!;
  assert.ok(Number(cn[cn.length - 1]) < 0);
  const p = purchaseRegister([{ date: "2026-11-02", number: 'S"1', supplier: "A, B", gstin: "", in2b: false, claimable: false, lines: [] }]);
  assert.match(toCsv(p), /"S""1","A, B"/);
});
