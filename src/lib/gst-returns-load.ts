import { strToU8, zipSync } from "fflate";
import { creditNoteOf } from "./credit-note";
import { gstr1, gstr3b, purchaseRegister, salesRegister, toCsv, type PurchaseDoc, type SaleDoc, type Table, type Tax3 } from "./gst-returns";
import { invoiceOf, stateCode } from "./invoice";
import { creditNotesIn, getOrders, getSettings, invoicedOrders, uninvoicedPaid, type Order } from "./orders-db";
import { getReceipt, listReceipts, type Receipt } from "./stock-in/db";
import { getSupabase } from "./supabase";

// Everything a GST return needs for one date range, worked out from the
// documents themselves (invoices, credit notes, supplier bills), and handed
// back as zips of CSVs: the GSTR-1 tables with a GSTR-3B summary, or the
// Tally sales and purchase registers. Test orders are left out; invoices
// later cancelled are listed as cancelled.
const ist = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ReturnData = { sales: SaleDoc[]; cancelled: string[]; bills: PurchaseDoc[]; itcBills: PurchaseDoc[]; reversal: Tax3; reclaim: Tax3; warnings: string[] };

async function receipts(ids: string[]): Promise<Receipt[]> {
  const out: Receipt[] = [];
  for (let i = 0; i < ids.length; i += 8) out.push(...(await Promise.all(ids.slice(i, i + 8).map((id) => getReceipt(id)))));
  return out;
}

export async function loadReturns(from: string, to: string): Promise<ReturnData> {
  const [shop, invoiced, notes, missing] = await Promise.all([getSettings(), invoicedOrders(from, to), creditNotesIn(from, to), uninvoicedPaid(from, to)]);
  const warnings: string[] = [];
  if (!shop.gstin || !shop.store_state) warnings.push("The shop's GSTIN or state isn't set in Settings, so GST can't be split into CGST/SGST/IGST. Set them before filing.");
  if (missing) warnings.push(`${missing} paid order${missing === 1 ? "" : "s"} up to this range's end ${missing === 1 ? "has" : "have"} no invoice yet (paid before invoices were automatic). Open their invoices from Orders to issue them.`);

  const posOf = (state: string) => {
    const code = stateCode(state);
    return `${code || "--"}-${state}`;
  };
  const badPos = new Set<string>();
  const valueOf = (o: Order) => {
    const inv = invoiceOf(o, shop.store_state);
    return r2(inv.taxable + inv.gst + inv.shipping);
  };

  const sales: SaleDoc[] = [];
  const cancelled: string[] = [];
  const noHsn = new Set<string>();
  let tests = 0;
  for (const o of invoiced) {
    if (o.is_test) {
      tests++;
      continue;
    }
    if (o.status === "cancelled") {
      cancelled.push(o.invoice_number ?? "");
      continue;
    }
    const inv = invoiceOf(o, shop.store_state);
    for (const l of inv.lines) if (!l.hsn) noHsn.add(l.name);
    if (!stateCode(o.address_state)) badPos.add(o.address_state);
    sales.push({
      kind: "invoice",
      number: o.invoice_number ?? "",
      date: ist(o.invoice_date ?? o.created_at),
      party: o.contact_name,
      gstin: o.buyer_gstin ?? "",
      pos: posOf(o.address_state),
      inter: inv.split === "inter",
      value: valueOf(o),
      lines: inv.lines.map((l) => ({ hsn: l.hsn, name: l.name, qty: l.qty, rate: l.rate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, gst: l.gst, cess: l.cess })),
    });
  }
  if (tests) warnings.push(`${tests} test order${tests === 1 ? " was" : "s were"} left out.`);
  if (cancelled.length) warnings.push(`${cancelled.length} invoice${cancelled.length === 1 ? " was" : "s were"} cancelled after issue and ${cancelled.length === 1 ? "is" : "are"} counted as cancelled in the document summary.`);
  if (noHsn.size) warnings.push(`${noHsn.size} product${noHsn.size === 1 ? " has" : "s have"} no HSN code on its invoice (set them in Products › GST & HSN; new orders pick them up).`);

  // credit notes may correct invoices from an earlier period
  const noteOrders = new Map<string, Order>((await getOrders([...new Set(notes.map((n) => n.order_id))])).map((o) => [o.id, o]));
  for (const n of notes) {
    const o = noteOrders.get(n.order_id);
    if (!o || o.is_test) continue;
    const cn = creditNoteOf(n, o, shop.store_state);
    if (!stateCode(o.address_state)) badPos.add(o.address_state);
    sales.push({
      kind: "credit",
      number: n.number,
      date: ist(n.issued_at),
      against: { number: o.invoice_number ?? "", date: ist(o.invoice_date ?? o.created_at), value: valueOf(o) },
      party: o.contact_name,
      gstin: o.buyer_gstin ?? "",
      pos: posOf(o.address_state),
      inter: cn.split === "inter",
      value: r2(n.amount),
      lines: cn.lines.map((l) => ({ hsn: l.hsn, name: l.name, qty: l.qty, rate: l.rate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, gst: l.gst, cess: l.cess })),
    });
  }
  if (badPos.size) warnings.push(`Unrecognised state on some orders (${[...badPos].join(", ")}): their place of supply shows as "--". Fix before filing.`);

  const toDoc = (b: Receipt, in2b: boolean): PurchaseDoc => ({
    date: b.bill_date,
    number: b.bill_no,
    supplier: b.supplier ?? "",
    gstin: b.supplier_gstin ?? "",
    in2b,
    lines: b.lines.map((l) => ({ rate: l.gst_rate, taxable: r2(l.qty * l.unit_price), cgst: l.cgst, sgst: l.sgst, igst: l.igst, claimable: l.claimable })),
  });

  // purchase register: supplier bills dated in the range
  const rows = (await listReceipts(from, to)).filter((r) => r.status === "posted" && r.kind === "bill");
  const sb = getSupabase();
  const flagOf = new Map<string, boolean>();
  if (rows.length && sb) {
    const { data } = await sb.from("stock_receipts").select("id, in_2b").in("id", rows.map((r) => r.id));
    for (const f of (data ?? []) as { id: string; in_2b: boolean }[]) flagOf.set(f.id, f.in_2b);
  }
  const bills = (await receipts(rows.map((r) => r.id))).map((b) => toDoc(b, flagOf.get(b.id) ?? false));
  const waiting = bills.filter((b) => !b.in2b && b.lines.some((l) => l.claimable)).length;
  if (waiting) warnings.push(`${waiting} supplier bill${waiting === 1 ? " dated in this range isn't" : "s dated in this range aren't"} ticked as in GSTR-2B yet; ${waiting === 1 ? "its" : "their"} ITC counts in the month ${waiting === 1 ? "it's" : "they're"} ticked for.`);

  // ITC: bills in GSTR-2B for a month in the range, whatever their date
  let itcBills: PurchaseDoc[] = [];
  if (sb) {
    const { data, error } = await sb.from("stock_receipts").select("id").eq("kind", "bill").eq("status", "posted").eq("in_2b", true).gte("in_2b_month", `${from.slice(0, 7)}-01`).lte("in_2b_month", to);
    if (error) throw error;
    itcBills = (await receipts(((data ?? []) as { id: string }[]).map((r) => r.id))).map((b) => toDoc(b, true));
  }

  // 180-day rule, for this period only: reverse ITC on claimed bills whose
  // 180th day falls in the range while still unpaid at its end; reclaim it on
  // bills paid in the range after their 180th day
  const day180 = (d: string) => new Date(new Date(`${d}T12:00:00Z`).getTime() + 180 * 86400000).toISOString().slice(0, 10);
  const reversal: Tax3 = { igst: 0, cgst: 0, sgst: 0 };
  const reclaim: Tax3 = { igst: 0, cgst: 0, sgst: 0 };
  let nRev = 0;
  if (sb) {
    const { data, error } = await sb.from("stock_receipts").select("id, bill_date, paid_on").eq("kind", "bill").eq("status", "posted").eq("in_2b", true);
    if (error) throw error;
    const all = (data ?? []) as { id: string; bill_date: string; paid_on: string | null }[];
    const rev = all.filter((b) => day180(b.bill_date) >= from && day180(b.bill_date) <= to && (!b.paid_on || b.paid_on > to));
    const back = all.filter((b) => b.paid_on && b.paid_on >= from && b.paid_on <= to && b.paid_on > day180(b.bill_date));
    const add = (t: Tax3, b: Receipt) => {
      for (const l of b.lines.filter((x) => x.claimable)) {
        t.igst = r2(t.igst + l.igst);
        t.cgst = r2(t.cgst + l.cgst);
        t.sgst = r2(t.sgst + l.sgst);
      }
    };
    for (const b of await receipts(rev.map((x) => x.id))) add(reversal, b);
    for (const b of await receipts(back.map((x) => x.id))) add(reclaim, b);
    nRev = rev.length;
  }
  if (nRev) warnings.push(`${nRev} bill${nRev === 1 ? " passed" : "s passed"} 180 days unpaid in this range: the ITC on ${nRev === 1 ? "it" : "them"} is in 4(B)(2) to reverse. It's reclaimed in the month it's paid.`);

  return { sales, cancelled, bills, itcBills, reversal, reclaim, warnings };
}

function zipOf(tables: Table[], readme: string) {
  const files: Record<string, Uint8Array> = { "README.txt": strToU8(readme) };
  for (const t of tables) files[`${t.name}.csv`] = strToU8(toCsv(t));
  return new Blob([zipSync(files)], { type: "application/zip" });
}

export function returnsZip(d: ReturnData, from: string, to: string) {
  const readme = [
    `Babajee GST return working files, ${from} to ${to}.`,
    "gstr1-*.csv: the GSTR-1 tables (B2B, B2CL, B2CS, credit notes, nil-rated, HSN summary, documents).",
    "gstr3b-summary.csv: 3.1(a) outward taxable supplies, 3.1(c) nil-rated, 4(A)(5) ITC from bills in this period's GSTR-2B, ITC reclaimed on bills paid after 180 days, 4(B)(2) ITC reversed on bills passing 180 days unpaid in this period, and the net.",
    "Built from the invoices, credit notes and supplier bills in the admin. Check with the CA before filing.",
    ...(d.warnings.length ? ["", "Warnings:", ...d.warnings.map((w) => `- ${w}`)] : []),
  ].join("\r\n");
  return zipOf([...gstr1(d.sales, d.cancelled), gstr3b(d.sales, d.itcBills, d.reversal, d.reclaim)], readme);
}

export function registersZip(d: ReturnData, from: string, to: string) {
  const readme = [
    `Babajee sales and purchase registers, ${from} to ${to}, as spreadsheets for the accountant to bring into Tally (Tally needs an Excel import mapping or TDL for these).`,
    "sales-register.csv: one row per invoice or credit note (credit notes negative), taxable value by GST rate, CGST/SGST/IGST, total.",
    "purchase-register.csv: one row per supplier bill, with its claimable ITC and whether it's in GSTR-2B.",
    ...(d.warnings.length ? ["", "Warnings:", ...d.warnings.map((w) => `- ${w}`)] : []),
  ].join("\r\n");
  return zipOf([salesRegister(d.sales), purchaseRegister(d.bills)], readme);
}
