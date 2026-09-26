"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createCategory,
  listCategoriesWithCounts,
  moveCategory,
  updateCategory,
  type AdminCategory,
} from "@/lib/admin-data";
import { slugify } from "@/lib/slug";

export default function CategoriesAdmin() {
  const [rows, setRows] = useState<(AdminCategory & { count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listCategoriesWithCounts());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving("new");
    try {
      await createCategory({ slug: slugify(trimmed), name: trimmed, sort_order: rows.length });
      setName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(null);
  }

  async function toggleVisible(row: AdminCategory) {
    setSaving(row.id);
    try {
      await updateCategory(row.id, { is_visible: !row.is_visible });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(null);
  }

  async function rename(row: AdminCategory, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === row.name) return;
    setSaving(row.id);
    try {
      await updateCategory(row.id, { name: trimmed });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(null);
  }

  async function move(row: AdminCategory, direction: -1 | 1) {
    setSaving(row.id);
    try {
      await moveCategory(rows, row.id, direction);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setSaving(null);
  }

  return (
    <div>
      <h1 className="text-3xl">Categories</h1>
      {err && <p className="mt-4 text-rasta-red">{err}</p>}

      <form onSubmit={addCategory} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="grow">
          <span className="mb-1.5 block text-sm font-medium">New category name</span>
          <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vaporizers" />
        </label>
        <button type="submit" className="btn btn-primary disabled:opacity-60" disabled={saving === "new"}>
          {saving === "new" ? "Adding" : "Add category"}
        </button>
      </form>

      {loading ? (
        <p className="mt-8 text-muted">Loading.</p>
      ) : (
        <table className="mt-8 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 pr-4 font-medium">Order</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Slug</th>
              <th className="py-2 pr-4 font-medium">Products</th>
              <th className="py-2 pr-4 font-medium">Visible</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id} className="border-b border-line">
                <td className="py-2 pr-4">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => move(c, -1)}
                      disabled={saving === c.id || i === 0}
                      className="rounded border border-line px-2 py-0.5 text-muted hover:text-paper disabled:opacity-30"
                      aria-label={`Move ${c.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(c, 1)}
                      disabled={saving === c.id || i === rows.length - 1}
                      className="rounded border border-line px-2 py-0.5 text-muted hover:text-paper disabled:opacity-30"
                      aria-label={`Move ${c.name} down`}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-4">
                  <input className="field" defaultValue={c.name} onBlur={(e) => rename(c, e.target.value)} />
                </td>
                <td className="py-2 pr-4 text-muted">{c.slug}</td>
                <td className="py-2 pr-4">
                  <Link href={`/admin/products?category=${c.id}`} className="text-muted hover:text-paper">
                    {c.count}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  <button
                    type="button"
                    onClick={() => toggleVisible(c)}
                    disabled={saving === c.id}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      c.is_visible ? "bg-rasta-green/20 text-rasta-green" : "bg-line text-muted"
                    }`}
                  >
                    {c.is_visible ? "Visible" : "Hidden"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
