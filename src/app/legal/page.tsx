import LegalDoc from "@/components/LegalDoc";
import Page from "@/components/Page";

export default function LegalPage() {
  return (
    <Page narrow title="Legal">
      <LegalDoc
        sections={["Age restriction", "How our products may be used", "Privacy", "Intellectual property"]}
      />
    </Page>
  );
}
