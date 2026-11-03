"use client";

import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct, AdminVariant } from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";
import { type GstRules, unitProfit } from "@/lib/gst";
import { photosFor, shootPhotos } from "@/lib/product-photos";

type Api = ReturnType<typeof adminApi>;

// What a product still needs before it can sell: a photo, a price, to be shown.
export function needsOf(p: AdminProduct) {
  return {
    photo: p.images.length === 0 && photosFor(p.slug).length === 0,
    price: !p.variants.some((v) => v.price > 0),
    hidden: !p.is_visible,
  };
}
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

// One product, edited in place: photos first (drop, paste or choose them),
// then its name, category and description, then its price, stock and options.
// Every field saves as you leave it; there is no Save button to forget.
export default function ProductEditor({
  product,
  categories,
  api,
  onChanged,
  onClose,
  nav,
  sheet = true,
}: {
  product: AdminProduct;
  categories: AdminCategory[];
  api: Api;
  // the product after a change, re-read from the database
  onChanged: (p: AdminProduct) => void;
  onClose?: () => void;
  nav?: { at: number; of: number; prev?: () => void; next?: () => void; nextNeeds?: () => void };
  sheet?: boolean;
}) {
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [err, setErr] = useState("");
  const [description, setDescription] = useState(product.description);
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
    } catch (e) {
      setStatus("");
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function addFiles(files: File[], group: string | null = null) {
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    setUploading({ done: 0, of: pics.length });
    await run(async () => {
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

  const many = product.variants.length > 1;
  const single = product.variants[0];
  // stock is tracked for the product as a whole: every option, or none
  const tracked = product.variants.some((v) => v.track_stock);

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
          <button
            type="button"
            className={`ape-switch ${product.is_visible ? "is-on" : ""}`}
            aria-pressed={product.is_visible}
            onClick={() => run(() => api.setProductVisibility(product, !product.is_visible))}
          >
            <i aria-hidden="true" />
            {product.is_visible ? "On the shop" : "Hidden"}
          </button>
        </div>
        {err && <p className="ape-err">{err}</p>}

        {/* photos: drag any of them to reorder, or onto an option below */}
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
          <h3>{many ? "Photos of the product" : "Photos"}</h3>
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
                    <span>Add photos</span>
                    <small>Drop, paste or choose</small>
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

        {/* details */}
        <section className="ape-fields">
          <h3>Details</h3>
          <label className="ape-field">
            <span>Category</span>
            <select value={product.category_id} onChange={(e) => run(() => api.updateProduct(product.id, { category_id: e.target.value }))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ape-field ape-field--wide">
            <span>Description</span>
            <textarea
              rows={3}
              value={description}
              placeholder="Pack size, material, what it fits"
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== product.description && run(() => api.updateProduct(product.id, { description: description.trim() }))}
            />
          </label>
        </section>

        {/* price and options */}
        <section className="ape-fields">
          <h3>{many ? "Options, prices and stock" : "Price and stock"}</h3>
          {many ? (
            <>
            <div className="ape-price ape-price--main">
              <label className="ape-field">
                <span>Main price</span>
                <EditablePrice className="ape-main-price" value={mainPrice(product)} label="Main price" onSave={(price) => run(() => setMainPrice(api, product, price))} />
              </label>
              <p className="ape-hint">Every option takes this price unless it has its own below.</p>
            </div>
            <ul className="ape-opts">
              {product.variants.map((v) => (
                <OptionRow
                  key={v.id}
                  variant={v}
                  tracked={tracked}
                  main={mainPrice(product)}
                  photos={
                    <PhotoGroup
                      {...groupProps}
                      small
                      group={v.id}
                      items={itemsOf(v.id)}
                      onFiles={(f) => addFiles(f, v.id)}
                      add={<AddPhotos label={itemsOf(v.id).length ? "More" : `Photos of ${v.label}`} busy={!!uploading} onFiles={(f) => addFiles(f, v.id)} />}
                    />
                  }
                  onSave={(patch) => run(() => api.upsertVariant(product.id, { ...v, ...patch }))}
                  onDelete={() => run(() => api.deleteVariant(v.id))}
                />
              ))}
            </ul>
            </>
          ) : (
            single && <SinglePrice key={single.id} variant={single} tracked={tracked} onSave={(patch) => run(() => api.upsertVariant(product.id, { ...single, ...patch }))} />
          )}
          <button
            type="button"
            className="ape-chip"
            onClick={() =>
              run(() =>
                api.upsertVariant(product.id, { label: many ? "New option" : "Option 2", price: mainPrice(product), stock_qty: 0, track_stock: tracked, is_visible: true, sort_order: product.variants.length }),
              )
            }
          >
            + Add an option (a colour, size or design)
          </button>
        </section>

        {/* what each option costs the shop, and what it makes */}
        <CostAndProfit variants={product.variants} />

        {/* stock: counted down by each order when tracked, with its history */}
        <section className="ape-fields">
          <h3>Stock</h3>
          <button
            type="button"
            className={`ape-switch ${tracked ? "is-on" : ""}`}
            aria-pressed={tracked}
            onClick={() => run(() => Promise.all(product.variants.map((v) => api.upsertVariant(product.id, { id: v.id, track_stock: !tracked }))))}
          >
            <i aria-hidden="true" />
            {tracked ? "Tracking stock" : "Not tracking stock"}
          </button>
          <p className="ape-hint">
            {tracked
              ? `Each order takes its items off the ${many ? "counts" : "count"} above, and at 0 ${many ? "an option" : "it"} can't be ordered.`
              : "Always orderable. Turn this on to count stock down with each order and stop orders at 0."}
          </p>
          {tracked && <StockHistory variants={product.variants} />}
        </section>
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

function SinglePrice({ variant, tracked, onSave }: { variant: AdminVariant; tracked: boolean; onSave: (patch: Partial<AdminVariant>) => void }) {
  const [price, setPrice] = useState(variant.price ? String(variant.price) : "");
  const [stock, setStock] = useState(String(variant.stock_qty));
  return (
    <div className="ape-price">
      <label className="ape-field">
        <span>Price</span>
        <div className="ape-money">
          <i>₹</i>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={() => Number(price) !== variant.price && onSave({ price: Number(price) || 0 })}
            autoFocus={!variant.price}
          />
        </div>
      </label>
      {tracked && (
        <label className="ape-field">
          <span>In stock</span>
          <input
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={() => Number(stock) !== variant.stock_qty && onSave({ stock_qty: Number(stock) || 0 })}
          />
        </label>
      )}
    </div>
  );
}

function OptionRow({
  variant,
  tracked,
  main,
  photos,
  onSave,
  onDelete,
}: {
  variant: AdminVariant;
  tracked: boolean;
  main: number;
  photos: ReactNode;
  onSave: (patch: Partial<AdminVariant>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(variant.label);
  const [price, setPrice] = useState(variant.price ? String(variant.price) : "");
  const [was, setWas] = useState(variant.price);
  if (variant.price !== was) {
    setWas(variant.price);
    setPrice(variant.price ? String(variant.price) : "");
  }
  const own = main > 0 && variant.price > 0 && variant.price !== main;
  const [stock, setStock] = useState(String(variant.stock_qty));
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="ape-opt">
      <input className="ape-opt-name" aria-label="Option name" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} onBlur={() => label.trim() && label !== variant.label && onSave({ label: label.trim() })} />
      <div className={`ape-money ${own ? "is-own" : "is-main"}`} title={own ? "Its own price" : "The main price"}>
        <i>₹</i>
        {own && (
          <button type="button" className="ape-reset" onClick={() => onSave({ price: main })} aria-label={`Put ${variant.label} back on the main price`} title="Back to the main price">
            ↺
          </button>
        )}
        <input
          aria-label={`${variant.label} price`}
          inputMode="decimal"
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={() => Number(price) !== variant.price && onSave({ price: Number(price) || 0 })}
        />
      </div>
      {tracked ? (
        <input
          className="ape-opt-stock"
          aria-label={`${variant.label} stock`}
          title="In stock"
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onBlur={() => Number(stock) !== variant.stock_qty && onSave({ stock_qty: Number(stock) || 0 })}
        />
      ) : (
        <span className="ape-opt-stock is-off" title="Stock not tracked">
          –
        </span>
      )}
      <button type="button" className={`ape-switch ape-switch--sm ${variant.is_visible ? "is-on" : ""}`} aria-pressed={variant.is_visible} onClick={() => onSave({ is_visible: !variant.is_visible })}>
        <i aria-hidden="true" />
        <span className="sr-only">{variant.is_visible ? "On sale" : "Off"}</span>
      </button>
      {confirm ? (
        <button type="button" className="ape-del is-sure" onClick={onDelete} onBlur={() => setConfirm(false)}>
          Delete?
        </button>
      ) : (
        <button type="button" className="ape-del" onClick={() => setConfirm(true)} aria-label={`Delete ${variant.label}`}>
          ×
        </button>
      )}
      <small className="ape-opt-price">{variant.price > 0 ? formatPrice(variant.price) : "No price"}</small>
      {own && <small className="ape-own">Own price · main is {formatPrice(main)}</small>}
      {/* this option's own photos: what the shop shows when it is picked */}
      <div className="ape-opt-photos">{photos}</div>
    </li>
  );
}

// The last stock changes for this product's options: sales, cancelled orders put
// back, refunds restocked, and counts edited by hand.
const REASON = { sale: "Sold", cancel: "Order cancelled", refund: "Refund restock", return: "Returned", edit: "Order edited", undo: "Refund undone", manual: "Edited" } as const;
type Move = Awaited<ReturnType<typeof import("@/lib/orders-db").stockHistory>>[number];
function StockHistory({ variants }: { variants: AdminVariant[] }) {
  const [moves, setMoves] = useState<Move[] | null>(null);
  // read again whenever a count changes
  const counts = variants.map((v) => `${v.id}:${v.stock_qty}`).join(",");
  useEffect(() => {
    let live = true;
    import("@/lib/orders-db")
      .then((m) => m.stockHistory(counts.split(",").map((x) => x.split(":")[0])))
      .then((r) => live && setMoves(r.slice(0, 12)))
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

// Cost price per option, with the profit and margin it leaves at today's price
// and GST rule (Settings). Costs are kept in an admin-only table, apart from
// the options customers can read. Empty means not known yet.
function CostAndProfit({ variants }: { variants: AdminVariant[] }) {
  const ids = variants.map((v) => v.id).join(",");
  const [costs, setCosts] = useState<Map<string, number> | null>(null);
  const [rules, setRules] = useState<GstRules | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const list = ids ? ids.split(",") : [];
    import("@/lib/orders-db")
      .then((m) => Promise.all([m.getCosts(list), m.getSettings()]))
      .then(([c, s]) => {
        setCosts(c);
        setRules({ rate: s.gst_rate, inclusive: s.gst_inclusive, credit: s.gst_input_credit });
      })
      .catch(() => setCosts(null));
  }, [ids]);

  if (!costs || !rules) return null;
  const many = variants.length > 1;

  async function save(id: string, cost: number | null) {
    setErr("");
    try {
      const m = await import("@/lib/orders-db");
      await m.setCost(id, cost);
      setCosts((m) => {
        const n = new Map(m);
        if (cost == null) n.delete(id);
        else n.set(id, cost);
        return n;
      });
    } catch (e) {
      setErr(e && typeof e === "object" && "message" in e ? String(e.message) : "Could not save the cost.");
    }
  }

  return (
    <section className="ape-fields">
      <h3>Cost and profit</h3>
      <p className="ape-hint">
        What the shop pays the supplier for one{rules.credit ? ", as on the bill (with GST)" : ""}. Only admins see it. Profit is after {rules.rate}% GST
        {rules.inclusive ? " (inside the price)" : " (added at checkout, so not taken from the price)"}
        {rules.credit ? ", with the supplier's GST claimed back" : ""}.
      </p>
      <ul className="ape-costs">
        {variants.map((v) => (
          <CostRow key={v.id} label={many ? v.label : "Cost price"} price={v.price} cost={costs.get(v.id)} rules={rules} onSave={(c) => save(v.id, c)} />
        ))}
      </ul>
      {err && <p className="ape-err">{err}</p>}
    </section>
  );
}

function CostRow({ label, price, cost, rules, onSave }: { label: string; price: number; cost: number | undefined; rules: GstRules; onSave: (cost: number | null) => void }) {
  const [text, setText] = useState(cost === undefined ? "" : String(cost));
  const n = text.trim() === "" ? null : Number(text);
  const u = n != null && price > 0 ? unitProfit(price, n, rules) : null;
  return (
    <li className="ape-cost">
      <span className="ape-cost-name">
        {label}
        <small>{price > 0 ? `sells at ${formatPrice(price)}` : "no price yet"}</small>
      </span>
      <label className="ape-money">
        <i aria-hidden>₹</i>
        <input
          inputMode="decimal"
          aria-label={`${label} cost price`}
          placeholder="Cost"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={() => n !== (cost ?? null) && onSave(n)}
        />
      </label>
      <span className={`ape-cost-profit ${u ? (u.profit < 0 ? "is-neg" : "is-pos") : ""}`}>
        {u ? (
          <>
            {formatPrice(u.profit, { paise: true })} profit
            <small>{u.margin.toFixed(1)}% margin</small>
          </>
        ) : (
          <small>{n == null ? "Add a cost to see profit" : "Add a price to see profit"}</small>
        )}
      </span>
    </li>
  );
}
