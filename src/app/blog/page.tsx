import type { Metadata } from "next";
import { BlogList } from "@/components/home/ContentPage";

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides, new arrivals and notes from the Babajee shop.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/blog/` },
};

export default function Blog() {
  return <BlogList />;
}
