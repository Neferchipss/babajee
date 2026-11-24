"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lineName, lineTotals, priceEntered, type Line } from "@/components/admin/stock/LineEditor";
import SheetImport from "@/components/admin/stock/SheetImport";
import { RangePicker, rangeLabel, useRange } from "@/components/admin/RangePicker";
import { PreviewLayer } from "@/components/admin/print/ArPrintPreview";
import { billSheet, companyOf, type Company } from "@/components/admin/print/docs";
import { printSheets } from "@/components/admin/print/printing";
import type { SheetDoc } from "@/lib/print-sheet";
import { toast, toastError } from "@/components/admin/Toaster";
import { listProducts } from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";
import { GST_BRACKETS } from "@/lib/gst";
import { errText, getSettings } from "@/lib/orders-db";
import { getReceipt, listReceipts, listSuppliers, postReceipt, saveSupplier, stockCatalogue, trackAllStock, uncounted, type Receipt, type ReceiptKind, type ReceiptRow, type Supplier } from "@/lib/stock-in/db";
import type { Candidate } from "@/lib/stock-in/match";
import { paisa, priceOf, priceTyping } from "@/lib/stock-in/price";
import { ArIcon, ArSection, ArToolbar, stdMenu, useArKeys, useArMenu, menuOf } from "./aronium-kit";
import { Band, DocFooter, DocHead, DocNotes, DocStrip, DocTabs, DocTotals, dmy, dmyTime, HF, HV, MiniBar, PaidSwitch, ProductTree, type PickRow } from "./aronium-docs";

// Purchases in the Aronium-style design, as Aronium's Management • Documents
// with the Document type set to Purchase: the toolbar (Add, Print, Print
// preview, Save as PDF, Edit, Delete), the filter panel, "Documents (n)" and
// under it the selected document's items. Add asks "Select document type"
// (Expenses: 100 - Purchase; Inventory: Opening stock, or a purchase filled
// from a supplier's sheet) and opens the Purchase document editor in its own
// tab, exactly as Aronium's: header, Document items with the product picker
// on the left, totals, notes, Save. Babajee's extras: Opening stock and Upload
// a sheet on the toolbar, the GSTIN and track-all-stock notes, the duplicate
// bill check. Same data and posting as the ordinary Purchases page.
const money = (n: number) => formatPrice(n, { paise: true });
const today = () => new Date().toLocaleDateString("en-CA");
const NEW_SUPPLIER = "__new";
type Draft = { kind: ReceiptKind; sheet?: boolean } | null;
const KIND: Record<ReceiptKind, string> = { bill: "100 - Purchase", opening: "Opening stock", quick: "Stock added (no bill)" };
const titleOf = (b: { kind: ReceiptKind; bill_no: string }) => (b.kind === "opening" ? "Opening stock" : b.kind === "quick" ? "Stock added (no bill)" : b.bill_no || "(no number)");

export default function AroniumPurchases() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(null);
  const [choosing, setChoosing] = useState(false);
  const [docType, setDocType] = useState<NonNullable<Draft>>({ kind: "bill" });
  const [loaded, setLoaded] = useState<{ key: string; rows: ReceiptRow[] } | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [err, setErr] = useState("");
  const [range, setRange] = useRange("30");
  const [noGstin, setNoGstin] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Receipt | null>(null);
  // the filter panel
  const [supplier, setSupplier] = useState("");
  const [type, setType] = useState<"" | ReceiptKind>("");
  const [status, setStatus] = useState<"" | "posted" | "void">("");
  const [number, setNumber] = useState("");
  const menu = useArMenu();

  const [company, setCompany] = useState<Company | null>(null);
  const [preview, setPreview] = useState<{ title: string; docs: SheetDoc[] | null; err?: string } | null>(null);
  useEffect(() => {
    getSettings().then(
      (s) => {
        setNoGstin(!s.gstin.trim());
        setCompany(companyOf(s));
      },
      () => {},
    );
  }, []);
  const key = `${range.from}~${range.to}`;
  const bills = loaded?.key === key ? loaded.rows : null;
  const loadBills = useCallback(() => {
    listReceipts(range.from, range.to).then(
      (rows) => setLoaded({ key, rows }),
      (e) => (setErr(errText(e)), setLoaded({ key, rows: [] })),
    );
  }, [range.from, range.to, key]);
  const loadSuppliers = useCallback(() => listSuppliers().then(setSuppliers, (e) => (setErr(errText(e)), setSuppliers([]))), []);
  useEffect(() => {
    loadBills();
  }, [loadBills]);
  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);
  // the selected document's items, below the grid
  useEffect(() => {
    let live = true;
    if (sel)
      getReceipt(sel).then(
        (r) => live && setDetail(r),
        () => live && setDetail(null),
      );
    return () => {
      live = false;
    };
  }, [sel]);

  const shown = useMemo(
    () =>
      (bills ?? []).filter(
        (b) => (!supplier || b.supplier_id === supplier) && (!type || b.kind === type) && (!status || b.status === status) && (!number.trim() || b.bill_no.toLowerCase().includes(number.trim().toLowerCase())),
      ),
    [bills, supplier, type, status, number],
  );
  const live = shown.filter((b) => b.status === "posted");
  const sum = live.reduce((a, b) => ({ taxable: a.taxable + Number(b.taxable), gst: a.gst + Number(b.gst) }), { taxable: 0, gst: 0 });
  const picked = shown.find((b) => b.id === sel) ?? null;
  const items = picked && detail?.id === picked.id ? detail.lines : [];
  const open = (id: string) => router.push(`/admin/inventory/purchases/bill?id=${id}`);
  // Print / Print preview / Save as PDF: the ticked bills, else the selected
  // one, each as its own A4 purchase document, all in one print job
  const targets = (b: ReceiptRow | null) => {
    const t = shown.filter((x) => ticked.has(x.id)).map((x) => x.id);
    return t.length ? t : b ? [b.id] : [];
  };
  const docsFor = async (ids: string[]) => {
    const phones = Object.fromEntries((suppliers ?? []).map((x) => [x.id, x.phone]));
    const list = await Promise.all(ids.map((id) => getReceipt(id)));
    return list.filter((r): r is Receipt => !!r).map((r) => billSheet(r, { company, supplierPhone: r.supplier_id ? phones[r.supplier_id] : undefined }));
  };
  const printBills = (b: ReceiptRow | null) => {
    const ids = targets(b);
    if (ids.length) docsFor(ids).then(printSheets, toastError);
  };
  const previewBills = (b: ReceiptRow | null) => {
    const ids = targets(b);
    if (!ids.length) return;
    const title = ids.length === 1 ? (shown.find((x) => x.id === ids[0])?.bill_no || "Purchase") : `${ids.length} purchases`;
    setPreview({ title, docs: null });
    docsFor(ids).then(
      (docs) => setPreview({ title, docs }),
      (e) => setPreview({ title, docs: null, err: errText(e) }),
    );
  };
  const clear = () => (setSupplier(""), setType(""), setStatus(""), setNumber(""));

  useArKeys({
    add: () => !draft && setChoosing(true),
    refresh: () => loadBills(),
    edit: () => !draft && sel && open(sel),
    del: () => !draft && picked && picked.status === "posted" && router.push(`/admin/inventory/purchases/bill?id=${picked.id}&void=1`),
  });

  if (draft)
    return (
      <div className="arx">
        <DocStrip tab={draft.kind === "opening" ? "Opening stock" : `${new Date().getFullYear() % 100}-100-??????`} onClose={() => setDraft(null)} onList={() => setDraft(null)} />
        <PurchaseDoc
          kind={draft.kind}
          startWithSheet={!!draft.sheet}
          suppliers={(suppliers ?? []).filter((s) => s.active)}
          onSupplier={loadSuppliers}
          onCancel={() => setDraft(null)}
          onPosted={() => {
            setDraft(null);
            loadBills();
          }}
        />
      </div>
    );

  const docMenu = (b: ReceiptRow | null) =>
    stdMenu({
      add: () => setChoosing(true),
      edit: () => b && open(b.id),
      del: () => b && b.status === "posted" && router.push(`/admin/inventory/purchases/bill?id=${b.id}&void=1`),
      refresh: loadBills,
      has: !!b,
      extra: [
        { label: "Print", key: "Ctrl+P", disabled: !b && !ticked.size, onClick: () => printBills(b) },
        { label: "Print preview", key: "Ctrl+F2", disabled: !b && !ticked.size, onClick: () => previewBills(b) },
        { label: "Save as PDF", disabled: !b && !ticked.size, onClick: () => printBills(b) },
      ],
    });

  return (
    <div className="arx arx-list">
      {preview && <PreviewLayer title={preview.title} docs={preview.docs} loading={!preview.docs && !preview.err} error={preview.err} onClose={() => setPreview(null)} />}
      <DocStrip />
      <ArToolbar
        tools={[
          { icon: "add", label: "Add", onClick: () => setChoosing(true) },
          { icon: "print", label: "Print", disabled: !picked && !ticked.size, onClick: () => printBills(picked), title: "The ticked bills, or the selected one, as A4 purchase documents" },
          { icon: "preview", label: "Print preview", disabled: !picked && !ticked.size, onClick: () => previewBills(picked) },
          { icon: "pdf", label: "Save as PDF", disabled: !picked && !ticked.size, onClick: () => printBills(picked), title: "Pick “Save as PDF” as the printer" },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && open(picked.id) },
          { icon: "del", label: "Delete", disabled: !picked || picked.status !== "posted", title: "Void the bill: its stock is taken back out", onClick: () => picked && router.push(`/admin/inventory/purchases/bill?id=${picked.id}&void=1`) },
          { icon: "box", label: "Opening stock", onClick: () => setDraft({ kind: "opening" }) },
          { icon: "excel", label: "Upload a sheet", onClick: () => setDraft({ kind: "bill", sheet: true }) },
          { icon: "folder", label: "Suppliers", href: "/admin/inventory/suppliers" },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      {noGstin && (
        <div className="arx-info is-warn">
          <p>
            Set the shop&apos;s GSTIN in <Link href="/admin/settings">My company</Link> to split GST into CGST/SGST/IGST.
          </p>
        </div>
      )}
      <TrackAll refresh={loaded} />

      <form
        className="arx-filter"
        onSubmit={(e) => {
          e.preventDefault();
          loadBills();
        }}
      >
        <label>
          <span>Product</span>
          <select className="adm-input" disabled title="Babajee lists purchases by bill">
            <option>All products</option>
          </select>
        </label>
        <label>
          <span>User</span>
          <select className="adm-input" disabled title="Babajee doesn't keep who posted a bill">
            <option>All users</option>
          </select>
        </label>
        <label>
          <span>Cash register</span>
          <select className="adm-input" disabled title="Babajee has no cash registers">
            <option>All cash registers</option>
          </select>
        </label>
        <label>
          <span>Supplier</span>
          <select className="adm-input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Document type</span>
          <select className="adm-input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="">All document types</option>
            <option value="bill">100 - Purchase</option>
            <option value="opening">Opening stock</option>
            <option value="quick">Stock added (no bill)</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select className="adm-input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">All documents</option>
            <option value="posted">Posted</option>
            <option value="void">Voided</option>
          </select>
        </label>
        <label>
          <span>Document number</span>
          <input className="adm-input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Bill no." />
        </label>
        <label>
          <span>External document</span>
          <input className="adm-input" disabled title="The bill number is the document number" />
        </label>
        <label className="arx-rangecell">
          <span>Period</span>
          <RangePicker value={range} onChange={setRange} />
        </label>
        <div className="arx-go">
          <button className="art-btn">
            <ArIcon name="search" />
            <span>Search</span>
          </button>
          <button type="button" className="art-btn" onClick={clear}>
            <ArIcon name="clear" />
            <span>Clear</span>
          </button>
        </div>
      </form>

      <ArSection title="Documents" n={bills ? shown.length : undefined} />
      {bills && live.length > 0 && (
        <p className="arx-kpis">
          <span>
            <b>{live.length}</b> posted bill{live.length === 1 ? "" : "s"}
          </span>
          <span>
            Before GST <b>{money(sum.taxable)}</b>
          </span>
          <span>
            GST <b>{money(sum.gst)}</b>
          </span>
        </p>
      )}
      <div className="aro-grid" onContextMenu={(e) => menu.open(e, docMenu(null))}>
        <table className="adm-table aro-table">
          <thead>
            <tr>
              <th className="aro-tick">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={shown.length > 0 && shown.every((b) => ticked.has(b.id))}
                  onChange={(e) => setTicked(e.target.checked ? new Set(shown.map((b) => b.id)) : new Set())}
                />
              </th>
              <th>ID</th>
              <th>Number</th>
              <th>External document</th>
              <th>Document type</th>
              <th>Status</th>
              <th>Supplier</th>
              <th>Date</th>
              <th className="r">Lines</th>
              <th className="r">Items</th>
              <th className="r">Total before tax</th>
              <th className="r">Tax</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b, n) => (
              <tr
                key={b.id}
                className={`${b.id === sel ? "is-sel" : ""} ${b.status === "void" ? "is-struck" : ""}`}
                onClick={() => setSel(b.id)}
                onDoubleClick={() => open(b.id)}
                onContextMenu={(e) => {
                  setSel(b.id);
                  e.stopPropagation();
                  menu.open(e, docMenu(b));
                }}
              >
                <td className="aro-tick">
                  <input
                    type="checkbox"
                    aria-label={`Select ${titleOf(b)}`}
                    checked={ticked.has(b.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setTicked((t) => (e.target.checked ? new Set(t).add(b.id) : new Set([...t].filter((x) => x !== b.id))))}
                  />
                </td>
                <td>{n + 1}</td>
                <td>{b.kind === "bill" ? b.bill_no || "(no number)" : ""}</td>
                <td />
                <td>{KIND[b.kind]}</td>
                <td>{b.status === "void" ? "Voided" : "Posted"}</td>
                <td>{b.supplier || ""}</td>
                <td>{dmy(b.bill_date)}</td>
                <td className="r">{b.lines}</td>
                <td className="r">{b.qty}</td>
                <td className="r">{money(Number(b.taxable))}</td>
                <td className="r">{money(Number(b.gst))}</td>
                <td className="r">{money(Number(b.taxable) + Number(b.gst))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bills === null ? <p className="aro-none">Loading.</p> : !shown.length && <p className="aro-none">{bills.length ? "No documents match the filter." : `No bills for ${rangeLabel(range).toLowerCase()}.`}</p>}
        {menu.node}
      </div>
      <div className="aro-split" aria-hidden="true">
        •••
      </div>
      <ArSection title="Document items" n={items.length} />
      <div className="aro-grid arx-items-grid">
        <table className="adm-table aro-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Code</th>
              <th>Name</th>
              <th>Unit of measure</th>
              <th className="r">Quantity</th>
              <th className="r">Price before tax</th>
              <th className="r">Tax</th>
              <th className="r">Price</th>
              <th className="r">Total before discount</th>
              <th className="r">Discount</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l, n) => (
              <tr key={l.id}>
                <td>{n + 1}</td>
                <td />
                <td>
                  {l.product}
                  {l.option ? `, ${l.option}` : ""}
                </td>
                <td>pcs</td>
                <td className="r">{l.qty}</td>
                <td className="r">{money(l.unit_price)}</td>
                <td className="r">{l.gst_rate}%</td>
                <td className="r">{money(paisa(l.unit_price * (1 + l.gst_rate / 100)))}</td>
                <td className="r">{money(l.qty * l.unit_price)}</td>
                <td className="r">0.00</td>
                <td className="r">{money(paisa(l.qty * l.unit_price + Number(l.gst)))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Band
        open={choosing}
        title="Select document type"
        onCancel={() => setChoosing(false)}
        onOk={() => {
          setChoosing(false);
          setDraft(docType);
        }}
      >
        <TypePicker
          value={docType}
          onChange={setDocType}
          onOpen={(d) => {
            setChoosing(false);
            setDraft(d);
          }}
        />
      </Band>
    </div>
  );
}

// "Select document type": categories on the left, their types on the right
function TypePicker({ value, onChange, onOpen }: { value: NonNullable<Draft>; onChange: (d: NonNullable<Draft>) => void; onOpen: (d: NonNullable<Draft>) => void }) {
  const [cat, setCat] = useState<"expenses" | "inventory">(value.kind === "opening" ? "inventory" : "expenses");
  const same = (d: NonNullable<Draft>) => d.kind === value.kind && !!d.sheet === !!value.sheet;
  const item = (d: NonNullable<Draft>, label: string, hint: string) => (
    <li>
      <button type="button" className={same(d) ? "is-on" : ""} onClick={() => onChange(d)} onDoubleClick={() => onOpen(d)}>
        {label}
        <small>{hint}</small>
      </button>
    </li>
  );
  const off = (label: string, hint: string) => (
    <li>
      <button type="button" disabled title={hint}>
        {label}
        <small>{hint}</small>
      </button>
    </li>
  );
  return (
    <div className="arx-types">
      <ul>
        <li>
          <button type="button" className={cat === "expenses" ? "is-on" : ""} onClick={() => (setCat("expenses"), onChange({ kind: "bill" }))}>
            Expenses
          </button>
        </li>
        <li>
          <button type="button" className={cat === "inventory" ? "is-on" : ""} onClick={() => (setCat("inventory"), onChange({ kind: "opening" }))}>
            Inventory
          </button>
        </li>
        {off("Sales", "Sales are taken on Orders › New order")}
      </ul>
      <ul>
        {cat === "expenses" ? (
          <>
            {item({ kind: "bill" }, "100 - Purchase", "A bill from a supplier: adds its products to stock and records the GST paid.")}
            {item({ kind: "bill", sheet: true }, "100 - Purchase, from a sheet", "Upload the supplier's .xlsx, .xls or .csv and match its rows to your products.")}
            {off("120 - Stock return", "Babajee doesn't keep stock returns to a supplier.")}
          </>
        ) : (
          <>
            {item({ kind: "opening" }, "Opening stock", "What you already have on the shelf, with what you paid. No supplier or bill number.")}
            {off("300 - Inventory count", "Counts are made on Stock › Quick inventory.")}
          </>
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- the editor
function PurchaseDoc({ kind, startWithSheet, suppliers, onSupplier, onCancel, onPosted }: { kind: ReceiptKind; startWithSheet: boolean; suppliers: Supplier[]; onSupplier: () => void; onCancel: () => void; onPosted: () => void }) {
  const opening = kind === "opening";
  const [supplier, setSupplier] = useState("");
  const [newName, setNewName] = useState("");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [catalogue, setCatalogue] = useState<Candidate[] | null>(null);
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const [counted, setCounted] = useState<Map<string, number>>(new Map());
  const [shopRate, setShopRate] = useState(18);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"items" | "payments" | "sheet">(startWithSheet ? "sheet" : "items");
  const [dup, setDup] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [now] = useState(() => new Date().toISOString());
  const menu = useArMenu();

  const loadCatalogue = useCallback(() => stockCatalogue().then(setCatalogue, (e) => (setErr(errText(e)), setCatalogue([]))), []);
  useEffect(() => {
    void loadCatalogue();
    listProducts().then(
      (ps) => {
        setRates(new Map(ps.flatMap((p) => (p.gst_rate != null ? p.variants.map((v) => [v.id, p.gst_rate as number] as const) : []))));
        setCounted(new Map(ps.flatMap((p) => p.variants.filter((v) => v.track_stock).map((v) => [v.id, v.stock_qty] as const))));
      },
      () => {},
    );
    getSettings().then((s) => setShopRate(s.gst_rate), () => {});
  }, [loadCatalogue]);
  const gstOf = useCallback((id: string) => rates.get(id) ?? shopRate, [rates, shopRate]);
  const noteOf = (id: string) => (opening && counted.has(id) ? `Already counted: ${counted.get(id)}. This adds to it.` : null);
  const byId = useMemo(() => new Map((catalogue ?? []).map((c) => [c.variant_id, c])), [catalogue]);
  const rows = useMemo<PickRow[] | null>(() => (catalogue ? catalogue.map((c) => ({ key: c.variant_id, group: c.product, name: c.product, label: c.option, code: c.sku, note: (c.pack ?? 1) > 1 ? `Box of ${c.pack}` : undefined })) : null), [catalogue]);
  const t = useMemo(() => lineTotals(lines), [lines]);
  const hasSupplier = supplier === NEW_SUPPLIER ? newName.trim() !== "" : supplier !== "";
  const linesOk = lines.length > 0 && lines.every((l) => l.qty > 0 && priceEntered(l));
  const valid = linesOk && (opening || (hasSupplier && billNo.trim() !== ""));
  const supplierName = (supplier === NEW_SUPPLIER ? newName : (suppliers.find((s) => s.id === supplier)?.name ?? "")).trim();
  const supplierGstin = supplier === NEW_SUPPLIER ? "" : (suppliers.find((s) => s.id === supplier)?.gstin ?? "");
  const problem = !lines.length
    ? "Pick the bill's products on the left."
    : !lines.every((l) => l.qty > 0)
      ? "Every line needs a quantity."
      : !lines.every(priceEntered)
        ? "Type a price for every line."
        : !opening && !hasSupplier
          ? "Choose the supplier."
          : !opening && !billNo.trim()
            ? "Type the bill number (External document)."
            : "";

  const add = (id: string) => {
    const c = byId.get(id);
    if (!c) return;
    const at = lines.findIndex((l) => l.variant_id === id);
    if (at >= 0) setLines(lines.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l)));
    else setLines([...lines, { variant_id: id, qty: 1, unit_price: NaN, gst_rate: gstOf(id) }]);
    setSel(id);
  };
  const patch = (id: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variant_id === id ? { ...l, ...p } : l)));
  const remove = (id: string | null) => id && (setLines((ls) => ls.filter((l) => l.variant_id !== id)), setSel(null));
  function takeLines(incoming: Line[]) {
    const merged = new Map(lines.map((l) => [l.variant_id, l]));
    for (const l of incoming) {
      const prev = merged.get(l.variant_id);
      merged.set(l.variant_id, prev ? { ...prev, qty: prev.qty + l.qty } : l);
    }
    setLines([...merged.values()]);
    setTab("items");
  }

  async function post(confirmed = false) {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (!opening && !confirmed && supplier !== NEW_SUPPLIER) {
        const known = await listReceipts(null, null);
        const no = billNo.trim().toLowerCase();
        if (known.some((b) => b.kind === "bill" && b.status === "posted" && b.supplier_id === supplier && b.bill_no.trim().toLowerCase() === no)) {
          setDup(true);
          setBusy(false);
          return;
        }
      }
      let supplierId: string | null = !opening && supplier && supplier !== NEW_SUPPLIER ? supplier : null;
      if (!opening && supplier === NEW_SUPPLIER) {
        supplierId = await saveSupplier({ name: newName.trim() });
        setSupplier(supplierId);
        setNewName("");
        onSupplier();
      }
      await postReceipt({ kind, supplier_id: supplierId, bill_no: opening ? "" : billNo.trim(), bill_date: date || undefined, notes: notes.trim(), lines });
      toast(opening ? "Opening stock posted" : `Bill ${billNo.trim()} posted`);
      onPosted();
    } catch (x) {
      toastError(x);
      setBusy(false);
    }
  }

  return (
    <>
      {err && <p className="adm-err">{err}</p>}
      <DocHead>
        <HF label="Number">
          <HV muted>{opening ? "Opening stock" : `${now.slice(2, 4)}-100-??????`}</HV>
        </HF>
        <HF label="External document">
          {opening ? (
            <HV muted>No bill for opening stock</HV>
          ) : (
            <input className="adm-input" value={billNo} placeholder="Bill no., e.g. 4471" aria-invalid={!billNo.trim()} onChange={(e) => (setBillNo(e.target.value), setDup(false))} />
          )}
        </HF>
        <HF label="Supplier" wide>
          {opening ? (
            <HV muted>No supplier needed</HV>
          ) : (
            <span className="arx-row" style={{ flexWrap: "nowrap" }}>
              <select className="adm-input" style={{ flex: 1 }} value={supplier} aria-invalid={!hasSupplier} onChange={(e) => (setSupplier(e.target.value), setDup(false))}>
                <option value="">Choose a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value={NEW_SUPPLIER}>New supplier…</option>
              </select>
              <button type="button" className="arx-link" title="Reload suppliers" aria-label="Reload suppliers" onClick={onSupplier}>
                <ArIcon name="refresh" size={18} />
              </button>
            </span>
          )}
        </HF>
        {supplier === NEW_SUPPLIER && !opening && (
          <HF label="New supplier" wide>
            <input className="adm-input" value={newName} placeholder="Supplier name" onChange={(e) => (setNewName(e.target.value), setDup(false))} />
          </HF>
        )}
        <HF label="Date">
          <input className="adm-input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </HF>
        <HF label="Due date">
          <HV muted>Not kept</HV>
        </HF>
        <HF label="Stock date">
          <HV>{dmyTime(now)}</HV>
        </HF>
        <div className="arx-hcell">
          <PaidSwitch on={false} disabled title="Once posted, set the date it was paid on the bill (Payments)" />
        </div>
        {!opening && supplier !== "" && !supplierGstin && (
          <div className="arx-hcell">
            <span className="arx-sub" style={{ whiteSpace: "normal", maxWidth: 360 }}>
              This supplier has no GSTIN, so the GST on this bill can&apos;t be claimed.
            </span>
          </div>
        )}
      </DocHead>
      {opening && (
        <div className="arx-info">
          <p>What you already have on the shelf, with what you paid for it. No supplier or bill number needed. GST isn&apos;t claimed on opening stock.</p>
        </div>
      )}

      <DocTabs
        tabs={[
          ["items", "Document items"],
          ["payments", "Payments"],
          ["sheet", "Upload a sheet"],
        ]}
        on={tab}
        onPick={setTab}
      />

      {tab === "items" && (
        <div className="arx-body">
          <ProductTree rows={rows} onPick={add} onRefresh={() => void loadCatalogue()} />
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "edit", label: "Edit", disabled: !sel, onClick: () => sel && document.getElementById(`pd-qty-${sel}`)?.focus() },
                { icon: "clear", label: "Delete", disabled: !sel, onClick: () => remove(sel) },
                { icon: "excel", label: "Fill from a sheet", disabled: catalogue === null, onClick: () => setTab("sheet") },
              ]}
            />
            <div
              className="aro-grid"
              onContextMenu={(e) =>
                menu.open(e, menuOf([{ label: "Edit", disabled: !sel, onClick: () => sel && document.getElementById(`pd-qty-${sel}`)?.focus() }], [{ label: "Delete", key: "Del", disabled: !sel, onClick: () => remove(sel) }]))
              }
            >
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Unit of measure</th>
                    <th className="r">Quantity</th>
                    <th className="r">Price before tax</th>
                    <th className="r">Tax</th>
                    <th className="r">Price</th>
                    <th className="r">Discount</th>
                    <th className="r">Total before tax</th>
                    <th className="r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, n) => {
                    const c = byId.get(l.variant_id);
                    const pack = c?.pack ?? 1;
                    const pe = priceEntered(l);
                    const before = pe ? paisa(l.qty * l.unit_price) : 0;
                    const note = noteOf(l.variant_id);
                    return (
                      <tr key={l.variant_id} className={l.variant_id === sel ? "is-sel" : ""} onClick={() => setSel(l.variant_id)} onContextMenu={() => setSel(l.variant_id)}>
                        <td>{n + 1}</td>
                        <td>{c?.sku ?? ""}</td>
                        <td>
                          {lineName(c)}
                          {note && <span className="arx-sub arx-red">{note}</span>}
                          {pack > 1 && l.qty > 0 && (
                            <span className="arx-sub">
                              = {(l.qty * pack).toLocaleString("en-IN")} pieces into stock{pe ? ` · ${money(l.unit_price / pack)} per piece before GST` : ""}
                            </span>
                          )}
                        </td>
                        <td>{pack > 1 ? `Box of ${pack}` : "Loose"}</td>
                        <td className="r">
                          <input
                            id={`pd-qty-${l.variant_id}`}
                            className="arx-cell-in"
                            inputMode="numeric"
                            value={l.qty ? String(l.qty) : ""}
                            placeholder="0"
                            aria-label={`${pack > 1 ? "Boxes" : "Quantity"} of ${lineName(c)}`}
                            aria-invalid={!(l.qty > 0)}
                            onChange={(e) => patch(l.variant_id, { qty: Number(e.target.value.replace(/\D/g, "")) })}
                          />
                        </td>
                        <td className="r">
                          <PriceCell line={l} label={`${pack > 1 ? "Price per box" : "Price"} before GST for ${lineName(c)}`} onPrice={(p) => patch(l.variant_id, { unit_price: p })} />
                        </td>
                        <td className="r">
                          <select className="arx-cell-in" value={l.gst_rate} aria-label={`GST on ${lineName(c)}`} onChange={(e) => patch(l.variant_id, { gst_rate: Number(e.target.value) })}>
                            {[...new Set([...(GST_BRACKETS as readonly number[]), l.gst_rate])]
                              .sort((a, b) => a - b)
                              .map((b) => (
                                <option key={b} value={b}>
                                  {b}%
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="r">{pe ? money(paisa(l.unit_price * (1 + l.gst_rate / 100))) : ""}</td>
                        <td className="r">0.00</td>
                        <td className="r">{money(before)}</td>
                        <td className="r">{money(paisa(before + paisa((before * l.gst_rate) / 100)))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {catalogue === null ? <p className="aro-none">Loading your products.</p> : !lines.length && <p className="aro-none">No products yet. Pick them on the left, or search and press Enter to add the first match.</p>}
              {menu.node}
            </div>
            <DocTotals rows={[["Total before tax:", money(t.taxable)], ["Tax:", money(t.gst)]]} total={money(t.total)}>
              {lines.some((l) => !priceEntered(l)) && <span className="arx-red">Type a price for every line.</span>}
              {lines.length > 0 && <span>Check this against the paper bill.</span>}
            </DocTotals>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "add", label: "New", bordered: true, disabled: true, title: "Post the bill first; then set the date it was paid on it" },
                { icon: "edit", label: "Edit", disabled: true },
                { icon: "clear", label: "Delete", disabled: true },
              ]}
            />
            <p className="aro-none">Babajee records the day a bill was paid to the supplier (for the 180-day ITC rule). Post the bill, then set it under Payments on the bill.</p>
            <DocTotals rows={[["Document total:", money(t.total)]]} totalLabel="Payments total:" total={money(0)} />
          </div>
        </div>
      )}

      {tab === "sheet" &&
        (catalogue ? (
          <div className="arx-cards">
            <div style={{ gridColumn: "1 / -1" }}>
              <SheetImport catalogue={catalogue} gstOf={gstOf} existing={lines} onLines={takeLines} onCancel={() => setTab("items")} />
            </div>
          </div>
        ) : (
          <p className="arx-dim">Loading your products.</p>
        ))}

      {tab === "items" && (
        <DocNotes
          internal={<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" aria-label="Notes" />}
          note={<p className="arx-note-ro arx-dim">A bill keeps one note: Internal note.</p>}
        />
      )}

      <DocFooter
        del={{ label: "Delete", title: "Nothing posted yet" }}
        pdf={{ disabled: true }}
        preview={{ disabled: true }}
        print={{ disabled: true }}
        save={{ label: busy ? "Posting" : opening ? "Post opening count" : "Post bill", disabled: !valid || busy || dup, onClick: () => void post(), title: problem || `Post · ${money(t.total)}` }}
        saveMenu={menuOf([{ label: `Post ${opening ? "opening count" : "bill"}${lines.length ? ` · ${money(t.total)}` : ""}`, disabled: !valid || busy || dup, onClick: () => void post() }], [{ label: "Cancel", onClick: onCancel, disabled: busy }])}
      >
        {problem && lines.length > 0 && <span className="arx-sub">{problem}</span>}
        <button type="button" className="arx-fb" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </DocFooter>

      <Band open={dup} title="Bill already posted" ok="Add to it" busy={busy} onCancel={() => setDup(false)} onOk={() => void post(true)}>
        <p>
          Bill {billNo.trim()} from {supplierName} is already posted. These lines will be added to it.
        </p>
      </Band>
    </>
  );
}

// the price is typed as text so "12." and "0.5" survive while typing
function PriceCell({ line, label, onPrice }: { line: Line; label: string; onPrice: (n: number) => void }) {
  const [price, setPrice] = useState(priceEntered(line) ? String(line.unit_price) : "");
  // a price set from outside (an uploaded sheet) shows in the box
  if (!Object.is(priceOf(price), line.unit_price)) setPrice(priceEntered(line) ? String(line.unit_price) : "");
  return (
    <input
      className="arx-cell-in is-wide"
      inputMode="decimal"
      value={price}
      placeholder="₹0"
      aria-label={label}
      aria-invalid={!priceEntered(line)}
      onChange={(e) => {
        const v = e.target.value;
        if (!priceTyping(v)) return;
        setPrice(v);
        onPrice(priceOf(v));
      }}
    />
  );
}

// Shown once an opening count is posted and some options still have no
// count: switching on counting makes them sell out, so it asks first.
function TrackAll({ refresh }: { refresh: unknown }) {
  const [n, setN] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const opening = (await listReceipts(null, null)).some((r) => r.kind === "opening" && r.status === "posted");
        const left = opening ? await uncounted() : 0;
        if (live) setN(left);
      } catch {
        if (live) setN(0);
      }
    })();
    return () => {
      live = false;
    };
  }, [refresh]);
  if (n <= 0) return null;
  async function go() {
    setBusy(true);
    try {
      const changed = await trackAllStock();
      toast(`Now tracking ${changed} option${changed === 1 ? "" : "s"}`);
      setN(await uncounted());
      setConfirming(false);
    } catch (x) {
      toastError(x);
    }
    setBusy(false);
  }
  return (
    <>
      <div className="arx-info">
        <p>
          {n} option{n === 1 ? " has" : "s have"} no stock count. Start stock tracking for all items? {n === 1 ? "It starts" : "They start"} at 0 and show as sold out until you add stock.
        </p>
        <button type="button" className="arx-minib is-b" onClick={() => setConfirming(true)}>
          Start stock tracking for all items
        </button>
      </div>
      <Band open={confirming} title="Start stock tracking for all items?" ok={busy ? "Starting" : "Yes, start tracking"} busy={busy} onCancel={() => setConfirming(false)} onOk={() => void go()}>
        <p>
          {n} option{n === 1 ? "" : "s"} will start at 0 and show as sold out until you add stock. Any number typed in for {n === 1 ? "it" : "them"} before is cleared, and the history notes it.
        </p>
      </Band>
    </>
  );
}
