"use client";

// A product's photos and boxes, shared by the full product page and the quick
// side panel (moved here from ProductEditor unchanged). Both act at once:
// a photo is uploaded, moved or removed, a box size added, straight away.
import { useCallback, useEffect, useRef, useState } from "react";
import { boxLabel, type AdminCategory, type AdminProduct, type AdminVariant, type BoxPreset, type BoxSize } from "@/lib/admin-data";
import { shootPhotos } from "@/lib/product-photos";
import type { Api } from "./ProductBasics";
import type { Group, PhotoItem, PhotoRef } from "./Photos";
import { sheetBoxSize, type BoxSetupProps } from "./Boxes";

type Run = (work: () => Promise<unknown>) => Promise<boolean>;

// ---------------------------------------------------------------- photos
// The photos are in groups: the product's own, then one per option (with no
// options, just the one). A photo's group is the option it shows.
export function usePhotoManager(product: AdminProduct, api: Api, run: Run, onAdded?: (n: number) => void) {
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null);
  const many = product.variants.filter((v) => !v.unit_variant_id).length > 1;
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
    if (ok) onAdded?.(pics.length);
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

  return { many, uploading, addFiles, itemsOf, groupProps, dragRef };
}

// ---------------------------------------------------------------- boxes (0061, 0065)
export function useBoxes(product: AdminProduct, categories: AdminCategory[], api: Api, run: Run) {
  const many = product.variants.filter((v) => !v.unit_variant_id).length > 1;
  const boxMode = !!categories.find((c) => c.id === product.category_id)?.sold_in_boxes || product.variants.some((v) => v.unit_variant_id);
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
  const setup: BoxSetupProps = {
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
  return { boxMode, setup, addBox, sizes };
}
