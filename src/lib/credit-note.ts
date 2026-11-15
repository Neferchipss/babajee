import { lineGst } from "./gst.ts";
import type { Order } from "./orders-db.ts";

// A GST credit note for one refund on an invoiced order (0051), laid out like
// the invoice. The lines follow the database's refund_tax exactly:
// - each refunded item at its own rate, scaled down when less than its value
//   was refunded;
// - anything refunded beyond the items (a discount or goodwill credit) split
//   across the order's rates in proportion to its goods, GST inside it;
// - refunded shipping, with no GST.
// GST is CGST+SGST in the shop's own state and IGST otherwise.
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
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase();

export function creditNoteOf(cn: CreditNoteRow, o: Order, shopState: string): CreditNote {
  const incl = o.gst_inclusive ?? true;
  const split: CreditNote["split"] = !shopState ? "unknown" : norm(shopState) === norm(o.address_state) ? "intra" : "inter";
  const items = o.order_items ?? [];
  const rateOf = (i: (typeof items)[number]) => i.gst_rate ?? o.gst_rate ?? 0;
  const withGst = (gross: number, rate: number) => (incl ? gross : gross + lineGst(gross, rate, false));
  // gross: the amount as priced (with GST if inclusive); gstIn: GST is inside it regardless
  const line = (name: string, option: string, hsn: string, qty: number, gross: number, rate: number, gstIn = incl): CreditLine => {
    const gst = lineGst(gross, rate, gstIn);
    const taxable = gstIn ? r2(gross - gst) : r2(gross);
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
  const rest = r2(cn.amount - cn.shipping);
  const refunded = (refund?.order_refund_items ?? []).flatMap((ri) => {
    const i = items.find((x) => x.id === ri.order_item_id);
    return i ? [{ i, qty: ri.quantity, gross: ri.quantity * i.unit_price }] : [];
  });
  const w = refunded.reduce((n, x) => n + withGst(x.gross, rateOf(x.i)), 0);

  let lines: CreditLine[];
  if (w > 0 && rest < w) {
    const k = rest / w;
    lines = refunded.map((x) => line(x.i.product_name, x.i.variant_label, x.i.hsn ?? "", x.qty, r2(x.gross * k), rateOf(x.i)));
  } else {
    lines = refunded.map((x) => line(x.i.product_name, x.i.variant_label, x.i.hsn ?? "", x.qty, x.gross, rateOf(x.i)));
    const extra = r2(rest - w);
    if (extra > 0) {
      const byRate = new Map<number, number>();
      for (const i of items) byRate.set(rateOf(i), (byRate.get(rateOf(i)) ?? 0) + withGst(i.quantity * i.unit_price, rateOf(i)));
      const rates = [...byRate.entries()].sort((a, b) => a[0] - b[0]);
      const tot = rates.reduce((n, [, g]) => n + g, 0);
      let acc = 0;
      rates.forEach(([rate, g], idx) => {
        const part = idx === rates.length - 1 ? r2(extra - acc) : r2((extra * g) / tot);
        acc = r2(acc + part);
        if (part > 0) lines.push(line("Discount / goodwill credit", "", "", 1, part, rate, true));
      });
      if (tot <= 0) lines.push(line("Discount / goodwill credit", "", "", 1, extra, 0, true));
    }
  }
  if (cn.shipping > 0) lines.push(line("Shipping charges", "", "", 1, cn.shipping, 0, true));

  const sum = (k: "taxable" | "gst" | "cgst" | "sgst" | "igst" | "total") => r2(lines.reduce((n, l) => n + l[k], 0));
  return { lines, taxable: sum("taxable"), gst: sum("gst"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), total: sum("total"), split };
}
