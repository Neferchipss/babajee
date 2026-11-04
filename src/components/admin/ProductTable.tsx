"use client";

import { Fragment, useState } from "react";
import { mainPrice, needsOf, setMainPrice } from "@/components/admin/ProductEditor";
import { SortTh, useSort } from "@/components/admin/ui";
import type { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant } from "@/lib/admin-data";
import { BRAND_NAMES } from "@/lib/brand";
import { photosFor } from "@/lib/product-photos";

type Api = ReturnType<typeof adminApi>;

export type NewRow = { name: string; categoryId: string; brand: string; type: string; price: number; stock: number | null; visible: boolean };

// The catalogue as a sheet, for people who'd rather work in rows: every
// cell edits in place and saves when you leave it (or press Enter, which
// also drops to the same column on the next row, as a spreadsheet does).
// A product with several options opens into one row per option: its name,
// price, stock (and whether stock is counted) and whether it shows, plus a
// row to add another option.
export default function ProductTable({
  products,
  categories,
  api,
  selecting,
  selected,
  openId,
  onToggle,
  onOpen,
  onSave,
  onCreate,
  category,
}: {
  products: AdminProduct[];
  categories: AdminCategory[];
  api: Api;
  selecting: boolean;
  selected: Set<string>;
  openId: string | null;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  // msg: what the notice says; by default "Saved · <product>"
  onSave: (id: string, work: () => Promise<unknown>, msg?: string) => Promise<void>;
  // a new product, filled in on the sheet's empty first row
  onCreate: (d: NewRow) => Promise<void>;
  // the category in view, which a new product goes into by default
  category: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  // inside a category tab every row is in that category, so the column goes
  const showCat = !category;
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const stockTotal = (p: AdminProduct) => {
    const t = p.variants.filter((v) => v.track_stock);
    return t.length ? t.reduce((n, v) => n + v.stock_qty, 0) : null;
  };
  const { sorted, sort, toggle } = useSort(products, {
    name: { get: (p) => p.name, text: true },
    category: { get: (p) => catName(p.category_id), text: true },
    brand: { get: (p) => p.brand, text: true },
    type: { get: (p) => p.product_type, text: true },
    price: { get: (p) => mainPrice(p) || null },
    stock: { get: (p) => stockTotal(p) },
    shown: { get: (p) => (p.is_visible ? 1 : 0) },
  });
  const flip = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="apt-wrap">
      <div className="apt-scroll">
        <table className="apt">
          <thead>
            <tr>
              {selecting && <th aria-label="Select" />}
              <th aria-label="Photo" />
              <SortTh k="name" label="Name" sort={sort} onSort={toggle} />
              {showCat && <SortTh k="category" label="Category" sort={sort} onSort={toggle} />}
              <SortTh k="brand" label="Brand" sort={sort} onSort={toggle} />
              <SortTh k="type" label="Type" sort={sort} onSort={toggle} />
              <SortTh k="price" label="Price (₹)" sort={sort} onSort={toggle} right />
              <SortTh k="stock" label="Stock" sort={sort} onSort={toggle} right />
              <SortTh k="shown" label="On shop" sort={sort} onSort={toggle} />
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {!selecting && <NewProductRow categories={categories} category={category} showCat={showCat} onCreate={onCreate} />}
            {sorted.map((p) => {
              const n = needsOf(p);
              const photo = p.images[0]?.url ?? photosFor(p.slug)[0];
              const one = p.variants.length === 1 ? p.variants[0] : null;
              const save = (work: () => Promise<unknown>, msg?: string) => onSave(p.id, work, msg);
              const expanded = !one && open.has(p.id);
              return (
                <Fragment key={p.id}>
                  <tr className={`${p.id === openId ? "is-open" : ""} ${p.is_visible ? "" : "is-hidden"} ${selected.has(p.id) ? "is-checked" : ""} ${expanded ? "is-expanded" : ""}`}>
                    {selecting && (
                      <td className="c-sel">
                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} aria-label={`Select ${p.name}`} />
                      </td>
                    )}
                    <td className="apt-photo c-ph">
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo} alt="" loading="lazy" />
                      ) : (
                        <span aria-hidden="true">{p.name.trim().charAt(0).toUpperCase()}</span>
                      )}
                    </td>
                    <td className="apt-name c-name">
                      <Cell col="name" value={p.name} label={`Name of ${p.name}`} onSave={(v) => v && save(() => api.updateProduct(p.id, { name: v }))} />
                      {(n.photo || n.price) && (
                        <span className="apt-needs">
                          {n.price && <i>No price</i>}
                          {n.photo && <i>No photo</i>}
                        </span>
                      )}
                    </td>
                    {showCat && (
                    <td className="c-cat">
                      <select className="apt-in" value={p.category_id} aria-label={`Category of ${p.name}`} onChange={(e) => save(() => api.updateProduct(p.id, { category_id: e.target.value }))}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    )}
                    <td className="c-brand">
                      <Cell col="brand" value={p.brand} list="apt-brands" label={`Brand of ${p.name}`} onSave={(v) => save(() => api.updateProduct(p.id, { brand: v }))} />
                    </td>
                    <td className="c-type">
                      <Cell col="type" value={p.product_type} label={`Type of ${p.name}`} onSave={(v) => save(() => api.updateProduct(p.id, { product_type: v }))} />
                    </td>
                    <td className="r c-price">
                      <Cell
                        col="price"
                        num
                        value={(one ? one.price : mainPrice(p)) ? String(one ? one.price : mainPrice(p)) : ""}
                        placeholder="Add"
                        label={one ? `Price of ${p.name}` : `Main price of ${p.name}, which its options follow`}
                        onSave={(v) => {
                          const price = Number(v) || 0;
                          return save(() => (one ? api.upsertVariant(p.id, { ...one, price }) : setMainPrice(api, p, price)));
                        }}
                      />
                      {!one && (
                        <button type="button" className="apt-opts" aria-expanded={expanded} onClick={() => flip(p.id)}>
                          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span> {p.variants.length} options
                        </button>
                      )}
                    </td>
                    <td className="r c-stock">
                      {one ? (
                        <StockCell v={one} name={p.name} onSave={(patch) => save(() => api.upsertVariant(p.id, { ...one, ...patch }))} />
                      ) : stockTotal(p) != null ? (
                        <span className="apt-static">{stockTotal(p)}</span>
                      ) : (
                        <span className="apt-static apt-muted">Not counted</span>
                      )}
                    </td>
                    <td className="c-shop">
                      <Switch on={p.is_visible} label={p.name} onFlip={() => save(() => api.setProductVisibility(p, !p.is_visible), `${p.name} ${p.is_visible ? "hidden from the shop" : "shown on the shop"}`)} />
                    </td>
                    <td className="c-open">
                      <button type="button" className="apt-open" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}`} title="Open the full editor">
                        →
                      </button>
                    </td>
                  </tr>

                  {expanded &&
                    p.variants.map((v) => (
                      <OptionRow
                        key={v.id}
                        v={v}
                        product={p}
                        selecting={selecting}
                        showCat={showCat}
                        onSave={(patch) =>
                          save(
                            () => api.upsertVariant(p.id, { ...v, ...patch }),
                            patch.is_visible !== undefined ? `${p.name} · ${v.label} ${patch.is_visible ? "shown" : "hidden"}` : `Saved · ${p.name} · ${patch.label ?? v.label}`,
                          )
                        }
                      />
                    ))}
                  {expanded && !selecting && <AddOptionRow product={p} onAdd={(label, price) => save(() => api.upsertVariant(p.id, { label, price, stock_qty: 0, track_stock: false, is_visible: true, sort_order: p.variants.length }), `Option ${label} added to ${p.name}`)} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        <datalist id="apt-brands">
          {BRAND_NAMES.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

// One option of a product, under it: name, price, stock, shown.
function OptionRow({ v, product: p, selecting, showCat, onSave }: { v: AdminVariant; product: AdminProduct; selecting: boolean; showCat: boolean; onSave: (patch: Partial<AdminVariant>) => Promise<void> }) {
  const main = mainPrice(p);
  const own = v.price > 0 && v.price !== main;
  return (
    <tr className={`apt-opt ${v.is_visible ? "" : "is-hidden"}`}>
      {selecting && <td className="c-sel" />}
      <td className="c-ph apt-branch" aria-hidden="true">
        ↳
      </td>
      <td className="c-name">
        <Cell col="name" value={v.label} label={`Name of the ${v.label} option of ${p.name}`} onSave={(x) => x && onSave({ label: x })} />
      </td>
      <td className="c-cat c-note" colSpan={showCat ? 3 : 2}>
        <span className="apt-muted apt-opt-note">{v.price === 0 ? "No price yet" : own ? "Its own price" : "Follows the main price"}</span>
      </td>
      <td className="r c-price">
        <Cell col="price" num value={v.price ? String(v.price) : ""} placeholder={main ? String(main) : "Add"} label={`Price of the ${v.label} option`} onSave={(x) => onSave({ price: Number(x) || 0 })} />
      </td>
      <td className="r c-stock">
        <StockCell v={v} name={`${p.name} ${v.label}`} onSave={onSave} />
      </td>
      <td className="c-shop">
        <Switch on={v.is_visible} label={`the ${v.label} option`} onFlip={() => onSave({ is_visible: !v.is_visible })} />
      </td>
      <td className="c-open" />
    </tr>
  );
}

// The last row under an open product: a new option's name and price.
function AddOptionRow({ product: p, onAdd }: { product: AdminProduct; onAdd: (label: string, price: number) => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    const name = label.trim();
    if (!name) return;
    setBusy(true);
    await onAdd(name, Number(price) || mainPrice(p));
    setLabel("");
    setPrice("");
    setBusy(false);
  }
  return (
    <tr className="apt-opt apt-opt-add">
      <td colSpan={10}>
        <form
          className="apt-opt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <span className="apt-branch" aria-hidden="true">
            +
          </span>
          <input className="apt-in" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New option: colour, size, design…" aria-label={`New option for ${p.name}`} />
          <input
            className="apt-in is-num"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={mainPrice(p) ? String(mainPrice(p)) : "Price"}
            aria-label="Its price"
          />
          <button className="apt-add-go" disabled={busy || !label.trim()}>
            {busy ? "Adding" : "Add option"}
          </button>
        </form>
      </td>
    </tr>
  );
}

// Stock: a number when it's counted, with a way to start or stop counting.
function StockCell({ v, name, onSave }: { v: AdminVariant; name: string; onSave: (patch: Partial<AdminVariant>) => Promise<void> }) {
  if (!v.track_stock)
    return (
      <button type="button" className="apt-count" onClick={() => onSave({ track_stock: true })} title="Start counting stock: checkout then refuses more than you have">
        Not counted
      </button>
    );
  return (
    <span className="apt-stock">
      <Cell col="stock" num value={String(v.stock_qty)} label={`Stock of ${name}`} onSave={(x) => onSave({ stock_qty: Math.max(0, Math.round(Number(x) || 0)) })} />
      <button type="button" className="apt-uncount" onClick={() => onSave({ track_stock: false })} aria-label={`Stop counting stock of ${name}`} title="Stop counting stock">
        ×
      </button>
    </span>
  );
}

function Switch({ on, label, onFlip }: { on: boolean; label: string; onFlip: () => void }) {
  return (
    <button type="button" className={`apt-switch ${on ? "is-on" : ""}`} aria-pressed={on} aria-label={on ? `Hide ${label} from the shop` : `Show ${label} on the shop`} onClick={onFlip}>
      <i aria-hidden="true" />
    </button>
  );
}

// One editable cell. Saves on leaving it when the value changed; Enter saves
// and moves to the same column on the next row (Shift+Enter, the row above),
// Escape puts the old value back.
function Cell({ value, onSave, label, col, num = false, list, placeholder }: { value: string; onSave: (v: string) => unknown; label: string; col: string; num?: boolean; list?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  // a fresh value from the database (after a save, or another edit) replaces the draft
  if (value !== was) {
    setWas(value);
    setV(value);
  }
  const commit = () => {
    const next = v.trim();
    if (next !== value.trim()) void onSave(next);
  };
  return (
    <input
      className={`apt-in ${num ? "is-num" : ""}`}
      data-col={col}
      value={v}
      list={list}
      placeholder={placeholder}
      inputMode={num ? "decimal" : undefined}
      aria-label={label}
      onChange={(e) => setV(num ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const all = [...document.querySelectorAll<HTMLInputElement>(`.apt [data-col="${col}"]`)];
          const next = all[all.indexOf(e.currentTarget) + (e.shiftKey ? -1 : 1)];
          if (next) next.focus();
          else e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setV(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

// The sheet's first row is always empty, ready for a new product: fill in
// what you know and press Create (or Enter in any of its cells). Leave stock
// empty to not count it. It lands in the sheet like any other row.
function NewProductRow({ categories, category, showCat, onCreate }: { categories: AdminCategory[]; category: string; showCat: boolean; onCreate: (d: NewRow) => Promise<void> }) {
  const blank = { name: "", brand: "", type: "", price: "", stock: "" };
  const [d, setD] = useState(blank);
  const [cat, setCat] = useState(category || categories[0]?.id || "");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // follow the category tab when it changes
  const [was, setWas] = useState(category);
  if (category !== was) {
    setWas(category);
    if (category) setCat(category);
  }
  const target = category || cat;
  async function create() {
    if (!d.name.trim() || !target || busy) return;
    setBusy(true);
    setErr("");
    try {
      await onCreate({
        name: d.name.trim(),
        categoryId: target,
        brand: d.brand.trim(),
        type: d.type.trim(),
        price: Number(d.price) || 0,
        stock: d.stock.trim() === "" ? null : Math.max(0, Math.round(Number(d.stock) || 0)),
        visible,
      });
      setD(blank);
      requestAnimationFrame(() => document.getElementById("apt-new-name")?.focus());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }
  const field = (k: keyof typeof blank, label: string, extra: { num?: boolean; placeholder?: string; list?: string; id?: string } = {}) => (
    <input
      id={extra.id}
      className={`apt-in apt-new-in ${extra.num ? "is-num" : ""}`}
      value={d[k]}
      list={extra.list}
      placeholder={extra.placeholder ?? label}
      inputMode={extra.num ? "decimal" : undefined}
      aria-label={`New product: ${label}`}
      onChange={(e) => setD({ ...d, [k]: extra.num ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void create();
        }
      }}
    />
  );
  return (
    <>
      <tr className="apt-new">
        <td className="apt-photo c-ph">
          <span className="apt-new-plus" aria-hidden="true">
            +
          </span>
        </td>
        <td className="apt-name c-name">{field("name", "Name", { placeholder: "New product name", id: "apt-new-name" })}</td>
        {showCat && (
          <td className="c-cat">
            <select className="apt-in apt-new-in" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="New product: category">
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </td>
        )}
        <td className="c-brand">{field("brand", "Brand", { list: "apt-brands" })}</td>
        <td className="c-type">{field("type", "Type")}</td>
        <td className="r c-price">{field("price", "Price", { num: true })}</td>
        <td className="r c-stock">{field("stock", "Stock", { num: true, placeholder: "Not counted" })}</td>
        <td className="c-shop">
          <Switch on={visible} label="the new product" onFlip={() => setVisible((v) => !v)} />
        </td>
        <td className="c-open">
          <button type="button" className="apt-create" disabled={busy || !d.name.trim() || !target} onClick={() => void create()}>
            {busy ? "…" : "Create"}
          </button>
        </td>
      </tr>
      {err && (
        <tr className="apt-new-err">
          <td colSpan={10}>{err}</td>
        </tr>
      )}
    </>
  );
}
