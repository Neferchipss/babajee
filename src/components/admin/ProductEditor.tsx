"use client";

import Link from "next/link";

import { errText } from "@/lib/orders-db";
import { useEffect, useRef, useState } from "react";
import { Bin } from "@/components/admin/ui";
import { TagPicker } from "./Subcategories";
import { type AdminCategory, type AdminProduct } from "@/lib/admin-data";
import { isAdminDemo } from "@/lib/admin-api";
import { BRAND_NAMES, brandOf } from "@/lib/brand";
import { toast, toastError } from "@/components/admin/Toaster";
import ProductStock from "@/components/admin/stock/ProductStock";
import { Api, STATUSES, mainPrice, needsOf } from "./editor/ProductBasics";
import { AddPhotos, PhotoGroup } from "./editor/Photos";
import { useBoxes, usePhotoManager } from "./editor/useProductParts";
import { HsnField, Pricing } from "./editor/Pricing";
import { Fold, LowMark, SeoListing, SpecsEditor, StockHistory, TYPE_HINTS, TagEditor, VariantCodes, Videos, WeightSize } from "./editor/Details";
import { BundleBlock } from "./editor/Bundle";

// the product list and table use these too
export { mainPrice, needsOf, needsWork, setMainPrice } from "./editor/ProductBasics";

// A product's name, edited where it is shown (on its card, as the editor's
// title): it reads as text and grows with it; Enter or leaving it saves.
export function EditableName({ value, onSave, className = "" }: { value: string; onSave: (name: string) => void; className?: string }) {
  const [v, setV] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setV(value);
  }
  return (
    <textarea
      className={`ape-inline ape-inline--name ${className}`}
      aria-label="Product name"
      rows={1}
      value={v}
      spellCheck={false}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setV(value);
          e.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const t = v.trim();
        if (!t) setV(value);
        else if (t !== value) onSave(t);
      }}
    />
  );
}
// A price, edited where it is shown: ₹ and the amount; empty or 0 is no price yet.
export function EditablePrice({ value, onSave, label, className = "" }: { value: number; onSave: (price: number) => void; label: string; className?: string }) {
  const [v, setV] = useState(value ? String(value) : "");
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setV(value ? String(value) : "");
  }
  return (
    <label className={`ape-inline-price ${className}`}>
      <i aria-hidden="true">₹</i>
      <input
        className="ape-inline"
        aria-label={label}
        inputMode="decimal"
        placeholder="Add price"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setV(value ? String(value) : "");
            e.currentTarget.blur();
          }
        }}
        onBlur={() => Number(v) !== value && onSave(Number(v) || 0)}
      />
    </label>
  );
}
// One product, edited in place, in the order a shopkeeper works: name and
// photos, then the price (buying price, GST, cost, selling price, profit),
// stock and category. Everything else (description, codes, HSN, Google
// listing, delete) waits under "More". Every field saves as you leave it;
// there is no Save button to forget.
export default function ProductEditor({
  product,
  categories,
  api,
  onChanged,
  onClose,
  onDelete,
  nav,
  sheet = true,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  api: Api;
  // the product after a change, re-read from the database
  onChanged: (p: AdminProduct) => void;
  onClose?: () => void;
  // asks before deleting the product; the page holds the confirm
  onDelete?: () => void;
  nav?: { at: number; of: number; prev?: () => void; next?: () => void; nextNeeds?: () => void };
  sheet?: boolean;
}) {
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [err, setErr] = useState("");
  const [description, setDescription] = useState(product.description);
  const [brand, setBrand] = useState(product.brand);
  const [ptype, setPtype] = useState(product.product_type);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function run(work: () => Promise<unknown>) {
    setStatus("saving");
    setErr("");
    try {
      await work();
      const fresh = await api.getProduct(product.id);
      if (fresh) onChanged(fresh);
      setStatus("saved");
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus(""), 1800);
      return true;
    } catch (e) {
      setStatus("");
      setErr(errText(e));
      toastError(e);
      return false;
    }
  }

  // Esc closes; Alt + arrows step through the products
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
      if (e.altKey && e.key === "ArrowRight") nav?.next?.();
      if (e.altKey && e.key === "ArrowLeft") nav?.prev?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tracked = product.variants.some((v) => v.track_stock);
  const { boxMode, setup: boxSetup, addBox } = useBoxes(product, categories, api, run);
  // the shop's GST rate, the default for stock bought in a product with no bracket of its own
  const [shopRate, setShopRate] = useState(18);
  useEffect(() => {
    import("@/lib/orders-db")
      .then((m) => m.getSettings())
      .then((s) => setShopRate(s.gst_rate))
      .catch(() => {});
  }, []);
  const { many, uploading, addFiles, itemsOf, groupProps, dragRef } = usePhotoManager(product, api, run, (n) => toast(`${n} photo${n === 1 ? "" : "s"} added to ${product.name}`));
  const needs = needsOf(product);

  return (
    <div className={sheet ? "ape ape--sheet" : "ape"} role={sheet ? "dialog" : undefined} aria-label={sheet ? `Edit ${product.name}` : undefined}>
      <div className="ape-bar">
        {nav && (
          <div className="ape-nav">
            <button type="button" className="ape-icon" onClick={nav.prev} disabled={!nav.prev} aria-label="Previous product" title="Previous (Alt + ←)">
              ‹
            </button>
            <span className="ape-pos">
              {nav.at} of {nav.of}
            </span>
            <button type="button" className="ape-icon" onClick={nav.next} disabled={!nav.next} aria-label="Next product" title="Next (Alt + →)">
              ›
            </button>
            {nav.nextNeeds && (
              <button type="button" className="ape-chip" onClick={nav.nextNeeds}>
                Next that needs work
              </button>
            )}
          </div>
        )}
        <span className={`ape-status ape-status--${status || "idle"}`} role="status">
          {status === "saving" ? "Saving" : status === "saved" ? "Saved" : ""}
        </span>
        {sheet && (
          <Link className="ape-chip ape-full" href={`/admin/products/edit?id=${product.id}${isAdminDemo() ? "&demo=1" : ""}`}>
            Open full page
          </Link>
        )}
        {onClose && (
          <button type="button" className="ape-icon ape-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
            ×
          </button>
        )}
      </div>

      <div className="ape-body">
        <div className="ape-title">
          <EditableName className="ape-name" value={product.name} onSave={(n) => run(() => api.updateProduct(product.id, { name: n }))} />
          {/* draft while it's being prepared, on the shop, or archived when retired */}
          <span className="ape-status" role="radiogroup" aria-label="Status">
            {STATUSES.map(([s, label, hint]) => (
              <button key={s} type="button" role="radio" aria-checked={product.status === s} title={hint} className={product.status === s ? `is-on is-${s}` : ""} onClick={() => product.status !== s && run(() => api.setProductStatus(product, s))}>
                {label}
              </button>
            ))}
          </span>
        </div>
        {(needs.photo || needs.price) && (
          <div className="ape-summary">
            {needs.photo && <em>Needs a photo</em>}
            {needs.price && <em>Needs a selling price</em>}
          </div>
        )}
        {err && <p className="ape-err">{err}</p>}

        {/* photos: drag any of them to reorder, or onto a size or colour below */}
        <section
          className={`ape-photos ${dragging ? "is-drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragRef.current) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles([...e.dataTransfer.files]);
          }}
        >
          <h3 className="sr-only">{many ? "Photos of the product" : "Photos"}</h3>
          <PhotoGroup
            {...groupProps}
            group={null}
            items={itemsOf(null)}
            onFiles={(f) => addFiles(f, null)}
            add={
              <button type="button" className="ape-drop" onClick={() => fileInput.current?.click()} disabled={!!uploading}>
                {uploading ? (
                  <span>
                    Uploading {Math.min(uploading.done + 1, uploading.of)} of {uploading.of}
                  </span>
                ) : (
                  <>
                    <b aria-hidden="true">+</b>
                    <span>Add</span>
                  </>
                )}
              </button>
            }
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void addFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </section>

        {/* stock, before the price: add stock, correct a count, what moved */}
        <ProductStock product={product} rules={{ rate: product.gst_rate ?? shopRate }} onChanged={() => void run(async () => {})} />

        <section className="ape-fields">
          {tracked && <LowMark key={`low-${product.id}`} product={product} onSave={(low_stock_at) => run(() => api.updateProduct(product.id, { low_stock_at }))} />}
          <StockHistory variants={product.variants} />
        </section>

        {/* price: buying price, GST, cost price, selling price, profit (per size or colour when it has them) */}
        <Pricing
          product={product}
          onPatch={(patch) => run(() => api.updateProduct(product.id, patch))}
          onVariant={(v, patch) => run(() => api.upsertVariant(product.id, { ...v, ...patch }))}
          onDeleteVariant={(v) => run(() => api.deleteVariant(v.id))}
          boxes={boxMode ? { setup: boxSetup, onAdd: addBox } : null}
          onAdd={() =>
            run(() =>
              api.upsertVariant(product.id, { label: many ? "New size or colour" : "Size or colour 2", price: mainPrice(product), is_visible: true, sort_order: product.variants.length }),
            )
          }
          photos={(v) => (
            <PhotoGroup
              {...groupProps}
              small
              group={v.id}
              items={itemsOf(v.id)}
              onFiles={(f) => addFiles(f, v.id)}
              add={<AddPhotos label={itemsOf(v.id).length ? "More" : `Photos of ${v.label}`} busy={!!uploading} onFiles={(f) => addFiles(f, v.id)} />}
            />
          )}
        />

        {/* category, plainly */}
        <section className="ape-fields ape-plain">
          <label className="ape-line">
            <span className="ape-line-label">Category</span>
            <select className="ape-line-input" value={product.category_id} onChange={(e) => run(() => api.updateProduct(product.id, { category_id: e.target.value }))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* everything else, one tap away */}
        <Fold title="More" summary="Description, codes, weight and size, videos, Google listing, delete">
          <section className="ape-fields">
            <h3>Description</h3>
            <label className="ape-field ape-field--wide">
              <span>What the customer reads</span>
              <textarea
                rows={3}
                value={description}
                placeholder="Pack size, material, what it fits"
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== product.description && run(() => api.updateProduct(product.id, { description: description.trim() }))}
              />
            </label>
            <label className="ape-field">
              <span>Brand</span>
              <input
                list="ape-brands"
                value={brand}
                placeholder={brandOf(product.name).brand ?? "No brand"}
                onChange={(e) => setBrand(e.target.value)}
                onBlur={() => brand.trim() !== product.brand && run(() => api.updateProduct(product.id, { brand: brand.trim() }))}
              />
              <datalist id="ape-brands">
                {BRAND_NAMES.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <label className="ape-field">
              <span>Type</span>
              <input
                list="ape-types"
                value={ptype}
                placeholder="Cones, papers, tray…"
                onChange={(e) => setPtype(e.target.value)}
                onBlur={() => ptype.trim() !== product.product_type && run(() => api.updateProduct(product.id, { product_type: ptype.trim() }))}
              />
              <datalist id="ape-types">
                {TYPE_HINTS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <TagPicker key={`sub-${product.id}-${product.category_id}`} api={api} product={product} categorySlug={categories.find((c) => c.id === product.category_id)?.slug ?? product.category_slug ?? ""} onChanged={() => run(async () => {})} />
            <div className="ape-field ape-field--wide">
              <span id="ape-tags-label">Tags (for search)</span>
              <TagEditor tags={product.tags} onChange={(tags) => run(() => api.updateProduct(product.id, { tags }))} />
            </div>
          </section>

          <SpecsEditor key={`specs-${product.id}`} specs={product.specs} onSave={(specs) => run(() => api.updateProduct(product.id, { specs }))} />

          <HsnField key={`hsn-${product.id}`} product={product} onSave={(hsn) => run(() => api.updateProduct(product.id, { hsn }))} />

          <VariantCodes product={product} categorySlug={categories.find((c) => c.id === product.category_id)?.slug ?? product.category_slug ?? ""} onSave={(id, patch) => run(() => api.upsertVariant(product.id, { id, ...patch }))} />

          <WeightSize product={product} onSave={(id, patch) => run(() => api.upsertVariant(product.id, { id, ...patch }))} />

          <BundleBlock key={`bundle-${product.id}`} api={api} product={product} onSaved={() => run(async () => {})} />

          <Videos key={`vid-${product.id}`} urls={product.video_urls} onSave={(video_urls) => run(() => api.updateProduct(product.id, { video_urls }))} />

          <SeoListing key={`seo-${product.id}`} product={product} categoryName={categories.find((c) => c.id === product.category_id)?.name ?? product.category_name ?? ""} onSave={(patch) => run(() => api.updateProduct(product.id, patch))} />

          {onDelete && (
            <button type="button" className="ape-delete-link" onClick={onDelete} title="For good, with its sizes, colours and photos. If it has been ordered it stays: hide it instead.">
              <Bin /> Delete this product
            </button>
          )}
        </Fold>
      </div>
    </div>
  );
}
