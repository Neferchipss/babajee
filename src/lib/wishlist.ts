"use client";

import { useSyncExternalStore } from "react";

// Saved for later (the heart on a product). It lives in this browser's
// localStorage, so every heart on the site updates the moment it changes, in
// this tab and in any other. When the customer is signed in it is also kept
// on their account (saved_products, migration 0033): the shop can see what
// people want, and the list follows them to other devices. Signing in merges
// the two; after that every heart is written to both.
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
    remote((sb, me) => sb.from("saved_products").delete().eq("profile_id", me).eq("product_slug", item.slug));
    return false;
  }
  write([item, ...list]);
  remote((sb, me) => sb.from("saved_products").upsert(row(me, item), { onConflict: "profile_id,product_slug", ignoreDuplicates: true }));
  return true;
}

export const unsave = (slug: string) => {
  write(read().filter((i) => i.slug !== slug));
  remote((sb, me) => sb.from("saved_products").delete().eq("profile_id", me).eq("product_slug", slug));
};

// ---------------------------------------------------------------- account

type Sb = NonNullable<ReturnType<typeof import("./supabase").getSupabase>>;
// the signed-in customer, set by linkSaved (from the auth provider)
let me: string | null = null;

const row = (profile: string, i: SavedItem) => ({
  profile_id: profile,
  product_slug: i.slug,
  item: { href: i.href, name: i.name, tone: i.tone, price: i.price ?? null, options: i.options ?? 0 },
});

// a write to the account, in the background: the heart has already changed
// here, and a failed write is retried by the next sign-in's merge
function remote(work: (sb: Sb, profile: string) => PromiseLike<unknown>) {
  const profile = me;
  if (!profile) return;
  import("./supabase")
    .then(({ getSupabase }) => {
      const sb = getSupabase();
      return sb ? work(sb, profile) : undefined;
    })
    .then(undefined, () => {});
}

// Signed in (or out). In: what the account has and this browser doesn't is
// added here, and what this browser has and the account doesn't is sent up.
export async function linkSaved(profile: string | null) {
  me = profile;
  if (!profile) return;
  try {
    const { getSupabase } = await import("./supabase");
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from("saved_products").select("product_slug, item, created_at").order("created_at", { ascending: false });
    if (error || me !== profile) return;
    const local = read();
    const have = new Set(local.map((i) => i.slug));
    const theirs = new Set((data ?? []).map((r) => r.product_slug as string));
    const fromAccount: SavedItem[] = (data ?? [])
      .filter((r) => !have.has(r.product_slug))
      .map((r) => {
        const it = (r.item ?? {}) as Partial<SavedItem> & { price?: number | null };
        return { slug: r.product_slug, href: it.href ?? "/shop", name: it.name ?? r.product_slug, tone: it.tone ?? "", price: it.price ?? undefined, options: it.options ?? 0 };
      });
    if (fromAccount.length) write([...local, ...fromAccount]);
    const up = local.filter((i) => !theirs.has(i.slug));
    if (up.length) await sb.from("saved_products").upsert(up.map((i) => row(profile, i)), { onConflict: "profile_id,product_slug", ignoreDuplicates: true });
  } catch {}
}
