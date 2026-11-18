"use client";

// Visit counting for the admin's Analytics page, and each signed-in
// customer's activity on their admin page. Each visit gets a random id kept
// for the browser tab's session (no IP, no cookies); a page view, an add to
// cart and reaching checkout are each one row in public.site_events, plus
// one row per product opened and per add to cart, with the product's name.
// For a signed-in customer the database ties the visit to their account
// (migration 0036; the privacy policy says so). Admin pages, developer
// machines and staff are never counted: the database drops an admin's rows
// (0048), and a device an admin has signed in on stays uncounted even signed
// out (markStaffDevice). An order placed during a visit carries its id (0048).
// Since 0049: a visitor id kept in this browser across visits (to count who
// comes back and how many visits an order takes), the utm_ tags of the link
// that started the visit, searches with how many products matched, and the
// checkout steps.
import { loadSupabase } from "./sb";

const SESSION_KEY = "bj-visit";
const REF_KEY = "bj-visit-ref";
const SENT_KEY = "bj-visit-sent";
const STAFF_KEY = "bj-staff";
const VISITOR_KEY = "bj-visitor";
const CAMPAIGN_KEY = "bj-visit-campaign";

// a random id for this browser, kept across visits (empty when storage is blocked)
function visitor(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

// "source/medium/campaign" from the utm_ tags on the link that opened the
// visit; a Google Ads click (gclid) without tags counts as google/cpc
function campaignOf(search: string): string {
  const q = new URLSearchParams(search);
  const part = (k: string) => (q.get(k) ?? "").trim().toLowerCase().replace(/\//g, "-").slice(0, 50);
  const src = part("utm_source");
  if (src) return [src, part("utm_medium"), part("utm_campaign")].join("/").replace(/\/+$/, "");
  return q.has("gclid") ? "google/cpc" : "";
}

// called when an admin is signed in on this browser
export function markStaffDevice() {
  try {
    localStorage.setItem(STAFF_KEY, "1");
  } catch {}
}

function staffDevice() {
  try {
    return localStorage.getItem(STAFF_KEY) === "1";
  } catch {
    return false;
  }
}

// this visit's id, for tying an order to the visit (empty when not counted)
export function visitId(): string {
  if (!counted(location.pathname)) return "";
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

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
      sessionStorage.setItem(CAMPAIGN_KEY, campaignOf(location.search));
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
  return process.env.NODE_ENV === "production" && !/\/admin(\/|$)/.test(path) && !staffDevice();
}

// cart and checkout: once per visit, for the funnel. product and add: every
// time, with the product's name, for the customer's activity.
// search: label = what was typed, value = products that matched.
// step: label = a checkout step ("submit", "blocked: …", "error: …").
type VisitKind = "view" | "cart" | "checkout" | "product" | "add" | "search" | "step";

export function track(kind: VisitKind, path = location.pathname, label = "", value?: number) {
  if (!counted(path)) return;
  const id = session();
  if (!id) return;
  // cart and checkout count once per visit
  if (kind === "cart" || kind === "checkout") {
    try {
      const sent = sessionStorage.getItem(SENT_KEY) ?? "";
      if (sent.includes(kind)) return;
      sessionStorage.setItem(SENT_KEY, `${sent},${kind}`);
    } catch {}
  }
  let ref = "";
  let campaign = "";
  try {
    ref = sessionStorage.getItem(REF_KEY) ?? "";
    campaign = sessionStorage.getItem(CAMPAIGN_KEY) ?? "";
  } catch {}
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const clean = (base && path.startsWith(base) ? path.slice(base.length) : path).replace(/\/$/, "").replace(/\/\?/, "?") || "/";
  const args = { p_session: id, p_kind: kind, p_path: clean, p_referrer: ref, p_device: device(), p_label: label, p_visitor: visitor(), p_campaign: campaign, p_value: value ?? null };
  void loadSupabase().then((sb) => sb?.rpc("track_event", args).then(() => {}));
}
