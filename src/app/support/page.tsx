import PageShell from "@/components/PageShell";

const FAQS = [
  "How do I check my order status?",
  "What payment methods do you accept?",
  "Do you ship across India?",
];

export default function SupportPage() {
  return (
    <PageShell title="Support" sow="Extras — SOW #7">
      <div className="flex flex-col gap-3">
        {FAQS.map((q) => (
          <div key={q} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
            {q}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
