"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ProductEditor from "@/components/admin/ProductEditor";
import "@/components/admin/admin-products.css";
import { adminApi } from "@/lib/admin-api";
import type { AdminCategory, AdminProduct } from "@/lib/admin-data";

// One product on a page of its own (an old link, or a bookmark): the same
// editor the Products grid opens beside itself. A query param, not a dynamic
// segment, on purpose: a static export can't pre-build one page per product,
// but a single static page reading ?id= works fine.
export default function EditProductPage() {
  return (
    <Suspense>
      <EditProduct />
    </Suspense>
  );
}

function EditProduct() {
  const id = useSearchParams().get("id") ?? "";
  const api = adminApi();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProduct(id), api.listCategories()])
      .then(([p, cats]) => {
        setProduct(p);
        setCategories(cats);
        if (!p) setErr("No product with this id.");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="ap" style={{ maxWidth: 640 }}>
      <Link href="/admin/products" className="ap-link" style={{ justifySelf: "start", paddingLeft: 0 }}>
        ‹ All products
      </Link>
      {!id ? (
        <p className="ap-sub">No product chosen.</p>
      ) : err ? (
        <p className="ap-err">{err}</p>
      ) : !product ? (
        <p className="ap-sub">Loading.</p>
      ) : (
        <ProductEditor product={product} categories={categories} api={api} onChanged={setProduct} sheet={false} />
      )}
    </div>
  );
}
