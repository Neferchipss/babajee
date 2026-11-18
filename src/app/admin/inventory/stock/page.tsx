"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Chips, Confirm, Empty, Failed, Loading, PageHead, Toggle } from "@/components/admin/kit";
import BuyingPrice from "@/components/admin/stock/BuyingPrice";
import ProductStock from "@/components/admin/stock/ProductStock";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import { adminApi, isAdminDemo } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant } from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";
import { errText, type Purchase } from "@/lib/orders-db";
import "@/components/admin/admin-products.css";
import "./stock.css";

// Inventory > Stock (UI redesign, stage 3): the one place stock and buying
// prices change. Every option, its count (boxes shown as full boxes + loose
// pieces), its low-stock mark and its average buying price; per option: add
// stock or adjust the count (with a supplier bill, or a reason), set or
// correct the buying price, and switch counting on or off (0078).
type Filter = "counted" | "low" | "out" | "uncounted" | "all";
type Row = { p: AdminProduct; v: AdminVariant; boxes: AdminVariant[] };

export default function StockPage() {
  return (
    <Suspense>
      <Stock />
    </Suspense>
  );
}

function Stock() {
  const api = adminApi();
  const router = useRouter();
  const params = useSearchParams();
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [costs, setCosts] = useState<Map<string, Purchase>>(new Map());
  const [shopLow, setShopLow] = useState(3);
  const [shopRate, setShopRate] = useState(18);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<Filter>(params.get("product") ? "all" : "counted");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [stopping, setStopping] = useState<Row | null>(null);
  const [pricing, setPricing] = useState<Row | null>(null);
  const focus = params.get("product") ?? "";
  const managing = products?.find((p) => p.id === params.get("manage")) ?? null;

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.listProducts(), api.listCategories()]);
      setProducts(p);
      setCats(c);
      setErr("");
      const m = await import("@/lib/orders-db");
      m.getSettings().then(
        (s) => {
          setShopLow(s.low_stock_at);
          setShopRate(s.gst_rate);
        },
        () => {},
      );
      // the average buying prices, read in parts (a long list doesn't fit one request)
      const ids = p.flatMap((x) => x.variants.filter((v) => !v.unit_variant_id).map((v) => v.id));
      const all = new Map<string, Purchase>();
      for (let i = 0; i < ids.length; i += 150) {
        try {
          for (const [k, v] of await m.getPurchases(ids.slice(i, i + 150))) all.set(k, v);
        } catch {
          break;
        }
      }
      setCosts(all);
    } catch (e) {
      setErr(errText(e));
    }
  }, [api]);
  useEffect(() => {
    // everything is set after the reads come back
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const rows: Row[] = useMemo(
    () =>
      (products ?? []).flatMap((p) =>
        p.variants
          .filter((v) => !v.unit_variant_id)
          .map((v) => ({ p, v, boxes: p.variants.filter((b) => b.unit_variant_id === v.id) })),
      ),
    [products],
  );
  const lowAt = (r: Row) => r.p.low_stock_at ?? shopLow;
  const isLow = (r: Row) => r.v.track_stock && r.v.stock_qty > 0 && r.v.stock_qty <= lowAt(r);
  const isOut = (r: Row) => r.v.track_stock && r.v.stock_qty <= 0;
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(
    (r) =>
      (!focus || r.p.id === focus) &&
      (!cat || r.p.category_id === cat) &&
      words.every((w) => `${r.p.name} ${r.v.label} ${r.v.sku ?? ""} ${r.v.barcode ?? ""}`.toLowerCase().includes(w)) &&
      (filter === "all" || (filter === "counted" && r.v.track_stock) || (filter === "uncounted" && !r.v.track_stock) || (filter === "low" && isLow(r)) || (filter === "out" && isOut(r))),
  );
  const counted = rows.filter((r) => r.v.track_stock);
  const pieces = counted.reduce((n, r) => n + Math.max(0, r.v.stock_qty), 0);
  const value = counted.reduce((n, r) => n + Math.max(0, r.v.stock_qty) * (costs.get(r.v.id)?.purchase ?? 0), 0);
  const money = (n: number) => formatPrice(n, { paise: true });
  const demoQ = isAdminDemo() ? "&demo=1" : "";
  const manage = (p: AdminProduct | null) => router.replace(p ? `/admin/inventory/stock?manage=${p.id}${focus ? `&product=${focus}` : ""}${demoQ}` : `/admin/inventory/stock?${focus ? `product=${focus}` : ""}${demoQ}`, { scroll: false });

  async function counting(r: Row, on: boolean, note = "") {
    setBusyId(r.v.id);
    try {
      const m = await import("@/lib/stock-in/db");
      await m.setCounting(r.v.id, on, note);
      toast(on ? `Counting ${r.p.name}${r.v.label !== "Default" ? ` · ${r.v.label}` : ""}` : "Stopped counting");
      await load();
    } catch (e) {
      toastError(errText(e));
    }
    setBusyId("");
    setStopping(null);
  }

  // full boxes and loose pieces, for an option that comes in boxes
  const asBoxes = (r: Row) => {
    const sizes = [...new Set(r.boxes.map((b) => b.pack_of))].sort((a, b) => b - a);
    if (!sizes.length || !r.v.track_stock || r.v.stock_qty <= 0) return "";
    const big = sizes[0];
    const full = Math.floor(r.v.stock_qty / big);
    const loose = r.v.stock_qty - full * big;
    return `${full} box${full === 1 ? "" : "es"} of ${big}${loose ? ` + ${loose} loose` : ""}`;
  };

  return (
    <div className="inv">
      <PageHead
        title="Stock"
        help="Every option's count and buying price. Add stock (with a supplier bill or without), adjust a count, correct a buying price, or start and stop counting. This is the one place stock changes; bills are under Purchase bills."
        actions={
          <Link className="adm-btn" href="/admin/inventory/purchases">
            Purchase bills
          </Link>
        }
      />
      {err && <Failed error={err} onRetry={load} />}
      {products === null && !err ? (
        <Loading what="stock" />
      ) : (
        <>
          <div className="inv-stats">
            <div className="adm-card">
              <b>{counted.length}</b>
              <span>options counted</span>
            </div>
            <div className="adm-card">
              <b>{pieces.toLocaleString("en-IN")}</b>
              <span>pieces in stock</span>
            </div>
            <div className="adm-card">
              <b>{money(value)}</b>
              <span>stock at buying price (before GST)</span>
            </div>
            <div className="adm-card">
              <b>{rows.filter(isLow).length + rows.filter(isOut).length}</b>
              <span>low or out</span>
            </div>
          </div>
          {focus && (
            <p className="inv-focus">
              Showing one product.{" "}
              <button type="button" className="prd-linkbtn" onClick={() => router.replace(`/admin/inventory/stock${demoQ ? "?demo=1" : ""}`)}>
                Show all
              </button>
            </p>
          )}
          <div className="inv-tools">
            <input className="adm-input" type="search" value={q} placeholder="Search by name, option, SKU or barcode" aria-label="Search stock" onChange={(e) => setQ(e.target.value)} />
            <select className="adm-input" value={cat} aria-label="Type" onChange={(e) => setCat(e.target.value)}>
              <option value="">All types</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Chips
            value={filter}
            onChange={setFilter}
            label="Show"
            options={[
              { id: "counted", label: "Counted", count: counted.length },
              { id: "low", label: "Low", count: rows.filter(isLow).length },
              { id: "out", label: "Out", count: rows.filter(isOut).length },
              { id: "uncounted", label: "Not counted", count: rows.length - counted.length },
              { id: "all", label: "Everything", count: rows.length },
            ]}
          />
          {!shown.length ? (
            <Empty title="Nothing here">
              {filter === "counted" && !counted.length ? "No option counts stock yet. Switch counting on for an option under Not counted, or post a purchase bill." : "Try another filter or search."}
            </Empty>
          ) : (
            <div className="adm-card adm-tablecard">
              <table className="adm-table inv-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">In stock</th>
                    <th className="num" data-hide-sm>
                      Low at
                    </th>
                    <th className="num" data-hide-sm>
                      Buying price
                    </th>
                    <th>Counting</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const buy = costs.get(r.v.id)?.purchase;
                    return (
                      <tr key={r.v.id} className={isOut(r) ? "is-out" : isLow(r) ? "is-low" : ""}>
                        <td>
                          <Link href={`/admin/products/edit?id=${r.p.id}${demoQ}`} className="row-link">
                            {r.p.name}
                          </Link>
                          <div className="adm-muted adm-small">
                            {r.v.label !== "Default" ? `${r.v.label} · ` : ""}
                            {cats.find((c) => c.id === r.p.category_id)?.name}
                            {r.v.sku ? ` · ${r.v.sku}` : ""}
                          </div>
                        </td>
                        <td className="num">
                          {r.v.track_stock ? <b>{r.v.stock_qty}</b> : <span className="adm-muted">—</span>}
                          {asBoxes(r) && <div className="adm-muted adm-small">{asBoxes(r)}</div>}
                        </td>
                        <td className="num adm-small" data-hide-sm>
                          {r.v.track_stock ? lowAt(r) : ""}
                        </td>
                        <td className="num adm-small" data-hide-sm>
                          {buy != null ? money(buy) : <span className="adm-muted">Not set</span>}
                        </td>
                        <td>
                          <Toggle on={r.v.track_stock} label={r.v.track_stock ? "Counted" : "Off"} disabled={busyId === r.v.id} onChange={(on) => (on ? void counting(r, true) : setStopping(r))} />
                        </td>
                        <td>
                          <span className="inv-actions">
                            <button type="button" className="adm-btn" onClick={() => manage(r.p)}>
                              Add or adjust
                            </button>
                            <button type="button" className="adm-btn" onClick={() => setPricing(r)}>
                              {buy != null ? "Buying price" : "Set buying price"}
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Dialog open={!!managing} onClose={() => manage(null)} wide>
        {managing && (
          <div className="inv-manage">
            <div className="prd-card-head">
              <h2>{managing.name}</h2>
              <button type="button" className="adm-btn" onClick={() => manage(null)}>
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
        title={`Stop counting ${stopping?.p.name ?? ""}${stopping && stopping.v.label !== "Default" ? ` · ${stopping.v.label}` : ""}?`}
        body="Its number is kept, but checkout stops limiting sales to it and it leaves the low-stock alerts. You can switch counting back on any time."
        confirmLabel="Stop counting"
        danger={false}
        onConfirm={() => stopping && void counting(stopping, false)}
        onCancel={() => setStopping(null)}
      />
    </div>
  );
}
