import Link from "next/link";
import PageShell from "@/components/PageShell";
import { PLACEHOLDER_CART } from "@/lib/catalog-data";

export default function CartPage() {
  const subtotal = PLACEHOLDER_CART.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <PageShell title="Cart" sow="Product Catalogue — SOW #4">
      <div className="flex flex-col gap-4">
        {PLACEHOLDER_CART.map((item) => (
          <div key={item.slug} className="flex items-center gap-4 border-b border-neutral-800 pb-4">
            <div className="h-16 w-16 flex-shrink-0 rounded bg-neutral-800" />
            <div className="flex-1">
              <Link href={`/shop/${item.categorySlug}/${item.slug}`} className="font-medium hover:text-neutral-300">
                {item.name}
              </Link>
              <p className="text-sm text-neutral-500">Qty {item.qty}</p>
            </div>
            <p className="text-sm">&#8377;{(item.price * item.qty).toLocaleString("en-IN")}</p>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <span className="text-neutral-500">Subtotal</span>
          <span className="text-lg font-semibold">&#8377;{subtotal.toLocaleString("en-IN")}</span>
        </div>
        <Link
          href="/checkout"
          className="mt-4 inline-block rounded-full bg-white px-6 py-3 text-center text-sm font-medium text-black"
        >
          Proceed to checkout
        </Link>
      </div>
    </PageShell>
  );
}
