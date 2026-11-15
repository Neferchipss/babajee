import type { Receipt } from "./db.ts";

// Purchases report: one row per posted bill line, tidy for an analyst to join
// (ISO dates, plain numbers, no currency signs or thousands separators).
export const PURCHASES_HEAD = ["bill_date", "supplier", "supplier_gstin", "bill_no", "product", "option", "qty", "unit_price", "taxable", "rate", "cgst", "sgst", "igst", "claimable"];

const r2 = (n: number) => Math.round(n * 100) / 100;
const cell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function purchaseRows(receipts: Receipt[]): (string | number)[][] {
  return receipts
    .filter((r) => r.status === "posted" && r.kind === "bill")
    .flatMap((r) =>
      r.lines.map((l) => [
        String(r.bill_date).slice(0, 10), r.supplier ?? "", r.supplier_gstin ?? "", r.bill_no, l.product,
        !l.option || l.option === "Default" ? "" : l.option,
        l.qty, l.unit_price, r2(l.qty * l.unit_price), l.gst_rate, l.cgst, l.sgst, l.igst, l.claimable ? "true" : "false",
      ]),
    );
}

export function purchasesCsv(receipts: Receipt[]): string {
  return "\uFEFF" + [PURCHASES_HEAD, ...purchaseRows(receipts)].map((r) => r.map(cell).join(",")).join("\r\n");
}
