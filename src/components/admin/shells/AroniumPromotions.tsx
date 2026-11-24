"use client";

import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant } from "@/lib/admin-data";
import { dealFor } from "@/lib/deal";
import { errText } from "@/lib/orders-db";
import { can, useStaff } from "@/lib/staff";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArHelp, ArInfo } from "./aronium-help";

// Management • Promotions, as Aronium has it: the offers running in the shop,
// and a full-screen editor (name, active, start and end, days of the week,
// a product picker on the left, the items on offer on the right).
// Babajee's offer is a price below the MRP: an option whose "was" price
// (compare_at, 0028) is above what it sells for shows struck through on the
// shop with the saving. So the editor's items are options with their MRP;
// saving sets those MRPs, and taking an item out (or Delete) clears its MRP.
// The price itself never changes here. Babajee's offers have no name or
// dates (they run until ended), so those fields show but can't be set.
type Row = { p: AdminProduct; v: AdminVariant };
const key = (r: Row) => r.v.id;
const loose = (p: AdminProduct) => p.variants.filter((v) => !v.unit_variant_id);
const label = (r: Row) => (loose(r.p).length > 1 ? `${r.p.name} · ${r.v.label}` : r.p.name);

export default function AroniumPromotions() {
  const api = adminApi();
  const may = can(useStaff().me?.role ?? null, "catalog");
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ start: Row[] } | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [help, setHelp] = useState(false);

  const load = () =>
    Promise.all([api.listProducts(), api.listCategories()]).then(
      ([p, c]) => {
        setProducts(p);
        setCats(c);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => (products ?? []).flatMap((p) => loose(p).filter((v) => dealFor(v.price, v.compare_at ?? undefined)).map((v) => ({ p, v }))), [products]);
  const picked = rows.find((r) => key(r) === sel) ?? null;
  const group = (p: AdminProduct) => cats.find((c) => c.id === p.category_id)?.name ?? "";
  const off = (r: Row) => (r.v.compare_at ? Math.round((1 - r.v.price / r.v.compare_at) * 100) : 0);

  // a product's offer is edited together: all its options on offer
  const editRow = (r: Row) => setEditing({ start: rows.filter((x) => x.p.id === r.p.id) });
  const add = may ? () => setEditing({ start: [] }) : undefined;
  const editSel = may && picked ? () => editRow(picked) : undefined;
  const delSel = may && picked ? () => setDel(picked) : undefined;
  useArKeys({ add, edit: editSel, del: delSel, refresh: () => void load() });

  async function end(r: Row) {
    try {
      await api.upsertVariant(r.p.id, { ...r.v, compare_at: null });
      await load();
      toast(`${label(r)}: offer ended`);
    } catch (e) {
      toastError(e);
    }
  }

  const cols: ArCol<Row>[] = [
    { k: "name", label: "Name", render: (r) => r.p.name, sort: (r) => r.p.name },
    { k: "opt", label: "Option", render: (r) => (loose(r.p).length > 1 ? r.v.label : ""), sort: (r) => r.v.label },
    { k: "group", label: "Group", render: (r) => group(r.p), sort: (r) => group(r.p) },
    { k: "mrp", label: "Regular price", right: true, render: (r) => money(r.v.compare_at ?? 0), sort: (r) => r.v.compare_at ?? 0 },
    { k: "price", label: "Promotion price", right: true, render: (r) => money(r.v.price), sort: (r) => r.v.price },
    { k: "off", label: "Discount", right: true, render: (r) => `${off(r)}%`, sort: off },
    { k: "on", label: "Active", center: true, render: (r) => <Tick on={r.p.status === "published" && r.v.is_visible} /> },
  ];
  const menu = (r: Row | null) =>
    stdMenu({
      add,
      addLabel: "Add promotion",
      edit: may ? () => r && editRow(r) : undefined,
      del: may ? () => r && setDel(r) : undefined,
      refresh: () => void load(),
      has: !!r,
    });

  return (
    <ArScreen>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "Add promotion", disabled: !add, onClick: add },
          { icon: "edit", label: "Edit", disabled: !editSel, onClick: editSel },
          { icon: "del", label: "Delete", disabled: !delSel, onClick: delSel },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      {products && !rows.length ? (
        <ArEmpty title="No promotions" action={may ? "Create new promotion" : undefined} onAction={add} />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={key} sel={sel} onSel={setSel} onOpen={(r) => may && editRow(r)} menu={menu} />
      )}

      {editing && products && (
        <PromoEditor
          products={products}
          cats={cats}
          start={editing.start}
          onClose={() => setEditing(null)}
          onSaved={async (n) => {
            setEditing(null);
            await load();
            toast(n ? `Promotion saved: ${n} item${n === 1 ? "" : "s"} on offer` : "Promotion saved");
          }}
        />
      )}

      <Dialog open={del !== null} onClose={() => setDel(null)}>
        {del && (
          <form
            className="ara-dlg"
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              setDel(null);
              setSel(null);
              void end(del);
            }}
          >
            <h2>End this promotion?</h2>
            <p className="ara-help">
              {label(del)} stops showing its MRP of {money(del.v.compare_at ?? 0)} struck through. Its price stays {money(del.v.price)}.
            </p>
            <div className="ara-btns">
              <button className="adm-btn bad">Delete</button>
              <button type="button" className="adm-btn" onClick={() => setDel(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Promotions">
        <p>An offer in Babajee is a price below the MRP. Give an option a regular price (MRP) above what it sells for, and the shop shows the MRP struck through with the saving.</p>
        <p>Add promotion opens the editor: pick products on the left, add them with ▶, and type each one&apos;s regular price. Taking an item out, or Delete here, ends its offer. To change what an option sells for, use Price lists.</p>
      </ArHelp>
    </ArScreen>
  );
}

// The full-screen promotion editor, Aronium's: it covers the whole admin,
// menu included, with its own "← New promotion … ×" bar.
type Item = { p: AdminProduct; v: AdminVariant; mrp: string };
type Mode = "all" | "barcode" | "code" | "name";
const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "all", icon: "star", label: "Search everything" },
  { id: "barcode", icon: "barcode", label: "Search by barcode" },
  { id: "code", icon: "hash", label: "Search by code (SKU)" },
  { id: "name", icon: "tag", label: "Search by name" },
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const NO_DATES = "Babajee's offers have no name or dates: they run until you end them";

function PromoEditor({ products, cats, start, onClose, onSaved }: { products: AdminProduct[]; cats: AdminCategory[]; start: Row[]; onClose: () => void; onSaved: (n: number) => Promise<void> }) {
  const api = adminApi();
  const [items, setItems] = useState<Item[]>(() => start.map((r) => ({ ...r, mrp: String(r.v.compare_at ?? "") })));
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [busy, onClose]);

  const s = q.trim().toLowerCase();
  const choices = products
    .filter((p) => p.status !== "archived" && (!cat || p.category_id === cat))
    .flatMap((p) => loose(p).map((v) => ({ p, v })))
    .filter(({ p, v }) => {
      if (items.some((i) => i.v.id === v.id)) return false;
      if (!s) return !!cat;
      if (mode === "barcode") return (v.barcode ?? "").toLowerCase().includes(s);
      if (mode === "code") return (v.sku ?? "").toLowerCase().includes(s);
      if (mode === "name") return `${p.name} ${v.label}`.toLowerCase().includes(s);
      return `${p.name} ${v.label} ${v.sku ?? ""} ${v.barcode ?? ""}`.toLowerCase().includes(s);
    })
    .slice(0, 300);
  const addTicked = () => {
    const add = choices.filter((c) => ticked.has(c.v.id)).map((c) => ({ ...c, mrp: c.v.compare_at && c.v.compare_at > c.v.price ? String(c.v.compare_at) : "" }));
    setItems([...items, ...add]);
    setTicked(new Set());
  };
  const bad = (i: Item) => !(Number(i.mrp) > i.v.price);
  const startIds = new Set(start.map((r) => r.v.id));
  const removed = start.filter((r) => !items.some((i) => i.v.id === r.v.id));
  const changed = removed.length > 0 || items.some((i) => !startIds.has(i.v.id) || Number(i.mrp) !== (i.v.compare_at ?? 0));
  const ok = changed && items.every((i) => !bad(i)) && !busy;

  async function save() {
    setBusy(true);
    try {
      for (const i of items) if (Number(i.mrp) !== (i.v.compare_at ?? 0)) await api.upsertVariant(i.p.id, { ...i.v, compare_at: Math.round(Number(i.mrp) * 100) / 100 });
      for (const r of removed) await api.upsertVariant(r.p.id, { ...r.v, compare_at: null });
      await onSaved(items.length);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <div className="arpe" role="dialog" aria-label={start.length ? "Edit promotion" : "New promotion"}>
      <header className="arpe-bar">
        <button type="button" className="arpe-ico" aria-label="Back" onClick={onClose}>
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16.5 10h-13M8.5 5 3.5 10l5 5" />
          </svg>
        </button>
        <h1>{start.length ? `Edit promotion · ${start[0].p.name}` : "New promotion"}</h1>
        <button type="button" className="arpe-ico" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
          </svg>
        </button>
      </header>

      <div className="arpe-head">
        <div className="arpe-row">
          <input className="adm-input arpe-name" placeholder="Promotion name" disabled title={NO_DATES} aria-label="Promotion name" />
          <ArSwitch on label="Active" disabled title="An offer is active while its MRP is set" />
        </div>
        <div className="arpe-row">
          {["Start", "End"].map((w) => (
            <label key={w} className="arpe-when" title={NO_DATES}>
              <span>{w}</span>
              <span className="arpe-dt">
                <input className="adm-input" placeholder="Select a date" disabled aria-label={`${w} date`} />
                <ArIcon name="calendar" size={18} />
                <select className="adm-input" disabled aria-label={`${w} hour`}>
                  <option>00</option>
                </select>
                :
                <select className="adm-input" disabled aria-label={`${w} minute`}>
                  <option>00</option>
                </select>
              </span>
            </label>
          ))}
        </div>
        <div className="arpe-row arpe-days" title={NO_DATES}>
          <label>
            <input type="checkbox" checked disabled readOnly /> All days
          </label>
          {DAYS.map((d) => (
            <label key={d}>
              <input type="checkbox" disabled /> {d}
            </label>
          ))}
        </div>
      </div>

      <div className="arpe-body">
        <aside className="arpe-pick">
          <div className="arp-search">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={mode === m.id ? "is-on" : ""} aria-pressed={mode === m.id} aria-label={m.label} title={m.label} onClick={() => setMode(m.id)}>
                <ArIcon name={m.icon} size={18} />
              </button>
            ))}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name" aria-label="Find products" />
          </div>
          <div className="arp-tree arpe-tree">
            <button type="button" className={`arp-root ${cat ? "" : "is-on"}`} onClick={() => setCat("")}>
              <ArIcon name="folder" size={16} />
              Products
            </button>
            <ul>
              {cats.map((c) => (
                <li key={c.id}>
                  <button type="button" className={c.id === cat ? "is-on" : ""} onClick={() => setCat(c.id)}>
                    <ArIcon name="folder" size={16} />
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <ul className="arpe-choices" aria-label="Products to add">
            {choices.map((c) => (
              <li key={c.v.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={ticked.has(c.v.id)}
                    onChange={() =>
                      setTicked((t) => {
                        const n = new Set(t);
                        if (n.has(c.v.id)) n.delete(c.v.id);
                        else n.add(c.v.id);
                        return n;
                      })
                    }
                  />
                  <span>{label(c)}</span>
                  <small>{money(c.v.price)}</small>
                </label>
              </li>
            ))}
            {!choices.length && <li className="arpe-hint">{cat || s ? "Nothing more to add here." : "Pick a group or search to list products."}</li>}
          </ul>
        </aside>
        <button type="button" className="arpe-add" aria-label="Add the ticked products" title="Add" disabled={!ticked.size} onClick={addTicked}>
          ▶
        </button>
        <section className="arpe-items">
          {items.length ? (
            <table className="adm-table aro-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="r">Promotion price</th>
                  <th className="r">Regular price (MRP)</th>
                  <th className="r">Discount</th>
                  <th aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.v.id}>
                    <td>{label(i)}</td>
                    <td className="r">{money(i.v.price)}</td>
                    <td className="r">
                      <input
                        className={`adm-input arpe-mrp ${bad(i) ? "is-bad" : ""}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={i.mrp}
                        aria-label={`${label(i)} regular price`}
                        title={bad(i) ? "Has to be above the promotion price" : undefined}
                        onChange={(e) => setItems(items.map((x) => (x.v.id === i.v.id ? { ...x, mrp: e.target.value } : x)))}
                      />
                    </td>
                    <td className="r">{bad(i) ? "" : `${Math.round((1 - i.v.price / Number(i.mrp)) * 100)}%`}</td>
                    <td className="r">
                      <button type="button" className="arpe-x" aria-label={`Take ${label(i)} out`} onClick={() => setItems(items.filter((x) => x.v.id !== i.v.id))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="arpe-empty">
              <ArInfo>No items added to promotion.</ArInfo>
            </div>
          )}
        </section>
      </div>

      <footer className="arpe-foot">
        <button type="button" className="ara-panel-btn" disabled={!ok} onClick={() => void save()}>
          <span aria-hidden="true">✓</span> {busy ? "Saving" : "Save"}
        </button>
        <button type="button" className="ara-panel-btn is-danger" disabled={busy} onClick={onClose}>
          <span aria-hidden="true">✕</span> Cancel
        </button>
      </footer>
    </div>
  );
}
