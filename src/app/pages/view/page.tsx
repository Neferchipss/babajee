import type { Metadata } from "next";
import { Suspense } from "react";
import { PageView } from "@/components/home/ContentPage";

export const metadata: Metadata = { title: "Babajee" };

// a page written in Admin > Storefront > Pages (/pages/view/?slug=about-us)
export default function SitePage() {
  return (
    <Suspense>
      <PageView kind="page" />
    </Suspense>
  );
}
