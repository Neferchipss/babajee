import { withPageSeo } from "@/lib/catalog-db";
import type { Metadata } from "next";
import { BlogList } from "@/components/home/ContentPage";

const META: Metadata = {
  title: "Blog",
  description: "Guides, new arrivals and notes from the Babajee shop.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/blog/` },
};

// with the search listing from Admin > Storefront, when one is set
export async function generateMetadata(): Promise<Metadata> {
  return withPageSeo("/blog/", META);
}

export default function Blog() {
  return <BlogList />;
}
