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
type Shop = { store_name: string; legal_name: string; store_address: string; gstin: string; store_phone: string; store_email: string };
type Icon = "confirmed" | "shipped" | "refund" | "return" | "cancelled" | "new-order";

const env = (k: string) => Deno.env.get(k) ?? "";
const DB = `${env("SUPABASE_URL")}/rest/v1`;
const KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const dbHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const SITE = (env("SITE_URL") || "https://neferchipss.github.io/babajee").replace(/\/$/, "");
const ASSETS = (env("EMAIL_ASSETS_URL") || `${env("SUPABASE_URL")}/storage/v1/object/public/email`).replace(/\/$/, "");

// the site's dark theme
const C = { bg: "#000000", card: "#121213", surface: "#1b1b1c", line: "#272729", text: "#f2f3f5", muted: "#96979d", gold: "#d3ab70", red: "#ff6b6b", green: "#23a55a" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
const p = (html: string, color = C.text) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${color}">${html}</p>`;

async function db<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${DB}/${path}`, { ...init, headers: { ...dbHeaders, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

// the whole email: dark, phone-first, tables so every mail app lays it out
function page(o: { icon: Icon; title: string; body: string; button: { href: string; label: string }; shop: Shop; to: "customer" | "shop" }) {
  const s = o.shop;
  const name = s.legal_name || s.store_name || "Babajee";
  const contact = [s.store_email && `<a href="mailto:${esc(s.store_email)}" style="color:${C.gold};text-decoration:none">${esc(s.store_email)}</a>`, s.store_phone && esc(s.store_phone)].filter(Boolean).join(" · ");
  const help = contact ? `For help with your order, contact us at ${contact}.` : `For help with your order, use the contact options on our website.`;
  const footer =
    o.to === "customer"
      ? `This is an automated email about your order, sent because you shopped with Babajee. Please don't reply to it: replies aren't monitored. ${help}`
      : `Automated alert from your Babajee shop admin.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}" bgcolor="${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:${FONT}">
<tr><td align="center" style="padding:0 0 22px"><a href="${SITE}/"><img src="${ASSETS}/logo.png" width="200" alt="Babajee · The Smoke Shop" style="display:block;width:200px;height:auto;border:0;color:${C.gold};font-size:22px;font-weight:800"></a></td></tr>
<tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:18px;padding:28px 22px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:0 0 14px"><img src="${ASSETS}/${o.icon}.png" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:0"></td></tr>
<tr><td align="center" style="padding:0 0 18px"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;color:${C.text}">${esc(o.title)}</h1></td></tr>
<tr><td>${o.body}</td></tr>
<tr><td align="center" style="padding:22px 0 0"><a href="${o.button.href}" style="display:inline-block;background:${C.gold};color:#000000;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px">${esc(o.button.label)}</a></td></tr>
</table></td></tr>
<tr><td style="padding:22px 6px 0;font-size:12px;line-height:1.6;color:${C.muted}">
${p(footer, C.muted).replace("font-size:15px", "font-size:12px")}
<p style="margin:0 0 4px;font-size:12px;color:${C.muted}"><b style="color:${C.text}">${esc(name)}</b>${s.gstin ? ` · GSTIN ${esc(s.gstin)}` : ""}</p>
${s.store_address ? `<p style="margin:0 0 4px;font-size:12px;color:${C.muted}">${esc(s.store_address).replace(/\n/g, ", ")}</p>` : ""}
<p style="margin:10px 0 0;font-size:12px;color:${C.muted}">Products are sold only to adults 18 and over. © ${new Date().getFullYear()} ${esc(name)}. <a href="${SITE}/" style="color:${C.muted}">${esc(SITE.replace(/^https?:\/\//, ""))}</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function items(o: Order) {
  const row = (l: string, r: string, opts = "") => `<tr><td style="padding:8px 0;font-size:15px;color:${C.text};${opts}">${l}</td><td align="right" style="padding:8px 0 8px 12px;font-size:15px;color:${C.text};white-space:nowrap;${opts}">${r}</td></tr>`;
  const lines = o.order_items.map((i) => row(`${esc(i.product_name)}${i.variant_label ? `<br><span style="color:${C.muted};font-size:13px">${esc(i.variant_label)}</span>` : ""}<span style="color:${C.muted}"> × ${i.quantity}</span>`, inr(i.unit_price * i.quantity), `border-bottom:1px solid ${C.line}`)).join("");
  const extra = [
    row(`<span style="color:${C.muted}">Shipping</span>`, o.shipping > 0 ? inr(o.shipping) : "Free"),
    ...(o.gst_inclusive ? [] : [row(`<span style="color:${C.muted}">GST</span>`, inr(o.tax))]),
    row("<b>Total</b>", `<b>${inr(o.total)}</b>${o.gst_inclusive ? `<br><span style="color:${C.muted};font-size:12px">incl. GST</span>` : ""}`, `border-top:1px solid ${C.line}`),
  ].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface}" style="background:${C.surface};border-radius:12px"><tr><td style="padding:6px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${lines}${extra}</table></td></tr></table>`;
}

const ref = (o: Order) => p(`Order <b style="color:${C.gold}">${esc(o.order_number)}</b>`, C.muted);

function compose(e: Event, shop: Shop): { kind: string; subject: string; html: string } | null {
  const o = e.orders;
  const hi = p(`Hi ${esc(first(o.contact_name))},`);
  const view = { href: `${SITE}/orders/view/?id=${o.id}`, label: "View your order" };
  switch (e.status) {
    case "paid":
      return { kind: "confirmed", subject: `Order ${o.order_number} confirmed`, html: page({ icon: "confirmed", title: "Your order is confirmed", body: `${hi}${p("Thanks for shopping with us. We've received your payment and we're getting your order ready.")}${ref(o)}${items(o)}`, button: view, shop, to: "customer" }) };
    case "shipped": {
      const s = [...o.shipments].sort((a, b) => (b.shipped_at ?? "").localeCompare(a.shipped_at ?? ""))[0];
      const t = s ? trackLink(s.carrier, s.tracking_number) : null;
      const how = s?.tracking_number
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface}" style="background:${C.surface};border-radius:12px;margin:0 0 16px"><tr><td style="padding:14px 16px;font-size:14px;line-height:1.6;color:${C.muted}">Courier<br><b style="color:${C.text};font-size:15px">${esc(s.carrier || "Courier")}</b><br>Tracking number<br><b style="color:${C.text};font-size:15px;letter-spacing:.5px">${esc(s.tracking_number)}</b>${t && !t.direct ? `<br><span style="font-size:13px">Copy the number and paste it on ${esc(t.site)}'s tracking page.</span>` : ""}</td></tr></table>`
        : p(s?.carrier ? `It's been sent with ${esc(s.carrier)}. We'll share tracking details if the courier provides them.` : "We'll share tracking details as soon as the courier provides them.");
      const button = t ? { href: t.url, label: `Track on ${t.site}` } : view;
      return { kind: "shipped", subject: `Order ${o.order_number} is on its way`, html: page({ icon: "shipped", title: "Your order is on its way", body: `${hi}${p("Good news: your order has left our shop and is with the courier.")}${how}${ref(o)}${items(o)}`, button, shop, to: "customer" }) };
    }
    case "refund":
    case "return": {
      const r = [...o.order_refunds].filter((x) => x.created_at <= e.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? [...o.order_refunds].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!r) return null;
      const cn = o.credit_notes.find((n) => n.refund_id === r.id);
      const ret = e.status === "return";
      const box = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface}" style="background:${C.surface};border-radius:12px;margin:0 0 16px"><tr><td align="center" style="padding:18px 16px"><span style="font-size:13px;color:${C.muted}">Amount refunded</span><br><span style="font-size:28px;font-weight:800;color:${C.gold}">${inr(r.amount)}</span>${cn ? `<br><span style="font-size:13px;color:${C.muted}">Credit note ${esc(cn.number)}</span>` : ""}</td></tr></table>`;
      const body = `${hi}${p(ret ? "We've received your return and refunded you." : "We've issued a refund on your order.")}${box}${r.reason ? p(`Reason: ${esc(r.reason)}`, C.muted) : ""}${p("It usually shows in your account within 5–7 working days, depending on your bank or payment method.")}${ref(o)}`;
      return { kind: "refund", subject: `Refund of ${inr(r.amount)} on order ${o.order_number}`, html: page({ icon: ret ? "return" : "refund", title: ret ? "Your return is refunded" : "Your refund is on its way", body, button: view, shop, to: "customer" }) };
    }
    case "cancelled":
      return { kind: "cancelled", subject: `Order ${o.order_number} cancelled`, html: page({ icon: "cancelled", title: "Your order was cancelled", body: `${hi}${p(`Your order has been cancelled.${e.note ? ` ${esc(e.note)}` : ""}`)}${p("If you'd already paid, your refund follows separately and we'll email you when it's issued.", C.muted)}${ref(o)}${items(o)}`, button: view, shop, to: "customer" }) };
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
  const shop = (await db<Shop[]>(`store_settings?id=eq.1&select=store_name,legal_name,store_address,gstin,store_phone,store_email`))[0] ?? { store_name: "Babajee", legal_name: "", store_address: "", gstin: "", store_phone: "", store_email: "" };
  const mail = compose(e, shop);
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
    // the shop hears about each new paid order
    const alertTo = env("SHOP_ALERT_TO") || shop.store_email;
    if (e.status === "paid" && alertTo) {
      const o = e.orders;
      const html = page({ icon: "new-order", title: `New order from ${o.contact_name}`, body: `${p(`${esc(o.contact_name)} · <a href="mailto:${esc(o.contact_email)}" style="color:${C.gold}">${esc(o.contact_email)}</a>`, C.muted)}${ref(o)}${items(o)}`, button: { href: `${SITE}/admin/orders/view/?id=${o.id}`, label: "Open in admin" }, shop, to: "shop" });
      await send(alertTo, `New order ${o.order_number} · ${inr(o.total)}`, html, "").catch(() => {});
    }
    return new Response("sent", { status: 200 });
  } catch (err) {
    await fetch(`${DB}/email_log?id=eq.${claimed[0].id}`, { method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ error: String(err).slice(0, 500) }) }).catch(() => {});
    return new Response("send failed", { status: 502 });
  }
});
