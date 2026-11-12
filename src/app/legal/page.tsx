import type { Metadata } from "next";
import LegalDoc from "@/components/LegalDoc";
import Page from "@/components/Page";

export const metadata: Metadata = {
  title: "Legal and privacy",
  description: "Babajee's legal notices and privacy policy.",
};

export default function LegalPage() {
  return (
    <Page narrow title="Legal">
      <LegalDoc
        sections={["Age restriction", "How our products may be used", "Privacy", "Intellectual property"]}
      />
    </Page>
  );
}
