"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import AdminCategoryBar from "@/components/admin/AdminCategoryBar";
import ProductEditor, { EditableName, EditablePrice, mainPrice, needsOf, needsWork, setMainPrice } from "@/components/admin/ProductEditor";
import "@/components/admin/admin-products.css";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct } from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";
import { photosFor } from "@/lib/product-photos";
import { slugify } from "@/lib/slug";

type Need = "all" | "photo" | "price" | "hidden";

// The catalogue as the shop shows it: a grid of cards, by category. Each card
// says what the product still needs (a photo, a price, to be shown); open one
// and its editor slides in beside the grid, to fill it in and step to the next.
export default function ProductsAdminPage() {
  return (
    <Suspense>
      <ProductsAdmin />
    </Suspense>
  );
}

function ProductsAdmin() {
  const router = useRouter();
  const params = useSearchParams();
  const api = adminApi();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState(params.get("category") ?? "");
  const [need, setNeed] = useState<Need>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(params.get("product"));
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  async function load() {
    try {
      const [cats, prods] = await Promise.all([api.listCategories(), api.listProducts()]);
      setCategories(cats);
      setRows(prods);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the catalogue, read once on arrival
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the category and open product live in the address, so a link (or a reload) comes back to them
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (cat) q.set("category", cat);
    else q.delete("category");
    if (openId) q.set("product", openId);
    else q.delete("product");
    const next = `${window.location.pathname}${q.size ? `?${q}` : ""}`;
    if (next !== window.location.pathname + window.location.search) router.replace(next, { scroll: false });
  }, [cat, openId, router]);

  const inCat = useMemo(() => (cat ? rows.filter((p) => p.category_id === cat) : rows), [rows, cat]);
  const counts = useMemo(() => {
    const c = { photo: 0, price: 0, hidden: 0 };
    for (const p of inCat) {
      const n = needsOf(p);
      if (n.photo) c.photo++;
      if (n.price) c.price++;
      if (n.hidden) c.hidden++;
    }
    return c;
  }, [inCat]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inCat.filter((p) => (!q || p.name.toLowerCase().includes(q)) && (need === "all" || needsOf(p)[need]));
  }, [inCat, query, need]);

  const open = openId ? rows.find((p) => p.id === openId) : undefined;
  const at = open ? shown.findIndex((p) => p.id === open.id) : -1;
  const nextNeeds = () => {
    const after = [...shown.slice(at + 1), ...shown.slice(0, Math.max(at, 0))];
    return after.find(needsWork);
  };

  function replace(p: AdminProduct) {
    setRows((rs) => rs.map((r) => (r.id === p.id ? p : r)));
  }

  async function quickAdd(name: string, categoryId: string) {
    let slug = slugify(name);
    for (let n = 2; rows.some((r) => r.slug === slug); n++) slug = `${slugify(name)}-${n}`;
    const id = await api.createProduct({ category_id: categoryId, slug, name, description: "" });
    const fresh = await api.getProduct(id);
    if (fresh) setRows((rs) => [fresh, ...rs]);
    setNeed("all");
    setQuery("");
    setOpenId(id);
  }

  async function bulk(visible: boolean) {
    setBulkBusy(true);
    try {
      await api.bulkSetVisibility(rows, [...selected], visible);
      setSelected(new Set());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBulkBusy(false);
  }


  return (
    <div className={`ap ${open ? "ap--editing" : ""}`}>
      <header className="ap-head">
        <div>
          <h1>Products</h1>
          <p className="ap-sub">
            {loading
              ? "Loading the catalogue"
              : `${inCat.length} product${inCat.length === 1 ? "" : "s"}${counts.photo ? ` · ${counts.photo} need a photo` : ""}${counts.price ? ` · ${counts.price} need a price` : ""}`}
          </p>
        </div>
        <button type="button" className={`ap-chip ${selecting ? "is-on" : ""}`} onClick={() => (setSelecting((s) => !s), setSelected(new Set()))}>
          {selecting ? "Done selecting" : "Select"}
        </button>
      </header>
      {err && <p className="ap-err">{err}</p>}

      <AdminCategoryBar
        current={cat}
        onPick={(id) => {
          setCat(id);
          window.scrollTo({ top: 0, behavior: "instant" });
        }}
        categories={[{ id: "", slug: "all", name: "All" }, ...categories].map((c) => {
          const list = c.id ? rows.filter((p) => p.category_id === c.id) : rows;
          return { id: c.id, slug: c.slug, name: c.name, count: list.length, todo: list.filter((p) => needsOf(p).photo || needsOf(p).price).length };
        })}
      />

      <div className="ap-tools">
        <input className="ap-search" type="search" placeholder="Search by name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
        <div className="ap-needs" role="group" aria-label="Show">
          {(
            [
              ["all", "Everything", inCat.length],
              ["photo", "No photo", counts.photo],
              ["price", "No price", counts.price],
              ["hidden", "Hidden", counts.hidden],
            ] as const
          ).map(([id, label, n]) => (
            <button key={id} type="button" aria-pressed={need === id} onClick={() => setNeed(id)}>
              {label} <small>{n}</small>
            </button>
          ))}
        </div>
      </div>

      {selecting && (
        <div className="ap-bulk" role="region" aria-label="Selected products">
          <span>{selected.size ? `${selected.size} selected` : "Tick products to show or hide them together"}</span>
          <button type="button" className="ap-chip" disabled={!selected.size || bulkBusy} onClick={() => bulk(true)}>
            Show on the shop
          </button>
          <button type="button" className="ap-chip" disabled={!selected.size || bulkBusy} onClick={() => bulk(false)}>
            Hide
          </button>
          <button type="button" className="ap-link" onClick={() => setSelected(new Set(shown.map((p) => p.id)))}>
            Select all {shown.length}
          </button>
        </div>
      )}

      <div className="ap-split">
        <ul className="ap-grid">
          {!selecting && (
            <li>
              <QuickAdd categories={categories} cat={cat} onAdd={quickAdd} />
            </li>
          )}
          {shown.map((p) => (
            <li key={p.id}>
              <Card
                product={p}
                open={p.id === openId}
                selecting={selecting}
                checked={selected.has(p.id)}
                api={api}
                onSave={async (work) => {
                  try {
                    await work();
                    const fresh = await api.getProduct(p.id);
                    if (fresh) replace(fresh);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                }}
                onToggleVisible={async () => {
                  try {
                    await api.setProductVisibility(p, !p.is_visible);
                    const fresh = await api.getProduct(p.id);
                    if (fresh) replace(fresh);
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e));
                  }
                }}
                onClick={() => {
                  if (!selecting) return setOpenId(p.id === openId ? null : p.id);
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  });
                }}
              />
            </li>
          ))}
          {!loading && shown.length === 0 && <li className="ap-empty">Nothing here{need !== "all" ? ": everything in view has it" : ""}.</li>}
        </ul>

        {open && (
          <ProductEditor
            key={open.id}
            product={open}
            categories={categories}
            api={api}
            onChanged={replace}
            onClose={() => setOpenId(null)}
            nav={{
              at: at + 1,
              of: shown.length,
              prev: at > 0 ? () => setOpenId(shown[at - 1].id) : undefined,
              next: at >= 0 && at < shown.length - 1 ? () => setOpenId(shown[at + 1].id) : undefined,
              nextNeeds: nextNeeds() ? () => setOpenId(nextNeeds()!.id) : undefined,
            }}
          />
        )}
      </div>
    </div>
  );
}

function Card({
  product: p,
  open,
  selecting,
  checked,
  onClick,
  onToggleVisible,
  onSave,
  api,
}: {
  api: ReturnType<typeof adminApi>;
  product: AdminProduct;
  open: boolean;
  selecting: boolean;
  checked: boolean;
  onClick: () => void;
  onToggleVisible: () => Promise<void>;
  // a change saved from the card itself (its name, its price), then the product re-read
  onSave: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const n = needsOf(p);
  const photo = p.images[0]?.url ?? photosFor(p.slug)[0];
  const prices = p.variants.map((v) => v.price).filter((x) => x > 0);
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 0;
  return (
    <div className={`apc ${open ? "is-open" : ""} ${checked ? "is-checked" : ""} ${p.is_visible ? "" : "is-hidden"}`}>
      {/* the eye, where the shop's card has its heart: shown on the shop, or hidden */}
      {!selecting && (
        <button
          type="button"
          className="apc-eye"
          aria-pressed={!p.is_visible}
          aria-label={p.is_visible ? `Hide ${p.name} from the shop` : `Show ${p.name} on the shop`}
          title={p.is_visible ? "On the shop: tap to hide" : "Hidden: tap to show"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onToggleVisible();
            setBusy(false);
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
            {!p.is_visible && <path className="apc-eye-slash" d="M4 4l16 16" />}
          </svg>
        </button>
      )}
      {/* the picture opens the product's editor beside the grid */}
      <button type="button" className="apc-open" onClick={onClick} aria-pressed={selecting ? checked : open} aria-label={selecting ? `Select ${p.name}` : `Open ${p.name}`}>
      <span className="apc-img">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="apc-initial" aria-hidden="true">
            {p.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="apc-flags">
          {n.price && <i className="is-price">No price</i>}
          {n.photo && <i className="is-photo">No photo</i>}
        </span>
        {selecting && <span className={`apc-tick ${checked ? "is-on" : ""}`} aria-hidden="true" />}
      </span>
      </button>
      {/* name and price, edited right here; a product with options keeps its prices in the editor */}
      {p.variants.length === 1 ? (
        <EditablePrice className="apc-price" value={p.variants[0].price} label={`${p.name} price`} onSave={(price) => onSave(() => api.upsertVariant(p.id, { ...p.variants[0], price }))} />
      ) : (
        <span className="apc-price-row">
          {/* the main price, which the options follow; some may have their own */}
          <EditablePrice className="apc-price" value={mainPrice(p)} label={`${p.name} main price`} onSave={(price) => onSave(() => setMainPrice(api, p, price))} />
          {lo !== hi && (
            <button type="button" className="apc-own" onClick={onClick} title={`Options from ${formatPrice(lo)} to ${formatPrice(hi)}`}>
              + own prices
            </button>
          )}
        </span>
      )}
      <EditableName className="apc-name" value={p.name} onSave={(name) => onSave(() => api.updateProduct(p.id, { name }))} />
      <span className="apc-meta">
        {p.variants.length > 1 ? `${p.variants.length} options · ` : ""}
        {p.images.length ? `${p.images.length} photo${p.images.length === 1 ? "" : "s"}` : photo ? "Shoot photos" : "No photos"}
        {!p.is_visible && " · Hidden"}
      </span>
    </div>
  );
}

function QuickAdd({ categories, cat, onAdd }: { categories: AdminCategory[]; cat: string; onAdd: (name: string, categoryId: string) => Promise<void> }) {
  const [on, setOn] = useState(false);
  const [name, setName] = useState("");
  const [into, setInto] = useState(cat);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const target = cat || into || categories[0]?.id || "";

  if (!on)
    return (
      <button type="button" className="apc apc--add" onClick={() => setOn(true)}>
        <span className="apc-img">
          <b aria-hidden="true">+</b>
        </span>
        <span className="apc-name">Add a product</span>
        <span className="apc-meta">{cat ? `to ${categories.find((c) => c.id === cat)?.name ?? "this category"}` : "Name it, then add photos"}</span>
      </button>
    );

  return (
    <form
      className="apc apc--add is-on"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !target) return;
        setBusy(true);
        setErr("");
        try {
          await onAdd(name.trim(), target);
          setName("");
          setOn(false);
        } catch (x) {
          setErr(x instanceof Error ? x.message : String(x));
        }
        setBusy(false);
      }}
    >
      <label className="ape-field">
        <span>New product</span>
        <input autoFocus placeholder="Its name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOn(false)} />
      </label>
      {!cat && (
        <label className="ape-field">
          <span>Category</span>
          <select value={target} onChange={(e) => setInto(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {err && <p className="ap-err">{err}</p>}
      <div className="apc-add-actions">
        <button type="submit" className="ap-primary" disabled={busy || !name.trim()}>
          {busy ? "Adding" : "Add and open"}
        </button>
        <button type="button" className="ap-link" onClick={() => setOn(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
