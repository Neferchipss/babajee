"use client";

// What the admin pages call: the real database (admin-data.ts), or, on a
// developer's machine with ?demo=1 in the address, an in-memory catalogue
// made from the stock sheet, so the screens can be tried without an admin
// login. The demo never exists in a production build.
import * as real from "./admin-data";
import type { AdminCategory, AdminImage, AdminProduct, AdminVariant } from "./admin-data";
import { CATEGORIES } from "./catalog-data";

export const isAdminDemo = () =>
  process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

type Api = Pick<
  typeof real,
  | "listCategories"
  | "createCategory"
  | "updateCategory"
  | "moveCategory"
  | "listProducts"
  | "getProduct"
  | "createProduct"
  | "updateProduct"
  | "setProductVisibility"
  | "bulkSetVisibility"
  | "upsertVariant"
  | "deleteVariant"
  | "uploadProductImage"
  | "deleteProductImage"
  | "reorderProductImages"
  | "setImageVariant"
  | "importShootPhoto"
>;

let demo: Api | null = null;

export function adminApi(): Api {
  if (!isAdminDemo()) return real;
  return (demo ??= makeDemo());
}

function makeDemo(): Api {
  const uid = () => crypto.randomUUID();
  const cats: AdminCategory[] = CATEGORIES.map((c, i) => ({ id: c.slug, slug: c.slug, name: c.name, sort_order: i, is_visible: true }));
  let products: AdminProduct[] = CATEGORIES.flatMap((c) =>
    c.products.map((p, i) => ({
      id: uid(),
      slug: p.slug,
      name: p.name,
      description: p.unitsPerBox ? `${p.unitsPerBox} per box` : "",
      is_visible: i % 5 !== 3,
      sort_order: i,
      category_id: c.slug,
      category_slug: c.slug,
      category_name: c.name,
      variants: (p.variants.length ? p.variants : [{ label: "Default" }]).map((v, j) => ({
        id: uid(),
        label: v.label,
        price: i % 4 === 1 ? 0 : 420,
        stock_qty: 12,
        track_stock: i % 3 === 0,
        is_visible: i % 5 !== 3,
        sort_order: j,
      })),
      images: [] as AdminImage[],
    })),
  );
  const copy = <T,>(x: T): T => structuredClone(x);
  const find = (id: string) => products.find((p) => p.id === id)!;
  const wait = () => new Promise((r) => setTimeout(r, 120));
  const api: Api = {
    async listCategories() {
      return copy(cats);
    },
    async createCategory(input) {
      cats.push({ id: input.slug, ...input, is_visible: true });
    },
    async updateCategory(id, patch) {
      Object.assign(cats.find((c) => c.id === id)!, patch);
    },
    async moveCategory(_rows, id, direction) {
      const i = cats.findIndex((c) => c.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= cats.length) return;
      [cats[i], cats[j]] = [cats[j], cats[i]];
      cats.forEach((c, k) => (c.sort_order = k));
    },
    async listProducts(categoryId?: string) {
      await wait();
      return copy(categoryId ? products.filter((p) => p.category_id === categoryId) : products);
    },
    async getProduct(id: string) {
      const p = products.find((x) => x.id === id);
      return p ? copy(p) : null;
    },
    async createProduct(input) {
      const cat = cats.find((c) => c.id === input.category_id)!;
      const id = uid();
      products = [
        {
          id,
          ...input,
          is_visible: true,
          sort_order: -1,
          category_slug: cat.slug,
          category_name: cat.name,
          variants: [{ id: uid(), label: "Default", price: 0, stock_qty: 0, track_stock: false, is_visible: true, sort_order: 0 }],
          images: [],
        },
        ...products,
      ];
      return id;
    },
    async updateProduct(id, patch) {
      const p = find(id);
      Object.assign(p, patch);
      if (patch.category_id) {
        const cat = cats.find((c) => c.id === patch.category_id)!;
        p.category_slug = cat.slug;
        p.category_name = cat.name;
      }
    },
    async setProductVisibility(product, visible) {
      const p = find(product.id);
      p.is_visible = visible;
      if (p.variants.length === 1) p.variants[0].is_visible = visible;
    },
    async bulkSetVisibility(_all, ids, visible) {
      for (const id of ids) await api.setProductVisibility(find(id), visible);
    },
    async upsertVariant(productId, variant) {
      const p = find(productId);
      if (variant.id) Object.assign(p.variants.find((v) => v.id === variant.id)!, variant);
      else p.variants.push({ id: uid(), label: "Option", price: 0, stock_qty: 0, track_stock: false, is_visible: true, sort_order: p.variants.length, ...variant } as AdminVariant);
    },
    async deleteVariant(id) {
      for (const p of products) p.variants = p.variants.filter((v) => v.id !== id);
    },
    async uploadProductImage(productId, file, sortOrder, variantId = null, altText = "") {
      await wait();
      const blob = await real.preparePhoto(file);
      const id = uid();
      find(productId).images.push({ id, storage_path: "demo", url: URL.createObjectURL(blob), variant_id: variantId, sort_order: sortOrder, alt_text: altText });
      find(productId).images.sort((a, b) => a.sort_order - b.sort_order);
      return id;
    },
    async importShootPhoto(productId, src, path, sortOrder, variantId) {
      const blob = await (await fetch(src)).blob();
      return api.uploadProductImage(productId, new File([blob], "shoot.webp", { type: blob.type }), sortOrder, variantId, path);
    },
    async deleteProductImage(image) {
      for (const p of products) p.images = p.images.filter((i) => i.id !== image.id);
    },
    async reorderProductImages(ids) {
      for (const p of products) for (const i of p.images) if (ids.includes(i.id)) i.sort_order = ids.indexOf(i.id);
      for (const p of products) p.images.sort((a, b) => a.sort_order - b.sort_order);
    },
    async setImageVariant(id, variantId) {
      for (const p of products) for (const i of p.images) if (i.id === id) i.variant_id = variantId;
    },
  };
  return api;
}
