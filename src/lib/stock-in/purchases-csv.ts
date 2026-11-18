import type { Receipt } from "./db.ts";
import { round2 as r2 } from "../currency.ts";

// Purchases report: one row per posted bill line, tidy for an analyst to join
// (ISO dates, plain numbers, no currency signs or thousands separators).
// gst is the line's whole GST; cgst + sgst + igst add up to it only when the
// shop's and the supplier's GSTINs were known, otherwise all three are 0.
export const PURCHASES_HEAD = ["bill_date", "supplier", "supplier_gstin", "bill_no", "product", "option", "qty", "unit_price", "taxable", "rate", "gst", "cgst", "sgst", "igst", "claimable", "kind"];

const cell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function purchaseRows(receipts: Receipt[]): (string | number)[][] {
  return receipts
    .filter((r) => r.status === "posted")
    .flatMap((r) =>
      r.lines.map((l) => [
        String(r.bill_date).slice(0, 10), r.supplier ?? "", r.supplier_gstin ?? "", r.bill_no ?? "", l.product,
        !l.option || l.option === "Default" ? "" : l.option,
        l.qty, l.unit_price, r2(l.qty * l.unit_price), l.gst_rate, l.gst, l.cgst, l.sgst, l.igst, l.claimable ? "true" : "false", r.kind,
      ]),
    );
}

export function purchasesCsv(receipts: Receipt[]): string {
  return "\uFEFF" + [PURCHASES_HEAD, ...purchaseRows(receipts)].map((r) => r.map(cell).join(",")).join("\r\n");
}
