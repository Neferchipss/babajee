import Link from "next/link";
import Page from "@/components/Page";
import Price from "@/components/Price";
import { PLACEHOLDER_CART } from "@/lib/catalog-data";

const STEPS = [
  "Place your order.",
  "Transfer the total to the bank account below.",
  "Add your transfer reference and a screenshot.",
  "We check the payment and email you a confirmation.",
];

const BANK = ["Account name", "Account number", "IFSC code", "Bank and branch"];

export default function CheckoutPage() {
  return (
    <Page title="Checkout">
      <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:items-start">
        <form className="space-y-12">
          <section aria-labelledby="delivery-heading">
            <h2 id="delivery-heading" className="mb-5 text-2xl">
              Delivery address
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium">Full name</span>
                <input className="field" autoComplete="name" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium">Address</span>
                <input className="field" autoComplete="street-address" />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium">City</span>
                <input className="field" autoComplete="address-level2" />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium">PIN code</span>
                <input className="field" inputMode="numeric" autoComplete="postal-code" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium">Phone</span>
                <input className="field" type="tel" autoComplete="tel" />
              </label>
            </div>
          </section>

          <section aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="mb-5 text-2xl">
              Pay by bank transfer
            </h2>
            <ol className="mb-6 list-decimal space-y-2 pl-5 marker:font-semibold marker:text-rasta-gold">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>

            <dl className="mb-6 grid gap-x-8 gap-y-3 rounded-xl border border-line bg-iron p-5 sm:grid-cols-2">
              {BANK.map((label) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-medium text-muted">To be added by the store</dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-4">
              <label>
                <span className="mb-1.5 block text-sm font-medium">Transfer reference</span>
                <input className="field" />
              </label>
              <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line px-4 py-8 text-center hover:border-paper">
                <span className="font-medium">Upload a screenshot of the transfer</span>
                <span className="text-sm text-muted">PNG or JPG</span>
                <input type="file" accept="image/*" className="sr-only" />
              </label>
            </div>
          </section>

          <Link href="/orders/1001" className="btn btn-primary w-full sm:w-auto">
            Place order
          </Link>
        </form>

        <aside className="rounded-xl border border-line bg-iron p-6">
          <h2 className="text-2xl">Your items</h2>
          <ul className="mt-4 space-y-3">
            {PLACEHOLDER_CART.map((item) => (
              <li key={item.slug} className="flex justify-between gap-4 text-sm">
                <span>
                  {item.name} <span className="text-muted">x {item.qty}</span>
                </span>
                <Price />
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-between border-t border-line pt-4 text-lg font-semibold">
            <span>Total</span>
            <Price />
          </div>
        </aside>
      </div>
    </Page>
  );
}
