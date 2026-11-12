import type { MetadataRoute } from "next";
import { getStaticCategoryParams, getStaticProductParams } from "@/lib/catalog-db";
import { absUrl } from "@/lib/site";

// Every page a search engine should know about: the shop's own pages, each
// category's shelf and each product. Made when the site is built, so a
// product added in the admin is listed from the next deploy.
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([getStaticCategoryParams(), getStaticProductParams()]);
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" | "yearly") => ({ url: absUrl(path), lastModified: now, changeFrequency, priority });
  return [
    page("/", 1, "weekly"),
    page("/shop/", 0.9, "daily"),
    ...categories.filter((c) => c.category !== "_none").map((c) => page(`/shop/${c.category}/`, 0.8, "daily")),
    ...products.map((p) => page(`/shop/${p.category}/${p.product}/`, 0.7, "weekly")),
    page("/about/", 0.5, "monthly"),
    page("/contact/", 0.4, "yearly"),
    page("/support/", 0.4, "monthly"),
    page("/terms/", 0.2, "yearly"),
    page("/legal/", 0.2, "yearly"),
  ];
}
