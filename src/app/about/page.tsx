import Link from "next/link";
import Page, { Placeholder } from "@/components/Page";

export default function AboutPage() {
  return (
    <Page narrow title="About Babajee">
      <div className="space-y-12">
        <section>
          <h2 className="mb-3 text-2xl sm:text-3xl">What we sell</h2>
          <p className="max-w-[60ch] text-lg">
            Rolling papers, rolling trays, bongs and bong accessories, grinders, ashtrays, storage,
            lighters and more, from a range of brands.
          </p>
          <Link href="/shop" className="btn btn-primary mt-6">
            Browse the shop
          </Link>
        </section>

        <section>
          <h2 className="mb-3 text-2xl sm:text-3xl">Our story</h2>
          <Placeholder>The store&apos;s story goes here. To be written with the store.</Placeholder>
        </section>

        <section>
          <h2 className="mb-3 text-2xl sm:text-3xl">Visit the store</h2>
          <Placeholder>Address and opening hours to be added by the store.</Placeholder>
        </section>
      </div>
    </Page>
  );
}
