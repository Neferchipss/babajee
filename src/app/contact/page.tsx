import { withPageSeo } from "@/lib/catalog-db";
import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import Page from "@/components/Page";

const META: Metadata = {
  title: "Contact",
  description: "Get in touch with Babajee about an order, a product or anything else.",
};

// with the search listing from Admin > Storefront, when one is set
export async function generateMetadata(): Promise<Metadata> {
  return withPageSeo("/contact/", META);
}

export default function ContactPage() {
  return (
    <Page title="Contact" lede="Questions about an order or a product? Send us a message.">
      <ContactForm />
    </Page>
  );
}
