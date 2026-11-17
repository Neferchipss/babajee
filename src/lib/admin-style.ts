"use client";

import { useSyncExternalStore } from "react";

// The admin's design, picked by each person (Settings > Admin design), kept
// in this browser. Each is its own layout (frame, menu, page style), drawn
// by its own shell in components/admin/shells; every page works in all.
export type AdminStyle = "current" | "shopify" | "ease" | "studio";
export const ADMIN_STYLES: { id: AdminStyle; name: string; based: string; about: string; points: string[] }[] = [
  {
    id: "current",
    name: "Current",
    based: "As it is today",
    about: "The admin as it is: the shop's own header, the section tree down the left, in the shop's colours, light or dark.",
    points: ["Section tree with every page and its count", "Follows the shop's light and dark mode", "Nothing new to learn"],
  },
  {
    id: "shopify",
    name: "Shopify-style",
    based: "Based on Shopify's admin",
    about: "A dark bar across the top with search, a grey menu down the left that opens the section you're in, and the page in white cards on a soft grey background, centred.",
    points: ["Top bar with search and your account", "Left menu: sections, the open one shows its pages", "White cards, quiet grey page, dark main buttons", "Menu slides in from the side on a phone"],
  },
  {
    id: "ease",
    name: "Ease",
    based: "Built for ease of use",
    about: "Big, plain and task-first: large section tabs across the top, the open section's pages as big buttons, one column, large text, and on a phone a tab bar at the bottom like an app. The home starts with today's jobs.",
    points: ["Home opens on today's jobs: pack, ship, reply, restock", "Large tabs and buttons, large text, strong contrast", "One column, nothing crowded", "Bottom tab bar on a phone"],
  },
  {
    id: "studio",
    name: "Studio",
    based: "My pick: for people who work in it all day",
    about: "A slim icon rail, a panel with the section's pages, a breadcrumb bar, and a command search (Ctrl K) to jump to any page or find any order, product or customer by typing. Compact, fast, keyboard-first.",
    points: ["Ctrl K: jump anywhere by typing", "Icon rail + pages panel (folds away for more room)", "Breadcrumbs: always know where you are", "Compact tables, more on screen"],
  },
];
const KEY = "bj-adm-style";
const EVENT = "bj:adm-style";
const ok = (s: string | null): s is AdminStyle => ADMIN_STYLES.some((x) => x.id === s);

// ?look=<design> on an admin address shows that design without saving it
// (Settings > Admin design's "Preview")
function read(): AdminStyle {
  const asked = new URLSearchParams(window.location.search).get("look");
  if (ok(asked)) return asked;
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
