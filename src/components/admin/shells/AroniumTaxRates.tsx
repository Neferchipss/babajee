"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { AdminProduct } from "@/lib/admin-data";
import { GST_BRACKETS } from "@/lib/gst";
import { errText, getSettings, type StoreSettings } from "@/lib/orders-db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArGrid, ArScreen, ArStepper, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";

// Management • Tax rates, in Aronium's layout but on India's GST system: one
// row per GST slab, each split the way GST charges it, CGST + SGST/UTGST
// (half each) to a buyer in the shop's own state and the whole rate as IGST
// to any other state. The slabs are set by law, so nothing here adds, edits
// or moves them, and there is deliberately no "Switch taxes": a product's
// slab follows its HSN code, set product by product on the Product taxes
// (HSN) tab. Babajee's column: how many products sit on each slab (products
// without their own use the shop's default, marked). Cess shows as its own
// row when it is switched on.
type Row = { name: string; rate: number; code: string; fixed: boolean; on: boolean; products: number; cess?: boolean };
const LAW = "GST slabs are set by law";

export default function AroniumTaxRates() {
  const api = adminApi();
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<Row | "new" | null>(null);
  const [help, setHelp] = useState(false);

  const load = () =>
    Promise.all([getSettings(), api.listProducts()]).then(
      ([s, p]) => {
        setSettings(s);
        setProducts(p);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = (products ?? []).filter((p) => p.status !== "archived");
  const def = settings?.gst_rate ?? 18;
  const on = (p: AdminProduct, rate: number) => (p.gst_rate ?? def) === rate;
  const rows: Row[] = GST_BRACKETS.map((rate) => ({
    name: `GST ${rate}%${rate === def ? " (default)" : ""}`,
    rate,
    code: `GST${rate}`,
    fixed: false,
    on: true,
    products: live.filter((p) => on(p, rate)).length,
  }));
  if (settings?.cess_enabled) rows.push({ name: "Cess (per product)", rate: 0, code: "CESS", fixed: false, on: true, products: live.filter((p) => Number(p.cess_rate ?? 0) > 0).length, cess: true });
  const picked = rows.find((r) => r.code === sel) ?? null;
  const hsnPage = "/admin/finance/gst";
  useArKeys({ edit: picked ? () => setView(picked) : undefined, refresh: () => void load() });

  const cols: ArCol<Row>[] = [
    { k: "name", label: "Name", render: (r) => r.name, sort: (r) => r.rate },
    { k: "code", label: "Code", render: (r) => r.code },
    { k: "rate", label: "Rate", right: true, render: (r) => (r.cess ? "per product" : `${r.rate}%`), sort: (r) => r.rate },
    { k: "cgst", label: "CGST", right: true, render: (r) => (r.cess ? "" : `${r.rate / 2}%`) },
    { k: "sgst", label: "SGST / UTGST", right: true, render: (r) => (r.cess ? "" : `${r.rate / 2}%`) },
    { k: "igst", label: "IGST", right: true, render: (r) => (r.cess ? "" : `${r.rate}%`) },
    { k: "fixed", label: "Fixed", center: true, render: (r) => <Tick on={r.fixed} /> },
    { k: "on", label: "Enabled", center: true, render: (r) => <Tick on={r.on} /> },
    { k: "n", label: "Products", right: true, render: (r) => (products ? r.products : ""), sort: (r) => r.products },
  ];
  const menu = (r: Row | null) =>
    stdMenu({
      add: () => setView("new"),
      addLabel: "New tax rate",
      edit: () => r && setView(r),
      del: () => {},
      refresh: () => void load(),
      has: !!r,
      extra: [{ label: "Product taxes (HSN)", onClick: () => router.push(hsnPage) }],
    }).map((x) => (x !== "-" && (x.label === "Delete" || x.label === "New tax rate") ? { ...x, disabled: true } : x));

  const v = view === "new" ? null : view;
  return (
    <ArScreen>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "New tax rate", disabled: true, title: LAW },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && setView(picked) },
          { icon: "del", label: "Delete", disabled: true, title: LAW },
          { icon: "tag", label: "Product taxes (HSN)", href: hsnPage, title: "Set each product's HSN code and slab" },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <ArGrid cols={cols} rows={rows} keyOf={(r) => r.code} sel={sel} onSel={setSel} onOpen={setView} menu={menu} />

      <ArPanel
        open={view !== null}
        title={v ? v.name.replace(" (default)", "") : "New tax rate"}
        width="narrow"
        canSave={false}
        onSave={() => {}}
        onClose={() => setView(null)}
        banner={
          <ArInfo tone="warn">
            {LAW}, so they can&apos;t be {v ? "changed" : "added"} here.{v && !v.cess ? ` ${v.products} product${v.products === 1 ? " is" : "s are"} on it; a product's slab follows its HSN code, set on Product taxes (HSN).` : ""}
          </ArInfo>
        }
      >
        <ArField label="Name">
          <input className="adm-input" readOnly value={v ? v.name.replace(" (default)", "") : ""} />
        </ArField>
        <ArField label="Code" size="short">
          <input className="adm-input" readOnly value={v?.code ?? ""} />
        </ArField>
        <ArField label="Rate">
          <ArStepper label="Rate" value={v?.rate ?? 0} disabled suffix="%" />
        </ArField>
        {v && !v.cess && (
          <ArInfo>
            In {settings?.store_state || "the shop's state"}: CGST {v.rate / 2}% + SGST/UTGST {v.rate / 2}%. To any other state: IGST {v.rate}%.
          </ArInfo>
        )}
        <div className="ara-toggles">
          <ArSwitch on={v?.fixed ?? false} label="Fixed" disabled title={LAW} />
          <ArSwitch on={v?.on ?? true} label="Enabled" disabled title={LAW} />
        </div>
      </ArPanel>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Tax rates">
        <p>India&apos;s GST slabs. {LAW}, so they can&apos;t be added, changed or deleted.</p>
        <p>Inside {settings?.store_state || "the shop's own state"} a slab is charged as CGST plus SGST/UTGST, half each; to every other state it is charged whole as IGST.</p>
        <p>Each product sits on one slab, which follows its HSN code; products without their own use the shop&apos;s default, marked (default). Set codes and slabs product by product on <Link href={hsnPage}>Product taxes (HSN)</Link>.</p>
        {settings?.cess_enabled && <p>Cess is charged on top of GST, at each product&apos;s own rate.</p>}
      </ArHelp>
    </ArScreen>
  );
}
