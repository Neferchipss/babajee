import type { Metadata } from "next";
import { FaqList } from "@/components/home/ContentPage";

export const metadata: Metadata = {
  title: "Questions and answers",
  description: "Delivery, orders, returns and more: answers to the questions people ask Babajee most.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/faq/` },
};

export default function Faq() {
  return <FaqList />;
}
