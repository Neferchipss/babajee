import type { Metadata } from "next";
import { FaqList } from "@/components/home/ContentPage";

// One help page: the shop's questions and answers (/faq/). /support stays so
// old links and bookmarks still land on it.
export const metadata: Metadata = {
  title: "Help and questions",
  description: "Delivery, orders, payment, returns and your account: answers to the questions people ask Babajee most.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/faq/` },
};

export default function SupportPage() {
  return <FaqList />;
}
