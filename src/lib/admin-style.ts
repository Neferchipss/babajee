"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";

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
    based: "For people who work in it all day",
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

function keep(s: AdminStyle) {
  try {
    localStorage.setItem(KEY, s);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// a person's pick: kept on their account (profiles.admin_design, 0077) so it
// follows them to any device, and in this browser so the admin opens in it
// at once
export function setAdminStyle(s: AdminStyle) {
  keep(s);
  const sb = getSupabase();
  if (!sb) return;
  void sb.auth.getUser().then(({ data }) => {
    if (data.user) void sb.from("profiles").update({ admin_design: s }).eq("id", data.user.id);
  });
}

// on opening the admin: the account's pick, when it differs from this browser's
export function useAccountAdminStyle(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    if (!sb) return;
    let live = true;
    void sb
      .from("profiles")
      .select("admin_design")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        const d = !error ? (data?.admin_design as string | null) : null;
        if (live && ok(d) && d !== read()) keep(d);
      });
    return () => {
      live = false;
    };
  }, [userId]);
}
