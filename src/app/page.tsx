import type { Metadata } from "next";
import HomeSwitch from "@/components/home/HomeSwitch";
import { getHomeProducts, getIndexCategories, getShelfPicks, getSiteDesign, withPageSeo } from "@/lib/catalog-db";
import { absUrl } from "@/lib/site";

const META: Metadata = {
  title: { absolute: "Babajee · Smoking accessories, delivered across India" },
  description: "Rolling papers, cones, trays, grinders, glass, bongs and more from Babajee. Real products, honest prices, delivered anywhere in India.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/` },
};

// with the search listing from Admin > Storefront, when one is set
export async function generateMetadata(): Promise<Metadata> {
  return withPageSeo("/", META);
}

// The landing: in the design picked in Admin > Storefront. Current is the
// street, then scrolling walks you in to the painted shop; the others are a
// shop home with banners, best sellers and new arrivals (HomeSwitch).
export default async function Home() {
  const categories = await getIndexCategories();
  const shelves = await getShelfPicks(categories.map((c) => c.slug));
  // for the storefront designs' home (Admin > Storefront)
  const products = await getHomeProducts(categories);
  const design = await getSiteDesign();
  // for search engines: the shop itself, and its search box (Google can show
  // a search field under the result that lands on the shop's search page)
  const data = [
    { "@context": "https://schema.org", "@type": "Organization", name: "Babajee", url: absUrl("/"), logo: absUrl("/icon.png") },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Babajee",
      url: absUrl("/"),
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${absUrl("/shop/search/")}?q={search_term_string}` }, "query-input": "required name=search_term_string" },
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
      <HomeSwitch pano={{ shelves, categories: categories.map(({ slug, name, count }) => ({ slug, name, count })) }} products={products} built={design} />
    </>
  );
}
