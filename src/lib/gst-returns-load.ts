import { strToU8, zipSync } from "fflate";
import { creditNoteOf } from "./credit-note";
import { gstr1, gstr3b, purchaseRegister, salesRegister, toCsv, type PurchaseDoc, type SaleDoc, type Table } from "./gst-returns";
import { invoiceOf, stateCode } from "./invoice";
import { creditNotesIn, getOrders, getSettings, invoicedOrders, type Order } from "./orders-db";
import { getReceipt, listReceipts } from "./stock-in/db";
import { getSupabase } from "./supabase";

// Everything a GST return needs for one date range, worked out from the
// documents themselves (invoices, credit notes, supplier bills), and handed
// back as zips of CSVs: the GSTR-1 tables with a GSTR-3B summary, or the
// Tally sales and purchase registers.
const ist = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const r2 = (n: number) => Math.round(n * 100) / 100;
const posOf = (state: string) => `${stateCode(state) || "--"}-${state}`;

export type ReturnData = { sales: SaleDoc[]; bills: PurchaseDoc[]; warnings: string[] };

export async function loadReturns(from: string, to: string): Promise<ReturnData> {
  const [shop, invoiced, notes] = await Promise.all([getSettings(), invoicedOrders(from, to), creditNotesIn(from, to)]);
  const warnings: string[] = [];
  if (!shop.gstin || !shop.store_state) warnings.push("The shop's GSTIN or state isn't set in Settings, so GST can't be split into CGST/SGST/IGST.");

  const sales: SaleDoc[] = [];
  const noHsn = new Set<string>();
  for (const o of invoiced) {
    const inv = invoiceOf(o, shop.store_state);
    for (const l of inv.lines) if (!l.hsn && l.name !== "Shipping charges") noHsn.add(l.name);
    sales.push({
      kind: "invoice",
      number: o.invoice_number ?? "",
      date: ist(o.invoice_date ?? o.created_at),
      party: o.contact_name,
      gstin: o.buyer_gstin ?? "",
      pos: posOf(o.address_state),
      inter: inv.split === "inter",
      value: r2(inv.taxable + inv.gst + inv.shipping),
      lines: inv.lines.map((l) => ({ hsn: l.hsn, name: l.name, qty: l.qty, rate: l.rate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, gst: l.gst })),
    });
  }
  if (noHsn.size) warnings.push(`${noHsn.size} product${noHsn.size === 1 ? " has" : "s have"} no HSN code (set them in Products › GST & HSN).`);

  // credit notes may correct invoices from an earlier period
  const noteOrders = new Map<string, Order>((await getOrders([...new Set(notes.map((n) => n.order_id))])).map((o) => [o.id, o]));
  for (const n of notes) {
    const o = noteOrders.get(n.order_id);
    if (!o) continue;
    const cn = creditNoteOf(n, o, shop.store_state);
    sales.push({
      kind: "credit",
      number: n.number,
      date: ist(n.issued_at),
      against: { number: o.invoice_number ?? "", date: ist(o.invoice_date ?? o.created_at) },
      party: o.contact_name,
      gstin: o.buyer_gstin ?? "",
      pos: posOf(o.address_state),
      inter: cn.split === "inter",
      value: r2(n.amount),
      lines: cn.lines.map((l) => ({ hsn: l.hsn, name: l.name, qty: l.qty, rate: l.rate, taxable: l.taxable, cgst: l.cgst, sgst: l.sgst, igst: l.igst, gst: l.gst })),
    });
  }

  // supplier bills in the range, with their 2B tick
  const rows = (await listReceipts(from, to)).filter((r) => r.status === "posted" && r.kind === "bill");
  const full = [];
  for (let i = 0; i < rows.length; i += 8) full.push(...(await Promise.all(rows.slice(i, i + 8).map((b) => getReceipt(b.id)))));
  const flags = new Map<string, boolean>();
  if (full.length) {
    const sb = getSupabase();
    const { data } = sb ? await sb.from("stock_receipts").select("id, in_2b").in("id", full.map((b) => b.id)) : { data: [] };
    for (const f of (data ?? []) as { id: string; in_2b: boolean }[]) flags.set(f.id, f.in_2b);
  }
  const bills: PurchaseDoc[] = full.map((b) => ({
    date: b.bill_date,
    number: b.bill_no,
    supplier: b.supplier ?? "",
    gstin: b.supplier_gstin ?? "",
    in2b: flags.get(b.id) ?? false,
    claimable: b.lines.some((l) => l.claimable),
    lines: b.lines.map((l) => ({ rate: l.gst_rate, taxable: r2(l.qty * l.unit_price), cgst: l.cgst, sgst: l.sgst, igst: l.igst })),
  }));
  const waiting = bills.filter((b) => b.claimable && !b.in2b).length;
  if (waiting) warnings.push(`${waiting} supplier bill${waiting === 1 ? " isn't" : "s aren't"} ticked as in GSTR-2B, so ${waiting === 1 ? "its" : "their"} ITC is left out of 3B.`);

  return { sales, bills, warnings };
}

function zipOf(tables: Table[], readme: string) {
  const files: Record<string, Uint8Array> = { "README.txt": strToU8(readme) };
  for (const t of tables) files[`${t.name}.csv`] = strToU8(toCsv(t));
  return new Blob([zipSync(files)], { type: "application/zip" });
}

export function returnsZip(d: ReturnData, from: string, to: string) {
  const readme = [
    `Babajee GST return working files, ${from} to ${to}.`,
    "gstr1-*.csv: the GSTR-1 tables (B2B, B2CL, B2CS, credit notes, HSN summary, documents).",
    "gstr3b-summary.csv: 3.1(a) outward taxable supplies, 4(A)(5) ITC from bills ticked as in GSTR-2B, and the net.",
    "Built from the invoices, credit notes and supplier bills in the admin. Check with the CA before filing.",
    ...(d.warnings.length ? ["", "Warnings:", ...d.warnings.map((w) => `- ${w}`)] : []),
  ].join("\r\n");
  return zipOf([...gstr1(d.sales), gstr3b(d.sales, d.bills)], readme);
}

export function registersZip(d: ReturnData, from: string, to: string) {
  const readme = [
    `Babajee sales and purchase registers, ${from} to ${to}, in a layout that imports into Tally.`,
    "sales-register.csv: one row per invoice or credit note (credit notes negative), taxable value by GST rate, CGST/SGST/IGST, total.",
    "purchase-register.csv: one row per supplier bill, with whether its ITC is claimable and in GSTR-2B.",
    ...(d.warnings.length ? ["", "Warnings:", ...d.warnings.map((w) => `- ${w}`)] : []),
  ].join("\r\n");
  return zipOf([salesRegister(d.sales), purchaseRegister(d.bills)], readme);
}
