"use client";

import { useEffect, useMemo, useState } from "react";
import { printGrid } from "@/components/admin/print/printing";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant } from "@/lib/admin-data";
import { isoDay } from "@/lib/dates";
import { download } from "@/lib/orders-csv";
import { errText, getCosts, getSettings, type StoreSettings } from "@/lib/orders-db";
import { can, useStaff } from "@/lib/staff";
import { ArGrid, ArIcon, ArScreen, ArStepper, ArToolbar, menuOf, Tick, useArKeys, useArMenu, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArPanel } from "./aronium-help";

// Management • Price lists, as Aronium has it: the price lists on the left
// (Babajee has one, "Products": the shop's own prices), the product groups
// under them to narrow the list, and on the right every option with what it
// cost, its markup and its price. Edit prices is Aronium's two-step window:
// raise or lower prices by a percentage, rounded, then pick which options it
// applies to. Product prices (or a double-click) sets one option's price,
// with the markup worked out as you type. Cost is the average buying price
// with the GST paid on it, from purchase bills (0057).
type Mode = "all" | "barcode" | "code" | "name";
const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "all", icon: "star", label: "Search everything" },
  { id: "barcode", icon: "barcode", label: "Search by barcode" },
  { id: "code", icon: "hash", label: "Search by code (SKU)" },
  { id: "name", icon: "tag", label: "Search by name" },
];
const ONE = "Babajee has one price list: the shop's prices";
const NEEDED = "Every option needs a price to be sold";
type Row = { p: AdminProduct; v: AdminVariant };
const markup = (price: number, cost: number | undefined) => (cost && cost > 0 && price > 0 ? ((price - cost) / cost) * 100 : null);
const pct = (n: number | null) => (n == null ? "" : `${n.toFixed(2)}%`);

export default function AroniumPriceLists() {
  const api = adminApi();
  const may = can(useStaff().me?.role ?? null, "catalog");
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [costs, setCosts] = useState<Map<string, number>>(new Map());
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  const printList = () =>
    printGrid("Price list", [
      ["Price list:", "Products"],
      ["Product group:", cats.find((c) => c.id === cat)?.name ?? "All"],
      ...(q.trim() ? ([["Search:", q.trim()]] as [string, string][]) : []),
    ]);
  const [sel, setSel] = useState<string | null>(null);
  const [one, setOne] = useState<Row | null>(null);
  const [bulk, setBulk] = useState(false);
  const [help, setHelp] = useState(false);
  const listMenu = useArMenu();

  const load = () =>
    Promise.all([api.listProducts(), api.listCategories(), getSettings()]).then(
      ([p, c, s]) => {
        setProducts(p);
        setCats(c);
        setSettings(s);
        setErr("");
        // buying costs: only staff with money rights can read them; others see the column empty
        getCosts(p.flatMap((x) => x.variants.map((v) => v.id))).then(setCosts, () => setCosts(new Map()));
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => p.status !== "archived" && (!cat || p.category_id === cat))
      .flatMap((p) => p.variants.filter((v) => !v.unit_variant_id).map((v) => ({ p, v })))
      .filter(({ p, v }) => {
        if (!s) return true;
        if (mode === "barcode") return (v.barcode ?? "").toLowerCase().includes(s);
        if (mode === "code") return (v.sku ?? "").toLowerCase().includes(s);
        if (mode === "name") return `${p.name} ${v.label}`.toLowerCase().includes(s);
        return `${p.name} ${v.label} ${v.sku ?? ""} ${v.barcode ?? ""} ${p.brand}`.toLowerCase().includes(s);
      });
  }, [products, cat, q, mode]);
  const picked = rows.find((r) => r.v.id === sel) ?? null;
  const name = (r: Row) => (r.p.variants.filter((v) => !v.unit_variant_id).length > 1 ? `${r.p.name} · ${r.v.label}` : r.p.name);
  const gstOf = (p: AdminProduct) => p.gst_rate ?? settings?.gst_rate ?? 18;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products ?? []) if (p.status !== "archived") m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [products]);

  const openBulk = may && rows.length ? () => setBulk(true) : undefined;
  const openOne = may && picked ? () => setOne(picked) : undefined;
  useArKeys({ edit: openOne, refresh: () => void load() });

  function excel() {
    const head = ["Code", "Product", "Option", "Group", "Cost price", "Markup %", "Price", "Tax inclusive", "GST %"];
    const esc = (x: string | number) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
    const lines = rows.map((r) => {
      const c = costs.get(r.v.id);
      const m = markup(r.v.price, c);
      return [r.v.sku ?? "", r.p.name, r.v.label, cats.find((x) => x.id === r.p.category_id)?.name ?? "", c ?? "", m == null ? "" : m.toFixed(2), r.v.price, settings?.gst_inclusive ? "Yes" : "No", gstOf(r.p)].map(esc).join(",");
    });
    download(`babajee-price-list-${isoDay(0)}.csv`, [head.join(","), ...lines].join("\n"));
    toast(`Exported ${rows.length} prices`);
  }

  async function setPrices(list: { r: Row; price: number }[]) {
    try {
      for (const { r, price } of list) await api.upsertVariant(r.p.id, { ...r.v, price });
      await load();
      toast(list.length === 1 ? `${name(list[0].r)}: ${money(list[0].price)}` : `${list.length} prices changed`);
    } catch (e) {
      toastError(e);
      await load();
    }
  }

  const cols: ArCol<Row>[] = [
    { k: "code", label: "Code", render: (r) => r.v.sku ?? "", sort: (r) => r.v.sku ?? "" },
    { k: "product", label: "Product", render: name, sort: name },
    { k: "cost", label: "Cost price", right: true, render: (r) => (costs.has(r.v.id) ? money(costs.get(r.v.id)!) : ""), sort: (r) => costs.get(r.v.id) ?? -1 },
    { k: "markup", label: "Markup", right: true, render: (r) => pct(markup(r.v.price, costs.get(r.v.id))), sort: (r) => markup(r.v.price, costs.get(r.v.id)) ?? -1e9 },
    { k: "price", label: "Price", right: true, render: (r) => (r.v.price ? money(r.v.price) : ""), sort: (r) => r.v.price },
    { k: "incl", label: "Tax inclusive", center: true, render: () => <Tick on={!!settings?.gst_inclusive} /> },
    { k: "tax", label: "Taxes", render: (r) => `GST ${gstOf(r.p)}%`, sort: (r) => gstOf(r.p) },
  ];
  // Aronium's price grid menu: Product prices | Copy markup | Delete price, Delete all prices
  const gridMenu = (r: Row | null) =>
    menuOf(
      [{ label: "Product prices", onClick: () => r && setOne(r), disabled: !r || !may }],
      [{ label: "Copy markup", disabled: true }],
      [
        { label: "Delete price", disabled: true },
        { label: "Delete all prices", disabled: true },
      ],
    );
  // and on the price list itself: New, Copy | Edit, Edit prices | Delete | Refresh
  const priceListMenu = menuOf(
    [
      { label: "New price list", key: "Ctrl+N", disabled: true },
      { label: "Copy price list", disabled: true },
    ],
    [
      { label: "Edit", disabled: true },
      { label: "Edit prices", onClick: openBulk, disabled: !openBulk },
    ],
    [{ label: "Delete", key: "Del", disabled: true }],
    [{ label: "Refresh", key: "F5", onClick: () => void load() }],
  );

  return (
    <ArScreen className="ara-pl">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "New price list", disabled: true, title: ONE },
          { icon: "edit", label: "Edit", disabled: true, title: ONE },
          { icon: "del", label: "Delete", disabled: true, title: ONE },
          { icon: "print", label: "Print", disabled: !rows.length, onClick: printList, title: "The price list as shown, as an A4 sheet" },
          { icon: "pdf", label: "Save as PDF", disabled: !rows.length, onClick: printList, title: "Pick “Save as PDF” as the printer" },
          { icon: "excel", label: "Excel", disabled: !rows.length, onClick: excel },
          { icon: "copy", label: "Copy price list", disabled: true, title: ONE },
          { icon: "percent", label: "Edit prices", disabled: !openBulk, onClick: openBulk, title: "Raise or lower prices by a percentage" },
          { icon: "tag", label: "Product prices", disabled: !openOne, onClick: openOne, title: "Set the selected option's price" },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <div className="ara-pl-body">
        <aside className="ara-pl-side">
          <section className="ara-pl-box" onContextMenu={(e) => listMenu.open(e, priceListMenu)}>
            {listMenu.node}
            <h3>Price lists</h3>
            <p>Select product prices or price list to edit</p>
            <button type="button" className="ara-pl-item is-on">
              <ArIcon name="tag" size={16} />
              Products
            </button>
          </section>
          <section className="ara-pl-box ara-pl-groups">
            <h3>Product groups</h3>
            <p>Filter items by product groups</p>
            <div className="arp-tree ara-pl-tree">
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
                      <small>{counts.get(c.id) ?? 0}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </aside>
        <section className="ara-pl-list">
          <div className="arp-search">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={mode === m.id ? "is-on" : ""} aria-pressed={mode === m.id} aria-label={m.label} title={m.label} onClick={() => setMode(m.id)}>
                <ArIcon name={m.icon} size={18} />
              </button>
            ))}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "barcode" ? "Barcode" : mode === "code" ? "Product code" : "Product name"} aria-label="Search products" />
            <ArIcon name="search" size={20} />
            <span className="arp-count">
              Products count: <b>{products ? rows.length : "…"}</b>
            </span>
          </div>
          <ArGrid cols={cols} rows={rows} keyOf={(r) => r.v.id} sel={sel} onSel={setSel} onOpen={(r) => may && setOne(r)} menu={gridMenu} />
        </section>
      </div>

      {one && (
        <PriceForm
          key={one.v.id}
          title={name(one)}
          price={one.v.price}
          cost={costs.get(one.v.id)}
          onCancel={() => setOne(null)}
          onSave={(price) => {
            const r = one;
            setOne(null);
            void setPrices([{ r, price }]);
          }}
        />
      )}

      <Dialog open={bulk} onClose={() => setBulk(false)} wide>
        {bulk && (
          <EditPrices
            rows={rows}
            name={name}
            where={cat ? (cats.find((c) => c.id === cat)?.name ?? "this group") : "all products"}
            onCancel={() => setBulk(false)}
            onApply={(list) => {
              setBulk(false);
              void setPrices(list);
            }}
          />
        )}
      </Dialog>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Price lists">
        <p>{ONE}. Every option of every product is listed with its cost price, markup and selling price.</p>
        <p>Cost price is the average buying price with the GST paid on it, from purchase bills. Markup is how much the price is above that cost.</p>
        <p>Edit prices raises or lowers prices by a percentage, rounded if you like, for the options you pick. Product prices (or a double-click) sets one option&apos;s price.</p>
      </ArHelp>
    </ArScreen>
  );
}

// Product prices: one option's price, with the markup over cost worked out as you type
function PriceForm({ title, price, cost, onCancel, onSave }: { title: string; price: number; cost?: number; onCancel: () => void; onSave: (price: number) => void }) {
  const [v, setV] = useState(price ? String(price) : "");
  const [m, setM] = useState(() => {
    const x = markup(price, cost);
    return x == null ? "" : x.toFixed(2);
  });
  const n = Number(v);
  const ok = v !== "" && n >= 0 && n !== price;
  return (
    <ArPanel open title={title} width="mid" canSave={ok} onClose={onCancel} onSave={() => ok && onSave(Math.round(n * 100) / 100)}>
      <ArField label="Cost" size="short">
        <input className="adm-input is-num" readOnly tabIndex={-1} value={cost != null ? money(cost) : "Not known"} />
      </ArField>
      <ArField label="Markup" size="short" hint="%">
        <input
          className="adm-input is-num"
          type="number"
          step="0.01"
          disabled={cost == null || cost <= 0}
          value={m}
          onChange={(e) => {
            setM(e.target.value);
            if (cost && e.target.value !== "") setV(String(Math.round(cost * (1 + Number(e.target.value) / 100) * 100) / 100));
          }}
        />
      </ArField>
      <ArField label="Sale price" size="short" invalid={v === ""}>
        <input
          className="adm-input is-num"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          autoFocus
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            const x = markup(Number(e.target.value), cost);
            setM(x == null ? "" : x.toFixed(2));
          }}
        />
      </ArField>
    </ArPanel>
  );
}

// Edit prices, Aronium's two-step window: the change (up or down by a
// percentage, and how to round), then which options it applies to
const ROUND = [0, 1, 5, 10, 50, 100];
function EditPrices({ rows, name, where, onCancel, onApply }: { rows: Row[]; name: (r: Row) => string; where: string; onCancel: () => void; onApply: (list: { r: Row; price: number }[]) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [up, setUp] = useState(true);
  const [by, setBy] = useState(0);
  const [higher, setHigher] = useState(true);
  const [to, setTo] = useState(0);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const next = (price: number) => {
    const x = price * (1 + ((up ? 1 : -1) * by) / 100);
    if (!to) return Math.max(0, Math.round(x * 100) / 100);
    return Math.max(0, (higher ? Math.ceil(x / to - 1e-9) : Math.floor(x / to + 1e-9)) * to);
  };
  const priced = rows.filter((r) => r.v.price > 0);
  const chosen = priced.filter((r) => !skip.has(r.v.id) && next(r.v.price) !== r.v.price);
  return (
    <div className="ara-dlg ara-wiz">
      <div className="ara-wiz-title">Edit prices</div>
      {step === 1 ? (
        <>
          <h2>Price change</h2>
          <p className="ara-help">Choose new price options</p>
          <fieldset className="ara-wiz-sec">
            <legend>Price change</legend>
            <div className="ara-wiz-line">
              <label>
                <input type="radio" name="dir" checked={up} onChange={() => setUp(true)} /> Increase
              </label>
              <label>
                <input type="radio" name="dir" checked={!up} onChange={() => setUp(false)} /> Decrease
              </label>
              <ArStepper label="Percent" value={by} min={0} max={up ? 1000 : 100} onChange={setBy} suffix="%" />
            </div>
          </fieldset>
          <fieldset className="ara-wiz-sec">
            <legend>Rounding</legend>
            <b>Rounding option</b>
            <div className="ara-wiz-line">
              <label>
                <input type="radio" name="round" checked={higher} onChange={() => setHigher(true)} /> Higher value
              </label>
              <label>
                <input type="radio" name="round" checked={!higher} onChange={() => setHigher(false)} /> Lower value
              </label>
            </div>
            <b>Round to nearest</b>
            <select className="adm-input ara-wiz-select" value={to} onChange={(e) => setTo(Number(e.target.value))} aria-label="Round to nearest">
              {ROUND.map((r) => (
                <option key={r} value={r}>
                  {r ? `₹${r}` : "No rounding"}
                </option>
              ))}
            </select>
          </fieldset>
          <div className="ara-wiz-btns">
            <button type="button" className="adm-btn" disabled={!by && !to} onClick={() => setStep(2)}>
              Next
            </button>
            <button type="button" className="adm-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Select products</h2>
          <p className="ara-help">
            Prices {up ? "up" : "down"} {by}%{to ? `, rounded to the ${higher ? "next" : "previous"} ₹${to}` : ""}, for {where}. Untick any to leave alone.
          </p>
          <div className="ara-wiz-list">
            <table className="adm-table aro-table">
              <thead>
                <tr>
                  <th className="aro-tick">
                    <input type="checkbox" aria-label="Tick all" checked={!skip.size} onChange={() => setSkip(skip.size ? new Set() : new Set(priced.map((r) => r.v.id)))} />
                  </th>
                  <th>Product</th>
                  <th className="r">Price</th>
                  <th className="r">New price</th>
                </tr>
              </thead>
              <tbody>
                {priced.map((r) => (
                  <tr key={r.v.id}>
                    <td className="aro-tick">
                      <input
                        type="checkbox"
                        aria-label={`Change ${name(r)}`}
                        checked={!skip.has(r.v.id)}
                        onChange={() =>
                          setSkip((s) => {
                            const n = new Set(s);
                            if (n.has(r.v.id)) n.delete(r.v.id);
                            else n.add(r.v.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td>{name(r)}</td>
                    <td className="r">{money(r.v.price)}</td>
                    <td className="r">{money(next(r.v.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!priced.length && <p className="aro-none">No priced options here. {NEEDED}: set one with Product prices first.</p>}
          </div>
          <div className="ara-wiz-btns">
            <button type="button" className="adm-btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="adm-btn pri" disabled={!chosen.length} onClick={() => onApply(chosen.map((r) => ({ r, price: next(r.v.price) })))}>
              Change {chosen.length} price{chosen.length === 1 ? "" : "s"}
            </button>
            <button type="button" className="adm-btn" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
