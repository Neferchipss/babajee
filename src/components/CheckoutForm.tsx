"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AddressPicker from "@/components/address/AddressPicker";
import { useAuth } from "@/lib/auth";
import { clearCart, useCart } from "@/lib/cart";
import { track } from "@/lib/track";
import { useCartStock } from "@/lib/cart-stock";

// Checkout: pick where it goes, add a note, place the order. There is no
// payment step yet. The order goes in unpaid, and the shop confirms payment
// with the customer before packing it (see supabase/migrations/0013).
const FIELDS = ["recipient_name", "phone", "line1", "line2", "landmark", "city", "state", "pincode", "latitude", "longitude"] as const;

export default function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const stock = useCartStock(cart);
  const { status } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    track("checkout");
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const form = new FormData(e.currentTarget);
    const address = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(`address_${k}`) ?? "")])) as Record<(typeof FIELDS)[number], string>;
    if (!address.line1) {
      setErr("Choose a delivery address, or add one and press Deliver here.");
      return;
    }
    if (!cart.length) {
      setErr("Your jar is empty.");
      return;
    }
    if (stock.blocked) {
      setErr(stock.blocked);
      return;
    }
    const unpriced = cart.find((l) => l.price === undefined);
    if (unpriced) {
      setErr(`${unpriced.name} has no price yet, so it can't be ordered. Remove it to continue.`);
      return;
    }
    setBusy(true);
    try {
      const { placeOrder, errText } = await import("@/lib/orders-db");
      try {
        const o = await placeOrder(
          cart.map((l) => ({ slug: l.slug, variant: l.variant, qty: l.qty })),
          address,
          String(form.get("notes") ?? ""),
        );
        clearCart();
        router.push(`/orders/view?id=${o.order_id}&placed=1`);
      } catch (x) {
        setErr(errText(x));
        setBusy(false);
      }
    } catch {
      setErr("Could not reach the shop. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form className="space-y-12" onSubmit={submit}>
      <section aria-labelledby="delivery-heading">
        <h2 id="delivery-heading" className="mb-5 text-2xl">
          Delivery address
        </h2>
        <AddressPicker />
      </section>

      <section aria-labelledby="notes-heading">
        <h2 id="notes-heading" className="mb-5 text-2xl">
          Anything we should know?
        </h2>
        <textarea name="notes" className="field min-h-24" maxLength={1000} placeholder="Delivery timing, gate code, packing (optional)" />
      </section>

      <section aria-labelledby="pay-heading">
        <h2 id="pay-heading" className="mb-3 text-2xl">
          Payment
        </h2>
        <p className="max-w-[60ch] text-muted">Place your order now. We&apos;ll get in touch to confirm payment before we pack it.</p>
      </section>

      {stock.blocked && !err ? (
        <p role="alert" className="text-red-soft">
          {stock.blocked} <Link href="/cart" className="underline">Go to your cart</Link>
        </p>
      ) : null}
      {err && (
        <p role="alert" className="text-red-soft">
          {err}
        </p>
      )}

      {status === "in" ? (
        <button className="btn btn-primary w-full sm:w-auto" disabled={busy || cart.length === 0 || !!stock.blocked}>
          {busy ? "Placing your order" : "Place order"}
        </button>
      ) : (
        <Link href="/account/login" className="btn btn-primary w-full sm:w-auto">
          Log in to place your order
        </Link>
      )}
    </form>
  );
}
