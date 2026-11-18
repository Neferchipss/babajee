"use client";

import { errText } from "@/lib/orders-db";
import { useState } from "react";
import { boxLabel, type AdminVariant, type BoxPreset, type BoxSize } from "@/lib/admin-data";
import { CATEGORIES } from "@/lib/catalog-data";
import { formatPrice } from "@/lib/currency";
import { unitProfit } from "@/lib/gst";
import type { Purchase } from "@/lib/orders-db";
import { Money, Rules } from "./Pricing";

// What the stock sheet says comes in a box of this product (catalog-data),
// as a starting suggestion
export function sheetBoxSize(slug: string): number | null {
  for (const c of CATEGORIES) {
    const p = c.products.find((x) => x.slug === slug);
    if (p) return p.unitsPerBox && p.unitsPerBox > 1 ? Math.round(p.unitsPerBox) : null;
  }
  return null;
}
// The product's box sizes (0065), above its options: each size with the
// usual price of a box, a way to add or take one off, the stock sheet's size
// as a suggestion, and presets (put one on this product or its whole
// category; save this product's sizes as one).
export type BoxSetupProps = {
  sizes: BoxSize[];
  presets: BoxPreset[];
  sheet: number | null;
  categoryName: string;
  onSize: (pieces: number, price: number | null) => Promise<unknown>;
  onRemove: (pieces: number) => Promise<unknown>;
  onApply: (id: string) => Promise<unknown>;
  onApplyCategory: (id: string) => Promise<unknown>;
  onSavePreset: (name: string) => Promise<unknown>;
  onDeletePreset: (id: string) => Promise<unknown>;
};
export function BoxSetup({ sizes, presets, sheet, categoryName, onSize, onRemove, onApply, onApplyCategory, onSavePreset, onDeletePreset }: BoxSetupProps) {
  const [other, setOther] = useState("");
  const [preset, setPreset] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const have = new Set(sizes.map((x) => x.pieces));
  const n = Number(other);
  const add = (pieces: number) => {
    if (!Number.isInteger(pieces) || pieces < 2 || have.has(pieces)) return;
    setOther("");
    void onSize(pieces, null);
  };
  const tryIt = (work: Promise<unknown>, done?: () => void) =>
    work.then(
      () => {
        setErr("");
        done?.();
      },
      (e) => setErr(errText(e)),
    );
  return (
    <div className="ape-boxset">
      <div className="ape-boxes-head">
        <b>Box sizes</b>
        <small>This product comes in these boxes. Each colour or size below ticks which ones it comes in.</small>
      </div>
      {sizes.map((x) => (
        <BoxSizeRow key={x.pieces} size={x} onPrice={(price) => void onSize(x.pieces, price)} onRemove={() => void onRemove(x.pieces)} />
      ))}
      <div className="ape-boxes-add">
        <span>+ Size</span>
        {sheet && !have.has(sheet) && (
          <button type="button" className="ape-chip" title="The stock sheet says this comes in boxes of this many" onClick={() => add(sheet)}>
            {boxLabel(sheet)} (stock sheet)
          </button>
        )}
        <span className="ape-money ape-boxes-other">
          <input inputMode="numeric" aria-label="Pieces in a box" placeholder="Pieces" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && add(n)} />
        </span>
        {other !== "" && (
          <button type="button" className="ape-chip" disabled={!(n >= 2) || have.has(n)} onClick={() => add(n)}>
            {have.has(n) ? "Already there" : `Add ${boxLabel(n)}`}
          </button>
        )}
      </div>
      <div className="ape-boxes-add">
        <span>Presets</span>
        <select className="ape-boxset-select" value={preset} aria-label="A box preset" onChange={(e) => setPreset(e.target.value)}>
          <option value="">{presets.length ? "Choose a preset…" : "No presets yet"}</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}: {p.sizes.join(", ")}
            </option>
          ))}
        </select>
        {preset && (
          <>
            <button type="button" className="ape-chip" onClick={() => tryIt(onApply(preset), () => setPreset(""))}>
              Use here
            </button>
            <button type="button" className="ape-chip" title={`Adds these sizes to every product in ${categoryName}`} onClick={() => tryIt(onApplyCategory(preset), () => setPreset(""))}>
              Use on all {categoryName}
            </button>
            <button type="button" className="ape-chip" onClick={() => tryIt(onDeletePreset(preset), () => setPreset(""))}>
              Delete preset
            </button>
          </>
        )}
      </div>
      {sizes.length > 0 && (
        <div className="ape-boxes-add">
          <span className="ape-money ape-boxset-name">
            <input aria-label="Name for a new preset" placeholder="Save these sizes as…" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </span>
          {name.trim() && (
            <button type="button" className="ape-chip" onClick={() => tryIt(onSavePreset(name), () => setName(""))}>
              Save preset
            </button>
          )}
        </div>
      )}
      {err && <p className="ape-err">{err}</p>}
    </div>
  );
}
export function BoxSizeRow({ size: x, onPrice, onRemove }: { size: BoxSize; onPrice: (price: number | null) => void; onRemove: () => void }) {
  const [price, setPrice] = useState(x.price == null ? "" : String(x.price));
  const [sure, setSure] = useState(false);
  const p = price.trim() === "" ? null : Number(price);
  return (
    <div className="ape-box">
      <div className="ape-box-name">
        <b>{boxLabel(x.pieces)}</b>
        <small>usual price of a box</small>
      </div>
      <Money value={price} label={`${boxLabel(x.pieces)} usual price`} placeholder="pieces × price" onChange={setPrice} onSave={() => p !== x.price && onPrice(p)} />
      {sure ? (
        <button type="button" className="ape-del is-sure" onClick={onRemove} onBlur={() => setSure(false)}>
          Remove?
        </button>
      ) : (
        <button type="button" className="ape-del" onClick={() => setSure(true)} aria-label={`Remove ${boxLabel(x.pieces)}`} title="Remove this size (and the options' boxes of it)">
          ×
        </button>
      )}
    </div>
  );
}
// A loose option's boxes (0061, 0065): for each of the product's box sizes,
// whether this option comes in it; if it does, its box with its own price,
// whether it is sold to customers, and what it costs and earns per box.
export function BoxesBlock({
  unit,
  boxes,
  costs,
  rules,
  sizes,
  onAdd,
  onSave,
  onDelete,
}: {
  unit: AdminVariant;
  boxes: AdminVariant[];
  costs: Map<string, Purchase>;
  rules: Rules;
  sizes: BoxSize[];
  onAdd: (unit: AdminVariant, size: BoxSize) => void;
  onSave: (v: AdminVariant, patch: Partial<AdminVariant>) => void;
  onDelete: (v: AdminVariant) => void;
}) {
  // the product's sizes in order, then any box of a size no longer listed
  const rows = [...sizes.map((x) => ({ x, box: boxes.find((b) => b.pack_of === x.pieces) })), ...boxes.filter((b) => !sizes.some((x) => x.pieces === b.pack_of)).map((b) => ({ x: { pieces: b.pack_of, price: null, sort_order: 999 }, box: b }))];
  if (!rows.length) return null;
  return (
    <div className="ape-boxes">
      <div className="ape-boxes-head">
        <b>Boxes</b>
        <small>
          {unit.track_stock ? `${unit.stock_qty} pieces in stock` : "Stock not counted yet"}
          {/* in the biggest box: "= 2 boxes of 50 + 7 loose" */}
          {boxes.length > 0 && unit.track_stock && unit.stock_qty > 0 && (() => {
            const big = Math.max(...boxes.map((b) => b.pack_of));
            const full = Math.floor(unit.stock_qty / big);
            return ` = ${full} ${full === 1 ? "box" : "boxes"} of ${big} + ${unit.stock_qty - full * big} loose`;
          })()}
        </small>
      </div>
      {rows.map(({ x, box }) =>
        box ? (
          <BoxRow key={box.id} box={box} have={costs.get(box.id)} rules={rules} onSave={(patch) => onSave(box, patch)} onDelete={() => onDelete(box)} />
        ) : (
          <button key={x.pieces} type="button" className="ape-box-tick" onClick={() => onAdd(unit, x)}>
            <i aria-hidden="true">+</i> Comes in {boxLabel(x.pieces)}
          </button>
        ),
      )}
    </div>
  );
}
export function BoxRow({ box: b, have, rules, onSave, onDelete }: { box: AdminVariant; have: Purchase | undefined; rules: Rules; onSave: (patch: Partial<AdminVariant>) => void; onDelete: () => void }) {
  const [sell, setSell] = useState(b.price ? String(b.price) : "");
  const [sellWas, setSellWas] = useState(b.price);
  if (b.price !== sellWas) {
    setSellWas(b.price);
    setSell(b.price ? String(b.price) : "");
  }
  const [confirm, setConfirm] = useState(false);
  const s = Number(sell) || 0;
  const u = have && s > 0 ? unitProfit(s, have.cost, rules, { paid: have.gstPaid, claimable: have.gstClaimable }) : null;
  const money = (n: number) => formatPrice(n, { paise: true });
  return (
    <div className="ape-box">
      <div className="ape-box-name">
        <b>{boxLabel(b.pack_of)}</b>
        <small>{b.track_stock ? `${Math.max(0, b.stock_qty)} in stock` : "not counted"}</small>
      </div>
      <Money value={sell} label={`${b.label} selling price`} placeholder="0" onChange={setSell} onSave={() => s !== b.price && onSave({ price: s })} />
      <button type="button" className={`ape-switch ape-switch--sm ${b.is_visible ? "is-on" : ""}`} aria-pressed={b.is_visible} onClick={() => onSave({ is_visible: !b.is_visible })} title={b.is_visible ? "Sold to customers: tap to stop" : "Not sold as a box: tap to sell it"}>
        <i aria-hidden="true" />
        <span>{b.is_visible ? "Sold to customers" : "Not sold as a box"}</span>
      </button>
      {confirm ? (
        <button type="button" className="ape-del is-sure" onClick={onDelete} onBlur={() => setConfirm(false)}>
          Delete?
        </button>
      ) : (
        <button type="button" className="ape-del" onClick={() => setConfirm(true)} aria-label={`Delete ${b.label}`}>
          ×
        </button>
      )}
      <small className={`ape-box-profit ${u ? (u.kept < 0 ? "is-neg" : "is-pos") : ""}`}>
        {have ? `Cost ${money(have.cost)}` : "No cost yet"}
        {u && ` · ${u.kept < 0 ? "loss" : "profit"} ${money(Math.abs(u.kept))} a box after GST`}
      </small>
    </div>
  );
}
