// What a GST invoice needs, worked out from an order as it was recorded:
// each line's taxable value and GST at its own bracket, split into CGST + SGST
// when the buyer is in the shop's own state and IGST when not, a summary per
// bracket and HSN code, the totals, and the amount in words. Prices are as
// sold (each line's GST rate, the order's "inside the price" rule), so an
// invoice never changes when the catalogue does.
import { lineGst } from "./gst";
import type { Order } from "./orders-db";

// GST state codes, the first two digits of a GSTIN
export const STATE_CODES: Record<string, string> = {
  "Jammu and Kashmir": "01", "Himachal Pradesh": "02", Punjab: "03", Chandigarh: "04", Uttarakhand: "05", Haryana: "06", Delhi: "07",
  Rajasthan: "08", "Uttar Pradesh": "09", Bihar: "10", Sikkim: "11", "Arunachal Pradesh": "12", Nagaland: "13", Manipur: "14",
  Mizoram: "15", Tripura: "16", Meghalaya: "17", Assam: "18", "West Bengal": "19", Jharkhand: "20", Odisha: "21", Chhattisgarh: "22",
  "Madhya Pradesh": "23", Gujarat: "24", "Dadra and Nagar Haveli and Daman and Diu": "26", Maharashtra: "27", Karnataka: "29", Goa: "30",
  Lakshadweep: "31", Kerala: "32", "Tamil Nadu": "33", Puducherry: "34", "Andaman and Nicobar Islands": "35", Telangana: "36",
  "Andhra Pradesh": "37", Ladakh: "38",
};
const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
export function stateCode(state: string) {
  const k = Object.keys(STATE_CODES).find((x) => norm(x) === norm(state));
  return k ? STATE_CODES[k] : "";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceLine = { name: string; option: string; sku: string | null; hsn: string; qty: number; rate: number; unit: number; taxable: number; gst: number; cgst: number; sgst: number; igst: number; total: number };
// one row of the tax summary: lines in the same bracket and HSN code
export type TaxRow = { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; gst: number };
export type Invoice = {
  lines: InvoiceLine[];
  summary: TaxRow[];
  taxable: number;
  gst: number;
  // same state: half each; other state: all IGST; shop's state unknown: just "GST"
  split: "intra" | "inter" | "unknown";
  cgst: number;
  sgst: number;
  igst: number;
  shipping: number;
  total: number;
  refunded: number;
  placeOfSupply: string;
};

export function invoiceOf(o: Order, shopState: string): Invoice {
  const incl = o.gst_inclusive ?? true;
  const split: Invoice["split"] = !shopState ? "unknown" : norm(shopState) === norm(o.address_state) ? "intra" : "inter";
  const lines = (o.order_items ?? []).map((i) => {
    const rate = i.gst_rate ?? o.gst_rate ?? 0;
    const gross = i.unit_price * i.quantity;
    const gst = lineGst(gross, rate, incl);
    const taxable = incl ? r2(gross - gst) : r2(gross);
    const half = r2(gst / 2);
    return {
      name: i.product_name,
      option: i.variant_label,
      sku: i.sku,
      hsn: i.hsn ?? "",
      qty: i.quantity,
      rate,
      unit: r2(taxable / i.quantity),
      taxable,
      gst,
      cgst: split === "intra" ? half : 0,
      sgst: split === "intra" ? r2(gst - half) : 0,
      igst: split === "intra" ? 0 : gst,
      total: r2(taxable + gst),
    };
  });
  const byKey = new Map<string, TaxRow>();
  for (const l of lines) {
    const k = `${l.rate}|${l.hsn}`;
    const t = byKey.get(k) ?? { hsn: l.hsn, rate: l.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0 };
    byKey.set(k, { ...t, taxable: r2(t.taxable + l.taxable), cgst: r2(t.cgst + l.cgst), sgst: r2(t.sgst + l.sgst), igst: r2(t.igst + l.igst), gst: r2(t.gst + l.gst) });
  }
  const taxable = r2(lines.reduce((n, l) => n + l.taxable, 0));
  const gst = r2(lines.reduce((n, l) => n + l.gst, 0));
  return {
    lines,
    summary: [...byKey.values()].sort((a, b) => a.rate - b.rate || a.hsn.localeCompare(b.hsn)),
    taxable,
    gst,
    split,
    cgst: r2(lines.reduce((n, l) => n + l.cgst, 0)),
    sgst: r2(lines.reduce((n, l) => n + l.sgst, 0)),
    igst: r2(lines.reduce((n, l) => n + l.igst, 0)),
    shipping: o.shipping ?? 0,
    total: o.total,
    refunded: (o.order_refunds ?? []).reduce((n, r) => n + Number(r.amount), 0),
    placeOfSupply: `${o.address_state}${stateCode(o.address_state) ? ` (${stateCode(o.address_state)})` : ""}`,
  };
}

// "Rupees One Thousand Two Hundred and Forty-Nine and Fifty Paise Only", Indian style (lakh, crore)
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function two(n: number) {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}
function three(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? (h ? "and " : "") + two(rest) : ""].filter(Boolean).join(" ");
}
function words(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return parts.join(" ");
}
export function amountInWords(amount: number) {
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);
  return `Rupees ${words(rupees)}${paise ? ` and ${two(paise)} Paise` : ""} Only`;
}
