import Link from "next/link";
import Page from "@/components/Page";
import Price from "@/components/Price";
import ProductArt from "@/components/ProductArt";
import QtyStepper from "@/components/QtyStepper";
import { PLACEHOLDER_CART } from "@/lib/catalog-data";
import { categoryTone } from "@/lib/tone";

export default function CartPage() {
  return (
    <Page title="Your cart">
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <ul className="divide-y divide-line border-y border-line">
          {PLACEHOLDER_CART.map((item) => (
            <li key={item.slug} className="flex items-center gap-4 py-5">
              <ProductArt
                name={item.name}
                tone={categoryTone(item.categorySlug)}
                className="w-20 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/shop/${item.categorySlug}/${item.slug}`}
                  className="font-medium hover:text-rasta-gold"
                >
                  {item.name}
                </Link>
                <div className="mt-2">
                  <QtyStepper initial={item.qty} />
                </div>
              </div>
              <Price className="font-medium" />
            </li>
          ))}
        </ul>

        <aside className="rounded-xl border border-line bg-iron p-6">
          <h2 className="text-2xl">Order summary</h2>
          <dl className="mt-5 space-y-3">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>
                <Price />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd className="text-muted">Added at checkout</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-lg font-semibold">
              <dt>Total</dt>
              <dd>
                <Price />
              </dd>
            </div>
          </dl>
          <Link href="/checkout" className="btn btn-primary mt-6 w-full">
            Go to checkout
          </Link>
        </aside>
      </div>
    </Page>
  );
}
