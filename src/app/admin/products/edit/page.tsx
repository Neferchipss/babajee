"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Empty } from "@/components/admin/kit";
import ProductPage from "@/components/admin/product/ProductPage";
import "@/components/admin/admin-products.css";

// A product's full page: adding its details and editing them, all in one
// place (components/admin/product/ProductPage.tsx). A query parameter, not a
// dynamic segment: a static export can't build one page per product, but one
// page reading ?id= works.
export default function EditProductPage() {
  return (
    <Suspense>
      <EditProduct />
    </Suspense>
  );
}

function EditProduct() {
  const id = useSearchParams().get("id") ?? "";
  return id ? <ProductPage id={id} /> : <Empty title="No product chosen" />;
}
