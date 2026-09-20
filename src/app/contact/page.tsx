import Page from "@/components/Page";

const DETAILS = ["Address", "Phone", "Email", "Opening hours"];

export default function ContactPage() {
  return (
    <Page title="Contact" lede="Questions about an order or a product? Send us a message.">
      <div className="grid gap-12 md:grid-cols-2">
        <form className="grid gap-4">
          <label>
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <input className="field" autoComplete="name" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input className="field" type="email" autoComplete="email" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Message</span>
            <textarea className="field" rows={5} />
          </label>
          <button type="button" className="btn btn-primary justify-self-start">
            Send message
          </button>
        </form>

        <dl className="space-y-5">
          {DETAILS.map((label) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-medium text-muted">To be added by the store</dd>
            </div>
          ))}
        </dl>
      </div>
    </Page>
  );
}
