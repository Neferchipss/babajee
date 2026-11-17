import { withPageSeo } from "@/lib/catalog-db";
import type { Metadata } from "next";
import { FaqList } from "@/components/home/ContentPage";

const META: Metadata = {
  title: "Questions and answers",
  description: "Delivery, orders, returns and more: answers to the questions people ask Babajee most.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/faq/` },
};

// with the search listing from Admin > Storefront, when one is set
export async function generateMetadata(): Promise<Metadata> {
  return withPageSeo("/faq/", META);
}

export default function Faq() {
  return <FaqList />;
}
