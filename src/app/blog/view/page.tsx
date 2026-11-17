import type { Metadata } from "next";
import { Suspense } from "react";
import { PageView } from "@/components/home/ContentPage";

export const metadata: Metadata = { title: "Blog" };

// a post written in Admin > Storefront > Pages > Blog (/blog/view/?slug=…)
export default function BlogPost() {
  return (
    <Suspense>
      <PageView kind="post" />
    </Suspense>
  );
}
