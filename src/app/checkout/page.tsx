import Link from "next/link";
import PageShell from "@/components/PageShell";
import { PLACEHOLDER_CART } from "@/lib/catalog-data";

export default function CheckoutPage() {
  const subtotal = PLACEHOLDER_CART.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <PageShell title="Checkout" sow="Order Management — SOW #5">
      <div className="grid gap-8 sm:grid-cols-2">
        <form className="flex flex-col gap-4">
          <h2 className="font-medium">Shipping address</h2>
          <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Full name" />
          <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Address line" />
          <div className="flex gap-4">
            <input className="w-1/2 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="City" />
            <input className="w-1/2 rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="PIN code" />
          </div>
          <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Phone" />

          <h2 className="mt-4 font-medium">Payment — bank transfer</h2>
          <p className="text-sm text-neutral-500">
            Account details placeholder. After transferring, upload the reference/screenshot below.
          </p>
          <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Transfer reference" />
          <div className="rounded border border-dashed border-neutral-800 px-3 py-6 text-center text-sm text-neutral-500">
            Upload payment screenshot (placeholder)
          </div>

          <Link
            href="/orders/1001"
            className="mt-4 inline-block rounded-full bg-white px-6 py-3 text-center text-sm font-medium text-black"
          >
            Place order
          </Link>
        </form>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="font-medium">Order summary</h2>
          {PLACEHOLDER_CART.map((item) => (
            <div key={item.slug} className="mt-3 flex justify-between text-sm">
              <span className="text-neutral-400">{item.name} &times; {item.qty}</span>
              <span>&#8377;{(item.price * item.qty).toLocaleString("en-IN")}</span>
            </div>
          ))}
          <div className="mt-4 flex justify-between border-t border-neutral-800 pt-4 font-medium">
            <span>Total</span>
            <span>&#8377;{subtotal.toLocaleString("en-IN")}</span>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
