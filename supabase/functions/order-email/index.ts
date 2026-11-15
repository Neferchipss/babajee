// order-email: one email per order event, sent through Resend (0052).
//
// The database calls this with { event_id } after an order event is saved
// (paid, shipped, refund/return, cancelled). Everything else is read here
// with the service role, so a caller can't choose what is sent or to whom;
// email_log's unique event_id stops repeats, and only events from the last
// 15 minutes are sent.
//
// Secrets (Supabase dashboard › Edge Functions › Secrets):
//   RESEND_API_KEY    the Resend API key (required)
//   EMAIL_FROM        e.g. "Babajee <orders@babajee.in>"; until the domain is
//                     verified, leave unset: "Babajee <onboarding@resend.dev>"
//   EMAIL_TEST_TO     while set, every email goes to this address instead
//                     (subject marked [Test → customer]), and test orders send
//   SHOP_ALERT_TO     who gets "New order" alerts (default: Settings' shop email)
//   SITE_URL          the shop's address for links (default the GitHub Pages one)
//   EMAIL_ASSETS_URL  where logo.png and the icons live (default: the public
//                     "email" storage bucket; files in brand/email/)
//   SHOP_INSTAGRAM    the shop's Instagram link, shown in the footer if set
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { photoOf } from "./photos.ts";
import { alertMail, compose, type Event, type Shop } from "./template.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const DB = `${env("SUPABASE_URL")}/rest/v1`;
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const dbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const cfg = {
  site: (env("SITE_URL") || "https://neferchipss.github.io/babajee").replace(/\/$/, ""),
  assets: (env("EMAIL_ASSETS_URL") || `${env("SUPABASE_URL")}/storage/v1/object/public/email`).replace(/\/$/, ""),
  instagram: env("SHOP_INSTAGRAM"),
  photo: photoOf,
};

async function db<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${DB}/${path}`, { ...init, headers: { ...dbHeaders, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

async function send(to: string, subject: string, html: string, replyTo: string) {
  const test = env("EMAIL_TEST_TO");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_FROM") || "Babajee <onboarding@resend.dev>",
      to: [test || to],
      subject: test ? `[Test → ${to}] ${subject}` : subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Resend ${r.status}: ${JSON.stringify(j)}`);
  return (j as { id?: string }).id ?? "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let eventId = "";
  try {
    eventId = String(((await req.json()) as { event_id?: string }).event_id ?? "");
  } catch {
    /* fall through */
  }
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return new Response("event_id needed", { status: 400 });

  const rows = await db<Event[]>(`order_events?id=eq.${eventId}&select=id,status,note,created_at,actor:profiles(role),orders(*,order_items(product_name,variant_label,quantity,unit_price,product_variants(products(slug))),shipments(carrier,tracking_number,shipped_at),order_refunds(id,amount,reason,created_at),credit_notes(number,refund_id))`);
  const e = rows[0];
  if (!e?.orders) return new Response("no such event", { status: 404 });
  if (Date.now() - new Date(e.created_at).getTime() > 15 * 60 * 1000) return new Response("too old", { status: 200 });
  const testing = !!env("EMAIL_TEST_TO");
  if (e.orders.is_test && !testing) return new Response("test order", { status: 200 });
  const shop = (await db<Shop[]>(`store_settings?id=eq.1&select=store_name,legal_name,store_address,gstin,store_phone,store_email,return_days,unpaid_hours`))[0] ?? { store_name: "Babajee", legal_name: "", store_address: "", gstin: "", store_phone: "", store_email: "" };
  const mail = compose(e, shop, cfg);
  if (!mail || !e.orders.contact_email) return new Response("nothing to send", { status: 200 });

  // claim the event first: a second call finds it taken
  const claimed = await db<{ id: string }[]>(`email_log?on_conflict=event_id`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ event_id: e.id, order_id: e.orders.id, kind: mail.kind, to_address: e.orders.contact_email }),
  });
  if (!claimed.length) return new Response("already sent", { status: 200 });

  try {
    const id = await send(e.orders.contact_email, mail.subject, mail.html, shop.store_email);
    await db(`email_log?id=eq.${claimed[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ resend_id: id }) }).catch(() => {});
    // the shop hears about each new order as it's placed (payment is arranged by
    // hand), unless the shop placed it itself
    const alertTo = env("SHOP_ALERT_TO") || shop.store_email;
    const byShop = (e as Event & { actor?: { role?: string } | null }).actor?.role === "admin";
    if (e.status === "pending" && !byShop && alertTo) {
      const a = alertMail(e.orders, shop, cfg);
      await send(alertTo, a.subject, a.html, "").catch(() => {});
    }
    return new Response("sent", { status: 200 });
  } catch (err) {
    await fetch(`${DB}/email_log?id=eq.${claimed[0].id}`, { method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ error: String(err).slice(0, 500) }) }).catch(() => {});
    return new Response("send failed", { status: 502 });
  }
});
