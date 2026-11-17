// GST return working files for one period, from documents already worked out
// (invoices via invoiceOf, credit notes via creditNoteOf, purchase bills):
// the GSTR-1 tables (B2B, B2CL, B2CS, CDNR, CDNUR, nil-rated, HSN, document
// summary), a GSTR-3B summary (3.1(a), 3.1(c), 4(A)(5), 4(B)(2), net), and
// Tally-friendly sales and purchase registers. Plain data in, CSV tables out;
// no database, so it is tested on its own (gst-returns.test.ts).
//
// Rules used (to be confirmed by the shop's CA):
// - B2B: the invoice has the buyer's GSTIN.
// - B2CL: no buyer GSTIN, inter-state, invoice value over the B2CL limit
//   (₹1,00,000 from August 2024).
// - B2CS: every other consumer invoice, summed by place of supply and rate;
//   credit notes against B2CS invoices are netted off here.
// - CDNR / CDNUR: credit notes against B2B / B2CL invoices, classed from the
//   invoice they correct (which may be in an earlier period).
// - 0% lines are nil-rated: GSTR-1 table 8 and 3B 3.1(c), not taxable rows.
// - HSN summary from invoices less credit notes, unit "NOS".
// - 3B 4(A)(5): GST on claimable lines of supplier bills in this period's
//   GSTR-2B; 4(B)(2): ITC on bills unpaid 180 days after their date.

export const B2CL_LIMIT = 100000;

// cess: the cess on the line (0057), absent or 0 for none
export type DocLine = { hsn: string; name: string; qty: number; rate: number; taxable: number; cgst: number; sgst: number; igst: number; gst: number; cess?: number };
export type SaleDoc = {
  kind: "invoice" | "credit";
  number: string;
  date: string; // YYYY-MM-DD
  // for a credit note, the invoice it corrects and that invoice's value
  against?: { number: string; date: string; value: number };
  party: string;
  gstin: string; // buyer's GSTIN, '' for a consumer
  pos: string; // place of supply, e.g. "27-Maharashtra"
  inter: boolean;
  value: number; // with GST
  lines: DocLine[];
};
export type PurchaseLine = { rate: number; taxable: number; cgst: number; sgst: number; igst: number; claimable: boolean };
export type PurchaseDoc = { date: string; number: string; supplier: string; gstin: string; in2b: boolean; lines: PurchaseLine[] };
export type Tax3 = { igst: number; cgst: number; sgst: number };

export type Table = { name: string; head: string[]; rows: (string | number)[][] };

const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = <T>(xs: T[], f: (x: T) => number) => r2(xs.reduce((n, x) => n + f(x), 0));
const taxed = (l: DocLine) => l.rate > 0;

// taxed lines of one document, grouped by GST rate
function byRate(lines: DocLine[]) {
  const m = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number }>();
  for (const l of lines.filter(taxed)) {
    const t = m.get(l.rate) ?? { rate: l.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
    m.set(l.rate, { rate: l.rate, taxable: r2(t.taxable + l.taxable), cgst: r2(t.cgst + l.cgst), sgst: r2(t.sgst + l.sgst), igst: r2(t.igst + l.igst), cess: r2(t.cess + (l.cess ?? 0)) });
  }
  return [...m.values()].sort((a, b) => a.rate - b.rate);
}

const isB2cl = (gstin: string, inter: boolean, value: number) => !gstin && inter && value > B2CL_LIMIT;
const classOf = (d: SaleDoc) => {
  if (d.gstin) return "b2b";
  const value = d.kind === "credit" ? (d.against?.value ?? 0) : d.value;
  return isB2cl(d.gstin, d.inter, value) ? "b2cl" : "b2cs";
};

// cancelled: numbers of invoices issued in the period and later cancelled
export function gstr1(docs: SaleDoc[], cancelled: string[] = []): Table[] {
  const inv = docs.filter((d) => d.kind === "invoice");
  const cn = docs.filter((d) => d.kind === "credit");

  const b2b: Table = { name: "gstr1-b2b", head: ["GSTIN of recipient", "Receiver name", "Invoice number", "Invoice date", "Invoice value", "Place of supply", "Reverse charge", "Invoice type", "Rate", "Taxable value", "Cess amount"], rows: [] };
  for (const d of inv.filter((x) => classOf(x) === "b2b")) for (const g of byRate(d.lines)) b2b.rows.push([d.gstin, d.party, d.number, d.date, d.value, d.pos, "N", "Regular B2B", g.rate, g.taxable, g.cess]);

  const b2cl: Table = { name: "gstr1-b2cl", head: ["Invoice number", "Invoice date", "Invoice value", "Place of supply", "Rate", "Taxable value", "Cess amount"], rows: [] };
  for (const d of inv.filter((x) => classOf(x) === "b2cl")) for (const g of byRate(d.lines)) b2cl.rows.push([d.number, d.date, d.value, d.pos, g.rate, g.taxable, g.cess]);

  // B2CS: by place of supply and rate, credit notes netted off
  const cs = new Map<string, { pos: string; rate: number; taxable: number; cess: number }>();
  const addCs = (d: SaleDoc, sign: number) => {
    for (const g of byRate(d.lines)) {
      const k = `${d.pos}|${g.rate}`;
      const t = cs.get(k) ?? { pos: d.pos, rate: g.rate, taxable: 0, cess: 0 };
      cs.set(k, { ...t, taxable: r2(t.taxable + sign * g.taxable), cess: r2(t.cess + sign * g.cess) });
    }
  };
  for (const d of inv.filter((x) => classOf(x) === "b2cs")) addCs(d, 1);
  for (const c of cn.filter((x) => classOf(x) === "b2cs")) addCs(c, -1);
  const b2cs: Table = { name: "gstr1-b2cs", head: ["Type", "Place of supply", "Rate", "Taxable value", "Cess amount"], rows: [...cs.values()].sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate).map((x) => ["OE", x.pos, x.rate, x.taxable, x.cess]) };

  const cdnr: Table = { name: "gstr1-cdnr", head: ["GSTIN of recipient", "Receiver name", "Note number", "Note date", "Note type", "Place of supply", "Reverse charge", "Note value", "Rate", "Taxable value", "Cess amount", "Against invoice"], rows: [] };
  for (const c of cn.filter((x) => classOf(x) === "b2b")) for (const g of byRate(c.lines)) cdnr.rows.push([c.gstin, c.party, c.number, c.date, "C", c.pos, "N", c.value, g.rate, g.taxable, g.cess, c.against?.number ?? ""]);

  const cdnur: Table = { name: "gstr1-cdnur", head: ["UR type", "Note number", "Note date", "Note type", "Place of supply", "Note value", "Rate", "Taxable value", "Cess amount", "Against invoice"], rows: [] };
  for (const c of cn.filter((x) => classOf(x) === "b2cl")) for (const g of byRate(c.lines)) cdnur.rows.push(["B2CL", c.number, c.date, "C", c.pos, c.value, g.rate, g.taxable, g.cess, c.against?.number ?? ""]);

  // table 8: nil-rated (0%) supplies, credit notes netted off
  const nilOf = (reg: boolean, inter: boolean) =>
    sum(
      docs.filter((d) => !!d.gstin === reg && d.inter === inter),
      (d) => (d.kind === "credit" ? -1 : 1) * d.lines.filter((l) => !taxed(l)).reduce((n, l) => n + l.taxable, 0),
    );
  const nil: Table = {
    name: "gstr1-nil",
    head: ["Description", "Nil rated supplies", "Exempted", "Non-GST supplies"],
    rows: [
      ["Inter-state supplies to registered persons", nilOf(true, true), 0, 0],
      ["Intra-state supplies to registered persons", nilOf(true, false), 0, 0],
      ["Inter-state supplies to unregistered persons", nilOf(false, true), 0, 0],
      ["Intra-state supplies to unregistered persons", nilOf(false, false), 0, 0],
    ],
  };

  // HSN summary: invoices less credit notes
  const hs = new Map<string, { hsn: string; rate: number; qty: number; value: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number }>();
  for (const d of docs) {
    const sign = d.kind === "credit" ? -1 : 1;
    for (const l of d.lines) {
      const k = `${l.hsn}|${l.rate}`;
      const t = hs.get(k) ?? { hsn: l.hsn, rate: l.rate, qty: 0, value: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
      const c = l.cess ?? 0;
      hs.set(k, { ...t, qty: t.qty + sign * l.qty, value: r2(t.value + sign * (l.taxable + l.gst + c)), taxable: r2(t.taxable + sign * l.taxable), igst: r2(t.igst + sign * l.igst), cgst: r2(t.cgst + sign * l.cgst), sgst: r2(t.sgst + sign * l.sgst), cess: r2(t.cess + sign * c) });
    }
  }
  const hsn: Table = {
    name: "gstr1-hsn",
    head: ["HSN", "UQC", "Total quantity", "Total value", "Rate", "Taxable value", "Integrated tax", "Central tax", "State/UT tax", "Cess"],
    rows: [...hs.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate).map((x) => [x.hsn || "(none)", "NOS", x.qty, x.value, x.rate, x.taxable, x.igst, x.cgst, x.sgst, x.cess]),
  };

  // document summary: first and last number of each series, cancelled included
  const series = (numbers: string[], nCancelled: number, label: string) => {
    if (!numbers.length) return [];
    const ns = numbers.slice().sort();
    return [[label, ns[0], ns[ns.length - 1], ns.length, nCancelled]];
  };
  const docsT: Table = {
    name: "gstr1-docs",
    head: ["Nature of document", "Sr. no. from", "Sr. no. to", "Total number", "Cancelled"],
    rows: [...series([...inv.map((d) => d.number), ...cancelled], cancelled.length, "Invoices for outward supply"), ...series(cn.map((d) => d.number), 0, "Credit note")],
  };

  return [b2b, b2cl, b2cs, cdnr, cdnur, nil, hsn, docsT];
}

// itcBills: bills in this period's GSTR-2B; reversal: ITC on bills passing
// 180 days unpaid in this period; reclaim: ITC on such bills paid in it
export function gstr3b(docs: SaleDoc[], itcBills: PurchaseDoc[], reversal: Tax3 = { igst: 0, cgst: 0, sgst: 0 }, reclaim: Tax3 = { igst: 0, cgst: 0, sgst: 0 }): Table {
  const sign = (d: SaleDoc) => (d.kind === "credit" ? -1 : 1);
  const out = (k: "taxable" | "igst" | "cgst" | "sgst" | "cess", pick: (l: DocLine) => boolean) => sum(docs, (d) => sign(d) * d.lines.filter(pick).reduce((n, l) => n + (l[k] ?? 0), 0));
  const claim = itcBills.filter((b) => b.in2b).flatMap((b) => b.lines.filter((l) => l.claimable));
  const itc = (k: "igst" | "cgst" | "sgst") => sum(claim, (l) => l[k]);
  const o = { taxable: out("taxable", taxed), igst: out("igst", taxed), cgst: out("cgst", taxed), sgst: out("sgst", taxed), cess: out("cess", taxed) };
  const i = { igst: r2(itc("igst") + reclaim.igst), cgst: r2(itc("cgst") + reclaim.cgst), sgst: r2(itc("sgst") + reclaim.sgst) };
  return {
    name: "gstr3b-summary",
    head: ["Section", "Taxable value", "Integrated tax", "Central tax", "State/UT tax", "Cess"],
    rows: [
      ["3.1(a) Outward taxable supplies", o.taxable, o.igst, o.cgst, o.sgst, o.cess],
      ["3.1(c) Nil rated and exempted supplies", out("taxable", (l) => !taxed(l)), "", "", "", ""],
      ["4(A)(5) All other ITC (bills in this period's GSTR-2B, plus ITC reclaimed on bills paid after 180 days)", "", i.igst, i.cgst, i.sgst, 0],
      ["4(B)(2) ITC reversed: bills passing 180 days unpaid in this period", "", reversal.igst, reversal.cgst, reversal.sgst, 0],
      ["Net tax payable (before cross-utilisation)", "", r2(o.igst - i.igst + reversal.igst), r2(o.cgst - i.cgst + reversal.cgst), r2(o.sgst - i.sgst + reversal.sgst), o.cess],
    ],
  };
}

const RATES = [0, 5, 12, 18, 28, 40];

// Tally-style sales register: one row per invoice or credit note
export function salesRegister(docs: SaleDoc[]): Table {
  const head = ["Date", "Voucher type", "Voucher no.", "Party", "GSTIN", "Place of supply", ...RATES.map((r) => `Taxable @${r}%`), "CGST", "SGST", "IGST", "Total"];
  const rows = [...docs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
    .map((d) => {
      const s = d.kind === "credit" ? -1 : 1;
      const at = (r: number) => r2(s * d.lines.filter((l) => l.rate === r).reduce((n, l) => n + l.taxable, 0));
      const t = (k: "cgst" | "sgst" | "igst") => r2(s * d.lines.reduce((n, l) => n + l[k], 0));
      return [d.date, d.kind === "credit" ? "Credit Note" : "Sales", d.number, d.party, d.gstin, d.pos, ...RATES.map(at), t("cgst"), t("sgst"), t("igst"), r2(s * d.value)];
    });
  return { name: "sales-register", head, rows };
}

// Tally-style purchase register: one row per supplier bill
export function purchaseRegister(bills: PurchaseDoc[]): Table {
  const head = ["Date", "Supplier invoice no.", "Supplier", "GSTIN", ...RATES.map((r) => `Taxable @${r}%`), "CGST", "SGST", "IGST", "Total", "ITC claimable", "In GSTR-2B"];
  const rows = [...bills]
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
    .map((b) => {
      const at = (r: number) => sum(b.lines.filter((l) => l.rate === r), (l) => l.taxable);
      const t = (k: "cgst" | "sgst" | "igst") => sum(b.lines, (l) => l[k]);
      const total = sum(b.lines, (l) => l.taxable + l.cgst + l.sgst + l.igst);
      const itc = sum(b.lines.filter((l) => l.claimable), (l) => l.cgst + l.sgst + l.igst);
      return [b.date, b.number, b.supplier, b.gstin, ...RATES.map(at), t("cgst"), t("sgst"), t("igst"), total, itc, b.in2b ? "Yes" : "No"];
    });
  return { name: "purchase-register", head, rows };
}

// one table as CSV, with a BOM so Excel reads it as UTF-8
export function toCsv(t: Table): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [t.head, ...t.rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
