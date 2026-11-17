"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SlideToConfirm from "@/components/SlideToConfirm";
import AddressPicker from "@/components/address/AddressPicker";
import { billingDefault, listAddresses } from "@/lib/address-db";
import { addressLines, type Address } from "@/lib/addresses";
import { useAuth, type Profile } from "@/lib/auth";
import { cartSums, clearCart, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { track } from "@/lib/track";
import { useCartStock } from "@/lib/cart-stock";

// Checkout: pick where it goes, add a note, place the order. There is no
// online payment, by the shop's choice: the order goes in unpaid, someone from
// the shop contacts the customer to take payment and marks it paid (0013, 0055).
const FIELDS = ["recipient_name", "phone", "line1", "line2", "landmark", "city", "state", "pincode", "latitude", "longitude"] as const;

export default function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const stock = useCartStock(cart);
  const { status, profile } = useAuth();
  const blocked = profile?.status === "blocked";
  // the billing address, when it isn't the delivery one (0066)
  const [billing, setBilling] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const total = cartSums(cart).total;

  useEffect(() => {
    track("checkout");
  }, []);
  // the checkout steps, for Analytics > Traffic: where people stop (0049)
  const step = (label: string) => track("step", location.pathname, label.slice(0, 120));
  useEffect(() => {
    if (status === "out") step("sign-in needed");
  }, [status]);
  const stockBlocked = !!stock.blocked;
  useEffect(() => {
    if (stockBlocked) step("blocked: stock");
  }, [stockBlocked]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    step("submit");
    const form = new FormData(e.currentTarget);
    const address = Object.fromEntries(FIELDS.map((k) => [k, String(form.get(`address_${k}`) ?? "")])) as Record<(typeof FIELDS)[number], string>;
    if (!address.line1) {
      setErr("Choose a delivery address, or add one and press Deliver here.");
      step("blocked: no address");
      return;
    }
    if (!cart.length) {
      setErr("Your jar is empty.");
      step("blocked: empty cart");
      return;
    }
    if (stock.blocked) {
      setErr(stock.blocked);
      return;
    }
    const unpriced = cart.find((l) => l.price === undefined);
    if (unpriced) {
      setErr(`${unpriced.name} has no price yet, so it can't be ordered. Remove it to continue.`);
      step("blocked: no price");
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
        // billing elsewhere: put it on the order (a miss here never loses the order)
        if (billing) {
          const { setOrderBilling } = await import("@/lib/orders-db");
          await setOrderBilling(o.order_id, { name: billing.recipient_name, line1: billing.line1, line2: billing.line2, city: billing.city, state: billing.state, pincode: billing.pincode }).catch(() => {});
        }
        clearCart();
        router.push(`/orders/view?id=${o.order_id}&placed=1`);
      } catch (x) {
        setErr(errText(x));
        step(`error: ${errText(x)}`);
        setBusy(false);
      }
    } catch {
      setErr("Could not reach the shop. Check your connection and try again.");
      step("error: offline");
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} className="space-y-12" onSubmit={submit}>
      <section aria-labelledby="delivery-heading">
        <h2 id="delivery-heading" className="mb-5 text-2xl">
          Delivery address
        </h2>
        <AddressPicker />
      </section>

      {status === "in" && <BillingPicker profile={profile} onChange={setBilling} />}

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
        <p className="max-w-[60ch] text-muted">
          Nothing to pay online. Place your order and someone from our team will contact you on the phone number in your delivery address to take payment. We&apos;ll hold your items while we do, then pack and ship once it&apos;s paid.
        </p>
      </section>

      {blocked && (
        <p role="alert" className="text-red-soft">
          This account can&apos;t place orders right now. Please <Link href="/contact" className="underline">contact us</Link>.
        </p>
      )}
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
        <>
          <div className="co-desk">
            <button className="btn btn-primary w-full sm:w-auto" disabled={busy || blocked || cart.length === 0 || !!stock.blocked}>
              {busy ? "Placing your order" : "Place order"}
            </button>
          </div>
          {/* phones: slide to confirm, so a stray tap can't place an order */}
          <div className="co-slide-gap" aria-hidden="true" />
          <div className="co-slidebar">
            <SlideToConfirm
              label={`Slide to confirm order · ${formatPrice(total)}`}
              disabled={blocked || cart.length === 0 || !!stock.blocked}
              busy={busy}
              onConfirm={() => formRef.current?.requestSubmit()}
            />
            <small>Nothing to pay now: our team will contact you for payment.</small>
          </div>
        </>
      ) : (
        <Link href="/account/login" className="btn btn-primary w-full sm:w-auto">
          Log in to place your order
        </Link>
      )}
    </form>
  );
}

// Where the bill goes (0066): the delivery address unless another is picked
// (the customer's saved billing address to start with). A business account's
// name and GSTIN go on its invoice either way.
function BillingPicker({ profile, onChange }: { profile: Profile | null; onChange: (a: Address | null) => void }) {
  const [list, setList] = useState<Address[]>([]);
  const [pick, setPick] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([listAddresses(), billingDefault()])
      .then(([rows, b]) => {
        if (!live) return;
        setList(rows);
        // a saved billing address that isn't the delivery default starts picked
        const start = b && rows.find((r) => r.id === b && !r.is_default);
        if (start) {
          setPick(start.id);
          onChange(start);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [onChange]);
  const choose = (id: string) => {
    setPick(id);
    onChange(list.find((r) => r.id === id) ?? null);
  };
  const business = profile?.customer_type === "business" && profile.gstin;
  if (list.length < 2 && !business) return null;
  return (
    <section aria-labelledby="billing-heading">
      <h2 id="billing-heading" className="mb-3 text-2xl">
        Billing
      </h2>
      {business && (
        <p className="mb-3 text-sm text-muted">
          GST invoice to {profile!.business_name || "your business"} · GSTIN {profile!.gstin}
        </p>
      )}
      {list.length > 1 && (
        <label className="block max-w-md">
          <span className="mb-1.5 block text-sm font-medium">Bill to</span>
          <select className="field" value={pick} onChange={(e) => choose(e.target.value)}>
            <option value="">Same as the delivery address</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label ? `${a.label}: ` : ""}
                {addressLines(a).join(", ")}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
