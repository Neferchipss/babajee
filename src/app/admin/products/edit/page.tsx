"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  deleteVariant,
  getProduct,
  listCategories,
  updateProduct,
  upsertVariant,
  type AdminCategory,
  type AdminProduct,
  type AdminVariant,
} from "@/lib/admin-data";
import { formatPrice } from "@/lib/currency";

// A query param, not a dynamic segment, on purpose: a static export can't
// pre-build one page per product (most are hidden, so their ids aren't even
// visible at build time), but a single static page reading ?id= works fine.
export default function EditProductPage() {
  return (
    <Suspense>
      <EditProduct />
    </Suspense>
  );
}

function EditProduct() {
  const id = useSearchParams().get("id") ?? "";
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [p, cats] = await Promise.all([getProduct(id), listCategories()]);
      setProduct(p);
      setCategories(cats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id) return <p className="text-muted">No product chosen.</p>;
  if (err) return <p className="text-rasta-red">{err}</p>;
  if (!product) return <p className="text-muted">Loading.</p>;

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nextVisible = form.get("is_visible") === "on";
    setSaving(true);
    try {
      await updateProduct(product!.id, {
        name: String(form.get("name")).trim(),
        description: String(form.get("description")).trim(),
        category_id: String(form.get("category_id")),
        is_visible: nextVisible,
      });
      // A product with a single option: showing/hiding the product always
      // carries that one option's visibility with it (see setProductVisibility).
      if (product!.variants.length === 1) {
        await upsertVariant(product!.id, { ...product!.variants[0], is_visible: nextVisible });
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  }

  async function saveVariant(v: AdminVariant, patch: Partial<AdminVariant>) {
    try {
      await upsertVariant(product!.id, { ...v, ...patch });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function addVariant() {
    try {
      await upsertVariant(product!.id, {
        label: "New option",
        price: 0,
        stock_qty: 0,
        is_visible: false,
        sort_order: product!.variants.length,
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeVariant(v: AdminVariant) {
    if (product!.variants.length === 1) {
      setErr("A product needs at least one option. Hide the product instead, or add another option first.");
      return;
    }
    if (!confirm(`Delete the "${v.label}" option? This cannot be undone.`)) return;
    try {
      await deleteVariant(v.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <Link href="/admin/products" className="text-sm text-muted hover:text-paper">
        Back to products
      </Link>
      <h1 className="mt-2 text-3xl">{product.name}</h1>

      {product.is_visible && product.variants.every((v) => !v.is_visible) && (
        <p className="mt-4 rounded-lg border border-rasta-gold/40 bg-rasta-gold/10 px-4 py-3 text-sm text-rasta-gold">
          This product is marked visible, but none of its options are. It will not actually show on the site —
          turn on at least one option below.
        </p>
      )}

      <form onSubmit={saveDetails} className="mt-6 grid max-w-lg gap-4" key={`${product.id}:${product.name}`}>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Category</span>
          <select name="category_id" className="field w-full" defaultValue={product.category_id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input name="name" className="field w-full" defaultValue={product.name} required />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Description</span>
          <textarea name="description" className="field w-full" rows={3} defaultValue={product.description} />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input name="is_visible" type="checkbox" defaultChecked={product.is_visible} className="size-4 accent-[var(--color-rasta-gold)]" />
          Show this product on the site
        </label>
        <button type="submit" className="btn btn-primary w-fit disabled:opacity-60" disabled={saving}>
          {saving ? "Saving" : "Save details"}
        </button>
      </form>

      <h2 className="mt-12 text-2xl">Options, price and stock</h2>
      <p className="mt-1 text-sm text-muted">Every product needs at least one option. Set a real price and switch it on to sell it.</p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2 pr-4 font-medium">Option</th>
            <th className="py-2 pr-4 font-medium">Price</th>
            <th className="py-2 pr-4 font-medium">Stock</th>
            <th className="py-2 pr-4 font-medium">Visible</th>
            <th className="py-2 pr-4 font-medium" />
          </tr>
        </thead>
        <tbody>
          {product.variants.map((v) => (
            <VariantRow key={v.id} variant={v} onSave={(patch) => saveVariant(v, patch)} onDelete={() => removeVariant(v)} />
          ))}
        </tbody>
      </table>
      <button type="button" onClick={addVariant} className="btn btn-ghost mt-4">
        Add another option
      </button>
    </div>
  );
}

function VariantRow({
  variant,
  onSave,
  onDelete,
}: {
  variant: AdminVariant;
  onSave: (patch: Partial<AdminVariant>) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(variant.label);
  const [price, setPrice] = useState(String(variant.price));
  const [stock, setStock] = useState(String(variant.stock_qty));

  return (
    <tr className="border-b border-line">
      <td className="py-2 pr-4">
        <input className="field w-36" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => onSave({ label })} />
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <input
            className="field w-24"
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onBlur={() => onSave({ price: Number(price) || 0 })}
          />
          <span className="text-xs text-muted">{formatPrice(Number(price) || 0)}</span>
        </div>
      </td>
      <td className="py-2 pr-4">
        <input
          className="field w-20"
          type="number"
          min={0}
          step="1"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          onBlur={() => onSave({ stock_qty: Number(stock) || 0 })}
        />
      </td>
      <td className="py-2 pr-4">
        <button
          type="button"
          onClick={() => onSave({ is_visible: !variant.is_visible })}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            variant.is_visible ? "bg-rasta-green/20 text-rasta-green" : "bg-line text-muted"
          }`}
        >
          {variant.is_visible ? "Visible" : "Hidden"}
        </button>
      </td>
      <td className="py-2 pr-4">
        <button type="button" onClick={onDelete} className="text-sm text-rasta-red hover:underline">
          Delete
        </button>
      </td>
    </tr>
  );
}
