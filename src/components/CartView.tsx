"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type CartLine, cartSums, clearCart, lineUnit, removeLine, restoreLine, setQty, useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/currency";
import { toggleSaved } from "@/lib/wishlist";
import CartRecs from "./CartRecs";
import { JarArt } from "./CartJar";
import type { CardProduct } from "./ProductCard";
import ProductArt from "./ProductArt";
import "./cart.css";

const rs = (n: number) => formatPrice(n, { paise: true });
const buzz = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

type Undo = { text: string; restore: () => void };

const Bin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

// What is in Baba's jar, laid out like the quick-commerce carts: what the
// deals saved across the top, every line in one panel (picture, name, how it
// comes, move to wishlist; the stepper and price on the right, its minus a
// bin at one), a row of things to add, and on phones the total and checkout
// in a bar at the bottom. Removing, saving or clearing can be undone.
export default function CartView({ recs = [] }: { recs?: CardProduct[] }) {
  const cart = useCart();
  const sums = cartSums(cart);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [clearing, setClearing] = useState(false);
  const undoTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  const offerUndo = (u: Undo) => {
    window.clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = window.setTimeout(() => setUndo(null), 5000);
  };
  const remove = (line: CartLine) => {
    const gone = removeLine(line.key);
    buzz(8);
    if (gone) offerUndo({ text: `Removed ${line.name}`, restore: () => restoreLine(gone.line, gone.at) });
  };
  const toWishlist = (line: CartLine) => {
    toggleSaved({ slug: line.slug, href: line.href, name: line.name, tone: line.tone, price: line.price });
    const gone = removeLine(line.key);
    buzz([6, 30, 10]);
    if (gone) offerUndo({ text: `Moved ${line.name} to your wishlist`, restore: () => restoreLine(gone.line, gone.at) });
  };
  const clearAll = () => {
    const before = cart;
    clearCart();
    setClearing(false);
    buzz(12);
    offerUndo({ text: "Cleared the jar", restore: () => before.forEach((l, i) => restoreLine(l, i)) });
  };

  const toast = undo && (
    <div className="cv-toast" role="status">
      <span>{undo.text}</span>
      <button
        type="button"
        onClick={() => {
          undo.restore();
          setUndo(null);
        }}
      >
        Undo
      </button>
    </div>
  );

  if (cart.length === 0) {
    return (
      <>
        <div className="cv-empty">
          <div className="cv-empty-jar">
            <JarArt pebbles={[]} />
          </div>
          <p className="cv-empty-title">The jar is empty.</p>
          <p className="cv-empty-sub">Anything you add drops in here.</p>
          <Link href="/shop" className="btn btn-primary">
            Go to the shop
          </Link>
          {toast}
        </div>
        <CartRecs products={recs} />
      </>
    );
  }

  return (
    <div className="cv">
      <div className="cv-main">
        {sums.saved > 0 && (
          <p className="cv-yay">
            Yay! You saved <b>{rs(sums.saved)}</b> on this order
          </p>
        )}

        <div className="cv-head">
          <p className="cv-count">
            {sums.count} item{sums.count === 1 ? "" : "s"} in the jar
          </p>
          {clearing ? (
            <p className="cv-confirm">
              Empty the jar?
              <button type="button" className="cv-link cv-link--danger" onClick={clearAll}>
                Yes, clear
              </button>
              <button type="button" className="cv-link" onClick={() => setClearing(false)}>
                Keep
              </button>
            </p>
          ) : (
            <button type="button" className="cv-link" onClick={() => setClearing(true)}>
              Clear all
            </button>
          )}
        </div>

        <div className="cv-panel">
          <ul className="cv-lines">
            {cart.map((line) => {
              const u = lineUnit(line);
              const meta = [line.variant !== "Standard" ? line.variant : null, line.unit].filter(Boolean).join(" · ");
              return (
                <li key={line.key} className="cv-line">
                  <Link href={line.href} className="cv-thumb" tabIndex={-1} aria-hidden="true">
                    <ProductArt name={line.name} tone={line.tone} />
                  </Link>
                  <div className="cv-info">
                    <Link href={line.href} className="cv-name">
                      {line.name}
                    </Link>
                    {meta && <p className="cv-meta">{meta}</p>}
                    <button type="button" className="cv-wish" onClick={() => toWishlist(line)}>
                      Move to wishlist
                    </button>
                  </div>
                  <div className="cv-side">
                    <div className="cv-step" role="group" aria-label={`${line.name} quantity`}>
                      <button
                        type="button"
                        aria-label={line.qty === 1 ? `Remove ${line.name}` : `One less ${line.name}`}
                        onClick={() => {
                          if (line.qty === 1) remove(line);
                          else {
                            buzz(5);
                            setQty(line.key, line.qty - 1);
                          }
                        }}
                      >
                        {line.qty === 1 ? <Bin /> : <span aria-hidden="true">&minus;</span>}
                      </button>
                      <span className="cv-qty" aria-live="polite">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`One more ${line.name}`}
                        onClick={() => {
                          buzz(5);
                          setQty(line.key, line.qty + 1);
                        }}
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </div>
                    <p className="cv-price" data-deal={u.mrp !== undefined}>
                      {u.mrp !== undefined && <s>{rs(u.mrp * line.qty)}</s>}
                      <span>{rs(u.price * line.qty)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="cv-forgot">
            Forgot something? <Link href="/shop">Add more items</Link>
          </p>
        </div>

        <CartRecs products={recs} />
      </div>

      <aside className="cv-sum" aria-label="Bill details">
        <h2 className="cv-sum-title">Bill details</h2>
        <dl>
          <div>
            <dt>Items total</dt>
            <dd>
              {sums.saved > 0 && <s>{rs(sums.full)}</s>} {rs(sums.total)}
            </dd>
          </div>
          {sums.saved > 0 && (
            <div className="cv-saved">
              <dt>Deals</dt>
              <dd>&minus;{rs(sums.saved)}</dd>
            </div>
          )}
          <div>
            <dt>Delivery</dt>
            <dd className="cv-muted">At checkout</dd>
          </div>
          <div className="cv-total">
            <dt>To pay</dt>
            <dd>{rs(sums.total)}</dd>
          </div>
        </dl>
        <Link href="/checkout" className="btn btn-primary cv-go">
          Checkout
        </Link>
      </aside>

      {/* phones: what to pay and checkout stay in reach */}
      <div className="cv-bar">
        <div className="cv-bar-sum">
          <span className="cv-bar-label">To pay</span>
          <span className="cv-bar-total">{rs(sums.total)}</span>
        </div>
        <Link href="/checkout" className="cv-bar-go">
          Checkout
        </Link>
      </div>
      {toast}
    </div>
  );
}

// The short list beside the checkout form.
export function CheckoutItems() {
  const cart = useCart();
  const sums = cartSums(cart);
  return (
    <aside className="rounded-xl border border-line bg-iron p-6">
      <h2 className="text-2xl">Your items</h2>
      {cart.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Nothing in the jar yet.{" "}
          <Link href="/shop" className="underline underline-offset-4">
            Go to the shop
          </Link>
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
              <span className="tabular-nums">{rs(lineUnit(line).price * line.qty)}</span>
            </li>
          ))}
        </ul>
      )}
      {sums.saved > 0 && (
        <div className="mt-4 flex justify-between text-sm" style={{ color: "var(--bb-green, #45c470)" }}>
          <span>Deals</span>
          <span className="tabular-nums">&minus;{rs(sums.saved)}</span>
        </div>
      )}
      <div className="mt-5 flex justify-between border-t border-line pt-4 text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{rs(sums.total)}</span>
      </div>
    </aside>
  );
}
