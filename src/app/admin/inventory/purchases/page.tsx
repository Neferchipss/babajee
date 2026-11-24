"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import LineEditor, { type Line, lineTotals, priceEntered } from "@/components/admin/stock/LineEditor";
import { RangePicker, rangeLabel, useRange } from "@/components/admin/RangePicker";
import { toast, toastError } from "@/components/admin/Toaster";
import { listProducts } from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";
import { dayLabel } from "@/lib/dates";
import { errText, getSettings } from "@/lib/orders-db";
import SheetImport from "@/components/admin/stock/SheetImport";
import { listReceipts, listSuppliers, postReceipt, saveSupplier, stockCatalogue, trackAllStock, uncounted, type ReceiptKind, type ReceiptRow, type Supplier } from "@/lib/stock-in/db";
import type { Candidate } from "@/lib/stock-in/match";
import "@/components/admin/stock/stockin.css";
import AroniumPurchases from "@/components/admin/shells/AroniumPurchases";
import { useAdminStyle } from "@/lib/admin-style";

// The same wording and check as Settings › Store, and the database checks too.
const today = () => new Date().toLocaleDateString("en-CA");
const NEW_SUPPLIER = "__new";

type Draft = { kind: ReceiptKind; sheet?: boolean } | null;

// Stock in: the supplier bills posted so far, a way to enter a new one, and
// the suppliers. Posting a bill adds its lines to stock and records the GST
// paid on them.
export default function StockInPage() {
  return useAdminStyle() === "aronium" ? <AroniumPurchases /> : <StockInPageOriginal />;
}

function StockInPageOriginal() {
  const [draft, setDraft] = useState<Draft>(null);
  const [loaded, setLoaded] = useState<{ key: string; rows: ReceiptRow[] } | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [err, setErr] = useState("");
  const [range, setRange] = useRange("30");
  // without the shop's GSTIN the GST on a bill can't be split into CGST/SGST/IGST
  const [noGstin, setNoGstin] = useState(false);
  useEffect(() => {
    getSettings().then((s) => setNoGstin(!s.gstin.trim()), () => {});
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

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/admin/products" className="adm-back adm-only-narrow">
        ← Products
      </Link>
      <header className="adm-pagehead">
        <h1>Purchases</h1>
        <p>Bills from your suppliers. Posting one adds its products to stock and records the GST you paid.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}
      {noGstin && (
        <p className="adm-small sti-voidnote">
          Set the shop&apos;s GSTIN in <Link href="/admin/settings">Settings</Link> to split GST into CGST/SGST/IGST.
        </p>
      )}

      {draft ? (
        <NewBill
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
      ) : (
        <>
          <TrackAll refresh={loaded} />
          <Bills bills={bills} range={range} setRange={setRange} onNew={(kind, sheet) => setDraft({ kind, sheet })} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bills

function Bills({ bills, range, setRange, onNew }: { bills: ReceiptRow[] | null; range: ReturnType<typeof useRange>[0]; setRange: ReturnType<typeof useRange>[1]; onNew: (k: ReceiptKind, sheet?: boolean) => void }) {
  const live = (bills ?? []).filter((b) => b.status === "posted");
  const sum = live.reduce((a, b) => ({ taxable: a.taxable + Number(b.taxable), gst: a.gst + Number(b.gst) }), { taxable: 0, gst: 0 });
  return (
    <div className="sti-stack">
      <div className="sti-top">
        <button type="button" className="adm-btn pri" onClick={() => onNew("bill")}>
          New purchase bill
        </button>
        <button type="button" className="adm-btn" onClick={() => onNew("opening")}>
          Opening stock
        </button>
        <button type="button" className="adm-btn" onClick={() => onNew("bill", true)}>
          Upload a sheet
        </button>
      </div>
      <RangePicker value={range} onChange={setRange} />
      {bills === null ? (
        <p className="adm-muted adm-small">Loading.</p>
      ) : bills.length === 0 ? (
        <p className="adm-muted">No bills for {rangeLabel(range).toLowerCase()}.</p>
      ) : (
        <>
          <p className="adm-muted adm-small">
            {live.length} bill{live.length === 1 ? "" : "s"} · {formatPrice(sum.taxable, { paise: true })} before GST · GST {formatPrice(sum.gst, { paise: true })}
          </p>
          <ul className="sti-list">
            {bills.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/inventory/purchases/bill?id=${b.id}`} className={`sti-item ${b.status === "void" ? "is-void" : ""}`}>
                  <div className="sti-item-head">
                    <b>{b.kind === "opening" ? "Opening stock" : b.kind === "quick" ? "Stock added (no bill)" : `Bill ${b.bill_no || "(no number)"}`}</b>
                    <span className={`adm-pill ${b.status === "void" ? "off" : "done"}`}>{b.status === "void" ? "Voided" : "Posted"}</span>
                  </div>
                  <div className="sti-item-sub">
                    <span>{b.supplier || "No supplier"}</span>
                    <span>{dayLabel(b.bill_date)}</span>
                    <span>
                      {b.lines} line{b.lines === 1 ? "" : "s"}, {b.qty} item{b.qty === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="sti-item-sub">
                    <span>{formatPrice(b.taxable, { paise: true })} before GST</span>
                    <span>GST {formatPrice(b.gst, { paise: true })}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- new bill

function NewBill({ kind, startWithSheet, suppliers, onSupplier, onCancel, onPosted }: { kind: ReceiptKind; startWithSheet: boolean; suppliers: Supplier[]; onSupplier: () => void; onCancel: () => void; onPosted: () => void }) {
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
  // options already counting stock, with their count: an opening count adds to it
  const [counted, setCounted] = useState<Map<string, number>>(new Map());
  const [shopRate, setShopRate] = useState(18);
  const [err, setErr] = useState("");
  const [sheet, setSheet] = useState(startWithSheet);
  // set when this supplier and bill number are already posted
  const [dup, setDup] = useState(false);

  useEffect(() => {
    stockCatalogue().then(setCatalogue, (e) => (setErr(errText(e)), setCatalogue([])));
    listProducts().then(
      (ps) => {
        setRates(new Map(ps.flatMap((p) => (p.gst_rate != null ? p.variants.map((v) => [v.id, p.gst_rate as number] as const) : []))));
        setCounted(new Map(ps.flatMap((p) => p.variants.filter((v) => v.track_stock).map((v) => [v.id, v.stock_qty] as const))));
      },
      () => {},
    );
    getSettings().then((s) => setShopRate(s.gst_rate), () => {});
  }, []);

  const gstOf = useCallback((id: string) => rates.get(id) ?? shopRate, [rates, shopRate]);
  const noteOf = useCallback(
    (id: string) => (opening && counted.has(id) ? `Already counted: ${counted.get(id)}. This adds to it.` : null),
    [opening, counted],
  );
  const t = useMemo(() => lineTotals(lines), [lines]);

  const hasSupplier = supplier === NEW_SUPPLIER ? newName.trim() !== "" : supplier !== "";
  const linesOk = lines.length > 0 && lines.every((l) => l.qty > 0 && priceEntered(l));
  // a bill is a supplier and a number; without them it can only be an opening count
  const valid = linesOk && (opening || (hasSupplier && billNo.trim() !== ""));

  const supplierName = (supplier === NEW_SUPPLIER ? newName : (suppliers.find((s) => s.id === supplier)?.name ?? "")).trim();
  const supplierGstin = supplier === NEW_SUPPLIER ? "" : (suppliers.find((s) => s.id === supplier)?.gstin ?? "");

  // sheet lines join whatever is already on the form
  function takeLines(incoming: Line[]) {
    const merged = new Map(lines.map((l) => [l.variant_id, l]));
    for (const l of incoming) {
      const prev = merged.get(l.variant_id);
      merged.set(l.variant_id, prev ? { ...prev, qty: prev.qty + l.qty } : l);
    }
    setLines([...merged.values()]);
    setSheet(false);
  }

  async function post(e: { preventDefault(): void }, confirmed = false) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      // The database adds lines to a posted bill with the same supplier and
      // number, which would double the stock if a paper bill is entered twice.
      // A supplier added just now has no bills yet.
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
        // a retry after a failed post reuses this supplier instead of adding another
        setSupplier(supplierId);
        setNewName("");
        onSupplier();
      }
      await postReceipt({
        kind,
        supplier_id: supplierId,
        bill_no: opening ? "" : billNo.trim(),
        bill_date: date || undefined,
        notes: notes.trim(),
        lines,
      });
      toast(opening ? "Opening stock posted" : `Bill ${billNo.trim()} posted`);
      onPosted();
    } catch (x) {
      toastError(x);
      setBusy(false);
    }
  }

  if (sheet && catalogue) return <SheetImport catalogue={catalogue} gstOf={gstOf} existing={lines} onLines={takeLines} onCancel={() => setSheet(false)} />;

  return (
    <form className="adm-card sti-form sti-stack" onSubmit={post}>
      <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{opening ? "Opening stock" : "New purchase bill"}</h2>
      {opening && <p className="adm-muted adm-small">What you already have on the shelf, with what you paid for it. No supplier or bill number needed. GST isn&apos;t claimed on opening stock.</p>}
      {err && <p className="adm-err">{err}</p>}
      {!opening && (
        <>
          <label className="adm-label">
            Supplier
            <select className="adm-input" value={supplier} onChange={(e) => (setSupplier(e.target.value), setDup(false))}>
              <option value="">Choose a supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SUPPLIER}>New supplier…</option>
            </select>
          </label>
          {supplier !== "" && !supplierGstin && <p className="adm-muted adm-small" style={{ margin: 0 }}>This supplier has no GSTIN, so the GST on this bill can&apos;t be claimed.</p>}
          {supplier === NEW_SUPPLIER && (
            <label className="adm-label">
              New supplier name
              <input className="adm-input" value={newName} placeholder="Supplier name" onChange={(e) => (setNewName(e.target.value), setDup(false))} />
            </label>
          )}
          <div className="sti-grid">
            <label className="adm-label">
              Bill no.
              <input className="adm-input" value={billNo} placeholder="e.g. 4471" onChange={(e) => (setBillNo(e.target.value), setDup(false))} />
            </label>
            <label className="adm-label">
              Date
              <input className="adm-input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
        </>
      )}
      {opening && (
        <label className="adm-label">
          Date
          <input className="adm-input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      <label className="adm-label">
        Notes
        <input className="adm-input" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
      </label>

      {catalogue !== null && (
        <button type="button" className="adm-btn" onClick={() => setSheet(true)}>
          Fill from a sheet
        </button>
      )}
      {catalogue === null ? <p className="adm-muted adm-small">Loading your products.</p> : <LineEditor catalogue={catalogue} lines={lines} onChange={setLines} gstOf={gstOf} noteOf={noteOf} />}

      {dup && (
        <div className="sti-confirm" role="alertdialog" aria-label="Bill already posted">
          <p>
            Bill {billNo.trim()} from {supplierName} is already posted. These lines will be added to it.
          </p>
          <div className="adm-actions">
            <button type="button" className="adm-btn pri" disabled={busy} onClick={(e) => post(e, true)}>
              Add to it
            </button>
            <button type="button" className="adm-btn" disabled={busy} onClick={() => setDup(false)}>
              Don&apos;t post
            </button>
          </div>
        </div>
      )}
      <div className="adm-actions">
        <button className="adm-btn pri" disabled={!valid || busy || dup} style={{ flex: 1 }}>
          {busy ? "Posting" : `Post ${opening ? "opening count" : "bill"}${lines.length ? ` · ${formatPrice(t.total, { paise: true })}` : ""}`}
        </button>
        <button type="button" className="adm-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- track all stock

// Shown once an opening count is posted and some options still have no count.
// Switching on counting makes uncounted options sell out, so it says so first
// and asks again before it does anything.
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
    <div className="sti-card" style={{ marginBottom: 14 }}>
      <p>
        {n} option{n === 1 ? " has" : "s have"} no stock count. Start stock tracking for all items? {n === 1 ? "It starts" : "They start"} at 0 and show as sold out until you add stock.
      </p>
      {confirming ? (
        <div className="sti-confirm" role="alertdialog" aria-label="Start stock tracking for all items">
          <p>
            {n} option{n === 1 ? "" : "s"} will start at 0 and show as sold out until you add stock. Any number typed in for {n === 1 ? "it" : "them"} before is cleared, and the history notes it. Start tracking?
          </p>
          <div className="adm-actions">
            <button type="button" className="adm-btn pri" disabled={busy} onClick={go}>
              {busy ? "Starting" : "Yes, start tracking"}
            </button>
            <button type="button" className="adm-btn" disabled={busy} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="adm-btn pri" onClick={() => setConfirming(true)}>
          Start stock tracking for all items
        </button>
      )}
    </div>
  );
}
