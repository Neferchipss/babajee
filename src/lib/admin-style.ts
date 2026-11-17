"use client";

import { useSyncExternalStore } from "react";

// The admin's look, picked by each person for themselves (kept in this
// browser): the shop's current look, or one of four others. Only colours,
// sizes and spacing change; every page and button stays where it is.
export type AdminStyle = "current" | "market" | "ease" | "ledger" | "bazaar";
export const ADMIN_STYLES: { id: AdminStyle; name: string; about: string }[] = [
  { id: "current", name: "Current", about: "The admin as it is, in the shop's own colours, light or dark." },
  { id: "market", name: "Market", about: "Like the big online-shop dashboards: soft grey page, white cards, dark buttons, a quiet green for good news." },
  { id: "ease", name: "Ease", about: "Bigger text and buttons, more space, strong contrast: easy on the eyes and on a phone." },
  { id: "ledger", name: "Ledger", about: "Compact and crisp for long sessions with numbers: more rows on screen, tidy lines, tabular figures." },
  { id: "bazaar", name: "Bazaar", about: "Babajee red, turmeric and leaf green on warm cream: the shop's own colours, cosy for the counter." },
];
const KEY = "bj-adm-style";
const EVENT = "bj:adm-style";
const ok = (s: string | null): s is AdminStyle => ADMIN_STYLES.some((x) => x.id === s);

function read(): AdminStyle {
  try {
    const s = localStorage.getItem(KEY);
    return ok(s) ? s : "current";
  } catch {
    return "current";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useAdminStyle(): AdminStyle {
  return useSyncExternalStore(subscribe, read, () => "current");
}

export function setAdminStyle(s: AdminStyle) {
  try {
    localStorage.setItem(KEY, s);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
