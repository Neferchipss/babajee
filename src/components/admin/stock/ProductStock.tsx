"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { AdminProduct, AdminVariant } from "@/lib/admin-data";
import { toast, toastError } from "@/components/admin/Toaster";
import { formatPrice } from "@/lib/currency";
import { dayLabel } from "@/lib/dates";
import { GST_BRACKETS } from "@/lib/gst";
import { nextAverage } from "@/lib/stock-in/average";
import type { Supplier } from "@/lib/stock-in/db";
import { priceOf, priceTyping } from "@/lib/stock-in/price";
import "./stock.css";

const BRACKETS = GST_BRACKETS;
const today = () => new Date().toLocaleDateString("en-CA");
const NEW_SUPPLIER = "__new";

type Open = { id: string; mode: "add" | "correct" } | null;

// Stock of a product, option by option: the count, the average buying price,
// and the two ways to change it. Adding stock posts a receipt (a bill when it
// has a supplier and a bill number); correcting a count needs a reason.
export default function ProductStock({ product, rules, onChanged }: { product: AdminProduct; rules: { rate: number }; onChanged: () => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [avg, setAvg] = useState<Map<string, number | null>>(new Map());
  const ids = product.variants.map((v) => v.id).join(",");
  const counts = product.variants.map((v) => `${v.stock_qty}${v.track_stock ? "t" : "u"}`).join(",");
  const many = product.variants.length > 1;

  // the average buying price lives with the costs; read again when a count moves
  useEffect(() => {
    let live = true;
    import("@/lib/orders-db")
      .then((m) => m.getPurchases(ids ? ids.split(",") : []))
      .then((c) => live && setAvg(new Map([...c].map(([id, p]) => [id, p.purchase]))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ids, counts]);

  const toggle = (id: string, mode: "add" | "correct") => setOpen(open?.id === id && open.mode === mode ? null : { id, mode });
  const done = () => {
    setOpen(null);
    onChanged();
  };

  return (
    <section className="ape-fields stk">
      <h3>Stock</h3>
      <ul className="stk-list">
        {product.variants.map((v) => {
          const a = avg.get(v.id);
          return (
            <li key={v.id} className="stk-opt">
              <div className="stk-head">
                <span className="stk-name">{many ? v.label : "In stock"}</span>
                <b className={`stk-count ${v.track_stock ? (v.stock_qty <= 0 ? "is-out" : "") : "is-none"}`}>{v.track_stock ? v.stock_qty : "Not counted yet"}</b>
              </div>
              <small className="stk-avg">{a != null ? `Average buying price ${formatPrice(a, { paise: true })} before GST` : "No buying price yet"}</small>
              <div className="stk-actions">
                <button type="button" className="ape-chip stk-btn" aria-expanded={open?.id === v.id && open.mode === "add"} onClick={() => toggle(v.id, "add")}>
                  + Add stock
                </button>
                <button type="button" className="ape-chip stk-btn" aria-expanded={open?.id === v.id && open.mode === "correct"} onClick={() => toggle(v.id, "correct")}>
                  Correct count
                </button>
              </div>
              {open?.id === v.id && open.mode === "add" && <AddStock key={`add-${v.id}`} variant={v} average={a ?? null} defaultRate={product.gst_rate ?? rules.rate} onDone={done} />}
              {open?.id === v.id && open.mode === "correct" && <CorrectCount key={`fix-${v.id}`} variant={v} onDone={done} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AddStock({ variant: v, average, defaultRate, onDone }: { variant: AdminVariant; average: number | null; defaultRate: number; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState(defaultRate);
  const [supplier, setSupplier] = useState("");
  const [newName, setNewName] = useState("");
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(today());
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    import("@/lib/stock-in/db")
      .then((m) => m.listSuppliers())
      .then((s) => live && setSuppliers(s.filter((x) => x.active)))
      .catch(() => live && setSuppliers([]));
    return () => {
      live = false;
    };
  }, []);

  const q = Math.round(Number(qty));
  const p = priceOf(price);
  const valid = q > 0 && Number.isFinite(p) && p >= 0;
  const hasSupplier = supplier === NEW_SUPPLIER ? newName.trim() !== "" : supplier !== "";
  const bill = hasSupplier && billNo.trim() !== "";
  const held = v.track_stock ? v.stock_qty : 0;
  const preview = valid ? nextAverage(held, average, q, p) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const m = await import("@/lib/stock-in/db");
      let supplierId: string | null = supplier && supplier !== NEW_SUPPLIER ? supplier : null;
      if (bill && supplier === NEW_SUPPLIER) supplierId = await m.saveSupplier({ name: newName.trim() });
      const rid = await m.postReceipt({
        kind: bill ? "bill" : "quick",
        supplier_id: bill ? supplierId : null,
        bill_no: bill ? billNo.trim() : "",
        bill_date: date || undefined,
        lines: [{ variant_id: v.id, qty: q, unit_price: p, gst_rate: rate }],
      });
      // one line was posted: more on the receipt means it joined a bill already posted
      const joined = bill ? await m.getReceipt(rid).then((r) => (r.lines.length > 1 ? r : null), () => null) : null;
      toast(
        joined
          ? `Added ${q} to bill ${joined.bill_no} (posted ${dayLabel(new Date(joined.created_at).toLocaleDateString("en-CA"))})`
          : bill
            ? `Added ${q} to bill ${billNo.trim()}`
            : `Added ${q} to stock`,
      );
      onDone();
    } catch (x) {
      toastError(x);
      setBusy(false);
    }
  }

  return (
    <form className="stk-form" onSubmit={submit}>
      <div className="stk-grid">
        <label className="ape-field">
          <span>Quantity</span>
          <input inputMode="numeric" value={qty} placeholder="0" autoFocus onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="ape-field">
          <span>Buying price before GST</span>
          <input inputMode="decimal" value={price} placeholder="₹0" onChange={(e) => priceTyping(e.target.value) && setPrice(e.target.value)} />
        </label>
      </div>
      <div className="ape-field">
        <span id={`stk-gst-${v.id}`}>GST %</span>
        <div className="ape-chips" role="group" aria-labelledby={`stk-gst-${v.id}`}>
          {BRACKETS.map((b) => (
            <button key={b} type="button" className={rate === b ? "is-on" : ""} aria-pressed={rate === b} onClick={() => setRate(b)}>
              {b}%
            </button>
          ))}
        </div>
      </div>
      <label className="ape-field">
        <span>Supplier</span>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="">No supplier</option>
          {(suppliers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SUPPLIER}>New supplier…</option>
        </select>
      </label>
      {supplier === NEW_SUPPLIER && (
        <label className="ape-field">
          <span>New supplier name</span>
          <input value={newName} placeholder="Supplier name" onChange={(e) => setNewName(e.target.value)} />
        </label>
      )}
      <div className="stk-grid">
        <label className="ape-field">
          <span>Bill no.</span>
          <input value={billNo} placeholder="e.g. 4471" onChange={(e) => setBillNo(e.target.value)} />
        </label>
        <label className="ape-field">
          <span>Date</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {!bill ? (
        <p className="ape-hint stk-hint">Without a supplier bill, the GST on this stock can&apos;t be claimed.</p>
      ) : (
        !(suppliers ?? []).find((s) => s.id === supplier)?.gstin && <p className="ape-hint stk-hint">This supplier has no GSTIN, so the GST on this stock can&apos;t be claimed.</p>
      )}
      {preview != null && (
        <p className="stk-preview" aria-live="polite">
          Average buying price after this: {formatPrice(preview, { paise: true })}
          {average != null && <small> (now {formatPrice(average, { paise: true })})</small>}
        </p>
      )}
      {preview != null && (
        <p className="ape-hint stk-hint">
          {Math.max(held, 0) > 0 && average != null
            ? `(${Math.max(held, 0)} in stock × ${formatPrice(average, { paise: true })} + ${q} new × ${formatPrice(p, { paise: true })}) ÷ ${Math.max(held, 0) + q} pieces = ${formatPrice(preview, { paise: true })}`
            : !v.track_stock
              ? `This option isn't counted yet, so the average is just the price you typed: ${formatPrice(p, { paise: true })}.`
              : `Nothing in stock right now, so the average is just the price you typed: ${formatPrice(p, { paise: true })}.`}
        </p>
      )}
      <div className="stk-submit">
        <button className="stk-go" disabled={!valid || busy}>
          {busy ? "Adding" : "Add stock"}
        </button>
      </div>
    </form>
  );
}

function CorrectCount({ variant: v, onDone }: { variant: AdminVariant; onDone: () => void }) {
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = count.trim() !== "" && note.trim() !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const m = await import("@/lib/stock-in/db");
      await m.correctStock(v.id, Number(count), note.trim());
      toast(`Count corrected to ${Number(count)}`);
      onDone();
    } catch (x) {
      toastError(x);
      setBusy(false);
    }
  }

  return (
    <form className="stk-form" onSubmit={submit}>
      <label className="ape-field">
        <span>New count</span>
        <input inputMode="numeric" value={count} placeholder={v.track_stock ? String(v.stock_qty) : "0"} autoFocus onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
      </label>
      <label className="ape-field">
        <span>Reason</span>
        <input value={note} placeholder="e.g. counted the shelf, 2 broken" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="stk-submit">
        <button className="stk-go" disabled={!valid || busy}>
          {busy ? "Saving" : "Correct count"}
        </button>
      </div>
    </form>
  );
}
