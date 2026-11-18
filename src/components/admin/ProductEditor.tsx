"use client";

import { errText } from "@/lib/orders-db";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bin } from "@/components/admin/ui";
import { TagPicker } from "./Subcategories";
import { boxLabel, type AdminCategory, type AdminProduct, type AdminVariant, type BoxPreset, type BoxSize } from "@/lib/admin-data";
import { BRAND_NAMES, brandOf } from "@/lib/brand";
import { toast, toastError } from "@/components/admin/Toaster";
import { shootPhotos } from "@/lib/product-photos";
import ProductStock from "@/components/admin/stock/ProductStock";
import { Api, STATUSES, mainPrice, needsOf } from "./editor/ProductBasics";
import { AddPhotos, Group, PhotoGroup, PhotoItem, PhotoRef } from "./editor/Photos";
import { HsnField, Pricing } from "./editor/Pricing";
import { BoxSetupProps, sheetBoxSize } from "./editor/Boxes";
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
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
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

  async function addFiles(files: File[], group: string | null = null) {
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    setUploading({ done: 0, of: pics.length });
    const ok = await run(async () => {
      let n = product.images.length;
      // the shop shows the shoot's photos until the product has its own: bring
      // them in with the new ones, so none of them disappears from the shop
      if (live && shoot.length) {
        await importShoot();
        n += shoot.length;
      }
      for (let i = 0; i < pics.length; i++) {
        await api.uploadProductImage(product.id, pics[i], n + i, group);
        setUploading({ done: i + 1, of: pics.length });
      }
    });
    setUploading(null);
    if (ok) toast(`${pics.length} photo${pics.length === 1 ? "" : "s"} added to ${product.name}`);
  }

  // a photo pasted anywhere while the product is open lands in it
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

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

  // boxes (0061) sit under the loose option they hold, not beside it
  const many = product.variants.filter((v) => !v.unit_variant_id).length > 1;
  const tracked = product.variants.some((v) => v.track_stock);
  const boxMode = !!categories.find((c) => c.id === product.category_id)?.sold_in_boxes || product.variants.some((v) => v.unit_variant_id);
  // its box sizes and the shop's presets (0065)
  const [sizes, setSizes] = useState<BoxSize[]>([]);
  const [presets, setPresets] = useState<BoxPreset[]>([]);
  const loadBoxes = useCallback(
    () =>
      Promise.all([api.listBoxSizes(product.id), api.listBoxPresets()])
        .then(([s, p]) => {
          setSizes(s);
          setPresets(p);
        })
        .catch(() => {}),
    [api, product.id],
  );
  useEffect(() => {
    if (boxMode) void loadBoxes();
  }, [boxMode, loadBoxes]);
  // this option comes in this box: its box, off the shop until ticked, priced
  // as the product's size says, else the pieces' price x the pieces
  const addBox = (unit: AdminVariant, size: BoxSize) =>
    run(() =>
      api.upsertVariant(product.id, {
        label: many ? `${unit.label} · ${boxLabel(size.pieces)}` : boxLabel(size.pieces),
        price: size.price ?? Math.round(unit.price * size.pieces * 100) / 100,
        is_visible: false,
        sort_order: product.variants.length,
        unit_variant_id: unit.id,
        pack_of: size.pieces,
      }),
    );
  const boxSetup: BoxSetupProps = {
    sizes,
    presets,
    sheet: sheetBoxSize(product.slug),
    onSize: (pieces, price) => run(() => api.saveBoxSize(product.id, { pieces, price, sort_order: sizes.find((x) => x.pieces === pieces)?.sort_order ?? sizes.length })).then(loadBoxes),
    // a size gone: the options' boxes of that size go too (one that has been
    // ordered can't: hide it instead)
    onRemove: (pieces) =>
      run(async () => {
        for (const b of product.variants.filter((v) => v.unit_variant_id && v.pack_of === pieces)) await api.deleteVariant(b.id);
        await api.deleteBoxSize(product.id, pieces);
      }).then(loadBoxes),
    onApply: (id) => run(() => api.applyBoxPreset(id, { products: [product.id] })).then(loadBoxes),
    onApplyCategory: (id) => run(() => api.applyBoxPreset(id, { category: product.category_id })).then(loadBoxes),
    onSavePreset: (name) => api.saveBoxPreset(name, sizes.map((x) => x.pieces)).then(loadBoxes),
    onDeletePreset: (id) => api.deleteBoxPreset(id).then(loadBoxes),
    categoryName: categories.find((c) => c.id === product.category_id)?.name ?? "",
  };
  // the shop's GST rate, the default for stock bought in a product with no bracket of its own
  const [shopRate, setShopRate] = useState(18);
  useEffect(() => {
    import("@/lib/orders-db")
      .then((m) => m.getSettings())
      .then((s) => setShopRate(s.gst_rate))
      .catch(() => {});
  }, []);

  // The photos are in groups: the product's own, then one per option (with no
  // options, just the one). A photo's group is the option it shows.
  const groups: Group[] = [null, ...(many ? product.variants.map((v) => v.id) : [])];
  const groupOf = (variantId: string | null): Group => (many && product.variants.some((v) => v.id === variantId) ? variantId : null);
  const dbIn = (p: AdminProduct, g: Group) => p.images.filter((i) => groupOf(i.variant_id) === g);
  // the shoot's photos not brought in yet, each in its option's group
  const shoot = shootPhotos(product.slug)
    .filter((x) => !product.images.some((i) => i.alt_text === x.path))
    .map((x) => ({ ...x, group: (many ? (product.variants.find((v) => v.label === x.option)?.id ?? null) : null) as Group }));
  // with none of its own yet, the shop shows the shoot's photos
  const live = product.images.length === 0;

  // The shoot's photos brought in as the product's own, in their groups and
  // order: all of them while the shop still shows them (so moving one doesn't
  // leave the shop with only that one), else just the one asked for.
  async function importShoot(only?: (typeof shoot)[number]): Promise<AdminProduct> {
    const list = only && !live ? [only] : shoot;
    let n = product.images.length;
    for (const x of list) await api.importShootPhoto(product.id, x.src, x.path, n++, x.group);
    return (await api.getProduct(product.id))!;
  }
  async function resolve(ref: PhotoRef): Promise<{ id: string; p: AdminProduct }> {
    if (ref.kind === "db") return { id: ref.id, p: product };
    const p = await importShoot(shoot.find((x) => x.path === ref.path));
    return { id: p.images.find((i) => i.alt_text === ref.path)!.id, p };
  }
  // a photo to a group, at a place in it (the end if none)
  function place(ref: PhotoRef, to: Group, at?: number) {
    void run(async () => {
      const { id, p } = await resolve(ref);
      const img = p.images.find((i) => i.id === id)!;
      const lists = groups.map((g) => dbIn(p, g).map((i) => i.id).filter((x) => x !== id));
      const target = lists[groups.indexOf(to)];
      target.splice(Math.min(at ?? target.length, target.length), 0, id);
      if (groupOf(img.variant_id) !== to) await api.setImageVariant(id, to);
      await api.reorderProductImages(lists.flat());
    });
  }
  function remove(ref: PhotoRef) {
    void run(async () => {
      const { id, p } = await resolve(ref);
      await api.deleteProductImage(p.images.find((i) => i.id === id)!);
    });
  }
  // what is being dragged (a drop can't read it from the event until it lands), and where it would land
  const dragRef = useRef<PhotoRef | null>(null);
  const [drop, setDrop] = useState<{ group: Group; at: number } | null>(null);
  const itemsOf = (g: Group): PhotoItem[] => [
    ...dbIn(product, g).map((i) => ({ key: i.id, src: i.url, ref: { kind: "db", id: i.id } as PhotoRef, shoot: false })),
    ...shoot.filter((x) => x.group === g).map((x) => ({ key: x.path, src: x.src, ref: { kind: "shoot", path: x.path } as PhotoRef, shoot: true })),
  ];
  const groupProps = { live, drop, setDrop, dragRef, onPlace: place, onRemove: remove, options: many ? product.variants : null };
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
