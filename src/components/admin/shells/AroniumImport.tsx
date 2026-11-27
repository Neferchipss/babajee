"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { adminApi, isAdminDemo } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct } from "@/lib/admin-data";
import { errText } from "@/lib/orders-db";
import { FIELD_LABELS, planImport, planSummary, type ImportField, type ImportPlan } from "@/lib/product-import";
import { downloadTemplate, runImport, type ImportResult } from "@/lib/product-import-run";
import { readSheet } from "@/lib/stock-in/sheet";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArToolbar, type ArCol } from "./aronium-kit";
import { ArHelp, ArInfo } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Products • Import, as Aronium's import: numbered steps (pick
// the file, check what it will do, import), the toolbar across the top. The
// sheet is read in the browser and matched to the shop (lib/product-import),
// shown as grids of what will change; nothing is written until Import. New
// products come in as drafts; empty cells are left alone.
type Tab = "updates" | "options" | "new" | "notes";
type Upd = ImportPlan["updates"][number];
type Opt = ImportPlan["newOptions"][number];
type New = ImportPlan["newProducts"][number];
type Note = ImportPlan["problems"][number] & { i: number };

export default function AroniumImport() {
  const api = adminApi();
  const fileRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [file, setFile] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [err, setErr] = useState("");
  const [going, setGoing] = useState<{ done: number; of: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [tab, setTab] = useState<Tab>("updates");
  const [help, setHelp] = useState(false);

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
      const p = planImport(rows, products, cats);
      setPlan(p);
      setTab(p.updates.length ? "updates" : p.newOptions.length ? "options" : p.newProducts.length ? "new" : "notes");
    } catch (e) {
      setPlan(null);
      setErr(e instanceof Error ? e.message : errText(e));
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function apply() {
    if (!plan) return;
    const res = await runImport(api, plan, (done, of) => setGoing({ done, of }));
    setGoing(null);
    setResult(res);
    setPlan(null);
    if (res.failed.length) toastError(`${res.failed.length} row${res.failed.length === 1 ? "" : "s"} didn't go in: see the list`);
    else toast(`Import done: ${res.ok} change${res.ok === 1 ? "" : "s"}`);
    await load().catch(() => {});
  }

  const count = plan ? plan.updates.length + plan.newOptions.length + plan.newProducts.length : 0;
  const found = (Object.keys(FIELD_LABELS) as ImportField[]).filter((f) => plan && !plan.unmapped.includes(f));
  const busy = !!going;

  const updCols: ArCol<Upd>[] = [
    { k: "row", label: "Row", right: true, render: (u) => u.row, sort: (u) => u.row },
    { k: "name", label: "Product", render: (u) => u.name, sort: (u) => u.name },
    { k: "opt", label: "Option", render: (u) => (u.option !== "Default" ? u.option : "") },
    {
      k: "ch",
      label: "Changes",
      render: (u) => (
        <span className="arc-diff">
          {u.changes.map((c) => (
            <span key={c.field}>
              {FIELD_LABELS[c.field]}: <s>{c.from}</s> → <b>{c.to}</b>
            </span>
          ))}
        </span>
      ),
    },
  ];
  const optCols: ArCol<Opt>[] = [
    { k: "row", label: "Row", right: true, render: (o) => o.row, sort: (o) => o.row },
    { k: "name", label: "Product", render: (o) => o.name, sort: (o) => o.name },
    { k: "opt", label: "New option", render: (o) => o.option || "new option" },
    { k: "price", label: "Sale price", right: true, render: (o) => (o.variant.price != null ? `₹${o.variant.price}` : "") },
    { k: "qty", label: "Quantity", right: true, render: (o) => (o.stock != null ? o.stock : "") },
  ];
  const newCols: ArCol<New>[] = [
    { k: "row", label: "Rows", render: (n) => n.rows.join(", "), sort: (n) => n.rows[0] },
    { k: "name", label: "Name", render: (n) => n.name, sort: (n) => n.name },
    { k: "group", label: "Group", render: (n) => n.categoryName, sort: (n) => n.categoryName },
    { k: "opts", label: "Options and prices", render: (n) => n.options.map((o) => `${o.label === "Default" ? "" : `${o.label} `}${o.variant.price != null ? `₹${o.variant.price}` : "no price"}`).join(", ") },
    { k: "st", label: "Status", render: () => "Draft" },
  ];
  const noteCols: ArCol<Note>[] = [
    { k: "row", label: "Row", right: true, render: (p) => p.row, sort: (p) => p.row },
    { k: "msg", label: "Note", render: (p) => p.message },
  ];

  const tabs: [Tab, string, number][] = plan
    ? [
        ["updates", "To update", plan.updates.length],
        ["options", "New options", plan.newOptions.length],
        ["new", "New products", plan.newProducts.length],
        ["notes", "Notes", plan.problems.length],
      ]
    : [];

  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "open", label: "Open file", disabled: !products || busy, onClick: () => fileRef.current?.click() },
          { icon: "excel", label: "Template", disabled: !cats.length, onClick: () => downloadTemplate(cats) },
          { icon: "import", label: going ? `Saving ${going.done}/${going.of}` : "Import", disabled: !count || busy, onClick: apply },
          { icon: "clear", label: "Cancel", disabled: !plan || busy, onClick: () => setPlan(null) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Sheet to import" />
      <div className="arc-pane">
        {err && <p className="adm-err">{err}</p>}
        <ol className="arc-steps">
          <li>
            <b>Select file</b>
            <small>An Excel (.xlsx) or .csv file, one row per option. Columns can be in any order.</small>
            <div className="arc-inline">
              <button type="button" className="arc-btn is-pri" disabled={!products || busy} onClick={() => fileRef.current?.click()}>
                {products ? "Browse" : "Loading the shop…"}
              </button>
              <input className="adm-input" readOnly value={file} placeholder="No file selected" aria-label="Selected file" />
              <button type="button" className="arc-btn" disabled={!cats.length} onClick={() => downloadTemplate(cats)}>
                Download template
              </button>
            </div>
            <ArInfo>
              Usual column names: Product (or Item name), Category, Option (or Size, Colour), Selling price, MRP (or Was price), Stock (or Qty), SKU, Barcode, Brand, HSN, GST %, Buying price (or Cost), Weight (g), Tags, Description. A row is matched by its SKU first, then by name and option.
            </ArInfo>
          </li>
          <li className={plan ? "" : "is-wait"}>
            <b>Check changes</b>
            {plan ? (
              <>
                <small>
                  {file}: {planSummary(plan)}
                </small>
                <small>Columns found: {found.map((f) => FIELD_LABELS[f]).join(", ") || "none"}</small>
              </>
            ) : (
              <small>Nothing is saved until you press Import.</small>
            )}
          </li>
          <li className={plan && count ? "" : "is-wait"}>
            <b>Import</b>
            <small>New products come in as drafts. Empty cells are left alone, never wiped.</small>
            <div className="arc-inline">
              <button type="button" className="arc-btn is-pri" disabled={!count || busy} onClick={apply}>
                {going ? `Saving ${going.done} of ${going.of}` : `Import ${count} change${count === 1 ? "" : "s"}`}
              </button>
              <button type="button" className="arc-btn" disabled={!plan || busy} onClick={() => setPlan(null)}>
                Cancel
              </button>
            </div>
            {isAdminDemo() && <small>Demo: stock counts and buying prices are not saved here.</small>}
          </li>
        </ol>
      </div>

      {plan && (
        <>
          <div className="ars-innertabs" role="tablist" aria-label="What the sheet will do">
            {tabs.map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
                {label} ({n})
              </button>
            ))}
          </div>
          {tab === "updates" && (plan.updates.length ? <ArGrid cols={updCols} rows={plan.updates} keyOf={(u) => String(u.row)} className="arc-grid" /> : <ArEmpty title="No products to update" />)}
          {tab === "options" && (plan.newOptions.length ? <ArGrid cols={optCols} rows={plan.newOptions} keyOf={(o) => String(o.row)} className="arc-grid" /> : <ArEmpty title="No new options" />)}
          {tab === "new" && (plan.newProducts.length ? <ArGrid cols={newCols} rows={plan.newProducts} keyOf={(n) => n.key} className="arc-grid" /> : <ArEmpty title="No new products" />)}
          {tab === "notes" &&
            (plan.problems.length ? (
              <>
                <p className="arc-note arc-pane">A row with a mistake is skipped; a stock note only leaves that stock alone.</p>
                <ArGrid cols={noteCols} rows={plan.problems.map((p, i) => ({ ...p, i }))} keyOf={(p) => String(p.i)} className="arc-grid" />
              </>
            ) : (
              <ArEmpty title="No notes" />
            ))}
        </>
      )}

      {result && (
        <div className="arc-pane">
          <ArSection title="Import finished" />
          <p>
            {result.ok} saved{result.failed.length ? `, ${result.failed.length} didn't go in:` : "."}
          </p>
          {result.failed.length > 0 && (
            <ArGrid
              cols={[
                { k: "what", label: "Row", render: (f: ImportResult["failed"][number]) => f.what },
                { k: "why", label: "Why", render: (f: ImportResult["failed"][number]) => f.why },
              ]}
              rows={result.failed}
              keyOf={(f) => f.what}
              className="arc-grid"
            />
          )}
          <div className="arc-inline">
            <Link className="arc-btn" href="/admin/products?need=hidden">
              See the new drafts
            </Link>
          </div>
        </div>
      )}

      <ArHelp open={help} onClose={() => setHelp(false)} title="Import products">
        <p>Add products, or update prices, stock, codes, GST and more, from a sheet with one row per option.</p>
        <p>Open the file, check the four tabs (what will be updated, new options, new products, and notes on rows that can&apos;t go in), then press Import. Nothing is saved before that.</p>
        <p>New products come in as drafts, so they stay off the shop until you show them. A cell left empty never wipes what&apos;s there. Stock and buying prices are set as an adjustment marked &ldquo;Sheet import&rdquo;.</p>
      </ArHelp>
    </ArScreen>
  );
}
