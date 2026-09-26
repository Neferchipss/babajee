"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listCategories, listProducts } from "@/lib/admin-data";

type Stats = { categories: number; products: number; visible: number; priced: number };

export default function AdminHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([listCategories(), listProducts()])
      .then(([categories, products]) => {
        setStats({
          categories: categories.length,
          products: products.length,
          visible: products.filter((p) => p.is_visible).length,
          priced: products.filter((p) => p.variants.some((v) => v.price > 0)).length,
        });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div>
      <h1 className="text-3xl">Admin</h1>
      <p className="mt-2 text-muted">
        Add categories and products, set prices and stock, and choose what shows on the site.
      </p>
      {err && <p className="mt-4 text-rasta-red">{err}</p>}

      {stats && (
        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ["Categories", stats.categories],
              ["Products", stats.products],
              ["Visible", stats.visible],
              ["Priced", stats.priced],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="tile p-5">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-3xl">{n}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/admin/categories" className="btn btn-ghost">
          Manage categories
        </Link>
        <Link href="/admin/products" className="btn btn-primary">
          Manage products
        </Link>
      </div>
    </div>
  );
}
