"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { listCategories, listProducts, updateProduct, type AdminCategory, type AdminProduct } from "@/lib/admin-data";
import { getSupabase } from "@/lib/supabase";
import { GST_BRACKETS } from "@/lib/gst";
import { errText, getSettings } from "@/lib/orders-db";
import "./tax.css";

// HSN codes and GST rates for the whole catalogue in one place: set them per
// category (all products, or only the ones still missing), then override any
// single product below. A tax invoice needs an HSN on every line, and each
// product's GST rate decides what is charged and claimed.
const HSN_OK = /^(\d{4}|\d{6}|\d{8})$/;

export default function TaxPage() {
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [shopRate, setShopRate] = useState(18);
  const [err, setErr] = useState("");
  const [only, setOnly] = useState<"missing" | "all">("missing");
  const [q, setQ] = useState("");

  const load = () =>
    Promise.all([listCategories(), listProducts(), getSettings()]).then(
      ([c, p, s]) => {
        setCats(c);
        setProducts(p.filter((x) => x.status !== "archived"));
        setShopRate(s.gst_rate);
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);

  const missing = (p: AdminProduct) => !p.hsn || p.gst_rate == null;
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (products ?? []).filter((p) => (only === "all" || missing(p)) && (!words || p.name.toLowerCase().includes(words) || p.hsn.includes(words)));
  }, [products, only, q]);

  const noHsn = (products ?? []).filter((p) => !p.hsn).length;
  const noRate = (products ?? []).filter((p) => p.gst_rate == null).length;

  // one product changed: keep the list in step without reloading everything
  const patchLocal = (id: string, patch: Partial<AdminProduct>) => setProducts((l) => (l ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div>
      <Link href="/admin/products" className="adm-back adm-only-narrow">
        ← Products
      </Link>
      <header className="adm-pagehead">
        <h1>GST &amp; HSN</h1>
        <p>HSN code and GST rate for every product. Set them per category, then change any single product below. Every line of a tax invoice needs an HSN code.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      {products && (
        <p className="tax-status">
          <b>{noHsn}</b> of {products.length} products have no HSN code · <b>{noRate}</b> use the shop&apos;s default rate ({shopRate}%), set in{" "}
          <Link href="/admin/settings">Settings</Link>
        </p>
      )}

      <section className="adm-card tax-cats">
        <h2>By category</h2>
        <div className="tax-catlist">
          {cats.map((c) => (
            <CategoryRow key={c.id} cat={c} products={(products ?? []).filter((p) => p.category_id === c.id)} onDone={load} />
          ))}
        </div>
      </section>

      <section className="adm-card tax-prods">
        <div className="tax-head">
          <h2>Products</h2>
          <div className="adm-chips" role="group" aria-label="Which products">
            <button type="button" className={`adm-chip ${only === "missing" ? "is-on" : ""}`} aria-pressed={only === "missing"} onClick={() => setOnly("missing")}>
              Missing HSN or rate
            </button>
            <button type="button" className={`adm-chip ${only === "all" ? "is-on" : ""}`} aria-pressed={only === "all"} onClick={() => setOnly("all")}>
              All
            </button>
          </div>
          <input className="adm-input" type="search" placeholder="Search product or HSN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
        </div>
        {!products ? (
          <p className="adm-muted">Loading.</p>
        ) : shown.length === 0 ? (
          <p className="adm-muted">{only === "missing" ? "Every product has an HSN code and a GST rate." : "Nothing matches."}</p>
        ) : (
          <ul className="tax-list">
            {shown.slice(0, 200).map((p) => (
              <ProductRow key={p.id} p={p} shopRate={shopRate} onSaved={(patch) => patchLocal(p.id, patch)} />
            ))}
          </ul>
        )}
        {shown.length > 200 && <p className="adm-muted adm-small">Showing 200 of {shown.length}. Search or set a category above to narrow it.</p>}
      </section>
    </div>
  );
}

function CategoryRow({ cat, products, onDone }: { cat: AdminCategory; products: AdminProduct[]; onDone: () => Promise<unknown> }) {
  const hsns = [...new Set(products.map((p) => p.hsn).filter(Boolean))];
  const rates = [...new Set(products.map((p) => p.gst_rate).filter((r) => r != null))];
  const [hsn, setHsn] = useState(hsns.length === 1 ? hsns[0] : "");
  const [rate, setRate] = useState<string>(rates.length === 1 ? String(rates[0]) : "");
  const [busy, setBusy] = useState(false);
  const gaps = products.filter((p) => !p.hsn || p.gst_rate == null).length;
  const hsnBad = hsn !== "" && !HSN_OK.test(hsn);
  const ready = !hsnBad && (hsn !== "" || rate !== "");

  async function apply(onlyMissing: boolean) {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Not connected to the database.");
      const patch: { hsn?: string; gst_rate?: number } = {};
      if (hsn) patch.hsn = hsn;
      if (rate) patch.gst_rate = Number(rate);
      // only the missing ones: each field fills only where it is empty
      if (onlyMissing) {
        if (patch.hsn) {
          const { error } = await sb.from("products").update({ hsn: patch.hsn }).eq("category_id", cat.id).neq("status", "archived").or("hsn.is.null,hsn.eq.");
          if (error) throw error;
        }
        if (patch.gst_rate != null) {
          const { error } = await sb.from("products").update({ gst_rate: patch.gst_rate }).eq("category_id", cat.id).neq("status", "archived").is("gst_rate", null);
          if (error) throw error;
        }
      } else {
        const { error } = await sb.from("products").update(patch).eq("category_id", cat.id).neq("status", "archived");
        if (error) throw error;
      }
      toast(`${cat.name}: ${onlyMissing ? "filled in where missing" : `set on all ${products.length}`}`);
      await onDone();
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  return (
    <div className="tax-cat">
      <div className="tax-catname">
        <b>{cat.name}</b>
        <small>
          {products.length} product{products.length === 1 ? "" : "s"}
          {gaps ? ` · ${gaps} missing` : " · all set"}
        </small>
      </div>
      <input className="adm-input tax-hsn" inputMode="numeric" maxLength={8} placeholder="HSN" aria-label={`${cat.name} HSN code`} aria-invalid={hsnBad} value={hsn} onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))} />
      <select className="adm-input tax-rate" aria-label={`${cat.name} GST rate`} value={rate} onChange={(e) => setRate(e.target.value)}>
        <option value="">Rate…</option>
        {GST_BRACKETS.map((b) => (
          <option key={b} value={b}>
            {b}%
          </option>
        ))}
      </select>
      <div className="tax-catbtns">
        <button type="button" className="adm-btn" disabled={!ready || busy || !gaps} onClick={() => apply(true)}>
          Fill missing
        </button>
        <button type="button" className="adm-btn" disabled={!ready || busy || !products.length} onClick={() => apply(false)}>
          Set all {products.length}
        </button>
      </div>
      {hsnBad && <p className="adm-err tax-err">An HSN code is 4, 6 or 8 digits.</p>}
    </div>
  );
}

function ProductRow({ p, shopRate, onSaved }: { p: AdminProduct; shopRate: number; onSaved: (patch: Partial<AdminProduct>) => void }) {
  const [hsn, setHsn] = useState(p.hsn);
  const bad = hsn !== "" && !HSN_OK.test(hsn);

  async function save(patch: Partial<Pick<AdminProduct, "hsn" | "gst_rate">>) {
    try {
      await updateProduct(p.id, patch);
      onSaved(patch);
    } catch (e) {
      toastError(errText(e));
    }
  }

  return (
    <li className="tax-row">
      <span className="tax-name">
        {p.name}
        <small>{p.category_name}</small>
      </span>
      <input
        className="adm-input tax-hsn"
        inputMode="numeric"
        maxLength={8}
        placeholder="HSN"
        aria-label={`${p.name} HSN code`}
        aria-invalid={bad}
        value={hsn}
        onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))}
        onBlur={() => !bad && hsn !== p.hsn && save({ hsn })}
      />
      <select className="adm-input tax-rate" aria-label={`${p.name} GST rate`} value={p.gst_rate == null ? "" : String(p.gst_rate)} onChange={(e) => save({ gst_rate: e.target.value === "" ? null : Number(e.target.value) })}>
        <option value="">Default ({shopRate}%)</option>
        {GST_BRACKETS.map((b) => (
          <option key={b} value={b}>
            {b}%
          </option>
        ))}
      </select>
    </li>
  );
}
