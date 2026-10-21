"use client";

import Link from "next/link";
import { cartCount, cartTotal, removeLine, setQty, useCart } from "@/lib/cart";
import { JarArt } from "./CartJar";
import Price from "./Price";
import ProductArt from "./ProductArt";
import QtyStepper from "./QtyStepper";

// What's in Baba's jar, with quantities to change and the total.
export default function CartView() {
  const cart = useCart();
  const count = cartCount(cart);
  const total = cartTotal(cart);

  if (cart.length === 0) {
    return (
      <div className="cart-empty flex flex-col items-center gap-5 py-16 text-center">
        <div className="w-24">
          <JarArt pebbles={[]} />
        </div>
        <p className="text-xl font-semibold">The jar is empty.</p>
        <p className="text-muted">Anything you add drops in here.</p>
        <Link href="/shop" className="btn btn-primary">
          Go to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      <ul className="divide-y divide-line border-y border-line">
        {cart.map((line) => (
          <li key={line.key} className="flex items-center gap-4 py-5">
            <ProductArt name={line.name} tone={line.tone} className="w-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <Link href={line.href} className="font-medium hover:text-rasta-gold">
                {line.name}
              </Link>
              {line.variant !== "Standard" && <p className="text-sm text-muted">{line.variant}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <QtyStepper value={line.qty} min={0} onChange={(q) => setQty(line.key, q)} label={`${line.name} quantity`} />
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="cursor-pointer text-sm text-muted underline underline-offset-4 hover:text-paper"
                >
                  Remove
                </button>
              </div>
            </div>
            <Price className="font-medium" value={line.price === undefined ? undefined : line.price * line.qty} />
          </li>
        ))}
      </ul>

      <aside className="rounded-xl border border-line bg-iron p-6">
        <h2 className="text-2xl">Order summary</h2>
        <dl className="mt-5 space-y-3">
          <div className="flex justify-between">
            <dt className="text-muted">
              Subtotal ({count} item{count === 1 ? "" : "s"})
            </dt>
            <dd>
              <Price value={total} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="text-muted">Added at checkout</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-lg font-semibold">
            <dt>Total</dt>
            <dd>
              <Price value={total} />
            </dd>
          </div>
        </dl>
        <Link href="/checkout" className="btn btn-primary mt-6 w-full">
          Go to checkout
        </Link>
      </aside>
    </div>
  );
}

// The short list beside the checkout form.
export function CheckoutItems() {
  const cart = useCart();
  const total = cartTotal(cart);
  return (
    <aside className="rounded-xl border border-line bg-iron p-6">
      <h2 className="text-2xl">Your items</h2>
      {cart.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing in the jar yet. <Link href="/shop" className="underline underline-offset-4">Go to the shop</Link>
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {cart.map((line) => (
            <li key={line.key} className="flex justify-between gap-4 text-sm">
              <span>
                {line.name}
                {line.variant !== "Standard" && <span className="text-muted"> · {line.variant}</span>}{" "}
                <span className="text-muted">x {line.qty}</span>
              </span>
              <Price value={line.price === undefined ? undefined : line.price * line.qty} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-between border-t border-line pt-4 text-lg font-semibold">
        <span>Total</span>
        <Price value={total} />
      </div>
    </aside>
  );
}
