import PageShell from "@/components/PageShell";

export default function ContactPage() {
  return (
    <PageShell title="Contact" sow="Extras — SOW #7">
      <form className="flex max-w-sm flex-col gap-4">
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Name" />
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Email" />
        <textarea className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Message" rows={4} />
        <button type="button" className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black">
          Send
        </button>
      </form>
    </PageShell>
  );
}
