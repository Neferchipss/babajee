"use client";

import { useSyncExternalStore } from "react";
import { unitPrice } from "./deal";

// The cart (Baba's jar). It lives in this browser's localStorage until there
// is an account to keep it on; every jar, count and cart page on the site
// reads it through useCart and updates the moment it changes, in this tab
// and in any other.
export type CartLine = {
  key: string; // product + option
  slug: string;
  href: string;
  name: string;
  tone: string;
  variant: string;
  price?: number;
  // how it is packed, e.g. "Box of 50"
  unit?: string;
  qty: number;
};
export type CartItem = Omit<CartLine, "key" | "qty">;

const KEY = "bj-cart";
const EVENT = "bb:cart";
// fired once a product has visibly dropped into a jar, so the jar can react
export const LANDED_EVENT = "bb:cart-landed";
const EMPTY: CartLine[] = [];

let raw: string | null = null;
let lines: CartLine[] = EMPTY;

function read(): CartLine[] {
  let now: string | null = null;
  try {
    now = localStorage.getItem(KEY);
  } catch {}
  if (now === raw) return lines;
  raw = now;
  try {
    const parsed = JSON.parse(now ?? "[]");
    lines = Array.isArray(parsed) ? (parsed as CartLine[]) : EMPTY;
  } catch {
    lines = EMPTY;
  }
  return lines;
}

function write(next: CartLine[]) {
  lines = next;
  raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const cartCount = (cart: CartLine[]) => cart.reduce((n, l) => n + l.qty, 0);

// one line's unit price for display (stand-ins until real prices arrive)
export const lineUnit = (l: CartLine) => unitPrice(l.slug, l.price);

// what the jar adds up to: the total to pay, what it would have cost at the
// struck-through prices, and the difference
export function cartSums(cart: CartLine[]) {
  let total = 0;
  let full = 0;
  for (const l of cart) {
    const u = lineUnit(l);
    total += u.price * l.qty;
    full += (u.mrp ?? u.price) * l.qty;
  }
  return { count: cartCount(cart), total, full, saved: full - total };
}
export const cartTotal = (cart: CartLine[]) => cartSums(cart).total;

export function addToCart(item: CartItem, qty = 1) {
  const key = `${item.slug}::${item.variant}`;
  const cart = read();
  const at = cart.findIndex((l) => l.key === key);
  if (at >= 0) write(cart.map((l, i) => (i === at ? { ...l, ...item, qty: l.qty + qty } : l)));
  else write([...cart, { ...item, key, qty }]);
}

export function setQty(key: string, qty: number) {
  const cart = read();
  write(qty <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, qty } : l)));
}

// removes a line and hands it back with where it was, for an undo
export function removeLine(key: string): { line: CartLine; at: number } | null {
  const cart = read();
  const at = cart.findIndex((l) => l.key === key);
  if (at < 0) return null;
  write(cart.filter((l) => l.key !== key));
  return { line: cart[at], at };
}

// puts a removed line back where it was (merging if it was added again since)
export function restoreLine(line: CartLine, at: number) {
  const cart = read();
  const there = cart.findIndex((l) => l.key === line.key);
  if (there >= 0) write(cart.map((l, i) => (i === there ? { ...l, qty: l.qty + line.qty } : l)));
  else write([...cart.slice(0, at), line, ...cart.slice(at)]);
}
export const clearCart = () => write([]);

// Throws a copy of `from` (usually the product picture) into whichever jar
// is on screen, then tells the jar it landed. Without a visible jar, or with
// reduced motion, it only tells the jar.
export function tossIntoJar(from: Element | null) {
  const land = () => window.dispatchEvent(new Event(LANDED_EVENT));
  // the jar on the product sheet first, then the cart button in the bar
  const rank = (j: HTMLElement) => ["sheet", "header"].indexOf(j.dataset.jar ?? "");
  const jars = [...document.querySelectorAll<HTMLElement>("[data-jar]")].sort((x, y) => rank(x) - rank(y));
  const jar = jars.find((j) => {
    const r = j.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(j).visibility !== "hidden";
  });
  if (!from || !jar || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    land();
    return;
  }
  const a = from.getBoundingClientRect();
  const b = jar.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: "0",
    zIndex: "60",
    pointerEvents: "none",
    borderRadius: "16px",
    overflow: "hidden",
  });
  // inside the sheet when it came from there, so its picture keeps its look
  (from.closest(".ps") ?? document.getElementById("site") ?? document.body).appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height * 0.45 - (a.top + a.height / 2);
  const s = Math.max(0.06, (b.width * 0.45) / a.width);
  // an arc: up a little first, then down into the mouth of the jar
  const lift = Math.min(90, Math.abs(dy) * 0.4 + 40);
  const fly = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${(1 + s) / 2.4}) rotate(-12deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(8deg)`, opacity: 0.6 },
    ],
    { duration: 620, easing: "cubic-bezier(0.45, 0, 0.6, 1)" },
  );
  fly.onfinish = fly.oncancel = () => {
    ghost.remove();
    land();
  };
}
