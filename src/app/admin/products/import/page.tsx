"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { isAdminDemo, adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct } from "@/lib/admin-data";
import { errText } from "@/lib/orders-db";
import { FIELD_LABELS, planImport, planSummary, TEMPLATE_HEADER, type ImportField, type ImportPlan } from "@/lib/product-import";
import { readSheet } from "@/lib/stock-in/sheet";
import { slugify } from "@/lib/slug";

// Products > Import from a sheet: add products and update prices, stock,
// codes, GST and more from an .xlsx or .csv, one row per option. The sheet is
// read here in the browser, matched to the shop (lib/product-import.ts), and
// shown as a plan; nothing is written until "Apply" is pressed. New products
// come in as drafts.
export default function ImportPage() {
  const api = adminApi();
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [file, setFile] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState("");
  const [going, setGoing] = useState<{ done: number; of: number } | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: { what: string; why: string }[] } | null>(null);

  const load = () => Promise.all([api.listProducts(), api.listCategories()]).then(([p, c]) => (setProducts(p), setCats(c)));
  useEffect(() => {
    load().catch((e) => setErr(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(f: File | undefined) {
    if (!f || !products) return;
    setErr("");
    setResult(null);
    try {
      const rows = readSheet({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      setFile(f.name);
      setPlan(planImport(rows, products, cats));
    } catch (e) {
      setPlan(null);
      setErr(e instanceof Error ? e.message : errText(e));
    }
  }

  function template() {
    const example = ["RAW Classic King Size", cats[0]?.name ?? "Rolling Papers", "", "120", "", "40", "RAW-KS", "", "RAW", "4813", "18", "85", "20", "raw, king size", ""];
    const csv = "﻿" + [TEMPLATE_HEADER, example].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "babajee-products-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function apply() {
    if (!plan) return;
    const demo = isAdminDemo();
    const stockDb = demo ? null : await import("@/lib/stock-in/db");
    const ordersDb = demo ? null : await import("@/lib/orders-db");
    const steps: { what: string; run: () => Promise<void> }[] = [];
    const stockAndCost = async (variantId: string, stock: number | null, purchase: number | null) => {
      if (stock != null && stockDb) await stockDb.correctStock(variantId, stock, "Sheet import");
      if (purchase != null && ordersDb) await ordersDb.correctPurchase(variantId, purchase, null, "Sheet import");
    };

    for (const u of plan.updates)
      steps.push({
        what: `${u.name}${u.option !== "Default" ? ` · ${u.option}` : ""} (row ${u.row})`,
        run: async () => {
          if (Object.keys(u.product).length) await api.updateProduct(u.productId, u.product);
          if (Object.keys(u.variant).length) await api.upsertVariant(u.productId, { id: u.variantId, ...u.variant });
          await stockAndCost(u.variantId, u.stock, u.purchase);
        },
      });
    for (const o of plan.newOptions)
      steps.push({
        what: `${o.name} · ${o.option || "new option"} (row ${o.row})`,
        run: async () => {
          await api.upsertVariant(o.productId, { ...o.variant, label: o.variant.label || "Option" });
          const fresh = await api.getProduct(o.productId);
          const made = fresh?.variants.find((v) => v.label === (o.variant.label || "Option"));
          if (made) await stockAndCost(made.id, o.stock, o.purchase);
        },
      });
    for (const n of plan.newProducts)
      steps.push({
        what: `${n.name} (new, row${n.rows.length > 1 ? "s" : ""} ${n.rows.join(", ")})`,
        run: async () => {
          let id = "";
          for (let k = 1; !id; k++) {
            try {
              id = await api.createProduct({ category_id: n.categoryId, slug: k === 1 ? slugify(n.name) : `${slugify(n.name)}-${k}`, name: n.name.trim(), description: n.product.description ?? "" });
            } catch (x) {
              if ((x as { code?: string }).code !== "23505" || k > 20) throw x;
            }
          }
          await api.updateProduct(id, { status: "draft", ...n.product });
          const made = await api.getProduct(id);
          const first = made?.variants[0];
          for (const [i, o] of n.options.entries()) {
            if (i === 0 && first) {
              await api.upsertVariant(id, { id: first.id, label: o.label, sort_order: 0, ...o.variant });
              await stockAndCost(first.id, o.stock, o.purchase);
            } else {
              await api.upsertVariant(id, { label: o.label, sort_order: i, ...o.variant });
              const again = await api.getProduct(id);
              const v = again?.variants.find((x) => x.label === o.label);
              if (v) await stockAndCost(v.id, o.stock, o.purchase);
            }
          }
        },
      });

    setGoing({ done: 0, of: steps.length });
    const failed: { what: string; why: string }[] = [];
    let ok = 0;
    for (const [i, s] of steps.entries()) {
      try {
        await s.run();
        ok++;
      } catch (e) {
        failed.push({ what: s.what, why: errText(e) });
      }
      setGoing({ done: i + 1, of: steps.length });
    }
    setGoing(null);
    setResult({ ok, failed });
    setPlan(null);
    if (failed.length) toastError(`${failed.length} row${failed.length === 1 ? "" : "s"} didn't go in: see the list`);
    else toast(`Import done: ${ok} change${ok === 1 ? "" : "s"}`);
    await load().catch(() => {});
  }

  const count = plan ? plan.updates.length + plan.newOptions.length + plan.newProducts.length : 0;
  const shownFields = (Object.keys(FIELD_LABELS) as ImportField[]).filter((f) => plan && !plan.unmapped.includes(f));

  return (
    <div className="imp">
      <Link href="/admin/products" className="adm-back adm-only-narrow">
        ← Products
      </Link>
      <header className="adm-pagehead">
        <h1>Import from a sheet</h1>
        <p>
          Add products, or update prices, stock, codes, GST and more, from an Excel (.xlsx) or .csv file with one row per option. You see exactly what will change before
          anything is saved. New products come in as drafts. Empty cells are left alone, never wiped.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card imp-pick">
        <label className="adm-btn pri imp-file">
          {products ? "Choose a sheet" : "Loading the shop…"}
          <input type="file" accept=".xlsx,.csv" disabled={!products || !!going} onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <button type="button" className="adm-btn" onClick={template} disabled={!cats.length}>
          Download a template
        </button>
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          Columns can be in any order and use the usual names: Product (or Item name), Category, Option (or Size, Colour), Selling price (or MRP), Was price, Stock (or Qty), SKU,
          Barcode, Brand, HSN, GST %, Buying price (or Cost), Weight (g), Tags, Description. A row is matched by its SKU first, then by name and option.
        </p>
      </section>

      {plan && (
        <section className="adm-card imp-plan">
          <div className="imp-head">
            <div>
              <h2>{file}</h2>
              <p className="adm-small" style={{ margin: 0 }}>
                {planSummary(plan)}
              </p>
              <p className="adm-muted adm-small" style={{ margin: "4px 0 0" }}>
                Columns found: {shownFields.map((f) => FIELD_LABELS[f]).join(", ") || "none"}
              </p>
            </div>
            <div className="adm-actions">
              <button type="button" className="adm-btn pri" disabled={!count || !!going} onClick={apply}>
                {going ? `Saving ${going.done} of ${going.of}` : `Apply ${count} change${count === 1 ? "" : "s"}`}
              </button>
              <button type="button" className="adm-btn" disabled={!!going} onClick={() => setPlan(null)}>
                Cancel
              </button>
            </div>
          </div>

          {plan.problems.length > 0 && (
            <details className="imp-block" open>
              <summary>
                {plan.problems.length} note{plan.problems.length === 1 ? "" : "s"}: a row with a mistake is skipped; a stock note only leaves that stock alone
              </summary>
              <ul className="imp-list">
                {plan.problems.map((p, i) => (
                  <li key={i}>
                    <b>Row {p.row}</b> {p.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {plan.updates.length > 0 && (
            <details className="imp-block" open>
              <summary>{plan.updates.length} to update</summary>
              <div className="rpt-scroll">
                <table className="adm-table imp-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Product</th>
                      <th>Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.updates.map((u) => (
                      <tr key={u.row}>
                        <td className="adm-muted">{u.row}</td>
                        <td>
                          {u.name}
                          {u.option !== "Default" && <span className="adm-muted"> · {u.option}</span>}
                        </td>
                        <td className="adm-small">
                          {u.changes.map((c) => (
                            <div key={c.field}>
                              {FIELD_LABELS[c.field]}: <s className="adm-muted">{c.from}</s> → <b>{c.to}</b>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {plan.newOptions.length > 0 && (
            <details className="imp-block" open>
              <summary>{plan.newOptions.length} new options on products already in the shop</summary>
              <ul className="imp-list">
                {plan.newOptions.map((o) => (
                  <li key={o.row}>
                    <b>Row {o.row}</b> {o.name} · {o.option || "new option"}
                    {o.variant.price != null ? ` · ₹${o.variant.price}` : ""}
                    {o.stock != null ? ` · ${o.stock} in stock` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {plan.newProducts.length > 0 && (
            <details className="imp-block" open>
              <summary>{plan.newProducts.length} new products (as drafts)</summary>
              <ul className="imp-list">
                {plan.newProducts.map((n) => (
                  <li key={n.key}>
                    <b>
                      Row{n.rows.length > 1 ? "s" : ""} {n.rows.join(", ")}
                    </b>{" "}
                    {n.name} <span className="adm-muted">in {n.categoryName}</span>
                    {" · "}
                    {n.options.map((o) => `${o.label === "Default" ? "" : `${o.label} `}${o.variant.price != null ? `₹${o.variant.price}` : "no price"}`).join(", ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {isAdminDemo() && <p className="adm-muted adm-small">Demo: stock counts and buying prices are not saved here.</p>}
        </section>
      )}

      {result && (
        <section className="adm-card">
          <h2 style={{ marginTop: 0 }}>Done</h2>
          <p>
            {result.ok} saved{result.failed.length ? `, ${result.failed.length} didn't go in:` : "."}
          </p>
          {result.failed.length > 0 && (
            <ul className="imp-list">
              {result.failed.map((f, i) => (
                <li key={i}>
                  <b>{f.what}</b> {f.why}
                </li>
              ))}
            </ul>
          )}
          <Link className="adm-btn" href="/admin/products?need=hidden">
            See the new drafts
          </Link>
        </section>
      )}
    </div>
  );
}
