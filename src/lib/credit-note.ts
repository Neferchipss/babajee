import { lineCess, lineGst } from "./gst.ts";
import type { Order } from "./orders-db.ts";
import { round2 as r2 } from "./currency.ts";

// A GST credit note for one refund on an invoiced order (0051), laid out like
// the invoice. The lines follow the database's refund_tax exactly:
// - each refunded item at its own rate, scaled down when less than its value
//   was refunded;
// - anything refunded beyond the items (a discount or goodwill credit) split
//   across the order's rates in proportion to its goods, GST inside it;
// - refunded shipping, with no GST.
// GST is CGST+SGST in the shop's own state and IGST otherwise. Each rate is
// a pair (GST, cess) since 0060's refund_taxes(); with no cess, as before.
export type CreditNoteRow = { id: string; number: string; order_id: string; refund_id: string | null; issued_at: string; amount: number; tax: number; cess?: number; shipping: number };
type CreditLine = { name: string; option: string; hsn: string; qty: number; rate: number; cessRate: number; taxable: number; gst: number; cgst: number; sgst: number; igst: number; cess: number; total: number };
type CreditNote = {
  lines: CreditLine[];
  taxable: number;
  gst: number;
  cess: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  split: "intra" | "inter" | "unknown";
};

const norm = (s: string) => s.trim().toLowerCase();

export function creditNoteOf(cn: CreditNoteRow, o: Order, shopState: string): CreditNote {
  const incl = o.gst_inclusive ?? true;
  const split: CreditNote["split"] = !shopState ? "unknown" : norm(shopState) === norm(o.address_state) ? "intra" : "inter";
  const items = o.order_items ?? [];
  const rateOf = (i: (typeof items)[number]) => i.gst_rate ?? o.gst_rate ?? 0;
  const cessOf = (i: (typeof items)[number]) => i.cess_rate ?? 0;
  const withGst = (gross: number, rate: number, c: number) => (incl ? gross : gross + lineGst(gross, rate, false, c) + lineCess(gross, rate, c, false));
  // gross: the amount as priced (with tax if inclusive); gstIn: tax is inside it regardless
  const line = (name: string, option: string, hsn: string, qty: number, gross: number, rate: number, c: number, gstIn = incl): CreditLine => {
    const gst = lineGst(gross, rate, gstIn, c);
    const cess = lineCess(gross, rate, c, gstIn);
    const taxable = gstIn ? r2(gross - gst - cess) : r2(gross);
    const half = r2(gst / 2);
    return {
      name,
      option,
      hsn,
      qty,
      rate,
      cessRate: c,
      taxable,
      gst,
      cgst: split === "intra" ? half : 0,
      sgst: split === "intra" ? r2(gst - half) : 0,
      igst: split === "intra" ? 0 : gst,
      cess,
      total: r2(taxable + gst + cess),
    };
  };

  const refund = cn.refund_id ? (o.order_refunds ?? []).find((r) => r.id === cn.refund_id) : undefined;
  const rest = r2(cn.amount - cn.shipping);
  const refunded = (refund?.order_refund_items ?? []).flatMap((ri) => {
    const i = items.find((x) => x.id === ri.order_item_id);
    return i ? [{ i, qty: ri.quantity, gross: ri.quantity * i.unit_price }] : [];
  });
  const w = refunded.reduce((n, x) => n + withGst(x.gross, rateOf(x.i), cessOf(x.i)), 0);

  let lines: CreditLine[];
  if (w > 0 && rest < w) {
    const k = rest / w;
    lines = refunded.map((x) => line(x.i.product_name, x.i.variant_label, x.i.hsn ?? "", x.qty, r2(x.gross * k), rateOf(x.i), cessOf(x.i)));
  } else {
    lines = refunded.map((x) => line(x.i.product_name, x.i.variant_label, x.i.hsn ?? "", x.qty, x.gross, rateOf(x.i), cessOf(x.i)));
    const extra = r2(rest - w);
    if (extra > 0) {
      // by (GST, cess) pair, in the database's order
      const byRate = new Map<string, { rate: number; c: number; g: number }>();
      for (const i of items) {
        const k = `${rateOf(i)}|${cessOf(i)}`;
        const t = byRate.get(k) ?? { rate: rateOf(i), c: cessOf(i), g: 0 };
        byRate.set(k, { ...t, g: t.g + withGst(i.quantity * i.unit_price, rateOf(i), cessOf(i)) });
      }
      const rates = [...byRate.values()].sort((a, b) => a.rate - b.rate || a.c - b.c);
      const tot = rates.reduce((n, x) => n + x.g, 0);
      let acc = 0;
      rates.forEach((x, idx) => {
        const part = idx === rates.length - 1 ? r2(extra - acc) : r2((extra * x.g) / tot);
        acc = r2(acc + part);
        if (part > 0) lines.push(line("Discount / goodwill credit", "", "", 1, part, x.rate, x.c, true));
      });
      if (tot <= 0) lines.push(line("Discount / goodwill credit", "", "", 1, extra, 0, 0, true));
    }
  }
  if (cn.shipping > 0) lines.push(line("Shipping charges", "", "", 1, cn.shipping, 0, 0, true));

  const sum = (k: "taxable" | "gst" | "cgst" | "sgst" | "igst" | "cess" | "total") => r2(lines.reduce((n, l) => n + l[k], 0));
  return { lines, taxable: sum("taxable"), gst: sum("gst"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), cess: sum("cess"), total: sum("total"), split };
}
