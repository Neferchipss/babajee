"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";

// The admin's design, picked by each person (Admin theme), kept in this
// browser: Aronium-style (the default, for anyone who hasn't picked) or
// Legacy (id "current", the admin as it was).
// Shopify-style, Ease and Studio were removed on 24 Nov 2026; a saved pick of
// one of them now falls back to Legacy. Each is its own layout (frame, menu, page style), drawn
// by its own shell in components/admin/shells; every page works in all.
export type AdminStyle = "current" | "aronium";
export const ADMIN_STYLES: { id: AdminStyle; name: string; based: string; about: string; points: string[] }[] = [
  {
    id: "aronium",
    name: "Aronium-style",
    based: "Based on Aronium's back office · the default",
    about: "Charcoal and square, like a counter till's back office: a title bar reading Management • page, one flat menu down the left with the open section in solid blue, the section's pages as tabs, and dense grid tables with a blue line under the headers.",
    points: ["Flat menu: every section one click away", "Section pages as tabs across the top", "Dense grid tables, square buttons and fields", "Dark charcoal with one blue accent"],
  },
  {
    id: "current",
    name: "Legacy",
    based: "The admin as it was",
    about: "The admin as it is: the shop's own header, the section tree down the left, in the shop's colours, light or dark.",
    points: ["Section tree with every page and its count", "Follows the shop's light and dark mode", "Nothing new to learn"],
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
    return ok(s) ? s : "aronium";
  } catch {
    return "aronium";
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
  return useSyncExternalStore(subscribe, read, () => "aronium");
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
