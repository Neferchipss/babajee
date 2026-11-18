"use client";

// The full product page (UI redesign, stage 2): one page to add and edit a
// product, laid out the way it is filled in.
//   main column  Basics · Photos · Options (one row each: price, was-price,
//                SKU, barcode, weight, sold; box rows under each) · Stock ·
//                Specifications · Bundle · Videos
//   right column Status and what it still needs · Organise (Type, then that
//                type's sub-categories, search keywords) · Tax · Cost and
//                profit · Search listing
// The words and numbers (name, prices, codes, type, sub-categories, tax,
// listing…) are a draft saved together from the Save bar; photos, stock,
// boxes and bundles act at once, as they're things done, not typed.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Confirm, Failed, GstPicker, Loading, SaveBar, Toggle } from "@/components/admin/kit";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import ProductStock from "@/components/admin/stock/ProductStock";
import { AddPhotos, PhotoGroup } from "@/components/admin/editor/Photos";
import { BoxSetup, BoxesBlock } from "@/components/admin/editor/Boxes";
import { BundleBlock } from "@/components/admin/editor/Bundle";
import { GstNote, type Rules } from "@/components/admin/editor/Pricing";
import { StockHistory, Videos } from "@/components/admin/editor/Details";
import { useBoxes, usePhotoManager } from "@/components/admin/editor/useProductParts";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant, ProductStatus, Spec, SubGroup, Subcategory } from "@/lib/admin-data";
import { BRAND_NAMES, brandOf } from "@/lib/brand";
import { formatPrice } from "@/lib/currency";
import { supplierGst, unitProfit } from "@/lib/gst";
import { errText, type Purchase } from "@/lib/orders-db";
import { autoDescription, autoTitle, DESC_MAX, fullTitle, TITLE_MAX } from "@/lib/seo";
import { can, useStaff } from "@/lib/staff";
import "./product-page.css";

type Api = ReturnType<typeof adminApi>;
type Option = {
  key: string;
  id?: string;
  label: string;
  price: string;
  compare_at: string;
  sku: string;
  barcode: string;
  weight_g: string;
  is_visible: boolean;
  remove?: boolean;
};
type Draft = {
  name: string;
  description: string;
  brand: string;
  category_id: string;
  subcategory_ids: string[];
  tags: string[];
  status: ProductStatus;
  gst_rate: number | null;
  hsn: string;
  cess_rate: string;
  low_stock_at: string;
  specs: Spec[];
  seo_title: string;
  seo_description: string;
  options: Option[];
};

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const optionOf = (v: AdminVariant): Option => ({
  key: v.id,
  id: v.id,
  label: v.label,
  price: v.price ? String(v.price) : "",
  compare_at: str(v.compare_at),
  sku: v.sku ?? "",
  barcode: v.barcode ?? "",
  weight_g: str(v.weight_g),
  is_visible: v.is_visible,
});
const draftOf = (p: AdminProduct): Draft => ({
  name: p.name,
  description: p.description,
  brand: p.brand,
  category_id: p.category_id,
  subcategory_ids: [...p.subcategory_ids].sort(),
  tags: p.tags,
  status: p.status,
  gst_rate: p.gst_rate,
  hsn: p.hsn,
  cess_rate: p.cess_rate ? String(p.cess_rate) : "",
  low_stock_at: str(p.low_stock_at),
  specs: p.specs,
  seo_title: p.seo_title,
  seo_description: p.seo_description,
  options: p.variants.filter((v) => !v.unit_variant_id).map(optionOf),
});
const STATUS: [ProductStatus, string, string][] = [
  ["draft", "Draft", "Being prepared: not on the shop"],
  ["published", "Active", "On the shop"],
  ["archived", "Archived", "Retired: off the shop, kept for its orders"],
];

export default function ProductPage({ id }: { id: string }) {
  const api = adminApi();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [shop, setShop] = useState<(Rules & { cessOn: boolean }) | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(
    () =>
      Promise.all([api.getProduct(id), api.listCategories()]).then(
        ([p, c]) => {
          setCategories(c);
          if (!p) setErr("No product with this id.");
          else setProduct(p);
        },
        (e) => setErr(errText(e)),
      ),
    [api, id],
  );
  useEffect(() => {
    void load();
    import("@/lib/orders-db")
      .then((m) => m.getSettings())
      .then((s) => setShop({ rate: s.gst_rate, inclusive: s.gst_inclusive, credit: s.gst_input_credit, cessOn: s.cess_enabled }))
      .catch(() => setShop({ rate: 18, inclusive: true, credit: false, cessOn: false }));
  }, [load]);

  if (err) return <Failed error={err} onRetry={load} />;
  if (!product || !shop) return <Loading what="the product" />;
  return <Editor key={product.id} api={api} product={product} categories={categories} shop={shop} onReload={async () => setProduct(await api.getProduct(id))} />;
}

function Editor({ api, product, categories, shop, onReload }: { api: Api; product: AdminProduct; categories: AdminCategory[]; shop: Rules & { cessOn: boolean }; onReload: () => Promise<void> }) {
  const router = useRouter();
  const { me } = useStaff();
  const role = me?.role ?? null;
  const saved = useMemo(() => draftOf(product), [product]);
  const [d, setD] = useState<Draft>(saved);
  const [base, setBase] = useState<Draft>(saved);
  if (base !== saved && JSON.stringify(base) !== JSON.stringify(saved)) {
    setBase(saved);
    setD(saved);
  }
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setOpt = (key: string, patch: Partial<Option>) => setD((x) => ({ ...x, options: x.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) }));
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // things done at once (photos, stock, boxes, bundle): then the product is read again
  const run = useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        await work();
        await onReload();
        return true;
      } catch (e) {
        toastError(errText(e));
        return false;
      }
    },
    [onReload],
  );
  const photos = usePhotoManager(product, api, run, (n) => toast(`${n} photo${n === 1 ? "" : "s"} added`));
  const boxes = useBoxes(product, categories, api, run);
  const cat = categories.find((c) => c.id === d.category_id);
  const live = d.options.filter((o) => !o.remove);
  const many = live.length > 1;

  // what it still needs before it can be Active
  const needs = [
    !d.name.trim() && "a name",
    !live.some((o) => Number(o.price) > 0) && "a selling price",
    !product.images.length && !photos.itemsOf(null).length && "a photo",
    !d.hsn && "an HSN code",
  ].filter(Boolean) as string[];

  function check(): string {
    if (!d.name.trim()) return "The product needs a name.";
    if (!live.length) return "Keep at least one option.";
    for (const o of live) {
      if (!o.label.trim()) return "Every option needs a name.";
      const p = num(o.price);
      const c = num(o.compare_at);
      if (p != null && !(p >= 0)) return `${o.label}: the price isn't a number.`;
      if (c != null && p != null && c <= p) return `${o.label}: the was-price should be above the price.`;
      if (o.weight_g && !(Number(o.weight_g) > 0)) return `${o.label}: the weight should be in grams.`;
    }
    if (d.hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(d.hsn)) return "An HSN code is 4, 6 or 8 digits.";
    if (d.cess_rate && !(Number(d.cess_rate) >= 0)) return "Cess is a percentage.";
    // making it Active needs the essentials; one already Active can still be saved
    if (d.status === "published" && base.status !== "published" && needs.length) return `To make it Active it still needs ${needs.join(", ")}.`;
    return "";
  }

  async function save() {
    const problem = check();
    if (problem) {
      toastError(problem);
      return;
    }
    setBusy(true);
    try {
      const patch: Partial<AdminProduct> = {};
      const same = (k: keyof Draft) => JSON.stringify(d[k]) === JSON.stringify(base[k]);
      if (!same("name")) patch.name = d.name.trim();
      if (!same("description")) patch.description = d.description.trim();
      if (!same("brand")) patch.brand = d.brand.trim();
      if (!same("category_id")) patch.category_id = d.category_id;
      if (!same("tags")) patch.tags = d.tags;
      if (!same("gst_rate")) patch.gst_rate = d.gst_rate;
      if (!same("hsn")) patch.hsn = d.hsn;
      if (!same("cess_rate")) patch.cess_rate = Number(d.cess_rate) || 0;
      if (!same("low_stock_at")) patch.low_stock_at = num(d.low_stock_at);
      if (!same("specs")) patch.specs = d.specs.filter((s) => s.label.trim() && s.value.trim());
      if (!same("seo_title")) patch.seo_title = d.seo_title.trim();
      if (!same("seo_description")) patch.seo_description = d.seo_description.trim();
      if (Object.keys(patch).length) await api.updateProduct(product.id, patch as Parameters<Api["updateProduct"]>[1]);
      // options: changed, new, removed
      for (const o of d.options) {
        const was = base.options.find((b) => b.key === o.key);
        if (o.remove) {
          if (o.id) await api.deleteVariant(o.id);
          continue;
        }
        const row: Partial<AdminVariant> = {
          label: o.label.trim(),
          price: num(o.price) ?? 0,
          compare_at: num(o.compare_at),
          sku: o.sku.trim() || null,
          barcode: o.barcode.trim() || null,
          weight_g: num(o.weight_g),
          is_visible: o.is_visible,
        };
        if (!o.id) await api.upsertVariant(product.id, { ...row, sort_order: product.variants.length + d.options.indexOf(o) });
        else if (JSON.stringify(o) !== JSON.stringify(was)) await api.upsertVariant(product.id, { id: o.id, ...row });
      }
      // sub-categories belong to the type: a new type starts with none
      if (!same("subcategory_ids") || !same("category_id")) await api.setProductSubcategories(product.id, d.subcategory_ids);
      if (!same("status")) await api.setProductStatus({ ...product, variants: (await api.getProduct(product.id))!.variants }, d.status);
      await onReload();
      toast(`${d.name.trim()} saved`);
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteProduct(product);
      toast(`${product.name} deleted`);
      router.push("/admin/products");
    } catch (e) {
      toastError(errText(e));
      setBusy(false);
      setDeleting(false);
    }
  }

  const rules: Rules = { rate: d.gst_rate ?? shop.rate, inclusive: shop.inclusive, credit: shop.credit, cess: shop.cessOn ? Number(d.cess_rate) || 0 : 0 };

  return (
    <div className="prd">
      <div className="prd-top">
        <Link href="/admin/products" className="prd-back">
          ‹ Products
        </Link>
        <h1>{d.name.trim() || "Untitled product"}</h1>
        <div className="prd-status" role="radiogroup" aria-label="Status">
          {STATUS.map(([s, label, hint]) => (
            <button key={s} type="button" role="radio" aria-checked={d.status === s} title={hint} className={d.status === s ? `is-on is-${s}` : ""} onClick={() => set({ status: s })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="prd-cols">
        <div className="prd-main">
          {/* ------------------------------------------------ basics */}
          <section className="adm-card prd-card">
            <h2>Basics</h2>
            <label className="adm-label">
              Name
              <input className="adm-input" value={d.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="adm-label">
              Description
              <textarea className="adm-input" rows={4} value={d.description} placeholder="Pack size, material, what it fits" onChange={(e) => set({ description: e.target.value })} />
            </label>
            <label className="adm-label">
              Brand
              <input className="adm-input" list="prd-brands" value={d.brand} placeholder={brandOf(d.name).brand ?? "No brand"} onChange={(e) => set({ brand: e.target.value })} />
              <datalist id="prd-brands">
                {BRAND_NAMES.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
          </section>

          {/* ------------------------------------------------ photos */}
          <section className="adm-card prd-card">
            <h2>Photos</h2>
            <PhotoGroup
              {...photos.groupProps}
              group={null}
              items={photos.itemsOf(null)}
              onFiles={(f) => photos.addFiles(f, null)}
              add={<AddPhotos label={photos.uploading ? `Uploading ${photos.uploading.done + 1} of ${photos.uploading.of}` : "Add photos"} busy={!!photos.uploading} onFiles={(f) => photos.addFiles(f, null)} />}
            />
            {photos.many &&
              product.variants
                .filter((v) => !v.unit_variant_id)
                .map((v) => (
                  <div key={v.id} className="prd-optphotos">
                    <b>{v.label}</b>
                    <PhotoGroup
                      {...photos.groupProps}
                      small
                      group={v.id}
                      items={photos.itemsOf(v.id)}
                      onFiles={(f) => photos.addFiles(f, v.id)}
                      add={<AddPhotos label={photos.itemsOf(v.id).length ? "More" : `Photos of ${v.label}`} busy={!!photos.uploading} onFiles={(f) => photos.addFiles(f, v.id)} />}
                    />
                  </div>
                ))}
            <p className="adm-muted adm-small">Drag to reorder, or onto an option. You can also paste a photo anywhere on this page.</p>
          </section>

          {/* ------------------------------------------------ options */}
          <section className="adm-card prd-card">
            <div className="prd-card-head">
              <h2>{many ? "Options" : "Price and codes"}</h2>
              <button
                type="button"
                className="adm-btn"
                onClick={() =>
                  set({
                    options: [...d.options, { key: `new-${Date.now()}`, label: "", price: live[0]?.price ?? "", compare_at: "", sku: "", barcode: "", weight_g: live[0]?.weight_g ?? "", is_visible: true }],
                  })
                }
              >
                + Add an option
              </button>
            </div>
            {many && live.some((o) => o.label === "Default") && <p className="prd-note">Rename &ldquo;Default&rdquo; to what makes it different (a size, a colour).</p>}
            <div className={`prd-opts ${many ? "is-many" : ""}`}>
              <div className="prd-opt prd-opt-head" aria-hidden="true">
                {many && <span>Option</span>}
                <span>Price (₹{shop.inclusive ? ", incl. GST" : ", excl. GST"})</span>
                <span>Was (₹)</span>
                <span>SKU</span>
                <span>Barcode</span>
                <span>Weight (g)</span>
                <span>Stock</span>
                {many && <span>Sold</span>}
                {many && <span />}
              </div>
              {d.options.map((o) => {
                const v = product.variants.find((x) => x.id === o.id);
                if (o.remove)
                  return (
                    <div key={o.key} className="prd-opt prd-opt-gone">
                      <span>
                        {o.label || "New option"} will be removed when you save.{" "}
                        <button type="button" className="prd-linkbtn" onClick={() => setOpt(o.key, { remove: false })}>
                          Undo
                        </button>
                      </span>
                    </div>
                  );
                return (
                  <div key={o.key} className="prd-opt-wrap">
                    <div className="prd-opt">
                      {many && <input className="adm-input" aria-label="Option name" placeholder="e.g. Red, 14 inch" value={o.label} maxLength={80} onChange={(e) => setOpt(o.key, { label: e.target.value })} />}
                      <input className="adm-input" aria-label={`${o.label} price`} inputMode="decimal" placeholder="0" value={o.price} onChange={(e) => setOpt(o.key, { price: e.target.value.replace(/[^\d.]/g, "") })} />
                      <input className="adm-input" aria-label={`${o.label} was-price`} inputMode="decimal" placeholder="—" value={o.compare_at} onChange={(e) => setOpt(o.key, { compare_at: e.target.value.replace(/[^\d.]/g, "") })} />
                      <input className="adm-input" aria-label={`${o.label} SKU`} value={o.sku} maxLength={60} onChange={(e) => setOpt(o.key, { sku: e.target.value })} />
                      <input className="adm-input" aria-label={`${o.label} barcode`} value={o.barcode} maxLength={60} onChange={(e) => setOpt(o.key, { barcode: e.target.value })} />
                      <input className="adm-input" aria-label={`${o.label} weight in grams`} inputMode="decimal" value={o.weight_g} onChange={(e) => setOpt(o.key, { weight_g: e.target.value.replace(/[^\d.]/g, "") })} />
                      <span className="prd-stock">{!v ? "New" : v.track_stock ? `${v.stock_qty}` : "Not counted"}</span>
                      {many && <Toggle on={o.is_visible} label="" onChange={(x) => setOpt(o.key, { is_visible: x })} />}
                      {many && (
                        <button type="button" className="prd-x" aria-label={`Remove ${o.label || "this option"}`} onClick={() => (o.id ? setOpt(o.key, { remove: true }) : set({ options: d.options.filter((x) => x.key !== o.key) }))}>
                          ×
                        </button>
                      )}
                    </div>
                    {boxes.boxMode && v && (
                      <div className="prd-boxes">
                        <BoxesBlock unit={v} boxes={product.variants.filter((b) => b.unit_variant_id === v.id)} costs={new Map()} rules={rules} sizes={boxes.sizes} onAdd={boxes.addBox} onSave={(b, patch) => run(() => api.upsertVariant(product.id, { ...b, ...patch }))} onDelete={(b) => run(() => api.deleteVariant(b.id))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {boxes.boxMode && (
              <details className="prd-boxsetup">
                <summary>Box sizes for this product</summary>
                <BoxSetup {...boxes.setup} />
              </details>
            )}
          </section>

          {/* ------------------------------------------------ stock */}
          <section className="adm-card prd-card">
            <h2>Stock</h2>
            <ProductStock product={product} rules={{ rate: rules.rate }} onChanged={() => void onReload()} />
            {product.variants.some((v) => v.track_stock) && (
              <label className="adm-label prd-narrow">
                Low-stock alert at
                <input className="adm-input" inputMode="numeric" placeholder="Shop's default" value={d.low_stock_at} onChange={(e) => set({ low_stock_at: e.target.value.replace(/\D/g, "") })} />
              </label>
            )}
            <StockHistory variants={product.variants} />
          </section>

          {/* ------------------------------------------------ specifications */}
          <section className="adm-card prd-card">
            <div className="prd-card-head">
              <h2>Specifications</h2>
              <button type="button" className="adm-btn" onClick={() => set({ specs: [...d.specs, { label: "", value: "" }] })}>
                + Add a row
              </button>
            </div>
            {d.specs.length ? (
              <div className="prd-specs">
                {d.specs.map((s, i) => (
                  <div key={i} className="prd-spec">
                    <input className="adm-input" placeholder="e.g. Material" aria-label="What" value={s.label} maxLength={60} onChange={(e) => set({ specs: d.specs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
                    <input className="adm-input" placeholder="e.g. Aluminium" aria-label="Value" value={s.value} maxLength={200} onChange={(e) => set({ specs: d.specs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
                    <button type="button" className="prd-x" aria-label="Remove this row" onClick={() => set({ specs: d.specs.filter((_, k) => k !== i) })}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="adm-muted adm-small">A table on the product page, like Material: Aluminium.</p>
            )}
          </section>

          <section className="adm-card prd-card prd-embed">
            <BundleBlock api={api} product={product} onSaved={() => void onReload()} />
          </section>
          <section className="adm-card prd-card prd-embed">
            <Videos urls={product.video_urls} onSave={(video_urls) => void run(() => api.updateProduct(product.id, { video_urls }))} />
          </section>
        </div>

        <aside className="prd-side">
          <section className="adm-card prd-card">
            <h2>Ready for the shop?</h2>
            {needs.length ? (
              <ul className="prd-needs">
                {needs.map((n) => (
                  <li key={n}>Needs {n}</li>
                ))}
              </ul>
            ) : (
              <p className="prd-ready">Everything&apos;s there.</p>
            )}
          </section>

          <Organise api={api} d={d} set={set} categories={categories} />

          <section className="adm-card prd-card">
            <h2>Tax</h2>
            <GstPicker value={d.gst_rate} shopRate={shop.rate} onChange={(v) => set({ gst_rate: v })} label="GST on sales" />
            <label className="adm-label">
              HSN code
              <input className="adm-input" inputMode="numeric" maxLength={8} placeholder="4, 6 or 8 digits" value={d.hsn} onChange={(e) => set({ hsn: e.target.value.replace(/\D/g, "") })} />
            </label>
            {shop.cessOn && (
              <label className="adm-label">
                Cess (%)
                <input className="adm-input" inputMode="decimal" placeholder="0" value={d.cess_rate} onChange={(e) => set({ cess_rate: e.target.value.replace(/[^\d.]/g, "") })} />
              </label>
            )}
          </section>

          {can(role, "catalog") && <CostCard product={product} options={live} rules={rules} onChanged={onReload} />}

          <SearchListing d={d} set={set} slug={product.slug} catName={cat?.name ?? ""} catSlug={cat?.slug ?? ""} />

          {can(role, "delete") && (
            <section className="adm-card prd-card">
              <h2>Delete</h2>
              <p className="adm-muted adm-small">For good, with its options and photos. A product that has been ordered can&apos;t be deleted: archive it instead.</p>
              <button type="button" className="adm-btn bad" onClick={() => setDeleting(true)}>
                Delete this product
              </button>
            </section>
          )}
        </aside>
      </div>

      <SaveBar dirty={dirty} busy={busy} onSave={save} onDiscard={() => setD(base)} />
      <Confirm open={deleting} title={`Delete ${product.name}?`} body="Its options and photos go too. This can't be undone." confirmLabel="Delete" busy={busy} onConfirm={remove} onCancel={() => setDeleting(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- organise: type, then its sub-categories
function Organise({ api, d, set, categories }: { api: Api; d: Draft; set: (p: Partial<Draft>) => void; categories: AdminCategory[] }) {
  const [list, setList] = useState<{ cat: string; groups: SubGroup[]; tags: Subcategory[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState("");
  useEffect(() => {
    let live = true;
    api.listSubcategories(d.category_id).then(
      (l) => live && setList({ cat: d.category_id, ...l }),
      () => live && setList({ cat: d.category_id, groups: [], tags: [] }),
    );
    return () => {
      live = false;
    };
  }, [api, d.category_id]);
  const tags = list?.cat === d.category_id ? list.tags : [];
  const groups = list?.cat === d.category_id ? list.groups : [];
  const picked = tags.filter((t) => d.subcategory_ids.includes(t.id));
  const rows = [...groups.map((g) => ({ g: g.name, tags: tags.filter((t) => t.group_id === g.id) })), { g: "Other", tags: tags.filter((t) => !t.group_id) }].filter((r) => r.tags.length);
  const flip = (id: string) => set({ subcategory_ids: (d.subcategory_ids.includes(id) ? d.subcategory_ids.filter((x) => x !== id) : [...d.subcategory_ids, id]).sort() });

  return (
    <section className="adm-card prd-card">
      <h2>Organise</h2>
      <label className="adm-label">
        Type
        <select className="adm-input" value={d.category_id} onChange={(e) => set({ category_id: e.target.value, subcategory_ids: [] })}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="adm-label">
        Sub-categories
        <button type="button" className="adm-input prd-subbtn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {picked.length ? picked.map((t) => t.name).join(", ") : tags.length ? "Pick…" : "None for this type yet"}
          <span aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="prd-subpop">
            {rows.length ? (
              rows.map((r) => (
                <fieldset key={r.g}>
                  <legend>{r.g}</legend>
                  {r.tags.map((t) => (
                    <label key={t.id} className="prd-subopt">
                      <input type="checkbox" checked={d.subcategory_ids.includes(t.id)} onChange={() => flip(t.id)} />
                      {t.name}
                    </label>
                  ))}
                </fieldset>
              ))
            ) : (
              <p className="adm-muted adm-small">This type has no sub-categories yet.</p>
            )}
            <Link className="adm-small" href={`/admin/products/categories?id=${d.category_id}`}>
              Manage {categories.find((c) => c.id === d.category_id)?.name}&apos;s sub-categories →
            </Link>
          </div>
        )}
      </div>
      <div className="adm-label">
        Search keywords
        <div className="prd-kws">
          {d.tags.map((t) => (
            <span key={t} className="prd-kw">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => set({ tags: d.tags.filter((x) => x !== t) })}>
                ×
              </button>
            </span>
          ))}
          <input
            className="prd-kw-input"
            value={kw}
            placeholder="Type and press Enter"
            aria-label="Add a search keyword"
            onChange={(e) => setKw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== ",") return;
              e.preventDefault();
              const t = kw.trim().toLowerCase();
              if (t && !d.tags.includes(t)) set({ tags: [...d.tags, t] });
              setKw("");
            }}
          />
        </div>
        <small className="adm-muted">Extra words people might search for. Not shown on the shop.</small>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- cost and profit
function CostCard({ product, options, rules, onChanged }: { product: AdminProduct; options: Option[]; rules: Rules; onChanged: () => Promise<void> }) {
  const [costs, setCosts] = useState<Map<string, Purchase> | null>(null);
  const [fixing, setFixing] = useState<AdminVariant | null>(null);
  const ids = product.variants.map((v) => v.id).join(",");
  const reload = useCallback(
    () =>
      import("@/lib/orders-db")
        .then((m) => m.getPurchases(ids ? ids.split(",") : []))
        .then(setCosts, () => setCosts(new Map())),
    [ids],
  );
  useEffect(() => {
    void reload();
  }, [reload, product]);
  const money = (n: number) => formatPrice(n, { paise: true });

  return (
    <section className="adm-card prd-card">
      <h2>Cost and profit</h2>
      {!costs ? (
        <Loading />
      ) : (
        options
          .filter((o) => o.id)
          .map((o) => {
            const v = product.variants.find((x) => x.id === o.id)!;
            const have = costs.get(v.id);
            const buy = have?.purchase ?? null;
            const paid = have?.gstPaid ?? (buy == null ? null : supplierGst(buy, rules.rate));
            const cost = buy == null || paid == null ? null : Math.round((buy + paid) * 100) / 100;
            const sell = Number(o.price) || 0;
            const u = cost != null && sell > 0 ? unitProfit(sell, cost, rules, { paid, claimable: have?.gstClaimable ?? paid }) : null;
            return (
              <div key={o.key} className="prd-cost">
                {options.length > 1 && <b>{o.label}</b>}
                <dl>
                  <dt>Buying price</dt>
                  <dd>{buy != null ? `${money(buy)} + ${money(paid ?? 0)} GST` : "Not set"}</dd>
                  <dt>Cost</dt>
                  <dd>{cost != null ? money(cost) : "–"}</dd>
                  <dt>Profit</dt>
                  <dd className={u ? (u.kept < 0 ? "is-neg" : "is-pos") : ""}>{u ? `${money(u.kept)} · ${u.net > 0 ? ((u.kept / u.net) * 100).toFixed(1) : "0"}%` : "–"}</dd>
                </dl>
                {u && <GstNote u={u} credit={rules.credit} fromBills={v.track_stock} />}
                <button type="button" className="prd-linkbtn" onClick={() => setFixing(v)}>
                  {buy == null ? "Set the buying price" : v.track_stock ? "Correct the buying price" : "Change the buying price"}
                </button>
              </div>
            );
          })
      )}
      <p className="adm-muted adm-small">Buying prices also come from purchase bills (Inventory).</p>
      <BuyingPrice
        key={fixing?.id ?? "none"}
        variant={fixing}
        have={fixing ? costs?.get(fixing.id) : undefined}
        rate={rules.rate}
        onClose={() => setFixing(null)}
        onSaved={async () => {
          setFixing(null);
          await reload();
          await onChanged();
          toast("Buying price saved");
        }}
      />
    </section>
  );
}

function BuyingPrice({ variant, have, rate, onClose, onSaved }: { variant: AdminVariant | null; have?: Purchase; rate: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const counted = !!variant?.track_stock;
  const [price, setPrice] = useState(have?.purchase != null ? String(have.purchase) : "");
  const [gst, setGst] = useState(String(have?.gstPaid != null && have.purchase ? Math.round((have.gstPaid / have.purchase) * 1000) / 10 : rate));
  const [why, setWhy] = useState(have?.purchase == null ? "Opening stock" : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!variant) return;
    const n = Number(price);
    const r = Number(gst);
    if (!(price.trim() !== "" && n >= 0)) return setErr("Enter the buying price before GST.");
    if (!(r >= 0 && r <= 100)) return setErr("Enter the GST rate on the bill.");
    if (counted && why.trim().length < 3) return setErr("Say why, for the activity log.");
    setBusy(true);
    setErr("");
    try {
      const m = await import("@/lib/orders-db");
      if (counted) await m.correctPurchase(variant.id, n, r, why.trim());
      else await m.setPurchase(variant.id, n, { rate: r, amount: null });
      await onSaved();
    } catch (x) {
      setErr(errText(x));
    }
    setBusy(false);
  }
  return (
    <Dialog open={!!variant} onClose={onClose}>
      {variant && (
        <form className="prd-dialog" onSubmit={save}>
          <h2>Buying price · {variant.label}</h2>
          <p className="adm-muted adm-small">
            {counted ? "Its stock is counted, so this corrects the average from the bills. Bills added later average against it; the old price and your reason go in the activity log." : "Per piece, before GST."}
          </p>
          <label className="adm-label">
            Price before GST (₹)
            <input className="adm-input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="adm-label">
            GST % on the supplier&apos;s bill
            <input className="adm-input" inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          {counted && (
            <label className="adm-label">
              Why
              <input className="adm-input" value={why} maxLength={300} placeholder="e.g. opening count entered at the wrong price" onChange={(e) => setWhy(e.target.value)} />
            </label>
          )}
          {err && <p className="adm-err">{err}</p>}
          <div className="adm-actions">
            <button type="button" className="adm-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="adm-btn pri" disabled={busy}>
              {busy ? "Saving" : "Save"}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- search listing
function SearchListing({ d, set, slug, catName, catSlug }: { d: Draft; set: (p: Partial<Draft>) => void; slug: string; catName: string; catSlug: string }) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "") || "your shop";
  const autoT = autoTitle({ name: d.name, category: catName });
  const autoD = autoDescription({ name: d.name, description: d.description, category: catName });
  const title = fullTitle(d.seo_title.trim() || autoT);
  const desc = d.seo_description.trim() || autoD;
  return (
    <section className="adm-card prd-card">
      <h2>Search listing</h2>
      <div className="prd-serp">
        <small>
          {site} › shop › {catSlug} › {slug}
        </small>
        <b>{title}</b>
        <span>{desc}</span>
      </div>
      <label className="adm-label">
        Page title ({d.seo_title.length}/{TITLE_MAX})
        <input className="adm-input" value={d.seo_title} maxLength={TITLE_MAX} placeholder={autoT} onChange={(e) => set({ seo_title: e.target.value })} />
      </label>
      <label className="adm-label">
        Description ({d.seo_description.length}/{DESC_MAX})
        <textarea className="adm-input" rows={3} value={d.seo_description} maxLength={DESC_MAX} placeholder={autoD} onChange={(e) => set({ seo_description: e.target.value })} />
      </label>
      <small className="adm-muted">Empty: made from the name, brand and description.</small>
    </section>
  );
}
