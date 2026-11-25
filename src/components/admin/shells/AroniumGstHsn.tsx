"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { listCategories, listProducts, updateProduct, type AdminCategory, type AdminProduct } from "@/lib/admin-data";
import { GST_BRACKETS } from "@/lib/gst";
import { errText, getSettings } from "@/lib/orders-db";
import { getSupabase } from "@/lib/supabase";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArSwitch, ArToolbar, menuOf, useArKeys, useArMenu, type ArCol } from "./aronium-kit";
import { ArHelp, ArInfo } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Tax rates • Product taxes (HSN), on Aronium's Products layout:
// the product groups down the left, the search row and the grid on the
// right, each product's HSN code and GST slab edited in the grid. India's
// rule holds here: a product's slab follows its HSN code, so a group's slab
// is set together with its HSN (Fill missing, or Set on all), never on its
// own. A product without its own slab uses the shop's default, from Settings.
const HSN_OK = /^(\d{4}|\d{6}|\d{8})$/;

export default function AroniumGstHsn() {
  const tree = useArMenu();
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [shopRate, setShopRate] = useState(18);
  const [err, setErr] = useState("");
  const [missing, setMissing] = useState(true);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("");
  const [sel, setSel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const load = () =>
    Promise.all([listCategories(), listProducts(), getSettings()]).then(
      ([c, p, s]) => {
        setCats(c);
        setProducts(p.filter((x) => x.status !== "archived"));
        setShopRate(s.gst_rate);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);
  useArKeys({ refresh: () => void load() });

  const gap = (p: AdminProduct) => !p.hsn || p.gst_rate == null;
  const inGroup = useMemo(() => (products ?? []).filter((p) => !group || p.category_id === group), [products, group]);
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return inGroup.filter((p) => (!missing || gap(p)) && (!w || p.name.toLowerCase().includes(w) || p.hsn.includes(w)));
  }, [inGroup, missing, q]);
  const noHsn = (products ?? []).filter((p) => !p.hsn).length;
  const noRate = (products ?? []).filter((p) => p.gst_rate == null).length;
  const cat = cats.find((c) => c.id === group) ?? null;
  const patchLocal = (id: string, patch: Partial<AdminProduct>) => setProducts((l) => (l ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)));
  async function save(p: AdminProduct, patch: Partial<Pick<AdminProduct, "hsn" | "gst_rate">>) {
    try {
      await updateProduct(p.id, patch);
      patchLocal(p.id, patch);
    } catch (e) {
      toastError(errText(e));
    }
  }

  const cols: ArCol<AdminProduct>[] = [
    { k: "name", label: "Name", render: (p) => p.name, sort: (p) => p.name },
    { k: "group", label: "Group", render: (p) => p.category_name, sort: (p) => p.category_name ?? "" },
    { k: "hsn", label: "HSN code", render: (p) => <HsnCell key={p.id + p.hsn} p={p} onSave={(hsn) => save(p, { hsn })} />, sort: (p) => p.hsn },
    {
      k: "rate",
      label: "GST slab",
      render: (p) => (
        <select className="adm-input arc-rate" aria-label={`${p.name} GST slab`} value={p.gst_rate == null ? "" : String(p.gst_rate)} onChange={(e) => save(p, { gst_rate: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">Default ({shopRate}%)</option>
          {GST_BRACKETS.map((b) => (
            <option key={b} value={b}>
              GST {b}%
            </option>
          ))}
        </select>
      ),
      sort: (p) => p.gst_rate ?? -1,
    },
    { k: "split", label: "CGST + SGST", right: true, render: (p) => `${(p.gst_rate ?? shopRate) / 2}% + ${(p.gst_rate ?? shopRate) / 2}%` },
    { k: "igst", label: "IGST", right: true, render: (p) => `${p.gst_rate ?? shopRate}%` },
  ];

  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "percent", label: "Tax rates", href: "/admin/tax-rates", title: "The GST slabs" },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      >
        <span className="ars-tool-switch">
          <ArSwitch on={missing} onChange={setMissing} label="Missing HSN or slab only" />
        </span>
      </ArToolbar>
      {err && <p className="adm-err">{err}</p>}
      {products && (
        <ArInfo>
          {noHsn} of {products.length} products have no HSN code · {noRate} use the shop&apos;s default slab ({shopRate}%), set in <Link href="/admin/settings?view=shop">Shop settings</Link>. Every line of a tax invoice needs an HSN code.
        </ArInfo>
      )}
      <div className="ars-body">
        <nav className="arp-tree" aria-label="Product groups" onContextMenu={(e) => tree.open(e, menuOf([{ label: "Refresh", key: "F5", onClick: () => void load() }]))}>
          {tree.node}
          <button type="button" className={`arp-root ${!group ? "is-on" : ""}`} onClick={() => setGroup("")}>
            <ArIcon name="folder" size={16} />
            Products
          </button>
          <ul>
            {cats.map((c) => {
              const mine = (products ?? []).filter((p) => p.category_id === c.id);
              const gaps = mine.filter(gap).length;
              return (
                <li key={c.id}>
                  <button type="button" className={group === c.id ? "is-on" : ""} onClick={() => setGroup(c.id)} title={gaps ? `${gaps} missing` : "All set"}>
                    <ArIcon name="folder" size={16} />
                    <span>{c.name}</span>
                    <small>{gaps ? `${gaps} missing` : "✓"}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <section className="arp-list">
          {cat && <GroupBand key={cat.id} cat={cat} products={inGroup} onDone={load} />}
          <div className="arp-search ars-cs-search">
            <input type="search" placeholder="Search product or HSN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" />
            <ArIcon name="search" size={20} />
            <span className="arp-count">
              Products count: <b>{products ? shown.length : "…"}</b>
            </span>
          </div>
          {!products ? (
            <p className="arc-note arc-pane">Loading.</p>
          ) : !shown.length ? (
            <ArEmpty title={missing ? "Every product here has an HSN code and a GST slab" : "Nothing matches"} />
          ) : (
            <ArGrid cols={cols} rows={shown.slice(0, 300)} keyOf={(p) => p.id} sel={sel} onSel={setSel} className="arc-grid" />
          )}
          {shown.length > 300 && <p className="arc-note arc-pane">Showing 300 of {shown.length}. Search or pick a group to narrow it.</p>}
        </section>
      </div>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Product taxes (HSN)">
        <p>Each product&apos;s HSN code and GST slab. A tax invoice needs an HSN code on every line, and the slab decides what is charged and claimed.</p>
        <p>Under GST a product&apos;s slab follows its HSN code, so for a whole group the slab is set together with its HSN: Fill missing fills only the products still without one; Set on all sets every product in the group.</p>
        <p>To change one product, edit its HSN code (saved when you leave the box) or pick its slab in the grid. Default means the shop&apos;s default slab, from Shop settings. Orders already placed keep what they were charged.</p>
      </ArHelp>
    </ArScreen>
  );
}

function HsnCell({ p, onSave }: { p: AdminProduct; onSave: (hsn: string) => void }) {
  const [hsn, setHsn] = useState(p.hsn);
  const bad = hsn !== "" && !HSN_OK.test(hsn);
  return (
    <input
      className="adm-input arc-hsn"
      inputMode="numeric"
      maxLength={8}
      placeholder="HSN"
      aria-label={`${p.name} HSN code`}
      aria-invalid={bad}
      title={bad ? "An HSN code is 4, 6 or 8 digits." : undefined}
      value={hsn}
      onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))}
      onBlur={() => !bad && hsn !== p.hsn && onSave(hsn)}
    />
  );
}

// the selected group's band: its HSN code and slab, set together on the
// products still missing them or on all of them
function GroupBand({ cat, products, onDone }: { cat: AdminCategory; products: AdminProduct[]; onDone: () => Promise<unknown> }) {
  const hsns = [...new Set(products.map((p) => p.hsn).filter(Boolean))];
  const rates = [...new Set(products.map((p) => p.gst_rate).filter((r) => r != null))];
  const [hsn, setHsn] = useState(hsns.length === 1 ? hsns[0] : "");
  const [rate, setRate] = useState<string>(rates.length === 1 ? String(rates[0]) : "");
  const [busy, setBusy] = useState(false);
  const gaps = products.filter((p) => !p.hsn || p.gst_rate == null).length;
  const hsnBad = hsn !== "" && !HSN_OK.test(hsn);
  // the slab follows the HSN: a slab is only set with its code
  const ready = !hsnBad && hsn !== "";

  async function apply(onlyMissing: boolean) {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Not connected to the database.");
      const patch: { hsn: string; gst_rate?: number } = { hsn };
      if (rate) patch.gst_rate = Number(rate);
      if (onlyMissing) {
        const a = await sb.from("products").update({ hsn: patch.hsn }).eq("category_id", cat.id).neq("status", "archived").or("hsn.is.null,hsn.eq.");
        if (a.error) throw a.error;
        if (patch.gst_rate != null) {
          const b = await sb.from("products").update({ gst_rate: patch.gst_rate }).eq("category_id", cat.id).neq("status", "archived").is("gst_rate", null);
          if (b.error) throw b.error;
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
    <div className="arc-pane">
      <div className="arc-inline">
        <b>{cat.name}</b>
        <span className="arc-grey">
          {products.length} product{products.length === 1 ? "" : "s"}
          {gaps ? ` · ${gaps} missing` : " · all set"}
        </span>
      </div>
      <div className="arc-inline">
        <input className="adm-input is-short" inputMode="numeric" maxLength={8} placeholder="HSN code" aria-label={`${cat.name} HSN code`} aria-invalid={hsnBad} value={hsn} onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))} />
        <select className="adm-input is-short" aria-label={`${cat.name} GST slab`} value={rate} onChange={(e) => setRate(e.target.value)}>
          <option value="">Slab: leave as is</option>
          {GST_BRACKETS.map((b) => (
            <option key={b} value={b}>
              GST {b}%
            </option>
          ))}
        </select>
        <button type="button" className="arc-btn" disabled={!ready || busy || !gaps} onClick={() => apply(true)}>
          Fill missing
        </button>
        <button type="button" className="arc-btn" disabled={!ready || busy || !products.length} onClick={() => apply(false)}>
          Set on all {products.length}
        </button>
      </div>
      {hsnBad && <p className="adm-err">An HSN code is 4, 6 or 8 digits.</p>}
    </div>
  );
}
