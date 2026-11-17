import type { Metadata } from "next";
import ContactForm from "@/components/ContactForm";
import Page from "@/components/Page";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Babajee about an order, a product or anything else.",
};

export default function ContactPage() {
  return (
    <Page title="Contact" lede="Questions about an order or a product? Send us a message.">
      <ContactForm />
    </Page>
  );
}
