"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { companyOf, type Company } from "@/components/admin/print/docs";
import { printSheets } from "@/components/admin/print/printing";
import { toast, toastError } from "@/components/admin/Toaster";
import type { SheetDoc, SheetRow } from "@/lib/print-sheet";
import { Dialog, money } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant } from "@/lib/admin-data";
import { download } from "@/lib/orders-csv";
import { errText, getPurchases, getSettings, type Purchase } from "@/lib/orders-db";
import { correctStock, setCounting as setCountingDb } from "@/lib/stock-in/db";
import { Confirm } from "@/components/admin/kit";
import BuyingPrice from "@/components/admin/stock/BuyingPrice";
import ProductStock from "@/components/admin/stock/ProductStock";
import { useRouter } from "next/navigation";
import { ArGrid, ArIcon, ArScreen, ArSwitch, ArToolbar, useArKeys, useArMenu, type ArCol, type ArMenuItem } from "./aronium-kit";
import "./aronium-screens-b.css";

// Stock in the Aronium-style design, as Aronium's Management • Stock: a
// toolbar, four view switches (negative, non zero, zero, active products)
// with the three coloured counts, product groups on the left, and every
// counted option with its quantity, buying cost and value at cost and at the
// selling price, totalled at the foot. Quick inventory sets the counted
// quantity of the selected option. Babajee's extras: Counted / Not counted /
// Everything (an option only limits sales once it is counted), the Low at
// column, Start or Stop counting, Buying price and Add or adjust (the same
// forms as Inventory > Stock), and Stock in and Suppliers. Print and Save as
// PDF print the list as shown (an A4 STOCK sheet with the filters and the
// totals); Inventory count report prints a count sheet by product group,
// with blank Counted and Difference columns to fill in by hand.
type Mode = "all" | "barcode" | "code" | "name";
type Row = { p: AdminProduct; v: AdminVariant };
const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "all", icon: "star", label: "Search everything" },
  { id: "barcode", icon: "barcode", label: "Search by barcode" },
  { id: "code", icon: "hash", label: "Search by code (SKU)" },
  { id: "name", icon: "tag", label: "Search by name" },
];
const cell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export default function AroniumStock() {
  const api = adminApi();
  const router = useRouter();
  const tree = useArMenu();
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [costs, setCosts] = useState<Map<string, Purchase>>(new Map());
  const [shopRate, setShopRate] = useState(18);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  const [neg, setNeg] = useState(false);
  const [nonZero, setNonZero] = useState(false);
  const [zero, setZero] = useState(false);
  const [active, setActive] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [counting, setCounting] = useState<Row | null>(null);
  const [show, setShow] = useState<"counted" | "uncounted" | "all">("counted");
  const [shopLow, setShopLow] = useState(3);
  const [stopping, setStopping] = useState<Row | null>(null);
  const [pricing, setPricing] = useState<Row | null>(null);
  const [managing, setManaging] = useState<AdminProduct | null>(null);
  const [busyId, setBusyId] = useState("");
  const [company, setCompany] = useState<Company | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api.listProducts(), api.listCategories()]).then(
        async ([p, c]) => {
          setProducts(p);
          setCats(c);
          setErr("");
          getSettings().then(
            (s) => {
              setShopRate(s.gst_rate);
              setShopLow(s.low_stock_at);
              setCompany(companyOf(s));
            },
            () => {},
          );
          // buying costs, read in parts (a long list doesn't fit one request)
          const ids = p.flatMap((x) => x.variants.filter((v) => !v.unit_variant_id).map((v) => v.id));
          const all = new Map<string, Purchase>();
          for (let i = 0; i < ids.length; i += 150) {
            try {
              for (const [k, v] of await getPurchases(ids.slice(i, i + 150))) all.set(k, v);
            } catch {
              break;
            }
          }
          setCosts(all);
        },
        (e) => setErr(errText(e)),
      ),
    [api],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // one row per loose option (boxes count through their pieces)
  const all: Row[] = useMemo(() => (products ?? []).flatMap((p) => p.variants.filter((v) => !v.unit_variant_id).map((v) => ({ p, v }))), [products]);
  const counted = all.filter((r) => r.v.track_stock);
  const rows = show === "counted" ? counted : show === "uncounted" ? all.filter((r) => !r.v.track_stock) : all;
  const counts = {
    neg: counted.filter((r) => r.v.stock_qty < 0).length,
    zero: counted.filter((r) => r.v.stock_qty === 0).length,
    pos: counted.filter((r) => r.v.stock_qty > 0).length,
  };
  const lowAt = (r: Row) => r.p.low_stock_at ?? shopLow;
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (cat && r.p.category_id !== cat) return false;
    if (neg && !(r.v.stock_qty < 0)) return false;
    if (nonZero && r.v.stock_qty === 0) return false;
    if (zero && r.v.stock_qty !== 0) return false;
    if (active && r.p.status !== "published") return false;
    if (!s) return true;
    if (mode === "barcode") return (r.v.barcode ?? "").toLowerCase().includes(s);
    if (mode === "code") return (r.v.sku ?? "").toLowerCase().includes(s);
    const name = `${r.p.name} ${r.v.label}`.toLowerCase();
    if (mode === "name") return name.includes(s);
    return `${name} ${r.v.sku ?? ""} ${r.v.barcode ?? ""}`.toLowerCase().includes(s);
  });

  const rate = (r: Row) => (r.p.gst_rate ?? shopRate) / 100;
  const costEx = (r: Row) => costs.get(r.v.id)?.purchase ?? null;
  const costIn = (r: Row) => costs.get(r.v.id)?.cost ?? null;
  const qty = (r: Row) => (r.v.track_stock ? Math.max(0, r.v.stock_qty) : 0);
  // selling prices include GST
  const valueIn = (r: Row) => qty(r) * r.v.price;
  const valueEx = (r: Row) => valueIn(r) / (1 + rate(r));
  const name = (r: Row) => (r.p.variants.filter((v) => !v.unit_variant_id).length > 1 ? `${r.p.name} · ${r.v.label}` : r.p.name);
  const sum = (f: (r: Row) => number | null) => shown.reduce((a, r) => a + (f(r) ?? 0), 0);
  const totals = {
    cost: sum((r) => (costEx(r) == null ? 0 : qty(r) * costEx(r)!)),
    costIn: sum((r) => (costIn(r) == null ? 0 : qty(r) * costIn(r)!)),
    sale: sum(valueEx),
    saleIn: sum(valueIn),
  };
  const picked = shown.find((r) => r.v.id === sel) ?? null;
  const m = (n: number | null) => (n == null ? "" : money(Math.round(n * 100) / 100));

  const cols: ArCol<Row>[] = [
    { k: "code", label: "Code", render: (r) => r.v.sku ?? "", sort: (r) => r.v.sku ?? "" },
    { k: "name", label: "Name", render: name, sort: name },
    { k: "qty", label: "Quantity", right: true, render: (r) => (r.v.track_stock ? <span className={r.v.stock_qty < 0 ? "ars-neg" : r.v.stock_qty === 0 ? "ars-zero" : r.v.stock_qty <= lowAt(r) ? "ars-low" : ""}>{r.v.stock_qty}</span> : <span className="adm-muted" title="Not counted">—</span>), sort: (r) => (r.v.track_stock ? r.v.stock_qty : -1e9) },
    { k: "uom", label: "Unit of measure", render: () => "pcs" },
    { k: "low", label: "Low at", right: true, render: (r) => (r.v.track_stock ? lowAt(r) : ""), sort: lowAt },
    { k: "cp", label: "Cost price", right: true, render: (r) => m(costEx(r)), sort: (r) => costEx(r) ?? -1 },
    { k: "cost", label: "Cost", right: true, render: (r) => m(costEx(r) == null ? null : qty(r) * costEx(r)!), sort: (r) => qty(r) * (costEx(r) ?? 0) },
    { k: "costin", label: "Cost incl. tax", right: true, render: (r) => m(costIn(r) == null ? null : qty(r) * costIn(r)!), sort: (r) => qty(r) * (costIn(r) ?? 0) },
    { k: "value", label: "Value", right: true, render: (r) => m(valueEx(r)), sort: valueEx },
    { k: "valuein", label: "Value incl. tax", right: true, render: (r) => m(valueIn(r)), sort: valueIn },
  ];

  function excel() {
    const head = ["Code", "Name", "Quantity", "Unit of measure", "Cost price", "Cost", "Cost incl. tax", "Value", "Value incl. tax"];
    const lines = shown.map((r) => [r.v.sku ?? "", name(r), r.v.stock_qty, "pcs", costEx(r) ?? "", costEx(r) == null ? "" : (qty(r) * costEx(r)!).toFixed(2), costIn(r) == null ? "" : (qty(r) * costIn(r)!).toFixed(2), valueEx(r).toFixed(2), valueIn(r).toFixed(2)]);
    download(`babajee-stock.csv`, "﻿" + [head, ...lines].map((l) => l.map(cell).join(",")).join("\r\n"));
  }
  // what's filtered, for the printed sheet's details
  const filters = (): [string, string][] => [
    ["Product group:", cats.find((c) => c.id === cat)?.name ?? "All"],
    ["Showing:", show === "counted" ? "Counted" : show === "uncounted" ? "Not counted" : "Everything"],
    ["Quantity:", [neg && "Negative", nonZero && "Non zero", zero && "Zero"].filter(Boolean).join(", ") || "All"],
    ["Products:", active ? "Active only" : "All"],
    ...(s ? ([["Search:", q.trim()]] as [string, string][]) : []),
  ];
  const company3 = (): [string, string][] => [
    ["Company:", company?.name ?? ""],
    ["Address:", company?.address ?? ""],
  ];
  function stockDoc(): SheetDoc {
    return {
      title: "Stock",
      meta: filters(),
      metaRight: company3(),
      cols: [{ label: "Code" }, { label: "Name" }, { label: "Quantity", align: "r" }, { label: "UOM", align: "c" }, { label: "Cost price", align: "r" }, { label: "Cost", align: "r" }, { label: "Cost incl. tax", align: "r" }, { label: "Value", align: "r" }, { label: "Value incl. tax", align: "r" }],
      rows: shown.map((r) => ({
        cells: [r.v.sku ?? "", name(r), r.v.track_stock ? String(r.v.stock_qty) : "Not counted", "pcs", m(costEx(r)), m(costEx(r) == null ? null : qty(r) * costEx(r)!), m(costIn(r) == null ? null : qty(r) * costIn(r)!), m(valueEx(r)), m(valueIn(r))],
      })),
      totals: [null, null, String(shown.reduce((a, r) => a + qty(r), 0)), null, null, m(totals.cost), m(totals.costIn), m(totals.sale), m(totals.saleIn)],
      file: "babajee-stock",
    };
  }
  // the count sheet: by product group, the system's number and blanks to fill
  function countDoc(): SheetDoc {
    const groups = new Map<string, Row[]>();
    for (const r of shown) {
      const g = cats.find((c) => c.id === r.p.category_id)?.name ?? "No group";
      groups.set(g, [...(groups.get(g) ?? []), r]);
    }
    const rows: SheetRow[] = [];
    for (const [g, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      rows.push({ group: g });
      for (const r of list.sort((a, b) => name(a).localeCompare(name(b)))) rows.push({ cells: [r.v.sku ?? "", r.p.name, r.v.label === "Default" ? "" : r.v.label, "pcs", r.v.track_stock ? String(r.v.stock_qty) : "–", "", ""] });
    }
    return {
      title: "Inventory count",
      meta: [...filters(), ["Counted by:", ""], ["Date:", ""]],
      metaRight: company3(),
      cols: [{ label: "Code" }, { label: "Product" }, { label: "Option" }, { label: "UOM", align: "c" }, { label: "In system", align: "r" }, { label: "Counted", align: "r" }, { label: "Difference", align: "r" }],
      rows,
      notes: ["Write the count in Counted, then the difference (Counted less In system). Enter it with Quick inventory or Add or adjust."],
      file: "babajee-inventory-count",
    };
  }
  const printStock = () => printSheets([stockDoc()]);
  const quick = () => picked?.v.track_stock && setCounting(picked);
  async function count(r: Row, on: boolean, note = "") {
    setBusyId(r.v.id);
    try {
      await setCountingDb(r.v.id, on, note);
      // put back with one click (the history keeps both lines)
      toast(on ? `Counting ${name(r)}` : "Stopped counting", { undo: () => void count(r, !on, "Undone") });
      await load();
    } catch (e) {
      toastError(errText(e));
    }
    setBusyId("");
    setStopping(null);
  }
  const toggleCount = (r: Row | null) => {
    if (!r || busyId) return;
    if (r.v.track_stock) setStopping(r);
    else void count(r, true);
  };
  const history = () => picked && router.push("/admin/inventory/history");
  useArKeys({ refresh: () => void load(), edit: quick });
  // Aronium: Print, Save as PDF | Stock history | Quick inventory, Recalculate | Refresh
  const menu = (r: Row | null): ArMenuItem[] => [
    { label: "Print", key: "Ctrl+P", disabled: !shown.length, onClick: printStock },
    { label: "Save as PDF", disabled: !shown.length, onClick: printStock },
    "-",
    { label: "Stock history", disabled: !r, onClick: () => router.push("/admin/inventory/history") },
    "-",
    { label: "Quick inventory", disabled: !r?.v.track_stock, onClick: () => r && setCounting(r) },
    { label: "Recalculate stock quantities", onClick: () => void load() },
    "-",
    { label: r?.v.track_stock === false ? "Start counting" : "Stop counting", disabled: !r || !!busyId, onClick: () => toggleCount(r) },
    { label: "Buying price", disabled: !r, onClick: () => r && setPricing(r) },
    { label: "Add or adjust", disabled: !r, onClick: () => r && setManaging(r.p) },
    "-",
    { label: "Refresh", key: "F5", onClick: () => void load() },
  ];

  return (
    <ArScreen className="ars-stock">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "history", label: "Stock history", disabled: !picked, onClick: history },
          { icon: "print", label: "Print", disabled: !shown.length, onClick: printStock, title: "The list as shown, as an A4 sheet" },
          { icon: "pdf", label: "Save as PDF", disabled: !shown.length, onClick: printStock, title: "Pick “Save as PDF” as the printer" },
          { icon: "excel", label: "Excel", disabled: !shown.length, onClick: excel },
          { icon: "list", label: "Inventory count report", disabled: !shown.length, onClick: () => printSheets([countDoc()]), title: "A count sheet by product group, with blanks to fill in" },
          { icon: "edit", label: "Quick inventory", disabled: !picked?.v.track_stock, onClick: quick, title: "Set the counted quantity of the selected option" },
          { icon: "help", label: "Help", href: "/admin/inventory/history", title: "Every stock change" },
          { icon: "import", label: "Stock in", href: "/admin/inventory/purchases/bill", title: "Enter a supplier bill" },
          { icon: "box", label: "Suppliers", href: "/admin/inventory/suppliers" },
          { icon: "paid", label: picked && !picked.v.track_stock ? "Start counting" : "Stop counting", disabled: !picked || !!busyId, onClick: () => toggleCount(picked) },
          { icon: "tag", label: "Buying price", disabled: !picked, onClick: () => picked && setPricing(picked) },
          { icon: "add", label: "Add or adjust", disabled: !picked, onClick: () => picked && setManaging(picked.p) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <div className="ars-body">
        <nav className="arp-tree" aria-label="Product groups" onContextMenu={(e) => tree.open(e, menu(picked))}>
          {tree.node}
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
        </nav>
        <section className="arp-list">
          <div className="ars-switches">
            <ArSwitch on={neg} onChange={setNeg} label="Negative quantity" />
            <ArSwitch on={nonZero} onChange={setNonZero} label="Non zero quantity" />
            <ArSwitch on={zero} onChange={setZero} label="Zero quantity" />
            <ArSwitch on={active} onChange={setActive} label="Active products" />
            <span className="ars-seg" role="radiogroup" aria-label="Show">
              {(
                [
                  ["counted", `Counted (${counted.length})`],
                  ["uncounted", `Not counted (${all.length - counted.length})`],
                  ["all", `Everything (${all.length})`],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={show === id} className={show === id ? "is-on" : ""} onClick={() => setShow(id)}>
                  {label}
                </button>
              ))}
            </span>
            <span className="ars-counts">
              <b className="is-neg" title="Below zero">{counts.neg}</b>
              <b className="is-zero" title="None left">{counts.zero}</b>
              <b className="is-pos" title="In stock">{counts.pos}</b>
            </span>
          </div>
          <div className="arp-search">
            {MODES.map((x) => (
              <button key={x.id} type="button" className={mode === x.id ? "is-on" : ""} aria-pressed={mode === x.id} aria-label={x.label} title={x.label} onClick={() => setMode(x.id)}>
                <ArIcon name={x.icon} size={18} />
              </button>
            ))}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name" aria-label="Search stock" />
            <ArIcon name="search" size={20} />
            <span className="arp-count">
              Products count: <b>{products ? shown.length : "…"}</b>
            </span>
          </div>
          <ArGrid
            cols={cols}
            rows={shown}
            keyOf={(r) => r.v.id}
            sel={sel}
            onSel={setSel}
            onOpen={(r) => (r.v.track_stock ? setCounting(r) : setManaging(r.p))}
            menu={menu}
          />
          <footer className="ars-foot">
            <div>
              <h3>Cost price</h3>
              <p>
                <span>Total cost:</span> <b>{m(totals.cost)}</b>
              </p>
              <p>
                <span>Total cost inc. tax:</span> <b>{m(totals.costIn)}</b>
              </p>
            </div>
            <div>
              <h3>Sale price</h3>
              <p>
                <span>Total:</span> <b>{m(totals.sale)}</b>
              </p>
              <p>
                <span>Total inc. tax:</span> <b>{m(totals.saleIn)}</b>
              </p>
            </div>
          </footer>
        </section>
      </div>

      {show === "counted" && products && !counted.length && <p className="arf-note ars-pad">No option counts stock yet. Switch counting on for an option under Not counted, or post a purchase bill.</p>}
      <Dialog open={!!managing} onClose={() => setManaging(null)} wide>
        {managing && (
          <div className="inv-manage">
            <div className="prd-card-head">
              <h2>{managing.name}</h2>
              <button type="button" className="adm-btn" onClick={() => setManaging(null)}>
                Done
              </button>
            </div>
            <ProductStock product={managing} rules={{ rate: managing.gst_rate ?? shopRate }} onChanged={() => void load()} />
          </div>
        )}
      </Dialog>
      <BuyingPrice
        key={pricing?.v.id ?? "none"}
        variant={pricing?.v ?? null}
        have={pricing ? costs.get(pricing.v.id) : undefined}
        rate={pricing?.p.gst_rate ?? shopRate}
        onClose={() => setPricing(null)}
        onSaved={async () => {
          setPricing(null);
          await load();
          toast("Buying price saved");
        }}
      />
      <Confirm
        open={!!stopping}
        title={`Stop counting ${stopping ? name(stopping) : ""}?`}
        body="Its number is kept, but checkout stops limiting sales to it and it leaves the low-stock alerts. You can switch counting back on any time."
        confirmLabel="Stop counting"
        danger={false}
        onConfirm={() => stopping && void count(stopping, false)}
        onCancel={() => setStopping(null)}
      />
      <Dialog open={counting !== null} onClose={() => setCounting(null)}>
        {counting && (
          <QuickInventory
            row={counting}
            label={name(counting)}
            onCancel={() => setCounting(null)}
            onDone={() => {
              setCounting(null);
              void load();
            }}
          />
        )}
      </Dialog>
    </ArScreen>
  );
}

function QuickInventory({ row, label, onCancel, onDone }: { row: Row; label: string; onCancel: () => void; onDone: () => void }) {
  const [count, setCount] = useState(String(row.v.stock_qty));
  const [note, setNote] = useState("Counted on the shelf");
  const [busy, setBusy] = useState(false);
  return (
    <form
      method="dialog"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(count);
        if (!Number.isInteger(n) || n < 0) return;
        setBusy(true);
        try {
          await correctStock(row.v.id, n, note.trim() || "Quick inventory");
          toast(`${label}: stock set to ${n}`);
          onDone();
        } catch (x) {
          toastError(x);
          setBusy(false);
        }
      }}
    >
      <h2>Quick inventory</h2>
      <p className="adm-muted" style={{ margin: 0 }}>
        {label} · now {row.v.stock_qty} pcs
      </p>
      <label className="adm-label">
        Counted quantity
        <input className="adm-input" type="number" min={0} step={1} inputMode="numeric" autoFocus value={count} onChange={(e) => setCount(e.target.value)} />
      </label>
      <label className="adm-label">
        Note
        <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="adm-btn pri" disabled={busy || count === "" || Number(count) < 0}>
          {busy ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}
