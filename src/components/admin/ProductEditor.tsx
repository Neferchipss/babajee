"use client";

import { errText } from "@/lib/orders-db";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Bin } from "@/components/admin/ui";
import { autoDescription, autoTitle, DESC_MAX, fullTitle, TITLE_MAX } from "@/lib/seo";
import { suggestSku } from "@/lib/sku";
import { isAdminDemo, type adminApi } from "@/lib/admin-api";
import { boxLabel, subcategoriesOf, type AdminCategory, type AdminProduct, type AdminVariant, type BoxTemplate, type ProductStatus, type Spec } from "@/lib/admin-data";
import { BRAND_NAMES, brandOf } from "@/lib/brand";
import { toast, toastError } from "@/components/admin/Toaster";
import { formatPrice } from "@/lib/currency";
import { GST_BRACKETS, supplierGst, unitProfit } from "@/lib/gst";
import type { Purchase } from "@/lib/orders-db";
import { photosFor, shootPhotos } from "@/lib/product-photos";
import ProductStock from "@/components/admin/stock/ProductStock";

type Api = ReturnType<typeof adminApi>;

// What a product still needs before it can sell: a photo, a price, to be shown.
export function needsOf(p: AdminProduct) {
  return {
    photo: p.images.length === 0 && photosFor(p.slug).length === 0,
    price: !p.variants.some((v) => v.price > 0),
    hidden: p.status === "draft",
  };
}
const STATUSES: [ProductStatus, string, string][] = [
  ["draft", "Draft", "Being prepared: not on the shop yet"],
  ["published", "On the shop", "Customers can see and buy it"],
  ["archived", "Archived", "Retired: off the shop and out of the everyday list, kept with its orders"],
];
export const needsWork = (p: AdminProduct) => Object.values(needsOf(p)).some(Boolean);

// A product's main price: the one its options share (the most common; a price
// over none). Options follow it unless one is given a price of its own.
export function mainPrice(p: AdminProduct): number {
  const tally = new Map<number, number>();
  for (const v of p.variants) if (v.price > 0) tally.set(v.price, (tally.get(v.price) ?? 0) + 1);
  let best = 0;
  let n = 0;
  for (const [price, k] of tally) if (k > n) [best, n] = [price, k];
  return best;
}
// The main price changed: every option on the old main price, or with none
// yet, moves with it; an option with its own price keeps it.
export async function setMainPrice(api: Api, p: AdminProduct, price: number) {
  const old = mainPrice(p);
  await Promise.all(p.variants.filter((v) => v.price === old || v.price === 0).map((v) => api.upsertVariant(p.id, { ...v, price })));
}

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

  // boxes (0058) sit under the loose option they hold, not beside it
  const many = product.variants.filter((v) => !v.unit_variant_id).length > 1;
  const tracked = product.variants.some((v) => v.track_stock);
  const boxMode = !!categories.find((c) => c.id === product.category_id)?.sold_in_boxes || product.variants.some((v) => v.unit_variant_id);
  const [templates, setTemplates] = useState<BoxTemplate[]>([]);
  useEffect(() => {
    if (!boxMode) return;
    api.listBoxTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, [api, boxMode]);
  // a box of `pieces` of this loose option: off the shop until ticked, priced at
  // the pieces' price to start (type the box's own price)
  const addBox = (unit: AdminVariant, pieces: number) =>
    run(async () => {
      await api.saveBoxTemplate(pieces).catch(() => {});
      await api.upsertVariant(product.id, {
        label: many ? `${unit.label} · ${boxLabel(pieces)}` : boxLabel(pieces),
        price: Math.round(unit.price * pieces * 100) / 100,
        is_visible: false,
        sort_order: product.variants.length,
        unit_variant_id: unit.id,
        pack_of: pieces,
      });
      setTemplates(await api.listBoxTemplates().catch(() => templates));
    });
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
          boxes={boxMode ? { templates, onAdd: addBox } : null}
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
            <SubcategoryField key={`sub-${product.id}`} product={product} onSave={(subcategory) => run(() => api.updateProduct(product.id, { subcategory }))} />
            <div className="ape-field ape-field--wide">
              <span id="ape-tags-label">Tags (for search)</span>
              <TagEditor tags={product.tags} onChange={(tags) => run(() => api.updateProduct(product.id, { tags }))} />
            </div>
          </section>

          <SpecsEditor key={`specs-${product.id}`} specs={product.specs} onSave={(specs) => run(() => api.updateProduct(product.id, { specs }))} />

          <HsnField key={`hsn-${product.id}`} product={product} onSave={(hsn) => run(() => api.updateProduct(product.id, { hsn }))} />

          <VariantCodes product={product} categorySlug={categories.find((c) => c.id === product.category_id)?.slug ?? product.category_slug ?? ""} onSave={(id, patch) => run(() => api.upsertVariant(product.id, { id, ...patch }))} />

          <WeightSize product={product} onSave={(id, patch) => run(() => api.upsertVariant(product.id, { id, ...patch }))} />

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

type Group = string | null; // a variant id, or null for the product's own photos
type PhotoRef = { kind: "db"; id: string } | { kind: "shoot"; path: string };
type PhotoItem = { key: string; src: string; ref: PhotoRef; shoot: boolean };

// One group of photos (the product's own, or one option's): each can be dragged
// to a new place here or into another group; the buttons on a photo do the
// same on a phone, where there is no dragging. Files dropped here join it.
function PhotoGroup({
  group,
  items,
  small = false,
  live,
  options,
  drop,
  setDrop,
  dragRef,
  onPlace,
  onRemove,
  onFiles,
  add,
}: {
  group: Group;
  items: PhotoItem[];
  small?: boolean;
  live: boolean;
  options: AdminVariant[] | null;
  drop: { group: Group; at: number } | null;
  setDrop: (d: { group: Group; at: number } | null) => void;
  dragRef: RefObject<PhotoRef | null>;
  onPlace: (ref: PhotoRef, to: Group, at?: number) => void;
  onRemove: (ref: PhotoRef) => void;
  onFiles: (files: File[]) => void;
  add: ReactNode;
}) {
  const here = drop?.group === group ? drop.at : -1;
  const own = items.filter((i) => !i.shoot).length;
  const same = (a: PhotoRef, b: PhotoRef) => (a.kind === "db" && b.kind === "db" ? a.id === b.id : a.kind === "shoot" && b.kind === "shoot" && a.path === b.path);
  return (
    <ul
      className={`ape-thumbs ${small ? "ape-thumbs--sm" : ""} ${here >= 0 ? "is-target" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const li = (e.target as HTMLElement).closest<HTMLElement>("[data-at]");
        let at = items.length;
        if (li) {
          const r = li.getBoundingClientRect();
          at = Number(li.dataset.at) + (e.clientX > r.left + r.width / 2 ? 1 : 0);
        }
        if (drop?.group !== group || drop.at !== at) setDrop({ group, at });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        let at = here >= 0 ? here : items.length;
        setDrop(null);
        const ref = dragRef.current;
        dragRef.current = null;
        if (ref) {
          const from = items.findIndex((i) => same(i.ref, ref));
          if (from >= 0 && from < at) at -= 1; // it leaves its old place first
          onPlace(ref, group, Math.min(at, own));
        } else if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      }}
    >
      {items.map((it, i) => (
        <li
          key={it.key}
          data-at={i}
          className={`ape-thumb ${it.shoot ? "is-shoot" : ""} ${it.shoot && !live ? "is-off" : ""} ${here === i ? "is-before" : ""} ${here === items.length && i === items.length - 1 ? "is-after" : ""}`}
          draggable
          onDragStart={(e) => {
            dragRef.current = it.ref;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", it.key);
          }}
          onDragEnd={() => {
            dragRef.current = null;
            setDrop(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.src} alt="" draggable={false} />
          <div className="ape-thumb-tools">
            <button type="button" onClick={() => onPlace(it.ref, group, i - 1)} disabled={i === 0} aria-label="Move earlier">
              ‹
            </button>
            {!small && i > 0 && (
              <button type="button" onClick={() => onPlace(it.ref, group, 0)} aria-label="Make this the shelf photo" title="Make this the shelf photo">
                ★
              </button>
            )}
            <button type="button" onClick={() => onPlace(it.ref, group, i + 1)} disabled={i >= items.length - 1} aria-label="Move later">
              ›
            </button>
            <button type="button" className="is-del" onClick={() => onRemove(it.ref)} aria-label="Remove this photo">
              ×
            </button>
          </div>
          {options && (
            <select className="ape-thumb-opt" value={group ?? ""} onChange={(e) => onPlace(it.ref, e.target.value || null)} aria-label="Which option this photo shows">
              <option value="">The product</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
        </li>
      ))}
      <li className={here === items.length && items.length === 0 ? "is-before" : ""}>{add}</li>
    </ul>
  );
}

function AddPhotos({ label, busy, onFiles }: { label: string; busy: boolean; onFiles: (files: File[]) => void }) {
  const pick = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="ape-opt-add" disabled={busy} onClick={() => pick.current?.click()}>
        + {label}
      </button>
      <input
        ref={pick}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------- price
//
// The price, in the order the shop thinks of it:
//   buying price (before GST) -> GST paid to the supplier -> cost price
//   (worked out) -> selling price (at the product's GST bracket) -> profit,
//   with a note of the GST behind it (collected, paid, claimed back, owed)
// With sizes or colours, one card each, the selling bracket chosen once for
// the product. Buying prices live in an admin-only table (0015, 0030, 0056);
// the database adds the GST paid to make the cost price.
type Rules = { rate: number; inclusive: boolean; credit: boolean; cess?: number };
// GST paid to the supplier as typed: a rate (null: the selling bracket) and,
// when typed over, the amount per piece
type SupplierGst = { rate: number | null; amount: number | null };
const SHOWN_BRACKETS = GST_BRACKETS.filter((b) => b > 0);

function Pricing({
  product,
  onPatch,
  onVariant,
  onDeleteVariant,
  onAdd,
  photos,
  boxes,
}: {
  product: AdminProduct;
  onPatch: (patch: { gst_rate?: number | null; cess_rate?: number }) => void;
  onVariant: (v: AdminVariant, patch: Partial<AdminVariant>) => void;
  onDeleteVariant: (v: AdminVariant) => void;
  onAdd: () => void;
  photos: (v: AdminVariant) => ReactNode;
  // the product's category is sold in boxes (0058): each loose option shows its boxes
  boxes: { templates: BoxTemplate[]; onAdd: (unit: AdminVariant, pieces: number) => void } | null;
}) {
  // loose options get the cards; boxes sit inside the option they hold
  const variants = product.variants.filter((v) => !v.unit_variant_id);
  const boxesOf = (v: AdminVariant) => product.variants.filter((b) => b.unit_variant_id === v.id);
  // costs for boxes too (a box's cost is its pieces' x pack_of)
  const ids = product.variants.map((v) => v.id).join(",");
  // stock in moves the average buying price, so read again when a count moves
  const counts = product.variants.map((v) => `${v.stock_qty}${v.track_stock ? "t" : "u"}`).join(",");
  const [costs, setCosts] = useState<Map<string, Purchase> | null>(null);
  const [shop, setShop] = useState<(Rules & { cessOn: boolean }) | null>(null);
  const [err, setErr] = useState("");

  // again when the bracket changes: the database re-adds the GST to the cost
  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    import("@/lib/orders-db")
      .then((m) => Promise.all([m.getPurchases(list), m.getSettings()]))
      .then(([c, s]) => {
        setCosts(c);
        setShop({ rate: s.gst_rate, inclusive: s.gst_inclusive, credit: s.gst_input_credit, cessOn: s.cess_enabled });
      })
      .catch(() => {
        setCosts(new Map());
        // the demo catalogue (?demo) works without the database: sample rules
        if (isAdminDemo()) setShop({ rate: 18, inclusive: true, credit: true, cessOn: false });
      });
  }, [ids, product.gst_rate, counts]);

  const rules: Rules = { rate: product.gst_rate ?? shop?.rate ?? 18, inclusive: shop?.inclusive ?? true, credit: shop?.credit ?? false, cess: shop?.cessOn ? product.cess_rate : 0 };
  const many = variants.length > 1;

  async function saveBuying(id: string, purchase: number | null, gst?: SupplierGst) {
    setErr("");
    try {
      const m = await import("@/lib/orders-db");
      const got = await m.setPurchase(id, purchase, gst);
      setCosts((c) => {
        const n = new Map(c);
        if (!got) n.delete(id);
        else n.set(id, got);
        return n;
      });
    } catch (e) {
      setErr(errText(e));
    }
  }

  const gst = (
    <div className="ape-line ape-line--gst">
      <span className="ape-line-label">
        GST on sales <small>this product&apos;s slab, charged to the buyer</small>
      </span>
      <div className="ape-chips" role="group" aria-label="GST rate">
        {SHOWN_BRACKETS.map((b) => (
          <button key={b} type="button" className={rules.rate === b ? "is-on" : ""} aria-pressed={rules.rate === b} onClick={() => product.gst_rate !== b && onPatch({ gst_rate: b })}>
            {b}%
          </button>
        ))}
      </div>
    </div>
  );
  // cess on top of GST, only once switched on in Settings (0057)
  const cessField = shop?.cessOn ? <CessField key={product.id} value={product.cess_rate} onSave={(n) => onPatch({ cess_rate: n })} /> : null;

  return (
    <section className="ape-fields ape-pricing">
      <h3>Price</h3>
      {!costs || !shop ? (
        <p className="ape-hint">Loading…</p>
      ) : many ? (
        <>
          {gst}
          {cessField}
          <ul className="ape-cards">
            {variants.map((v) => (
              <PriceRow
                key={v.id}
                variant={v}
                card
                have={costs.get(v.id)}
                rules={rules}
                onBuying={(n, g) => saveBuying(v.id, n, g)}
                onSave={(patch) => onVariant(v, patch)}
                onDelete={() => onDeleteVariant(v)}
                photos={photos(v)}
                boxes={boxes && <BoxesBlock unit={v} boxes={boxesOf(v)} costs={costs} rules={rules} templates={boxes.templates} onAdd={boxes.onAdd} onSave={onVariant} onDelete={onDeleteVariant} />}
              />
            ))}
          </ul>
        </>
      ) : (
        variants[0] && <PriceRow key={variants[0].id} variant={variants[0]} have={costs.get(variants[0].id)} rules={rules} gst={<>{gst}{cessField}</>} onBuying={(n, g) => saveBuying(variants[0].id, n, g)} onSave={(patch) => onVariant(variants[0], patch)} boxes={boxes && <BoxesBlock unit={variants[0]} boxes={boxesOf(variants[0])} costs={costs} rules={rules} templates={boxes.templates} onAdd={boxes.onAdd} onSave={onVariant} onDelete={onDeleteVariant} />} />
      )}
      {err && <p className="ape-err">{err}</p>}
      <button type="button" className="ape-chip" onClick={onAdd}>
        + Add a size or colour
      </button>
    </section>
  );
}

// a ₹ amount typed in place; saves when you leave it
function Money({ value, label, placeholder, onChange, onSave }: { value: string; label: string; placeholder: string; onChange: (v: string) => void; onSave: () => void }) {
  return (
    <span className="ape-money ape-line-input">
      <i aria-hidden>₹</i>
      <input
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={onSave}
      />
    </span>
  );
}

function PriceRow({
  variant: v,
  card = false,
  have,
  rules,
  gst,
  photos,
  boxes,
  onBuying,
  onSave,
  onDelete,
}: {
  variant: AdminVariant;
  card?: boolean;
  have: Purchase | undefined;
  rules: Rules;
  gst?: ReactNode;
  photos?: ReactNode;
  boxes?: ReactNode;
  onBuying: (purchase: number | null, gst?: SupplierGst) => void;
  onSave: (patch: Partial<AdminVariant>) => void;
  onDelete?: () => void;
}) {
  // a cost typed before buying prices existed shows as its buying price
  const start = have ? (have.purchase ?? Math.round(((have.cost * 100) / (100 + rules.rate)) * 100) / 100) : null;
  const [buy, setBuy] = useState(start == null ? "" : String(start));
  const [sell, setSell] = useState(v.price ? String(v.price) : "");
  const [sellWas, setSellWas] = useState(v.price);
  if (v.price !== sellWas) {
    setSellWas(v.price);
    setSell(v.price ? String(v.price) : "");
  }
  // GST paid to the supplier, as typed: the rate (null follows the selling
  // bracket) and the amount, filled in from the rate until typed over
  const [gRate, setGRate] = useState<number | null>(have?.supplierRate ?? null);
  const [gAmt, setGAmt] = useState(have?.supplierGst != null ? String(have.supplierGst) : "");
  const [label, setLabel] = useState(v.label);
  const [confirm, setConfirm] = useState(false);

  // once an option is counted, its buying price is the average kept by stock
  // in (Add stock, voids), so it is shown here, not typed; so is the GST paid
  // once supplier bills feed it
  const fromStock = v.track_stock;
  const fromBills = have?.source === "bills";
  const b = fromStock ? start : buy.trim() === "" ? null : Number(buy);
  const s = Number(sell) || 0;
  const rate = gRate ?? rules.rate;
  const typedAmt = gAmt.trim() === "" ? null : Number(gAmt);
  const paid = fromBills ? (have?.gstPaid ?? null) : b == null ? null : supplierGst(b, rate, typedAmt);
  const claimable = fromBills ? (have?.gstClaimable ?? null) : paid;
  const cost = b == null || paid == null ? null : Math.round((b + paid) * 100) / 100;
  const u = cost != null && s > 0 ? unitProfit(s, cost, rules, { paid, claimable }) : null;
  const money = (n: number) => formatPrice(n, { paise: true });
  // the supplier GST as it now stands, saved with the purchase price
  const saveGst = (next: SupplierGst) => {
    if (b == null) return;
    setGRate(next.rate);
    setGAmt(next.amount == null ? "" : String(next.amount));
    onBuying(b, next);
  };

  return (
    <li className={card ? "ape-card" : "ape-one"}>
      {card && (
        <div className="ape-card-head">
          <input className="ape-card-name" aria-label="Size or colour name" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} onBlur={() => label.trim() && label !== v.label && onSave({ label: label.trim() })} />
          <button type="button" className={`ape-switch ape-switch--sm ${v.is_visible ? "is-on" : ""}`} aria-pressed={v.is_visible} onClick={() => onSave({ is_visible: !v.is_visible })} title={v.is_visible ? "On sale: tap to hide" : "Hidden: tap to put on sale"}>
            <i aria-hidden="true" />
            <span className="sr-only">{v.is_visible ? "On sale" : "Hidden"}</span>
          </button>
          {onDelete &&
            (confirm ? (
              <button type="button" className="ape-del is-sure" onClick={onDelete} onBlur={() => setConfirm(false)}>
                Delete?
              </button>
            ) : (
              <button type="button" className="ape-del" onClick={() => setConfirm(true)} aria-label={`Delete ${v.label}`}>
                ×
              </button>
            ))}
        </div>
      )}

      {fromStock ? (
        <div className="ape-line">
          <span className="ape-line-label">
            Purchase price (excl. GST) <small>average of the stock bought in</small>
          </span>
          <b className="ape-line-value">{start != null ? formatPrice(start, { paise: true }) : "Add stock to set it"}</b>
        </div>
      ) : (
        <label className="ape-line">
          <span className="ape-line-label">
            Purchase price (excl. GST) <small>type it until stock is added</small>
          </span>
          <Money value={buy} label={`${v.label} purchase price, excl. GST`} placeholder="0" onChange={setBuy} onSave={() => b !== start && onBuying(b, { rate: gRate, amount: typedAmt })} />
        </label>
      )}
      {fromBills ? (
        <div className="ape-line">
          <span className="ape-line-label">
            GST paid to supplier <small>average off the supplier bills, per piece</small>
          </span>
          <b className="ape-line-value">
            {paid != null ? money(paid) : "–"}
            {paid != null && claimable != null && claimable < paid && <small className="ape-line-sub"> {money(claimable)} of it claimable</small>}
          </b>
        </div>
      ) : (
        <div className="ape-line ape-line--gst">
          <span className="ape-line-label">
            GST paid to supplier <small>pick the rate on their bill; change the amount if their bill differs</small>
          </span>
          <div className="ape-gst-paid">
            <div className="ape-chips" role="group" aria-label="GST rate the supplier charged">
              {[0, ...SHOWN_BRACKETS].map((r) => (
                <button key={r} type="button" className={rate === r ? "is-on" : ""} aria-pressed={rate === r} disabled={b == null} onClick={() => saveGst({ rate: r === rules.rate ? null : r, amount: null })}>
                  {r}%
                </button>
              ))}
            </div>
            <Money
              value={gAmt !== "" ? gAmt : paid != null ? paid.toFixed(2) : ""}
              label={`${v.label} GST paid to the supplier, per piece`}
              placeholder="0"
              onChange={setGAmt}
              onSave={() => {
                // typed back to what the rate gives: no override
                const auto = b == null ? null : supplierGst(b, rate);
                const amount = typedAmt == null || typedAmt === auto ? null : typedAmt;
                if (amount !== (have?.supplierGst ?? null) || gRate !== (have?.supplierRate ?? null)) saveGst({ rate: gRate, amount });
                else if (amount == null) setGAmt("");
              }}
            />
            {typedAmt != null && b != null && typedAmt !== supplierGst(b, rate) && (
              <button type="button" className="ape-link" onClick={() => saveGst({ rate: gRate, amount: null })}>
                Use {rate}% ({money(supplierGst(b, rate))})
              </button>
            )}
          </div>
        </div>
      )}
      {gst}
      <div className="ape-line">
        <span className="ape-line-label">
          Cost price (incl. GST) <small>purchase price + GST paid to supplier</small>
        </span>
        <b className="ape-line-value">{cost != null ? money(cost) : "–"}</b>
      </div>
      <label className="ape-line">
        <span className="ape-line-label">
          {rules.inclusive ? "Selling price (incl. GST)" : "Selling price (excl. GST)"} <small>{rules.inclusive ? "what the customer pays" : "GST is added at checkout"}</small>
        </span>
        <Money value={sell} label={`${v.label} selling price`} placeholder="0" onChange={setSell} onSave={() => s !== v.price && onSave({ price: s })} />
      </label>
      {/* the same price the other way round: before GST, or with it (and cess) */}
      {s > 0 && (
        <p className="ape-other-price">
          {rules.inclusive
            ? `${money(u?.net ?? (s * 100) / (100 + rules.rate + (rules.cess ?? 0)))} before GST${rules.cess ? " and cess" : ""}`
            : `${money(u?.sale ?? (s * (100 + rules.rate + (rules.cess ?? 0))) / 100)} with GST${rules.cess ? " and cess" : ""}: what the customer pays`}
        </p>
      )}

      {/* the headline is what the shop keeps once the GST collected is paid over;
          gross (with that GST still in it) is shown underneath for reference */}
      <div className={`ape-profit ${u ? (u.kept < 0 ? "is-neg" : "is-pos") : ""}`}>
        {u ? (
          <>
            <span>
              <b>
                {u.kept < 0 ? "Net loss" : "Net profit"} {formatPrice(Math.abs(u.kept), { paise: true })}
              </b>{" "}
              per piece · {u.net > 0 ? ((u.kept / u.net) * 100).toFixed(1) : "0"}% margin
            </span>
            <GstNote u={u} credit={rules.credit} fromBills={fromBills} />
          </>
        ) : (
          <small>{b == null && !s ? "Type the purchase and selling price to see the profit." : b == null ? "Type the purchase price to see the profit." : "Type the selling price to see the profit."}</small>
        )}
      </div>
      {boxes}
      {photos && <div className="ape-opt-photos">{photos}</div>}
    </li>
  );
}

// A loose option's boxes (0058): each one's stock in boxes, its own selling
// price, whether it is sold to customers, and what it costs and earns per box
// (its cost is the pieces' cost x the pieces in it). Then a way to add one,
// from the shop's usual sizes or any other.
function BoxesBlock({
  unit,
  boxes,
  costs,
  rules,
  templates,
  onAdd,
  onSave,
  onDelete,
}: {
  unit: AdminVariant;
  boxes: AdminVariant[];
  costs: Map<string, Purchase>;
  rules: Rules;
  templates: BoxTemplate[];
  onAdd: (unit: AdminVariant, pieces: number) => void;
  onSave: (v: AdminVariant, patch: Partial<AdminVariant>) => void;
  onDelete: (v: AdminVariant) => void;
}) {
  const [other, setOther] = useState("");
  const have = new Set(boxes.map((b) => b.pack_of));
  const n = Number(other);
  const add = (pieces: number) => {
    if (!Number.isInteger(pieces) || pieces < 2 || have.has(pieces)) return;
    setOther("");
    onAdd(unit, pieces);
  };
  return (
    <div className="ape-boxes">
      <div className="ape-boxes-head">
        <b>Boxes</b>
        <small>
          {unit.track_stock ? `${unit.stock_qty} pieces in stock` : "Stock not counted yet"}
          {/* in the biggest box: "= 2 boxes of 50 + 7 loose" */}
          {boxes.length > 0 && unit.track_stock && unit.stock_qty > 0 && (() => {
            const big = Math.max(...boxes.map((b) => b.pack_of));
            const full = Math.floor(unit.stock_qty / big);
            return ` = ${full} ${full === 1 ? "box" : "boxes"} of ${big} + ${unit.stock_qty - full * big} loose`;
          })()}
        </small>
      </div>
      {boxes.map((b) => (
        <BoxRow key={b.id} box={b} have={costs.get(b.id)} rules={rules} onSave={(patch) => onSave(b, patch)} onDelete={() => onDelete(b)} />
      ))}
      <div className="ape-boxes-add">
        <span>+ Add a box</span>
        {templates
          .filter((t) => !have.has(t.pieces))
          .map((t) => (
            <button key={t.id} type="button" className="ape-chip" onClick={() => add(t.pieces)}>
              {t.label}
            </button>
          ))}
        <span className="ape-money ape-boxes-other">
          <input inputMode="numeric" aria-label="Pieces in another box size" placeholder="Other size" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && add(n)} />
        </span>
        {other !== "" && (
          <button type="button" className="ape-chip" disabled={!(n >= 2) || have.has(n)} onClick={() => add(n)}>
            {have.has(n) ? "Already there" : `Add ${boxLabel(n)}`}
          </button>
        )}
      </div>
    </div>
  );
}

function BoxRow({ box: b, have, rules, onSave, onDelete }: { box: AdminVariant; have: Purchase | undefined; rules: Rules; onSave: (patch: Partial<AdminVariant>) => void; onDelete: () => void }) {
  const [sell, setSell] = useState(b.price ? String(b.price) : "");
  const [sellWas, setSellWas] = useState(b.price);
  if (b.price !== sellWas) {
    setSellWas(b.price);
    setSell(b.price ? String(b.price) : "");
  }
  const [confirm, setConfirm] = useState(false);
  const s = Number(sell) || 0;
  const u = have && s > 0 ? unitProfit(s, have.cost, rules, { paid: have.gstPaid, claimable: have.gstClaimable }) : null;
  const money = (n: number) => formatPrice(n, { paise: true });
  return (
    <div className="ape-box">
      <div className="ape-box-name">
        <b>{boxLabel(b.pack_of)}</b>
        <small>{b.track_stock ? `${Math.max(0, b.stock_qty)} in stock` : "not counted"}</small>
      </div>
      <Money value={sell} label={`${b.label} selling price`} placeholder="0" onChange={setSell} onSave={() => s !== b.price && onSave({ price: s })} />
      <button type="button" className={`ape-switch ape-switch--sm ${b.is_visible ? "is-on" : ""}`} aria-pressed={b.is_visible} onClick={() => onSave({ is_visible: !b.is_visible })} title={b.is_visible ? "Sold to customers: tap to stop" : "Not sold as a box: tap to sell it"}>
        <i aria-hidden="true" />
        <span>{b.is_visible ? "Sold to customers" : "Not sold as a box"}</span>
      </button>
      {confirm ? (
        <button type="button" className="ape-del is-sure" onClick={onDelete} onBlur={() => setConfirm(false)}>
          Delete?
        </button>
      ) : (
        <button type="button" className="ape-del" onClick={() => setConfirm(true)} aria-label={`Delete ${b.label}`}>
          ×
        </button>
      )}
      <small className={`ape-box-profit ${u ? (u.kept < 0 ? "is-neg" : "is-pos") : ""}`}>
        {have ? `Cost ${money(have.cost)}` : "No cost yet"}
        {u && ` · ${u.kept < 0 ? "loss" : "profit"} ${money(Math.abs(u.kept))} a box after GST`}
      </small>
    </div>
  );
}

// The GST behind the profit, written out for one piece: what the buyer paid
// and the GST in it, what the supplier was paid and the GST in that, how much
// of it is claimed back and why, the GST left to pay over, and the profit
// with and without the claim. The same sums as admin_profit() (0056).
function GstNote({ u, credit, fromBills }: { u: ReturnType<typeof unitProfit>; credit: boolean; fromBills: boolean }) {
  const money = (n: number) => formatPrice(n, { paise: true });
  const signed = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));
  const why = !credit
    ? "Nothing claimed back: input tax credit is off in Settings."
    : u.itc === 0
      ? fromBills
        ? "Nothing claimed back: none of the supplier bills can be claimed (no supplier GSTIN, or not in GSTR-2B)."
        : "Nothing claimed back: no GST was paid to the supplier."
      : u.itc < u.paid
        ? `Claimed back ${money(u.itc)} of the ${money(u.paid)}: only bills from suppliers with a GSTIN count.`
        : `Claimed back all ${money(u.itc)} as input tax credit.`;
  return (
    <details className="ape-gst-note">
      <summary>
        After GST · gross {money(u.profit)} before paying the GST collected · <span className="ape-link">How this is worked out</span>
      </summary>
      <dl>
        <dt>Sold for</dt>
        <dd>
          {money(u.sale)} = {money(u.net)} + <b>{money(u.collected)}</b> GST collected from the buyer
          {u.cess > 0 && <> + {money(u.cess)} cess (paid over in full)</>}
        </dd>
        <dt>Cost</dt>
        <dd>
          {money(u.cost)} = {money(u.cost - u.paid)} + <b>{money(u.paid)}</b> GST paid to the supplier
        </dd>
        <dt>Rebate</dt>
        <dd>{why}</dd>
        <dt>GST you pay</dt>
        <dd>
          {money(u.collected)} collected − {money(u.itc)} claimed back = <b>{money(u.owed)}</b> to the government
        </dd>
        <dt>Profit</dt>
        <dd>
          {money(u.net)} − {money(u.cost)} + {money(u.itc)} claimed back = <b>{signed(u.kept)}</b>
          {u.itc > 0 && <> ({signed(u.keptNoItc)} if nothing could be claimed back)</>}
        </dd>
      </dl>
    </details>
  );
}

// the cess rate, percent of the taxable value (0057)
function CessField({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [v, setV] = useState(value ? String(value) : "");
  const n = v.trim() === "" ? 0 : Number(v);
  const ok = Number.isFinite(n) && n >= 0 && n <= 400;
  return (
    <label className="ape-line">
      <span className="ape-line-label">
        Cess <small>percent on top of GST; 0 for none</small>
      </span>
      <span className="ape-money ape-line-input">
        <input inputMode="decimal" aria-label="Cess rate, percent" aria-invalid={!ok} placeholder="0" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} onBlur={() => ok && n !== value && onSave(n)} />
        <i aria-hidden>%</i>
      </span>
    </label>
  );
}

// the HSN code, printed on invoices
function HsnField({ product, onSave }: { product: AdminProduct; onSave: (hsn: string) => void }) {
  const [hsn, setHsn] = useState(product.hsn);
  const ok = /^(\d{4}|\d{6}|\d{8})?$/.test(hsn.trim());
  return (
    <section className="ape-fields">
      <h3>HSN code</h3>
      <label className="ape-field">
        <span>Printed on invoices; 4, 6 or 8 digits</span>
        <input inputMode="numeric" maxLength={8} placeholder="e.g. 4813" value={hsn} aria-invalid={!ok} onChange={(e) => setHsn(e.target.value.replace(/\D/g, ""))} onBlur={() => ok && hsn.trim() !== product.hsn && onSave(hsn.trim())} />
      </label>
      {!ok && <p className="ape-err">An HSN code is 4, 6 or 8 digits.</p>}
    </section>
  );
}

// The last stock changes for this product's options: sales, cancelled orders put
// back, refunds restocked, and counts edited by hand.
const REASON = { sale: "Sold", cancel: "Order cancelled", refund: "Refund restock", return: "Returned", edit: "Order edited", undo: "Refund reversed", manual: "Manual edit", stock_in: "Purchase", void: "Bill cancelled", correction: "Stock adjustment" } as const;
type Move = Awaited<ReturnType<typeof import("@/lib/orders-db").stockHistory>>[number];
function StockHistory({ variants }: { variants: AdminVariant[] }) {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [bills, setBills] = useState<Map<string, string>>(new Map());
  // read again whenever a count changes
  const counts = variants.map((v) => `${v.id}:${v.stock_qty}`).join(",");
  useEffect(() => {
    let live = true;
    import("@/lib/orders-db")
      .then((m) => m.stockHistory(counts.split(",").map((x) => x.split(":")[0])))
      .then(async (r) => {
        const top = r.slice(0, 12);
        // "Stock in" rows name their bill
        const bills = await import("@/lib/stock-in/db").then((d) => d.billNumbers([...new Set(top.flatMap((m) => (m.receipt_id ? [m.receipt_id] : [])))])).catch(() => new Map<string, string>());
        if (live) {
          setBills(bills);
          setMoves(top);
        }
      })
      .catch(() => live && setMoves([]));
    return () => {
      live = false;
    };
  }, [counts]);
  if (!moves?.length) return <p className="ape-hint">No stock changes yet.</p>;
  const many = variants.length > 1;
  return (
    <ol className="ape-history">
      {moves.map((m) => (
        <li key={m.id}>
          <span>
            {REASON[m.reason]}
            {m.order_number && ` · ${m.order_number}`}
            {m.receipt_id && bills.get(m.receipt_id) && ` · bill ${bills.get(m.receipt_id)}`}
            {m.note && <small> · {m.note}</small>}
            {many && m.label && <small> · {m.label}</small>}
          </span>
          <b className={m.delta < 0 ? "is-down" : "is-up"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b>
          <small>{m.qty_after} left</small>
          <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</time>
        </li>
      ))}
    </ol>
  );
}

// Shopify-style product types the shop is likely to use; anything can be typed
const TYPE_HINTS = ["Rolling papers", "Cones", "Filter tips", "Rolling tray", "Grinder", "Lighter", "Ashtray", "Storage", "Bong", "Pipe", "Cigar", "Tobacco", "Accessory", "Merch"];

// Tags as chips: type and press Enter or a comma to add, × to take one off.
// For grouping and finding products ("gift", "under 500", "new in").
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add(raw: string) {
    const fresh = raw
      .split(",")
      .map((t) => t.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .filter((t, i, all) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()) && all.findIndex((y) => y.toLowerCase() === t.toLowerCase()) === i);
    setDraft("");
    if (fresh.length) onChange([...tags, ...fresh].slice(0, 30));
  }
  return (
    <div className="ape-tags">
      {tags.map((t) => (
        <span key={t} className="ape-tag">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        aria-labelledby="ape-tags-label"
        value={draft}
        placeholder={tags.length ? "Add another" : "gift, under 500, new in…"}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  );
}

// The product's search-engine listing: what Google shows, and what WhatsApp
// or Instagram show when someone shares its link. Both fields are optional;
// left empty, they're written from the product (lib/seo.ts), and the preview
// shows exactly that.
function SeoListing({
  product,
  categoryName,
  onSave,
}: {
  product: AdminProduct;
  categoryName: string;
  onSave: (patch: { seo_title?: string; seo_description?: string }) => void;
}) {
  const [title, setTitle] = useState(product.seo_title);
  const [desc, setDesc] = useState(product.seo_description);
  const base = { name: product.name, category: categoryName, description: product.description, brand: product.brand, price: mainPrice(product) || null };
  const autoT = autoTitle(base);
  const autoD = autoDescription(base);
  const shownT = fullTitle(title.trim() || autoT);
  const shownD = desc.trim() || autoD;
  const slugPath = ["shop", product.category_slug ?? "", product.slug].filter(Boolean).join(" › ");
  const count = (n: number, max: number) => (
    <span className={`ape-count ${n > max ? "is-over" : ""}`}>
      {n}/{max}
    </span>
  );
  return (
    <section className="ape-fields ape-seo">
      <h3>Search engine listing</h3>
      <p className="ape-hint">How it shows on Google and when its link is shared. Leave empty to use what&apos;s written from the product. Changes reach Google after the next site update.</p>
      <div className="ape-serp" aria-label="Preview of the search result">
        <span className="ape-serp-site">
          <i aria-hidden="true">B</i>
          <span>
            Babajee
            <small>neferchipss.github.io › {slugPath}</small>
          </span>
        </span>
        <b className="ape-serp-title">{shownT.length > TITLE_MAX + 11 ? `${shownT.slice(0, TITLE_MAX + 10)}…` : shownT}</b>
        <span className="ape-serp-desc">{shownD}</span>
      </div>
      <label className="ape-field ape-field--wide">
        <span className="ape-seo-label">
          Page title {count(shownT.length, TITLE_MAX)}
        </span>
        <input
          value={title}
          maxLength={120}
          placeholder={autoT}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== product.seo_title && onSave({ seo_title: title.trim() })}
        />
      </label>
      <label className="ape-field ape-field--wide">
        <span className="ape-seo-label">
          Description {count(shownD.length, DESC_MAX)}
        </span>
        <textarea
          rows={3}
          value={desc}
          maxLength={320}
          placeholder={autoD}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc.trim() !== product.seo_description && onSave({ seo_description: desc.trim() })}
        />
      </label>
      {(product.seo_title || product.seo_description) && (
        <button
          type="button"
          className="ape-link"
          onClick={() => {
            setTitle("");
            setDesc("");
            onSave({ seo_title: "", seo_description: "" });
          }}
        >
          Go back to the automatic listing
        </button>
      )}
    </section>
  );
}

// Codes and the "was" price for each option. The SKU is the shop's own stock
// code (on orders and exports); the barcode is the number printed under the
// bars; the compare-at price is the higher price the shop strikes through
// beside the real one, with "₹x OFF".
function VariantCodes({ product, categorySlug, onSave }: { product: AdminProduct; categorySlug: string; onSave: (id: string, patch: Partial<AdminVariant>) => Promise<boolean> }) {
  const many = product.variants.length > 1;
  const empty = product.variants.filter((v) => !v.sku);
  return (
    <section className="ape-fields ape-codes">
      <div className="ape-codes-head">
        <h3>Codes and was-price</h3>
        {empty.length > 0 && (
          <button
            type="button"
            className="ape-chip"
            onClick={async () => {
              for (const v of empty) await onSave(v.id, { sku: suggestSku(categorySlug, product.slug, v.label, many) });
            }}
          >
            Fill in {empty.length === product.variants.length ? "SKUs" : `${empty.length} missing SKU${empty.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
      <p className="ape-hint">SKU is your own stock code; it goes on orders and exports. Compare-at is the higher price shown struck through, like ₹499 → ₹399 with ₹100 OFF.</p>
      <div className={`ape-codes-grid ${many ? "is-many" : ""}`}>
        <span className="ape-codes-th">{many ? "Option" : ""}</span>
        <span className="ape-codes-th">SKU</span>
        <span className="ape-codes-th">Barcode</span>
        <span className="ape-codes-th">Compare-at price</span>
        {product.variants.map((v) => (
          <CodeRow key={`${v.id}|${v.sku}|${v.barcode}|${v.compare_at}`} variant={v} many={many} hint={suggestSku(categorySlug, product.slug, v.label, many)} onSave={(patch) => onSave(v.id, patch)} />
        ))}
      </div>
    </section>
  );
}

function CodeRow({ variant: v, many, hint, onSave }: { variant: AdminVariant; many: boolean; hint: string; onSave: (patch: Partial<AdminVariant>) => void }) {
  const [sku, setSku] = useState(v.sku ?? "");
  const [code, setCode] = useState(v.barcode ?? "");
  const [was, setWas] = useState(v.compare_at ? String(v.compare_at) : "");
  const wasN = Number(was) || 0;
  const below = wasN > 0 && v.price > 0 && wasN <= v.price;
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
  return (
    <>
      <span className="ape-codes-opt">{many ? v.label : ""}</span>
      <input
        aria-label={`${v.label} SKU`}
        value={sku}
        placeholder={hint}
        spellCheck={false}
        onChange={(e) => setSku(e.target.value.toUpperCase())}
        onKeyDown={enter}
        onBlur={() => sku.trim() !== (v.sku ?? "") && onSave({ sku: sku.trim() || null })}
      />
      <input
        aria-label={`${v.label} barcode`}
        value={code}
        inputMode="numeric"
        placeholder="EAN or UPC"
        spellCheck={false}
        onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
        onKeyDown={enter}
        onBlur={() => code.trim() !== (v.barcode ?? "") && onSave({ barcode: code.trim() || null })}
      />
      <span className="ape-codes-was">
        <span className={`ape-money ${below ? "is-below" : ""}`}>
          <i>₹</i>
          <input
            aria-label={`${v.label} compare-at price`}
            inputMode="decimal"
            value={was}
            placeholder="None"
            onChange={(e) => setWas(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={enter}
            onBlur={() => (wasN || null) !== v.compare_at && onSave({ compare_at: wasN || null })}
          />
        </span>
        {wasN > v.price && v.price > 0 ? (
          <small className="ape-codes-off">{Math.round(((wasN - v.price) / wasN) * 100)}% off</small>
        ) : below ? (
          <small className="ape-codes-warn">Not above the price, so it won&apos;t show</small>
        ) : null}
      </span>
    </>
  );
}

// Each option's packed weight and size (0059): a box weighs what its pieces
// do and more, so boxes get their own. For shipping, and shown on the product
// page. Empty when not known.
function WeightSize({ product, onSave }: { product: AdminProduct; onSave: (id: string, patch: Partial<AdminVariant>) => Promise<boolean> }) {
  const many = product.variants.length > 1;
  return (
    <section className="ape-fields ape-codes">
      <h3>Weight and size</h3>
      <p className="ape-hint">Packed, as it ships: weight in grams, size in centimetres (length × width × height).</p>
      <div className={`ape-codes-grid ape-size-grid ${many ? "is-many" : ""}`}>
        <span className="ape-codes-th">{many ? "Option" : ""}</span>
        <span className="ape-codes-th">Weight (g)</span>
        <span className="ape-codes-th">L × W × H (cm)</span>
        {product.variants.map((v) => (
          // keyed on the option alone: a save re-reads the product, and the row
          // must not start over while the next box is being typed in
          <SizeRow key={v.id} variant={v} many={many} onSave={(patch) => onSave(v.id, patch)} />
        ))}
      </div>
    </section>
  );
}

function SizeRow({ variant: v, many, onSave }: { variant: AdminVariant; many: boolean; onSave: (patch: Partial<AdminVariant>) => void }) {
  const str = (n: number | null) => (n == null ? "" : String(n));
  const [w, setW] = useState(str(v.weight_g));
  const [l, setL] = useState(str(v.length_cm));
  const [wd, setWd] = useState(str(v.width_cm));
  const [h, setH] = useState(str(v.height_cm));
  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();
  // empty or zero: not known
  const num = (x: string) => (Number(x) > 0 ? Math.round(Number(x) * 10) / 10 : null);
  const field = (label: string, value: string, set: (x: string) => void, key: keyof AdminVariant) => (
    <input
      aria-label={`${v.label} ${label}`}
      inputMode="decimal"
      value={value}
      placeholder="–"
      onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))}
      onKeyDown={enter}
      onBlur={() => num(value) !== v[key] && onSave({ [key]: num(value) } as Partial<AdminVariant>)}
    />
  );
  return (
    <>
      <span className="ape-codes-opt">{many ? v.label : ""}</span>
      {field("weight in grams", w, setW, "weight_g")}
      <span className="ape-size-lwh">
        {field("length in cm", l, setL, "length_cm")}
        <i aria-hidden="true">×</i>
        {field("width in cm", wd, setWd, "width_cm")}
        <i aria-hidden="true">×</i>
        {field("height in cm", h, setH, "height_cm")}
      </span>
    </>
  );
}

// Links to the product's videos (0059): YouTube, or a direct .mp4. Up to six,
// one a line; shown on the product's page.
function Videos({ urls, onSave }: { urls: string[]; onSave: (urls: string[]) => void }) {
  const [text, setText] = useState(urls.join("\n"));
  const list = text
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const bad = list.filter((x) => !/^https:\/\/\S+$/.test(x));
  const ok = !bad.length && list.length <= 6;
  return (
    <section className="ape-fields">
      <h3>Videos</h3>
      <label className="ape-field">
        <span>Links, one a line (YouTube, or a direct .mp4 link). Up to six.</span>
        <textarea
          rows={3}
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=…"
          value={text}
          aria-invalid={!ok}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => ok && list.join("\n") !== urls.join("\n") && onSave(list)}
        />
      </label>
      {bad.length > 0 && <p className="ape-err">Each link starts with https:// ({bad[0]} doesn&apos;t).</p>}
      {list.length > 6 && <p className="ape-err">Six videos at most.</p>}
    </section>
  );
}

// A section folded to one line: its name and what's in it. Open it to edit.
function Fold({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details className="ape-fold">
      <summary>
        <span className="ape-fold-title">{title}</span>
        <span className="ape-fold-sum">{summary}</span>
        <i aria-hidden="true">›</i>
      </summary>
      <div className="ape-fold-body">{children}</div>
    </details>
  );
}


// A label within the category ("Cones", "Filters"): customers filter the
// shelf by it. Suggests the ones the category already uses.
function SubcategoryField({ product, onSave }: { product: AdminProduct; onSave: (s: string) => void }) {
  const [value, setValue] = useState(product.subcategory);
  const [known, setKnown] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    subcategoriesOf(product.category_id).then((l) => live && setKnown(l), () => {});
    return () => {
      live = false;
    };
  }, [product.category_id]);
  return (
    <label className="ape-field">
      <span>Subcategory</span>
      <input list="ape-subs" value={value} maxLength={40} placeholder="Cones, filters…" onChange={(e) => setValue(e.target.value)} onBlur={() => value.trim() !== product.subcategory && onSave(value.trim())} />
      <datalist id="ape-subs">
        {known.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </label>
  );
}

// Specifications: label and value rows ("Material", "Aluminium"), shown as
// a table on the product page. Saved when a field is left.
function SpecsEditor({ specs, onSave }: { specs: Spec[]; onSave: (s: Spec[]) => void }) {
  const [rows, setRows] = useState<Spec[]>(specs.length ? specs : []);
  const clean = (list: Spec[]) => list.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label && r.value);
  const save = (list: Spec[]) => {
    const c = clean(list);
    if (JSON.stringify(c) !== JSON.stringify(specs)) onSave(c);
  };
  const set = (i: number, k: keyof Spec, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <section className="ape-fields">
      <h3>Specifications</h3>
      {rows.length === 0 && <p className="ape-hint">Material, size, what&apos;s in the box… shown as a table on the product page.</p>}
      <div className="ape-specs">
        {rows.map((r, i) => (
          <div key={i} className="ape-spec">
            <input value={r.label} placeholder="Material" maxLength={40} aria-label="Specification" onChange={(e) => set(i, "label", e.target.value)} onBlur={() => save(rows)} />
            <input value={r.value} placeholder="Aluminium" maxLength={120} aria-label="Value" onChange={(e) => set(i, "value", e.target.value)} onBlur={() => save(rows)} />
            <button
              type="button"
              className="ape-icon"
              aria-label={`Remove ${r.label || "row"}`}
              onClick={() => {
                const next = rows.filter((_, j) => j !== i);
                setRows(next);
                save(next);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="ape-add" onClick={() => setRows((rs) => [...rs, { label: "", value: "" }])}>
        + Add a row
      </button>
    </section>
  );
}


// This product's low-stock mark: empty uses the shop's (Settings).
function LowMark({ product, onSave }: { product: AdminProduct; onSave: (n: number | null) => void }) {
  const [v, setV] = useState(product.low_stock_at == null ? "" : String(product.low_stock_at));
  return (
    <label className="ape-field">
      <span>Reorder level</span>
      <input
        inputMode="numeric"
        value={v}
        placeholder="Shop's default"
        onChange={(e) => setV(e.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          const n = v === "" ? null : Math.min(10000, Number(v));
          if (n !== product.low_stock_at) onSave(n);
        }}
      />
    </label>
  );
}
