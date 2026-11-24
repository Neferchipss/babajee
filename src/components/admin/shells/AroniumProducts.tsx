"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { mainPrice, needsOf } from "@/components/admin/ProductEditor";
import AroniumProductEditor, { blankProduct } from "./AroniumProductEditor";
import ProductTable, { type NewRow } from "@/components/admin/ProductTable";
import { printGrid } from "@/components/admin/print/printing";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money, SortTh, useSort } from "@/components/admin/ui";
import { adminApi } from "@/lib/admin-api";
import { ProductOrdered, type AdminCategory, type AdminProduct, type ProductStatus } from "@/lib/admin-data";
import { isoDay } from "@/lib/dates";
import { download } from "@/lib/orders-csv";
import { errText, getSettings, unitsSold } from "@/lib/orders-db";
import { slugify } from "@/lib/slug";
import { can, useStaff } from "@/lib/staff";
import { ArIcon, ArToolbar, menuOf, useArKeys, useArMenu, type ArMenuItem } from "./aronium-kit";
import "@/components/admin/admin-products.css";
import "./aronium-screens-a.css";

// Products in the Aronium-style design, laid out as Aronium's Management •
// Products: its toolbar, the product groups (our categories) as a tree on the
// left, and on the right a search row with its four modes (everything,
// barcode, code, name) over a grid of products. Click a row to select it;
// Ctrl-click and Shift-click (or the tick column) select several, as
// Aronium's grids do. Double-click, Enter or Edit product slides the
// product's editor in from the right. Babajee's own, kept from the ordinary
// page: the Show box in the search row (no photo, no price, drafts, archived,
// low or out of stock), Make active / Make draft / Archive / Delete on a
// selection, and Edit in table, the spreadsheet view where names, prices
// and stock are typed straight in.
type Mode = "all" | "barcode" | "code" | "name";
const MODES: { id: Mode; icon: string; label: string }[] = [
  { id: "all", icon: "star", label: "Search everything" },
  { id: "barcode", icon: "barcode", label: "Search by barcode" },
  { id: "code", icon: "hash", label: "Search by code (SKU)" },
  { id: "name", icon: "tag", label: "Search by name" },
];
type Need = "all" | "photo" | "price" | "hidden" | "archived" | "low" | "out";
const NEEDS: Need[] = ["all", "photo", "price", "hidden", "archived", "low", "out"];
const NEED_LABEL: Record<Need, string> = { all: "Everything", photo: "No photo", price: "No price", hidden: "Drafts", archived: "Archived", low: "Low stock", out: "Out of stock" };
const asNeed = (x: string | null | undefined): Need => (NEEDS.includes(x as Need) ? (x as Need) : "all");
const TABLE_KEY = "bj-ar-ptable";

const loose = (p: AdminProduct) => p.variants.filter((v) => !v.unit_variant_id);
// the grid's Stock column: what the counted options hold between them
const stockSum = (p: AdminProduct) => {
  const t = loose(p).filter((v) => v.track_stock);
  return t.length ? t.reduce((s, v) => s + v.stock_qty, 0) : null;
};
// low and out, as the ordinary page reckons them: counted, visible loose
// options at or under the product's low mark (or the shop's), or at none
const stockOf = (p: AdminProduct, shopLowAt: number) => {
  const t = p.variants.filter((v) => v.track_stock && v.is_visible && !v.unit_variant_id);
  const mark = p.low_stock_at ?? shopLowAt;
  return { out: t.length > 0 && t.some((v) => v.stock_qty <= 0), low: t.some((v) => v.stock_qty > 0 && v.stock_qty <= mark) };
};

export default function AroniumProducts() {
  const params = useSearchParams();
  const router = useRouter();
  const api = adminApi();
  const mayDelete = can(useStaff().me?.role ?? null, "delete");
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [rows, setRows] = useState<AdminProduct[] | null>(null);
  const [sold, setSold] = useState<Map<string, number> | null>(null);
  const [lowAt, setLowAt] = useState(3);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState(params.get("category") ?? "");
  const [need, setNeed] = useState<Need>(asNeed(params.get("need")));
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  // Print / Save as PDF: the list as shown, with its group, filter and search
  const printList = () =>
    printGrid("Products", [
      ["Product group:", cats.find((c) => c.id === cat)?.name ?? "All"],
      ["Show:", NEED_LABEL[need]],
      ...(q.trim() ? ([["Search:", q.trim()]] as [string, string][]) : []),
    ]);
  // the selection: the row last clicked (the editor's), and every selected row
  const [sel, setSel] = useState<string | null>(params.get("product"));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(params.get("product") ? [params.get("product")!] : []));
  const [openId, setOpenId] = useState<string | null>(params.get("product"));
  const [table, setTable] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(TABLE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminProduct[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([api.listCategories(), api.listProducts(), getSettings().catch(() => null)]).then(
      ([c, p, s]) => {
        setCats(c);
        setRows(p);
        if (s) setLowAt(s.low_stock_at);
        setErr("");
        unitsSold().then(setSold, () => setSold(new Map()));
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the menu's Catalogue pages (Drafts, Archived, ...) while already here: switch in place
  useEffect(() => {
    const go = (e: Event) => setNeed(asNeed((e as CustomEvent<{ need: string }>).detail.need));
    window.addEventListener("adm-nav", go);
    return () => window.removeEventListener("adm-nav", go);
  }, []);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    for (const [k, v] of [
      ["category", cat],
      ["need", need === "all" ? "" : need],
      ["product", openId ?? ""],
    ] as const) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    window.history.replaceState(null, "", `${window.location.pathname}${u.size ? `?${u}` : ""}`);
  }, [cat, need, openId]);
  const pickTable = (on: boolean) => {
    setTable(on);
    try {
      localStorage.setItem(TABLE_KEY, on ? "1" : "0");
    } catch {}
  };

  // archived products stay out of everything but their own filter (as the ordinary page)
  const inCatAll = useMemo(() => (rows ?? []).filter((p) => !cat || p.category_id === cat), [rows, cat]);
  const archived = useMemo(() => inCatAll.filter((p) => p.status === "archived"), [inCatAll]);
  const inCat = useMemo(() => (need === "archived" ? archived : inCatAll.filter((p) => p.status !== "archived")), [inCatAll, archived, need]);
  const counts = useMemo(() => {
    const c: Record<Need, number> = { all: 0, photo: 0, price: 0, hidden: 0, archived: archived.length, low: 0, out: 0 };
    for (const p of inCatAll) {
      if (p.status === "archived") continue;
      c.all++;
      const n = needsOf(p);
      const s = stockOf(p, lowAt);
      if (n.photo) c.photo++;
      if (n.price) c.price++;
      if (n.hidden) c.hidden++;
      if (s.low) c.low++;
      if (s.out) c.out++;
    }
    return c;
  }, [inCatAll, archived, lowAt]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inCat.filter((p) => {
      if (need === "photo" || need === "price" || need === "hidden") {
        if (!needsOf(p)[need]) return false;
      } else if (need === "low" || need === "out") {
        if (!stockOf(p, lowAt)[need]) return false;
      }
      if (!s) return true;
      const codes = loose(p).map((v) => v.sku ?? "").join(" ").toLowerCase();
      const bars = loose(p).map((v) => v.barcode ?? "").join(" ").toLowerCase();
      if (mode === "barcode") return bars.includes(s);
      if (mode === "code") return codes.includes(s);
      if (mode === "name") return p.name.toLowerCase().includes(s);
      return `${p.name} ${p.brand} ${p.product_type} ${codes} ${bars} ${p.tags.join(" ")}`.toLowerCase().includes(s);
    });
  }, [inCat, need, q, mode, lowAt]);

  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? "";
  const { sorted, sort, toggle: sortBy } = useSort(shown, {
    code: { get: (p) => loose(p)[0]?.sku ?? "", text: true },
    name: { get: (p) => p.name, text: true },
    group: { get: (p) => catName(p.category_id), text: true },
    price: { get: (p) => mainPrice(p) },
    stock: { get: (p) => stockSum(p) ?? -1 },
  });

  const one = rows?.find((p) => p.id === sel) ?? null;
  const chosen = sorted.filter((p) => picked.has(p.id));
  const open = rows?.find((p) => p.id === openId);
  const at = open ? sorted.findIndex((p) => p.id === open.id) : -1;
  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows ?? []) if (p.status !== "archived") m.set(p.category_id, (m.get(p.category_id) ?? 0) + 1);
    return m;
  }, [rows]);

  // Aronium's grid selection: a click selects one row, Ctrl-click adds or
  // takes one away, Shift-click selects the run from the last clicked row
  function clickRow(e: React.MouseEvent, id: string) {
    if (e.shiftKey && sel) {
      const a = sorted.findIndex((p) => p.id === sel);
      const b = sorted.findIndex((p) => p.id === id);
      if (a >= 0 && b >= 0) {
        const run = sorted.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.id);
        setPicked(new Set(e.ctrlKey || e.metaKey ? [...picked, ...run] : run));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      const n = new Set(picked);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      setPicked(n);
      setSel(id);
      return;
    }
    setSel(id);
    setPicked(new Set([id]));
  }
  const tickRow = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allTicked = sorted.length > 0 && sorted.every((p) => picked.has(p.id));

  // the selected products' status, together (as the ordinary page's Select)
  async function bulk(status: ProductStatus) {
    const list = chosen.length ? chosen : one ? [one] : [];
    if (!list.length) return;
    setBusy(true);
    try {
      for (const p of list) await api.setProductStatus(p, status);
      toast(`${list.length} product${list.length === 1 ? "" : "s"} ${status === "published" ? "made active" : status === "draft" ? "made drafts" : "archived"}`);
      await load();
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  // delete these products; ordered ones can't go and are reported instead
  async function deleteNow(list: AdminProduct[]) {
    setBusy(true);
    const gone: string[] = [];
    const kept: string[] = [];
    for (const p of list) {
      try {
        await api.deleteProduct(p);
        gone.push(p.id);
      } catch (e) {
        if (e instanceof ProductOrdered) kept.push(p.name);
        else {
          toastError(e);
          break;
        }
      }
    }
    setRows((rs) => (rs ?? []).filter((r) => !gone.includes(r.id)));
    setPicked((s) => new Set([...s].filter((id) => !gone.includes(id))));
    if (sel && gone.includes(sel)) setSel(null);
    if (openId && gone.includes(openId)) setOpenId(null);
    if (gone.length) toast(gone.length === 1 ? `${list.find((p) => p.id === gone[0])!.name} deleted` : `${gone.length} products deleted`);
    if (kept.length) toast(kept.length === 1 ? `${kept[0]} has been ordered, so it stays. Archive it instead.` : `${kept.length} have been ordered, so they stay. Archive them instead.`, { tone: "info" });
    setBusy(false);
    setDeleting(null);
  }
  const askDelete = () => {
    const list = chosen.length ? chosen : one ? [one] : [];
    if (mayDelete && list.length) setDeleting(list);
  };

  // Export: the products in view, one row per option, for a spreadsheet
  function exportCsv() {
    const esc = (x: string | number) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
    const head = ["Code", "Name", "Option", "Group", "Barcode", "Price", "GST %", "Stock", "Status"];
    const lines = sorted.flatMap((p) => loose(p).map((v) => [v.sku ?? "", p.name, v.label, catName(p.category_id), v.barcode ?? "", v.price, p.gst_rate ?? "", v.track_stock ? v.stock_qty : "", p.status].map(esc).join(",")));
    download(`babajee-products-${isoDay(0)}.csv`, [head.join(","), ...lines].join("\n"));
    toast(`Exported ${sorted.length} products`);
  }

  // a product made on the table's empty row, with what was typed into it (as the ordinary page)
  async function tableAdd(d: NewRow) {
    let slug = slugify(d.name);
    for (let n = 2; (rows ?? []).some((r) => r.slug === slug); n++) slug = `${slugify(d.name)}-${n}`;
    const id = await api.createProduct({ category_id: d.categoryId, slug, name: d.name, description: "" });
    const made = await api.getProduct(id);
    const v = made?.variants[0];
    await Promise.all([
      d.brand || !d.visible ? api.updateProduct(id, { brand: d.brand, ...(d.visible ? {} : { status: "draft" as const }) }) : null,
      v && (d.price || !d.visible) ? api.upsertVariant(id, { id: v.id, price: d.price, is_visible: d.visible }) : null,
    ]);
    const fresh = await api.getProduct(id);
    if (fresh) setRows((rs) => [fresh, ...(rs ?? [])]);
    setNeed("all");
    setQ("");
    toast(`${d.name} added${d.visible ? "" : ", hidden from the shop"}`);
  }
  // Aronium prefills a new product's code with the next number
  const nextCode = String(1 + Math.max(0, ...(rows ?? []).flatMap((r) => r.variants.map((v) => (/^\d{1,9}$/.test(v.sku ?? "") ? Number(v.sku) : 0)))));
  const replace = (p: AdminProduct) => setRows((rs) => (rs ?? []).map((r) => (r.id === p.id ? p : r)));

  // right-click, Aronium's menus: on a group, the group's; on the grid, the product list's
  const ctx = useArMenu();
  const groupMenu = (id: string): ArMenuItem[] =>
    menuOf(
      [
        { label: "New group", onClick: () => router.push("/admin/products/categories") },
        { label: "Edit group", disabled: !id, onClick: () => router.push(`/admin/products/categories?id=${id}`) },
      ],
      [{ label: "Delete group", disabled: !id, onClick: () => router.push(`/admin/products/categories?id=${id}`) }],
      [{ label: "Refresh", key: "F5", onClick: () => void load() }],
    );
  const listMenu = (p: AdminProduct | null): ArMenuItem[] => {
    const n = p ? Math.max(chosen.length, 1) : 0;
    const many = n > 1 ? ` ${n}` : "";
    return menuOf(
      [
        { label: "New product", key: "Ctrl+N", onClick: () => setAdding(true) },
        { label: "New group", onClick: () => router.push("/admin/products/categories") },
      ],
      [{ label: "Edit", disabled: !p || n > 1, onClick: () => p && setOpenId(p.id) }],
      [{ label: "Copy", disabled: true }],
      [
        { label: "Import", onClick: () => router.push("/admin/products/import") },
        { label: "Export", onClick: exportCsv, disabled: !sorted.length },
      ],
      [
        { label: "Print", key: "Ctrl+P", onClick: printList },
        { label: "Save as PDF", onClick: printList },
      ],
      // Babajee's: the selection's status, together
      [
        { label: `Make active${many}`, disabled: !p || busy, onClick: () => void bulk("published") },
        { label: `Make draft${many}`, disabled: !p || busy, onClick: () => void bulk("draft") },
        { label: `Archive${many}`, disabled: !p || busy, onClick: () => void bulk("archived") },
      ],
      mayDelete ? [{ label: `Delete${many}`, key: "Del", disabled: !p || busy, onClick: askDelete }] : [],
      [{ label: "Refresh", key: "F5", onClick: () => void load() }],
    );
  };
  useArKeys({ add: () => setAdding(true), refresh: () => void load(), del: askDelete, edit: () => one && setOpenId(one.id) });
  const nSel = chosen.length || (one ? 1 : 0);
  const sOf = nSel > 1 ? ` (${nSel})` : "";

  return (
    <div className="arp">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "folderAdd", label: "New group", href: "/admin/products/categories" },
          { icon: "folderEdit", label: "Edit group", disabled: !cat, href: cat ? `/admin/products/categories?id=${cat}` : undefined },
          { icon: "del", label: "Delete group", disabled: !cat, href: cat ? `/admin/products/categories?id=${cat}` : undefined, title: "Groups are deleted from their own page" },
          { icon: "add", label: "New product", onClick: () => setAdding(true) },
          { icon: "edit", label: "Edit product", disabled: !one, onClick: () => one && setOpenId(one.id) },
          mayDelete && { icon: "del", label: `Delete product${sOf}`, disabled: !nSel || busy, onClick: askDelete },
          { icon: "print", label: "Print", onClick: printList, title: "The list as shown, as an A4 sheet" },
          { icon: "pdf", label: "Save as PDF", onClick: printList, title: "Pick “Save as PDF” as the printer" },
          { icon: "hash", label: "Price tags", disabled: true, title: "Babajee sells online: no shelf price tags" },
          { icon: "merge", label: "Merge", disabled: true, title: "Not in Babajee" },
          { icon: "sort", label: "Sorting", href: "/admin/products/collections", title: "The shop's order is set in Collections" },
          { icon: "avg", label: "Mov. avg. price", href: "/admin/inventory/stock", title: "Average buying prices are kept on Stock" },
          { icon: "import", label: "Import", href: "/admin/products/import" },
          { icon: "export", label: "Export", disabled: !sorted.length, onClick: exportCsv },
          // Babajee's own
          { icon: "paid", label: `Make active${sOf}`, disabled: !nSel || busy, onClick: () => void bulk("published") },
          { icon: "edit", label: `Make draft${sOf}`, disabled: !nSel || busy, onClick: () => void bulk("draft") },
          { icon: "box", label: `Archive${sOf}`, disabled: !nSel || busy, onClick: () => void bulk("archived") },
          { icon: "open", label: "Full page", disabled: !one, onClick: () => one && router.push(`/admin/products/edit?id=${one.id}`), title: "Open the product on its own page" },
          { icon: "list", label: table ? "Back to list" : "Edit in table", onClick: () => pickTable(!table), title: "Type names, prices and stock straight into a table" },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}

      <div className="arp-body">
        <nav className="arp-tree" aria-label="Product groups">
          <button type="button" className={`arp-root ${cat ? "" : "is-on"}`} onClick={() => setCat("")} onContextMenu={(e) => (setCat(""), ctx.open(e, groupMenu("")))}>
            <ArIcon name="folder" size={16} />
            Products
          </button>
          <ul>
            {cats.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === cat ? "is-on" : ""} onClick={() => setCat(c.id)} onContextMenu={(e) => (setCat(c.id), ctx.open(e, groupMenu(c.id)))}>
                  <ArIcon name="folder" size={16} />
                  <span>{c.name}</span>
                  <small>{groupCounts.get(c.id) ?? 0}</small>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="arp-list">
          <div className="arp-search">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={mode === m.id ? "is-on" : ""} aria-pressed={mode === m.id} aria-label={m.label} title={m.label} onClick={() => setMode(m.id)}>
                <ArIcon name={m.icon} size={18} />
              </button>
            ))}
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "barcode" ? "Barcode" : mode === "code" ? "Product code" : "Product name"} aria-label="Search products" />
            <ArIcon name="search" size={20} />
            <label className="arp-show">
              <span>Show</span>
              <select value={need} onChange={(e) => setNeed(asNeed(e.target.value))} aria-label="Show">
                {NEEDS.map((n) => (
                  <option key={n} value={n}>
                    {NEED_LABEL[n]} ({counts[n]})
                  </option>
                ))}
              </select>
            </label>
            <span className="arp-count">
              {nSel > 1 && <span className="arp-selcount">{nSel} selected · </span>}
              Products count: <b>{rows ? shown.length : "…"}</b>
            </span>
          </div>

          {table ? (
            <div className="arp-table">
              <ProductTable
                products={sorted}
                categories={cats}
                api={api}
                selecting={false}
                selected={picked}
                openId={openId}
                onToggle={tickRow}
                onOpen={(id) => setOpenId(id === openId ? null : id)}
                onCreate={tableAdd}
                onDelete={mayDelete ? (p) => setDeleting([p]) : undefined}
                category={cat}
                sold={sold}
                onSave={async function onSave(id, work, msg, undo) {
                  try {
                    await work();
                    const fresh = await api.getProduct(id);
                    if (fresh) replace(fresh);
                    toast(msg ?? `Saved · ${fresh?.name ?? "product"}`, undo ? { undo: () => void onSave(id, undo, `Undone · ${fresh?.name ?? "product"}`, undefined) } : {});
                  } catch (e) {
                    setErr(errText(e));
                    toastError(e);
                  }
                }}
              />
            </div>
          ) : (
            <div className="aro-grid arp-grid" onContextMenu={(e) => ctx.open(e, listMenu(null))}>
              {ctx.node}
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th className="aro-tick">
                      <input type="checkbox" aria-label="Select all" checked={allTicked} onChange={() => setPicked(allTicked ? new Set() : new Set(sorted.map((p) => p.id)))} />
                    </th>
                    <SortTh k="code" label="Code" sort={sort} onSort={sortBy} />
                    <SortTh k="name" label="Name" sort={sort} onSort={sortBy} />
                    <SortTh k="group" label="Group" sort={sort} onSort={sortBy} />
                    <th>Barcode</th>
                    <th className="r">Options</th>
                    <SortTh k="price" label="Price" sort={sort} onSort={sortBy} right />
                    <th className="r">Tax</th>
                    <SortTh k="stock" label="Stock" sort={sort} onSort={sortBy} right />
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const v = loose(p);
                    const st = stockSum(p);
                    const on = picked.has(p.id);
                    return (
                      <tr
                        key={p.id}
                        tabIndex={0}
                        className={on ? "is-sel" : ""}
                        aria-selected={on}
                        onClick={(e) => !(e.target as HTMLElement).closest("input") && clickRow(e, p.id)}
                        onContextMenu={(e) => {
                          e.stopPropagation();
                          // right-clicking outside the selection selects that row first, as Aronium does
                          if (!picked.has(p.id)) {
                            setPicked(new Set([p.id]));
                          }
                          setSel(p.id);
                          ctx.open(e, listMenu(p));
                        }}
                        onDoubleClick={() => {
                          setSel(p.id);
                          setPicked(new Set([p.id]));
                          setOpenId(p.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setSel(p.id);
                            setOpenId(p.id);
                          } else if (e.key === " ") {
                            e.preventDefault();
                            tickRow(p.id);
                          }
                        }}
                      >
                        <td className="aro-tick">
                          <input type="checkbox" aria-label={`Select ${p.name}`} checked={on} onChange={() => tickRow(p.id)} />
                        </td>
                        <td>{v[0]?.sku ?? ""}</td>
                        <td>{p.name}</td>
                        <td>{catName(p.category_id)}</td>
                        <td>{v[0]?.barcode ?? ""}</td>
                        <td className="r">{v.length}</td>
                        <td className="r">{mainPrice(p) ? money(mainPrice(p)) : ""}</td>
                        <td className="r">{p.gst_rate == null ? "" : `${p.gst_rate}%`}</td>
                        <td className={`r ${st !== null && st <= 0 ? "arp-out" : ""}`}>{st ?? ""}</td>
                        <td>{p.status === "published" ? "✓" : p.status === "draft" ? "Draft" : "Archived"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows && !shown.length && (
                <div className="arp-empty">
                  <p>{q ? "No product matches the search" : need !== "all" ? `Nothing here: no product in view is ${NEED_LABEL[need].toLowerCase()}` : "Selected group contains no products"}</p>
                  <button type="button" onClick={() => setAdding(true)}>
                    Add new product
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {open && !adding && (
        <AroniumProductEditor
          key={open.id}
          product={open}
          categories={cats}
          api={api}
          catalogue={rows ?? []}
          onChanged={replace}
          onClose={() => setOpenId(null)}
          nav={{
            at: at + 1,
            of: sorted.length,
            prev:
              at > 0
                ? () => {
                    setOpenId(sorted[at - 1].id);
                    setSel(sorted[at - 1].id);
                    setPicked(new Set([sorted[at - 1].id]));
                  }
                : undefined,
            next:
              at >= 0 && at < sorted.length - 1
                ? () => {
                    setOpenId(sorted[at + 1].id);
                    setSel(sorted[at + 1].id);
                    setPicked(new Set([sorted[at + 1].id]));
                  }
                : undefined,
          }}
        />
      )}

      {/* New product: Aronium's slide-in, empty, in the group picked in the tree; made on Save */}
      {adding && (
        <AroniumProductEditor
          key="new"
          product={blankProduct(cat || cats[0]?.id || "", nextCode)}
          categories={cats}
          api={api}
          catalogue={rows ?? []}
          onChanged={replace}
          onClose={() => setAdding(false)}
          create={{
            make: async (name, categoryId) => {
              let slug = slugify(name);
              for (let n = 2; (rows ?? []).some((r) => r.slug === slug); n++) slug = `${slugify(name)}-${n}`;
              return api.createProduct({ category_id: categoryId, slug, name, description: "" });
            },
            done: async (id) => {
              await load();
              setAdding(false);
              setSel(id);
              setPicked(new Set([id]));
              setOpenId(id);
            },
          }}
        />
      )}
      <Dialog open={deleting !== null} onClose={() => !busy && setDeleting(null)}>
        {deleting && (
          <form
            method="dialog"
            className="ara-dlg"
            onSubmit={(e) => {
              e.preventDefault();
              void deleteNow(deleting);
            }}
          >
            <h2>{deleting.length === 1 ? `Delete ${deleting[0].name}?` : `Delete ${deleting.length} products?`}</h2>
            <p className="ara-help">
              {deleting.length === 1 ? "It goes" : "They go"} for good, with {deleting.length === 1 ? "its" : "their"} options and photos. This can&apos;t be undone. Anything that has been ordered stays, for those orders; to take it off the shop but keep it, archive it instead.
            </p>
            <div className="ara-btns">
              <button className="adm-btn bad" disabled={busy}>
                {busy ? "Deleting" : "Delete"}
              </button>
              <button type="button" className="adm-btn" disabled={busy} onClick={() => setDeleting(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

