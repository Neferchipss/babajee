"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/currency";
import { GST_BRACKETS } from "@/lib/gst";
import type { Candidate } from "@/lib/stock-in/match";
import { paisa, priceOf, priceTyping } from "@/lib/stock-in/price";
import "./stockin.css";

// unit_price is NaN until a price has been typed: "not entered" is not the same as 0
export type Line = { variant_id: string; qty: number; unit_price: number; gst_rate: number };
export const priceEntered = (l: Line) => Number.isFinite(l.unit_price) && l.unit_price >= 0;

const BRACKETS: readonly number[] = GST_BRACKETS;

// What a set of lines comes to: the price before GST, the GST, and the total.
export function lineTotals(lines: Line[]) {
  let taxable = 0;
  let gst = 0;
  for (const l of lines) {
    const t = paisa(l.qty * (priceEntered(l) ? l.unit_price : 0));
    taxable += t;
    gst += paisa((t * l.gst_rate) / 100);
  }
  taxable = paisa(taxable);
  gst = paisa(gst);
  return { taxable, gst, total: paisa(taxable + gst) };
}

export const lineName = (c: Candidate | undefined) => (c ? (c.option ? `${c.product}, ${c.option}` : c.product) : "Unknown option");

// The lines of a bill: type to find an option (product, option or SKU), Enter
// adds the top match, then set quantity and the buying price before GST.
export default function LineEditor({
  catalogue,
  lines,
  onChange,
  gstOf,
  noteOf,
}: {
  catalogue: Candidate[];
  lines: Line[];
  onChange: (l: Line[]) => void;
  gstOf: (variant_id: string) => number;
  // a warning to show on a line, if any
  noteOf?: (variant_id: string) => string | null;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(catalogue.map((c) => [c.variant_id, c])), [catalogue]);

  const found = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return catalogue
      .filter((c) => {
        const hay = `${c.product} ${c.option} ${c.sku ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 8);
  }, [q, catalogue]);

  const add = (c: Candidate) => {
    const at = lines.findIndex((l) => l.variant_id === c.variant_id);
    if (at >= 0) onChange(lines.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l)));
    else onChange([...lines, { variant_id: c.variant_id, qty: 1, unit_price: NaN, gst_rate: gstOf(c.variant_id) }]);
    setQ("");
  };
  const patch = (i: number, p: Partial<Line>) => onChange(lines.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const t = lineTotals(lines);

  return (
    <div className="sti-lines">
      <div className="sti-find">
        <label className="adm-label">
          Add a product
          <input
            className="adm-input"
            value={q}
            placeholder="Type a product, option or SKU"
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (found[0]) add(found[0]);
              }
            }}
          />
        </label>
        {q.trim() !== "" && (
          <ul className="sti-hits" aria-label="Matching products">
            {found.length === 0 && <li className="adm-muted adm-small sti-none">Nothing matches.</li>}
            {found.map((c) => (
              <li key={c.variant_id}>
                <button type="button" onClick={() => add(c)}>
                  <span>{lineName(c)}</span>
                  {c.sku && <small className="adm-muted">{c.sku}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="adm-muted adm-small">No products yet. Search above and press Enter to add the first match.</p>
      ) : (
        <ul className="sti-rows">
          {lines.map((l, i) => (
            <Row key={l.variant_id} line={l} pack={byId.get(l.variant_id)?.pack ?? 1} name={lineName(byId.get(l.variant_id))} note={noteOf?.(l.variant_id) ?? null} onPatch={(p) => patch(i, p)} onRemove={() => onChange(lines.filter((_, k) => k !== i))} />
          ))}
        </ul>
      )}

      {lines.length > 0 && (
        <div className="sti-totals" aria-live="polite">
          <div>
            <span>Before GST</span>
            <b>{formatPrice(t.taxable, { paise: true })}</b>
          </div>
          <div>
            <span>GST</span>
            <b>{formatPrice(t.gst, { paise: true })}</b>
          </div>
          <div className="is-total">
            <span>Total</span>
            <b>{formatPrice(t.total, { paise: true })}</b>
          </div>
          {lines.some((l) => !priceEntered(l)) && <p className="adm-small sti-voidnote">Type a price for every line.</p>}
          <p className="adm-muted adm-small">Check this against the paper bill.</p>
        </div>
      )}
    </div>
  );
}

function Row({ line, name, pack, note, onPatch, onRemove }: { line: Line; name: string; pack: number; note: string | null; onPatch: (p: Partial<Line>) => void; onRemove: () => void }) {
  // the price is typed as text so "12." and "0.5" survive while typing
  const [price, setPrice] = useState(priceEntered(line) ? String(line.unit_price) : "");
  // a price set from outside (an uploaded sheet) shows in the box
  if (!Object.is(priceOf(price), line.unit_price)) setPrice(priceEntered(line) ? String(line.unit_price) : "");
  return (
    <li className="sti-row">
      <div className="sti-row-head">
        <span className="sti-row-name">
          {name}
          <span className={`sti-kind ${pack > 1 ? "is-box" : ""}`}>{pack > 1 ? `Box of ${pack}` : "Loose"}</span>
        </span>
        <button type="button" className="adm-btn sti-x" aria-label={`Remove ${name}`} onClick={onRemove}>
          Remove
        </button>
      </div>
      {note && <p className="adm-small sti-voidnote" style={{ margin: 0 }}>{note}</p>}
      {pack > 1 && line.qty > 0 && (
        <p className="adm-small adm-muted sti-pieces">
          = {(line.qty * pack).toLocaleString("en-IN")} pieces into stock
          {priceEntered(line) ? ` · ${formatPrice(line.unit_price / pack, { paise: true })} per piece before GST` : ""}
        </p>
      )}
      <div className="sti-row-grid">
        <label className="adm-label">
          {pack > 1 ? "Boxes" : "Qty"}
          <input className="adm-input" inputMode="numeric" value={line.qty ? String(line.qty) : ""} placeholder="0" onChange={(e) => onPatch({ qty: Number(e.target.value.replace(/\D/g, "")) })} />
        </label>
        <label className="adm-label">
          {pack > 1 ? "Price per box before GST" : "Price before GST"}
          <input
            className="adm-input"
            inputMode="decimal"
            value={price}
            placeholder="₹0"
            onChange={(e) => {
              const v = e.target.value;
              if (!priceTyping(v)) return;
              setPrice(v);
              onPatch({ unit_price: priceOf(v) });
            }}
          />
        </label>
        <label className="adm-label">
          GST
          <select className="adm-input" value={line.gst_rate} onChange={(e) => onPatch({ gst_rate: Number(e.target.value) })}>
            {[...new Set([...BRACKETS, line.gst_rate])]
              .sort((a, b) => a - b)
              .map((b) => (
                <option key={b} value={b}>
                  {b}%
                </option>
              ))}
          </select>
        </label>
      </div>
    </li>
  );
}
