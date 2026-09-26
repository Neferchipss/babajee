"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createProduct, listCategories, type AdminCategory } from "@/lib/admin-data";
import { slugify } from "@/lib/slug";

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
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCategories()
      .then((cats) => {
        setCategories(cats);
        if (!preselect && cats[0]) setCategoryId(cats[0].id);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId || !name.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const id = await createProduct({
        category_id: categoryId,
        slug: slugify(name),
        name: name.trim(),
        description: description.trim(),
      });
      router.push(`/admin/products/edit?id=${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div>
      <Link href="/admin/products" className="text-sm text-muted hover:text-paper">
        Back to products
      </Link>
      <h1 className="mt-2 text-3xl">Add a product</h1>
      <form onSubmit={submit} className="mt-6 grid max-w-lg gap-4">
        <label>
          <span className="mb-1.5 block text-sm font-medium">Category</span>
          <select className="field w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Description</span>
          <textarea className="field w-full" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {err && <p className="text-sm text-rasta-red">{err}</p>}
        <button type="submit" className="btn btn-primary w-fit disabled:opacity-60" disabled={saving}>
          {saving ? "Creating" : "Create product"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        A hidden &ldquo;Default&rdquo; option is added automatically. Set its price and stock, then make it visible, on
        the next screen.
      </p>
    </div>
  );
}
