import { lineGst } from "./gst";
import type { Order } from "./orders-db";

// A GST credit note for one refund on an invoiced order (0051), laid out like
// the invoice: one line per refunded item, then refunded shipping and any
// discount/goodwill credit, with GST split CGST+SGST in the shop's own state
// and IGST otherwise. The note keeps its total and GST as they were when it
// was issued (amount, tax); if its refund was undone later, only those are
// left and it shows as a single line.
export type CreditNoteRow = { id: string; number: string; order_id: string; refund_id: string | null; issued_at: string; amount: number; tax: number; shipping: number };
export type CreditLine = { name: string; option: string; hsn: string; qty: number; rate: number; taxable: number; gst: number; cgst: number; sgst: number; igst: number; total: number };
export type CreditNote = {
  lines: CreditLine[];
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  split: "intra" | "inter" | "unknown";
  // the refund behind it no longer exists
  undone: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase();

export function creditNoteOf(cn: CreditNoteRow, o: Order, shopState: string): CreditNote {
  const incl = o.gst_inclusive ?? true;
  const split: CreditNote["split"] = !shopState ? "unknown" : norm(shopState) === norm(o.address_state) ? "intra" : "inter";
  const items = o.order_items ?? [];
  const maxRate = Math.max(0, ...items.map((i) => i.gst_rate ?? o.gst_rate ?? 0));
  const line = (name: string, option: string, hsn: string, qty: number, gross: number, rate: number): CreditLine => {
    const gst = lineGst(gross, rate, incl);
    const taxable = incl ? r2(gross - gst) : r2(gross);
    const half = r2(gst / 2);
    return {
      name,
      option,
      hsn,
      qty,
      rate,
      taxable,
      gst,
      cgst: split === "intra" ? half : 0,
      sgst: split === "intra" ? r2(gst - half) : 0,
      igst: split === "intra" ? 0 : gst,
      total: r2(taxable + gst),
    };
  };

  const refund = cn.refund_id ? (o.order_refunds ?? []).find((r) => r.id === cn.refund_id) : undefined;
  let lines: CreditLine[];
  if (!refund) {
    // only what the note recorded: one line, its GST as stored
    const taxable = r2(cn.amount - cn.tax);
    const half = r2(cn.tax / 2);
    lines = [
      {
        name: "Credit against the invoice",
        option: "",
        hsn: "",
        qty: 1,
        rate: maxRate,
        taxable,
        gst: cn.tax,
        cgst: split === "intra" ? half : 0,
        sgst: split === "intra" ? r2(cn.tax - half) : 0,
        igst: split === "intra" ? 0 : cn.tax,
        total: r2(taxable + cn.tax),
      },
    ];
  } else {
    lines = (refund.order_refund_items ?? []).flatMap((ri) => {
      const i = items.find((x) => x.id === ri.order_item_id);
      if (!i) return [];
      return [line(i.product_name, i.variant_label, i.hsn ?? "", ri.quantity, ri.quantity * i.unit_price, i.gst_rate ?? o.gst_rate ?? 0)];
    });
    const itemsGross = lines.reduce((n, l) => n + (incl ? l.total : l.taxable), 0);
    // an amount refunded beyond the items: a discount or goodwill credit
    const extra = r2(Number(refund.subtotal) - itemsGross);
    if (extra > 0.004) lines.push(line("Discount / goodwill credit", "", "", 1, extra, maxRate));
    if (Number(refund.shipping) > 0) lines.push(line("Shipping charges", "", "", 1, Number(refund.shipping), o.shipping_taxed ? maxRate : 0));
  }

  const sum = (k: "taxable" | "gst" | "cgst" | "sgst" | "igst" | "total") => r2(lines.reduce((n, l) => n + l[k], 0));
  return { lines, taxable: sum("taxable"), gst: sum("gst"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total"), split, undone: !refund };
}
