"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  bulkSetVisibility,
  listCategories,
  listProducts,
  setProductVisibility,
  upsertVariant,
  type AdminCategory,
  type AdminProduct,
} from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";

type SortKey = "name" | "category" | "price" | "options";
type VisibilityFilter = "all" | "visible" | "hidden";
type PricingFilter = "all" | "priced" | "unpriced";
const PAGE_SIZE = 50;

export default function ProductsAdminPage() {
  return (
    <Suspense>
      <ProductsAdmin />
    </Suspense>
  );
}

function minMaxPrice(p: AdminProduct) {
  const prices = p.variants.map((v) => v.price);
  return { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 };
}

function ProductsAdmin() {
  const initialCategory = useSearchParams().get("category") ?? "";
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [visFilter, setVisFilter] = useState<VisibilityFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PricingFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  async function load() {
    setLoading(true);
    try {
      setRows(await listProducts(categoryId || undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    setSelected(new Set());
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  useEffect(() => {
    setPage(0);
  }, [query, visFilter, priceFilter, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    if (visFilter !== "all") list = list.filter((p) => p.is_visible === (visFilter === "visible"));
    if (priceFilter !== "all") {
      list = list.filter((p) => {
        const priced = p.variants.some((v) => v.price > 0);
        return priceFilter === "priced" ? priced : !priced;
      });
    }
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name) * sortDir;
        case "category":
          return (a.category_name ?? "").localeCompare(b.category_name ?? "") * sortDir;
        case "options":
          return (a.variants.length - b.variants.length) * sortDir;
        case "price":
          return (minMaxPrice(a).min - minMaxPrice(b).min) * sortDir;
      }
    });
    return sorted;
  }, [rows, query, visFilter, priceFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    const idsOnPage = shown.map((p) => p.id);
    const allSelected = idsOnPage.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      idsOnPage.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function bulkVisibility(visible: boolean) {
    setBulkBusy(true);
    setErr("");
    try {
      await bulkSetVisibility(rows, [...selected], visible);
      setNote(`${visible ? "Showed" : "Hid"} ${selected.size} product${selected.size === 1 ? "" : "s"}.`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBulkBusy(false);
  }

  async function toggleVisible(p: AdminProduct) {
    setBusyRow(p.id);
    try {
      await setProductVisibility(p, !p.is_visible);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusyRow(null);
  }

  async function saveInlinePrice(p: AdminProduct, price: number, stockQty: number) {
    setBusyRow(p.id);
    try {
      await upsertVariant(p.id, { ...p.variants[0], price, stock_qty: stockQty });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusyRow(null);
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 1 ? " ↑" : " ↓") : "");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl">Products</h1>
        <Link href={categoryId ? `/admin/products/new?category=${categoryId}` : "/admin/products/new"} className="btn btn-primary">
          Add product
        </Link>
      </div>
      {err && <p className="mt-4 text-rasta-red">{err}</p>}
      {note && !err && (
        <p className="mt-4 text-muted" role="status">
          {note}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="field" value={visFilter} onChange={(e) => setVisFilter(e.target.value as VisibilityFilter)}>
          <option value="all">Any visibility</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
        </select>
        <select className="field" value={priceFilter} onChange={(e) => setPriceFilter(e.target.value as PricingFilter)}>
          <option value="all">Any pricing</option>
          <option value="priced">Priced</option>
          <option value="unpriced">Unpriced</option>
        </select>
        <input className="field grow" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-iron px-4 py-3 text-sm">
          <span>
            {selected.size} selected
          </span>
          <button type="button" className="btn btn-ghost" disabled={bulkBusy} onClick={() => bulkVisibility(true)}>
            Show selected
          </button>
          <button type="button" className="btn btn-ghost" disabled={bulkBusy} onClick={() => bulkVisibility(false)}>
            Hide selected
          </button>
          <button type="button" className="text-muted underline underline-offset-4 hover:text-paper" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-muted">Loading.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-muted">No products match.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {filtered.length} product{filtered.length === 1 ? "" : "s"}
          </p>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="w-8 py-2 pr-4">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={shown.length > 0 && shown.every((p) => selected.has(p.id))}
                    onChange={toggleSelectPage}
                  />
                </th>
                <th className="py-2 pr-4 font-medium">
                  <button type="button" onClick={() => sortBy("name")}>
                    Name{arrow("name")}
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <button type="button" onClick={() => sortBy("category")}>
                    Category{arrow("category")}
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <button type="button" onClick={() => sortBy("options")}>
                    Options{arrow("options")}
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">
                  <button type="button" onClick={() => sortBy("price")}>
                    Price{arrow("price")}
                  </button>
                </th>
                <th className="py-2 pr-4 font-medium">Stock</th>
                <th className="py-2 pr-4 font-medium">Visible</th>
                <th className="py-2 pr-4 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  checked={selected.has(p.id)}
                  onCheck={() => toggleSelect(p.id)}
                  busy={busyRow === p.id}
                  onToggleVisible={() => toggleVisible(p)}
                  onSavePrice={(price, stock) => saveInlinePrice(p, price, stock)}
                />
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="mt-4 flex items-center gap-4 text-sm">
              <button type="button" className="btn btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span className="text-muted">
                Page {page + 1} of {pageCount}
              </span>
              <button type="button" className="btn btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProductRow({
  product,
  checked,
  onCheck,
  busy,
  onToggleVisible,
  onSavePrice,
}: {
  product: AdminProduct;
  checked: boolean;
  onCheck: () => void;
  busy: boolean;
  onToggleVisible: () => void;
  onSavePrice: (price: number, stockQty: number) => void;
}) {
  const single = product.variants.length === 1;
  const only = product.variants[0];
  const [price, setPrice] = useState(String(only?.price ?? 0));
  const [stock, setStock] = useState(String(only?.stock_qty ?? 0));
  const { min, max } = minMaxPrice(product);

  return (
    <tr className="border-b border-line">
      <td className="py-2 pr-4">
        <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${product.name}`} />
      </td>
      <td className="py-2 pr-4">{product.name}</td>
      <td className="py-2 pr-4 text-muted">{product.category_name}</td>
      <td className="py-2 pr-4 text-muted">{product.variants.length}</td>
      <td className="py-2 pr-4">
        {single ? (
          <input
            className="field w-24"
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => onSavePrice(Number(price) || 0, Number(stock) || 0)}
          />
        ) : (
          <span className="text-muted">{min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`}</span>
        )}
      </td>
      <td className="py-2 pr-4">
        {single ? (
          <input
            className="field w-16"
            type="number"
            min={0}
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            onBlur={() => onSavePrice(Number(price) || 0, Number(stock) || 0)}
          />
        ) : (
          <span className="text-muted">{product.variants.reduce((sum, v) => sum + v.stock_qty, 0)}</span>
        )}
      </td>
      <td className="py-2 pr-4">
        <button
          type="button"
          onClick={onToggleVisible}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            product.is_visible ? "bg-rasta-green/20 text-rasta-green" : "bg-line text-muted"
          }`}
        >
          {product.is_visible ? "Visible" : "Hidden"}
        </button>
      </td>
      <td className="py-2 pr-4">
        <Link href={`/admin/products/edit?id=${product.id}`} className="font-medium text-rasta-gold hover:underline">
          Edit
        </Link>
      </td>
    </tr>
  );
}
