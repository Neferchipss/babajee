import { left, n, show, value, type Col } from "@/components/admin/reports-config";
import { formatPrice } from "@/lib/currency";
import type { ReportRow, StoreSettings } from "@/lib/orders-db";
import type { SheetCol, SheetDoc, SheetPair, SheetRow } from "@/lib/print-sheet";
import type { Receipt } from "@/lib/stock-in/db";

// The documents Babajee prints in Aronium's format, built from data the
// screens already have: a report, a purchase bill, any grid on screen. The
// drawing and the page breaks are Sheet.tsx and lib/print-sheet.ts.

export type Company = { name: string; address: string; gstin?: string; phone?: string; state?: string };
export const companyOf = (s: Pick<StoreSettings, "legal_name" | "store_name" | "store_address" | "gstin" | "store_phone" | "store_state">): Company => ({
  name: s.legal_name || s.store_name,
  address: s.store_address,
  gstin: s.gstin,
  phone: s.store_phone,
  state: s.store_state,
});
// Aronium's right-hand block: Company and Address (and GSTIN when there is one)
export const companyMeta = (c: Company | null): SheetPair[] => [
  ["Company:", c?.name ?? ""],
  ["Address:", c?.address ?? ""],
  ...(c?.gstin ? ([["GSTIN:", c.gstin]] as SheetPair[]) : []),
];
export const dmy = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("-") : "");
const money = (v: number) => formatPrice(v, { paise: true });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ------------------------------------------------------------------ a report
export function reportSheet(o: { label: string; kind: string; cols: Col[]; rows: ReportRow[]; from: string; to: string; company: Company | null }): SheetDoc {
  const cols: SheetCol[] = o.cols.map((c) => ({ label: c.label, align: left(c) ? "l" : "r" }));
  const rows: SheetRow[] = o.rows.map((r) => ({ cells: o.cols.map((c) => show(value(r, c), c)) }));
  const totals = o.cols.map((c) => (c.total ? show(o.rows.reduce((a, r) => a + n(value(r, c) ?? 0), 0), c) : null));
  return {
    title: o.label,
    // Babajee's reports filter by dates only; the rest is Aronium's and All
    meta: [
      ["Period:", `${dmy(o.from)} - ${dmy(o.to)}`],
      ["Customer:", "All"],
      ["User:", "All"],
      ["Product:", "All"],
    ],
    metaRight: companyMeta(o.company),
    cols,
    rows,
    totals: totals.some((t) => t) ? totals : undefined,
    file: `babajee-${o.kind}-${o.from}-to-${o.to}`,
  };
}

// ------------------------------------------------------------------ a purchase bill
export function billSheet(r: Receipt, o: { company: Company | null; paidOn?: string | null; inTwoB?: boolean; supplierPhone?: string }): SheetDoc {
  const kind = r.kind === "opening" ? "Opening stock" : r.kind === "quick" ? "Stock added (no bill)" : "Purchase";
  const sum = (k: "cgst" | "sgst" | "igst" | "gst") => r.lines.reduce((a, l) => a + Number(l[k]), 0);
  const taxable = r.lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0);
  const gst = sum("gst");
  const unsplit = Math.round((gst - sum("cgst") - sum("sgst") - sum("igst")) * 100) / 100;
  const items = r.lines.reduce((a, l) => a + l.qty, 0);
  const notClaimable = r.lines.filter((l) => !l.claimable).reduce((a, l) => a + Number(l.gst), 0);
  const why =
    r.kind === "opening"
      ? "Opening stock: its GST can't be claimed."
      : r.kind === "quick"
        ? "Added without a supplier bill: its GST can't be claimed."
        : !r.supplier_gstin
          ? "The supplier has no GSTIN: the GST on this bill can't be claimed."
          : "Some lines' GST can't be claimed.";
  const split: { label: string; value: string }[] = [
    ...(sum("cgst") ? [{ label: "CGST", value: money(sum("cgst")) }] : []),
    ...(sum("sgst") ? [{ label: "SGST", value: money(sum("sgst")) }] : []),
    ...(sum("igst") ? [{ label: "IGST", value: money(sum("igst")) }] : []),
    ...(unsplit ? [{ label: "Not split", value: money(unsplit) }] : []),
    ...(notClaimable ? [{ label: "Of which can't be claimed", value: money(notClaimable) }] : []),
  ];
  return {
    title: r.kind === "bill" ? "Purchase" : kind,
    stamp: r.status === "void" ? "VOIDED" : undefined,
    meta: [
      ["Supplier:", r.supplier || "No supplier"],
      ...(r.supplier_gstin ? ([["Supplier GSTIN:", r.supplier_gstin]] as SheetPair[]) : []),
      ...(o.supplierPhone ? ([["Phone:", o.supplierPhone]] as SheetPair[]) : []),
      ["Bill no.:", r.kind === "bill" ? r.bill_no || "(no number)" : "No bill"],
      ["Bill date:", dmy(r.bill_date)],
      ["Our document:", `100 - ${kind} · ${r.id.slice(0, 8).toUpperCase()}`],
      ["Posted:", new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })],
    ],
    metaRight: [...companyMeta(o.company), ...(o.company?.state ? ([["State:", o.company.state]] as SheetPair[]) : [])],
    cols: [
      { label: "#", align: "r" },
      { label: "Code" },
      { label: "Name" },
      { label: "UOM", align: "c" },
      { label: "Qty", align: "r" },
      { label: "Price before tax", align: "r" },
      { label: "Tax %", align: "r" },
      { label: "Tax", align: "r" },
      { label: "Total", align: "r" },
    ],
    rows: r.lines.map((l, i) => ({
      cells: [String(i + 1), "", `${l.product}${l.option ? `, ${l.option}` : ""}${l.claimable ? "" : " *"}`, "pcs", String(l.qty), money(l.unit_price), `${l.gst_rate}%`, money(Number(l.gst)), money(l.qty * l.unit_price + Number(l.gst))],
    })),
    totals: [null, null, null, null, String(items), null, null, money(gst), money(taxable + gst)],
    boxes: [
      ...(split.length ? [{ title: "GST", lines: split }] : []),
      {
        lines: [
          { label: `Total before tax (${items} item${items === 1 ? "" : "s"})`, value: money(taxable) },
          { label: "Tax", value: money(gst) },
          { label: "Total", value: money(taxable + gst), strong: true },
        ],
      },
    ],
    notes: [
      ...(r.lines.some((l) => !l.claimable) ? [`* ${why}`] : []),
      r.kind === "bill" ? (o.paidOn ? `Paid to the supplier on ${dmy(o.paidOn)}.` : "Not paid to the supplier yet.") : "",
      ...(r.kind === "bill" && o.inTwoB ? ["Appears in GSTR-2B."] : []),
      ...(r.notes ? [`Note: ${r.notes}`] : []),
      ...(r.status === "void" ? ["This bill was voided: its stock was taken back out and its GST no longer counts."] : []),
    ].filter(Boolean),
    file: `purchase-${slug(r.bill_no || kind)}-${r.bill_date}`,
  };
}

// ------------------------------------------------------------------ any grid on screen
// The grid as shown (its columns, its rows, in its order, with the filters
// that are on), read from the table itself, so every list prints without
// each screen describing its columns twice. Tick boxes and empty icon
// columns are left out.
export function gridSheet(table: HTMLTableElement | null, title: string, meta: SheetPair[] = [], company: Company | null = null): SheetDoc {
  const heads = table ? Array.from(table.tHead?.rows[0]?.cells ?? []) : [];
  const keep = heads.map((th) => {
    const text = (th.textContent ?? "").trim();
    return !!text && !th.querySelector("input[type=checkbox]");
  });
  const cellText = (c: HTMLTableCellElement) =>
    (c.innerText || c.textContent || "")
      .replace(/[↑↓▲▼⇅]/g, "")
      .replace(/\s*\n\s*/g, " · ")
      .trim();
  const cols: SheetCol[] = heads
    .map((th, i) => ({ th, i }))
    .filter(({ i }) => keep[i])
    .map(({ th }) => {
      const s = getComputedStyle(th);
      const align = th.classList.contains("r") || s.textAlign === "right" ? "r" : s.textAlign === "center" ? "c" : "l";
      return { label: cellText(th), align } as SheetCol;
    });
  const rows: SheetRow[] = [];
  for (const tr of Array.from(table?.tBodies[0]?.rows ?? [])) {
    const cells = Array.from(tr.cells);
    // an "empty" row (one cell across) isn't data
    if (cells.length < heads.length && cells.length === 1) continue;
    rows.push({ cells: cells.filter((_, i) => keep[i]).map((c) => cellText(c).replace(/^✓$/, "Yes")) });
  }
  return {
    title,
    meta: [...meta, ["Rows:", String(rows.length)]],
    metaRight: company ? companyMeta(company) : undefined,
    cols,
    rows,
    file: `babajee-${slug(title)}`,
  };
}

// the first grid in a screen (or the one inside a given element)
export const gridIn = (scope?: Element | null): HTMLTableElement | null => (scope ?? document).querySelector<HTMLTableElement>("table.aro-table, table.adm-table");
