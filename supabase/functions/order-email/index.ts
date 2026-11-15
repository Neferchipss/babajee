// order-email: one email per order event, sent through Resend (0052).
//
// The database calls this with { event_id } after an order event is saved
// (paid, shipped, refund/return, cancelled). Everything else is read here
// with the service role, so a caller can't choose what is sent or to whom;
// email_log's unique event_id stops repeats, and only events from the last
// 15 minutes are sent.
//
// Secrets (Supabase dashboard › Edge Functions › Secrets):
//   RESEND_API_KEY   the Resend API key (required)
//   EMAIL_FROM       e.g. "Babajee <orders@babajee.in>"; until the domain is
//                    verified, leave unset: "Babajee <onboarding@resend.dev>"
//   EMAIL_TEST_TO    while set, every email goes to this address instead
//                    (subject marked [Test → customer]), and test orders send
//   SHOP_ALERT_TO    who gets "New order" alerts (default: Settings' shop email)
//   SITE_URL         the shop's address for links (default the GitHub Pages one)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { trackLink } from "../../../src/lib/tracking.ts";

type Item = { product_name: string; variant_label: string; quantity: number; unit_price: number };
type Shipment = { carrier: string | null; tracking_number: string | null; shipped_at: string | null };
type Refund = { id: string; amount: number; reason: string; created_at: string };
type Note = { number: string; refund_id: string | null };
type Order = {
  id: string;
  order_number: string;
  status: string;
  is_test: boolean;
  contact_name: string;
  contact_email: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  gst_inclusive: boolean;
  order_items: Item[];
  shipments: Shipment[];
  order_refunds: Refund[];
  credit_notes: Note[];
};
type Event = { id: string; status: string; note: string; created_at: string; orders: Order };

const env = (k: string) => Deno.env.get(k) ?? "";
const DB = `${env("SUPABASE_URL")}/rest/v1`;
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const dbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const SITE = (env("SITE_URL") || "https://neferchipss.github.io/babajee").replace(/\/$/, "");

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (name: string) => (name || "there").trim().split(/\s+/)[0];

async function db<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${DB}/${path}`, { ...init, headers: { ...dbHeaders, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

// the email itself: phone-first, plain, readable without images
function page(title: string, body: string, o: Order) {
  const link = `${SITE}/orders/view/?id=${o.id}`;
  return `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#151515">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:800;font-size:20px;letter-spacing:.5px;margin-bottom:16px">BABAJEE</div>
<div style="background:#fff;border-radius:14px;padding:22px 20px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${body}
<p style="margin:22px 0 0"><a href="${link}" style="display:inline-block;background:#151515;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">View order ${esc(o.order_number)}</a></p>
</div>
<p style="font-size:12px;color:#6b6b6b;margin:14px 4px">You're getting this because you ordered from Babajee. Reply to this email if anything looks wrong.</p>
</div></body></html>`;
}

function items(o: Order) {
  const rows = o.order_items
    .map((i) => `<tr><td style="padding:6px 0">${esc(i.product_name)}${i.variant_label ? ` <span style="color:#6b6b6b">· ${esc(i.variant_label)}</span>` : ""} × ${i.quantity}</td><td style="padding:6px 0;text-align:right;white-space:nowrap">${inr(i.unit_price * i.quantity)}</td></tr>`)
    .join("");
  const extra = [
    `<tr><td style="padding:6px 0;color:#6b6b6b">Shipping</td><td style="padding:6px 0;text-align:right">${o.shipping > 0 ? inr(o.shipping) : "Free"}</td></tr>`,
    ...(o.gst_inclusive ? [] : [`<tr><td style="padding:6px 0;color:#6b6b6b">GST</td><td style="padding:6px 0;text-align:right">${inr(o.tax)}</td></tr>`]),
    `<tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #e6e3dd">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:700;border-top:1px solid #e6e3dd">${inr(o.total)}</td></tr>`,
  ].join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:15px">${rows}${extra}</table>`;
}

function compose(e: Event): { kind: string; subject: string; html: string } | null {
  const o = e.orders;
  const hi = `<p style="margin:0 0 14px">Hi ${esc(first(o.contact_name))},</p>`;
  switch (e.status) {
    case "paid":
      return { kind: "confirmed", subject: `Order ${o.order_number} confirmed`, html: page("Thanks, your order is confirmed", `${hi}<p style="margin:0 0 16px">We've got your payment and we're getting it ready.</p>${items(o)}`, o) };
    case "shipped": {
      const s = [...o.shipments].sort((a, b) => (b.shipped_at ?? "").localeCompare(a.shipped_at ?? ""))[0];
      const t = s ? trackLink(s.carrier, s.tracking_number) : null;
      const how = s?.tracking_number
        ? `<p style="margin:0 0 6px">${esc(s.carrier || "Courier")}, tracking number <b>${esc(s.tracking_number)}</b></p>${t ? `<p style="margin:0 0 16px"><a href="${t.url}">${t.direct ? "Track it" : "Track it"} on ${esc(t.site)}</a>${t.direct ? "" : " (paste the number there)"}</p>` : ""}`
        : `<p style="margin:0 0 16px">${s?.carrier ? `Sent with ${esc(s.carrier)}.` : ""}</p>`;
      return { kind: "shipped", subject: `Order ${o.order_number} is on its way`, html: page("Your order is on its way", `${hi}${how}${items(o)}`, o) };
    }
    case "refund":
    case "return": {
      // the newest refund up to this event
      const r = [...o.order_refunds].filter((x) => x.created_at <= e.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? [...o.order_refunds].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!r) return null;
      const cn = o.credit_notes.find((n) => n.refund_id === r.id);
      const body = `${hi}<p style="margin:0 0 10px">We've refunded <b>${inr(r.amount)}</b>${e.status === "return" ? " for your return" : ""} on order ${esc(o.order_number)}.</p>${r.reason ? `<p style="margin:0 0 10px;color:#6b6b6b">${esc(r.reason)}</p>` : ""}${cn ? `<p style="margin:0 0 10px">Credit note: <b>${esc(cn.number)}</b></p>` : ""}<p style="margin:0">It usually shows in your account within 5–7 working days, depending on your bank.</p>`;
      return { kind: "refund", subject: `Refund of ${inr(r.amount)} on order ${o.order_number}`, html: page("Your refund is on its way", body, o) };
    }
    case "cancelled":
      return { kind: "cancelled", subject: `Order ${o.order_number} cancelled`, html: page("Your order was cancelled", `${hi}<p style="margin:0 0 16px">Order ${esc(o.order_number)} has been cancelled.${e.note ? ` ${esc(e.note)}` : ""} If you paid for it, the refund follows separately.</p>${items(o)}`, o) };
  }
  return null;
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

  const rows = await db<Event[]>(`order_events?id=eq.${eventId}&select=id,status,note,created_at,orders(*,order_items(product_name,variant_label,quantity,unit_price),shipments(carrier,tracking_number,shipped_at),order_refunds(id,amount,reason,created_at),credit_notes(number,refund_id))`);
  const e = rows[0];
  if (!e?.orders) return new Response("no such event", { status: 404 });
  if (Date.now() - new Date(e.created_at).getTime() > 15 * 60 * 1000) return new Response("too old", { status: 200 });
  const testing = !!env("EMAIL_TEST_TO");
  if (e.orders.is_test && !testing) return new Response("test order", { status: 200 });
  const mail = compose(e);
  if (!mail || !e.orders.contact_email) return new Response("nothing to send", { status: 200 });

  // claim the event first: a second call finds it taken
  const claimed = await db<{ id: string }[]>(`email_log?on_conflict=event_id`, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ event_id: e.id, order_id: e.orders.id, kind: mail.kind, to_address: e.orders.contact_email }),
  });
  if (!claimed.length) return new Response("already sent", { status: 200 });

  const shop = (await db<{ store_email: string }[]>(`store_settings?id=eq.1&select=store_email`))[0]?.store_email ?? "";
  try {
    const id = await send(e.orders.contact_email, mail.subject, mail.html, shop);
    await db(`email_log?id=eq.${claimed[0].id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ resend_id: id }) }).catch(() => {});
    // the shop hears about each new paid order
    const alertTo = env("SHOP_ALERT_TO") || shop;
    if (e.status === "paid" && alertTo) {
      const o = e.orders;
      await send(alertTo, `New order ${o.order_number} · ${inr(o.total)}`, page(`New order from ${o.contact_name}`, `<p style="margin:0 0 16px">${esc(o.contact_name)} · ${esc(o.contact_email)}</p>${items(o)}`, o).replace(`${SITE}/orders/view/?id=`, `${SITE}/admin/orders/view/?id=`), "").catch(() => {});
    }
    return new Response("sent", { status: 200 });
  } catch (err) {
    await fetch(`${DB}/email_log?id=eq.${claimed[0].id}`, { method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ error: String(err).slice(0, 500) }) }).catch(() => {});
    return new Response("send failed", { status: 502 });
  }
});
