import type { Metadata } from "next";
import { getCategoryDetail, getStaticCategoryParams } from "@/lib/catalog-db";
import Shelf from "./Shelf";

export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticCategoryParams();
}

// "Grinder | Babajee", and a line on what's on the shelf
export async function generateMetadata(props: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category } = await props.params;
  const detail = await getCategoryDetail(category);
  if (!detail) return {};
  const n = detail.products.length;
  const description = `${n} ${detail.category.name.toLowerCase()} product${n === 1 ? "" : "s"} at Babajee: ${detail.products
    .slice(0, 3)
    .map((p) => p.name)
    .join(", ")}${n > 3 ? " and more" : ""}. Delivered across India.`;
  return { title: detail.category.name, description, alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/shop/${category}/` } };
}

export default async function CategoryPage(props: PageProps<"/shop/[category]">) {
  const { category } = await props.params;
  return <Shelf categorySlug={category} />;
}
