"use client";

import { useSyncExternalStore } from "react";
import { addToCart, type CartLine } from "./cart";

// Saved for later: lines taken out of the cart to buy another time, kept in
// this browser beside the cart (the cart's own pattern, lib/cart.ts). Moving
// one back puts it in the cart with its quantity. Unlike the wishlist (an
// account's list of products), this keeps the exact option and quantity.
const KEY = "bj-later";
const EVENT = "bb:later";
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

export function useLater() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

// a line put aside (the same option again adds to it)
export function saveForLater(line: CartLine) {
  const now = read();
  const at = now.findIndex((l) => l.key === line.key);
  write(at < 0 ? [line, ...now] : now.map((l, i) => (i === at ? { ...l, qty: l.qty + line.qty } : l)));
}

// back into the cart, with its quantity
export function moveToCart(key: string) {
  const line = read().find((l) => l.key === key);
  if (!line) return;
  const { key: _k, qty, ...item } = line;
  void _k;
  addToCart(item, qty);
  write(read().filter((l) => l.key !== key));
}

export function dropLater(key: string) {
  write(read().filter((l) => l.key !== key));
}
