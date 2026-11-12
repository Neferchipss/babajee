import type { Metadata } from "next";
import LegalDoc from "@/components/LegalDoc";
import Page from "@/components/Page";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for buying from Babajee.",
};

export default function TermsPage() {
  return (
    <Page narrow title="Terms and conditions">
      <LegalDoc
        sections={[
          "Who can buy",
          "Orders and payment",
          "Delivery",
          "Returns and refunds",
          "Your account",
          "Changes to these terms",
        ]}
      />
    </Page>
  );
}
