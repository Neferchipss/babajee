"use client";

import { useSyncExternalStore } from "react";

// Saved for later (the heart on a product). Like the cart, it lives in this
// browser's localStorage until there are accounts, and every heart on the
// site updates the moment it changes, in this tab and in any other.
export type SavedItem = {
  slug: string;
  href: string;
  name: string;
  tone: string;
  price?: number;
  // how many more options than one (0: it can go straight in the jar)
  options?: number;
};

const KEY = "bj-saved";
const EVENT = "bb:saved";
const EMPTY: SavedItem[] = [];

let raw: string | null = null;
let items: SavedItem[] = EMPTY;

function read(): SavedItem[] {
  let now: string | null = null;
  try {
    now = localStorage.getItem(KEY);
  } catch {}
  if (now === raw) return items;
  raw = now;
  try {
    const parsed = JSON.parse(now ?? "[]");
    items = Array.isArray(parsed) ? (parsed as SavedItem[]) : EMPTY;
  } catch {
    items = EMPTY;
  }
  return items;
}

function write(next: SavedItem[]) {
  items = next;
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

export function useSaved() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function useIsSaved(slug: string) {
  return useSyncExternalStore(
    subscribe,
    () => read().some((i) => i.slug === slug),
    () => false,
  );
}

// returns whether it is saved now
export function toggleSaved(item: SavedItem): boolean {
  const list = read();
  if (list.some((i) => i.slug === item.slug)) {
    write(list.filter((i) => i.slug !== item.slug));
    return false;
  }
  write([item, ...list]);
  return true;
}

export const unsave = (slug: string) => write(read().filter((i) => i.slug !== slug));
