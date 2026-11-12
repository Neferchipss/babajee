"use client";

// Visit counting for the admin's Analytics page, and each signed-in
// customer's activity on their admin page. Each visit gets a random id kept
// for the browser tab's session (no IP, no cookies); a page view, an add to
// cart and reaching checkout are each one row in public.site_events, plus
// one row per product opened and per add to cart, with the product's name.
// For a signed-in customer the database ties the visit to their account
// (migration 0036; the privacy policy says so). Admin pages and developer
// machines are never counted.
import { getSupabase } from "./supabase";

const SESSION_KEY = "bj-visit";
const REF_KEY = "bj-visit-ref";
const SENT_KEY = "bj-visit-sent";

function session(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
      // where the visit came from: another site's name, or nothing for direct
      let ref = "";
      try {
        const r = document.referrer ? new URL(document.referrer) : null;
        if (r && r.host !== location.host) ref = r.host.replace(/^www\./, "").replace(/^l\.|^lm\.|^m\./, "");
      } catch {}
      sessionStorage.setItem(REF_KEY, ref);
    }
    return id;
  } catch {
    return "";
  }
}

function device(): string {
  const touch = matchMedia("(pointer: coarse)").matches;
  const w = Math.min(screen.width, screen.height);
  if (!touch) return "desktop";
  return w >= 700 ? "tablet" : "mobile";
}

function counted(path: string) {
  return process.env.NODE_ENV === "production" && !/\/admin(\/|$)/.test(path);
}

// cart and checkout: once per visit, for the funnel. product and add: every
// time, with the product's name, for the customer's activity.
export type VisitKind = "view" | "cart" | "checkout" | "product" | "add";

export function track(kind: VisitKind, path = location.pathname, label = "") {
  if (!counted(path)) return;
  const sb = getSupabase();
  const id = session();
  if (!sb || !id) return;
  // cart and checkout count once per visit
  if (kind === "cart" || kind === "checkout") {
    try {
      const sent = sessionStorage.getItem(SENT_KEY) ?? "";
      if (sent.includes(kind)) return;
      sessionStorage.setItem(SENT_KEY, `${sent},${kind}`);
    } catch {}
  }
  let ref = "";
  try {
    ref = sessionStorage.getItem(REF_KEY) ?? "";
  } catch {}
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const clean = (base && path.startsWith(base) ? path.slice(base.length) : path).replace(/\/$/, "").replace(/\/\?/, "?") || "/";
  void sb.rpc("track_event", { p_session: id, p_kind: kind, p_path: clean, p_referrer: ref, p_device: device(), p_label: label }).then(() => {});
}
