"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "@/components/admin/Toaster";
import { createProduct, getProduct, listCategories, updateProduct, upsertVariant, type AdminCategory } from "@/lib/admin-data";
import { errText } from "@/lib/orders-db";
import { slugify } from "@/lib/slug";

// Add a product: its name, its category, a price if known. It starts as a
// draft (never half-finished on the shop) and opens in its panel, where the
// photos go in and it's set to On the shop.
export default function NewProductPage() {
  return (
    <Suspense>
      <NewProduct />
    </Suspense>
  );
}

function NewProduct() {
  const router = useRouter();
  const preselect = useSearchParams().get("category") ?? "";
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [categoryId, setCategoryId] = useState(preselect);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCategories()
      .then((cats) => {
        setCategories(cats);
        if (!preselect && cats[0]) setCategoryId(cats[0].id);
      })
      .catch((e) => setErr(errText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || !name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      // a name already used gets the next free address (grinder, grinder-2, ...)
      let id = "";
      for (let n = 1; !id; n++) {
        try {
          id = await createProduct({ category_id: categoryId, slug: n === 1 ? slugify(name) : `${slugify(name)}-${n}`, name: name.trim(), description: "" });
        } catch (x) {
          if ((x as { code?: string }).code !== "23505" || n > 20) throw x;
        }
      }
      await updateProduct(id, { status: "draft" });
      const p = Math.round(Number(price) || 0);
      if (p > 0) {
        const made = await getProduct(id);
        const v = made?.variants[0];
        if (v) await upsertVariant(id, { id: v.id, price: p });
      }
      toast(`${name.trim()} added as a draft`);
      router.push(`/admin/products?product=${id}`);
    } catch (x) {
      setErr(errText(x));
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Link href="/admin/products" className="adm-back adm-only-narrow">
        ← Products
      </Link>
      <header className="adm-pagehead">
        <h1>Add a product</h1>
        <p>Name it and pick its category. It starts as a draft: add its photos and price in the next step, then set it to On the shop.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}
      <form onSubmit={submit} className="adm-card" style={{ display: "grid", gap: 14 }}>
        <label className="adm-label">
          Name
          <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="RAW Classic King Size Slim" autoFocus required />
        </label>
        <label className="adm-label">
          Category
          <select className="adm-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-label">
          Selling price, ₹ (optional)
          <input className="adm-input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="Can be added later" />
        </label>
        <div className="adm-actions">
          <button className="adm-btn pri" disabled={saving || !name.trim() || !categoryId}>
            {saving ? "Adding" : "Add and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
