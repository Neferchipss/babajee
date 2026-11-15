// The order emails' layout, with no Deno or network in it, so the function
// (index.ts) and a local preview (scripts/email-preview.mjs) build the same
// HTML. Dark like the site; a hero banner per message, rounded outlined
// cards, a Swiggy-style bill, a progress tracker, and a brand footer.
import { trackLink } from "../../../src/lib/tracking.ts";

export type Item = { product_name: string; variant_label: string; quantity: number; unit_price: number; product_variants?: { products?: { slug?: string } | null } | null };
export type Shipment = { carrier: string | null; tracking_number: string | null; shipped_at: string | null };
export type Refund = { id: string; amount: number; reason: string; created_at: string };
export type Note = { number: string; refund_id: string | null };
export type Order = {
  id: string;
  order_number: string;
  status: string;
  is_test: boolean;
  created_at: string;
  contact_name: string;
  contact_email: string;
  address_line1: string;
  address_line2: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
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
export type Event = { id: string; status: string; note: string; created_at: string; orders: Order };
export type Shop = { store_name: string; legal_name: string; store_address: string; gstin: string; store_phone: string; store_email: string };
// photo: the product photo path for a slug and option, or null (product-photos maps)
export type Cfg = { site: string; assets: string; instagram: string; photo: (slug: string, option: string) => string | null };
export type Mail = { kind: string; subject: string; html: string };

// the site's dark theme (src/app/themes/modes.css): black, dark-grey surfaces,
// brass gold as the one accent, green for good news. The rasta colours belong
// to the logo only.
const C = { bg: "#000000", card: "#121213", surface: "#1b1b1c", line: "#272729", text: "#f2f3f5", muted: "#96979d", gold: "#d3ab70", green: "#23a55a" };
// the site's type: Geist, Geist Mono for prices (mail apps without web fonts fall back)
const FONT = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
// accent per message
const TONE = {
  confirmed: { accent: C.green },
  shipped: { accent: C.gold },
  refund: { accent: C.gold },
  return: { accent: C.gold },
  cancelled: { accent: C.muted },
  "new-order": { accent: C.gold },
} as const;
type Kind = keyof typeof TONE;

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const T = (inner: string, attrs = "") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${attrs}>${inner}</table>`;
const p = (html: string, color = C.text, size = 15) => `<p style="margin:0 0 12px;font-size:${size}px;line-height:1.55;color:${color}">${html}</p>`;

// a rounded, outlined dark card with a small-caps heading
function card(heading: string, inner: string) {
  return `<tr><td style="padding:0 0 14px">${T(
    `<tr><td style="border:1px solid ${C.line};border-radius:16px;padding:18px 18px 16px;background:${C.card}" bgcolor="${C.card}">${
      heading ? `<div style="font-size:12px;font-weight:700;letter-spacing:2px;color:${C.muted};text-transform:uppercase;padding:0 0 12px;border-bottom:1px solid ${C.line};margin:0 0 12px">${esc(heading)}</div>` : ""
    }${inner}</td></tr>`,
  )}</td></tr>`;
}

function hero(cfg: Cfg, kind: Kind, kicker: string, title: string) {
  const t = TONE[kind];
  return `<tr><td style="padding:0 0 14px">${T(
    `<tr><td bgcolor="${C.card}" style="background:${C.card};padding:22px 20px">${T(
      `<tr><td valign="middle"><div style="font-size:12px;font-weight:700;letter-spacing:2px;color:${t.accent};text-transform:uppercase;margin:0 0 8px">${esc(kicker)}</div><div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:${C.text}">${esc(title)}</div></td><td width="96" align="right" valign="middle"><img src="${cfg.assets}/${kind}.png" width="88" height="88" alt="" style="display:block;width:88px;height:88px;border:0"></td></tr>`,
    )}</td></tr>`,
    `style="border-radius:16px;overflow:hidden;border:1px solid ${C.line}"`,
  )}</td></tr>`;
}

// Confirmed → Packed → Shipped → Delivered: one line through the steps, gold up
// to where the order is. Each step is a quarter column (dot centred, half a
// line either side), so the labels sit right under their dots.
const STEPS = ["Confirmed", "Packed", "Shipped", "Delivered"];
function tracker(at: number) {
  const half = (on: boolean, show: boolean) =>
    `<td width="50%" valign="middle" style="font-size:0;line-height:0">${show ? `<div style="height:3px;background:${on ? C.gold : C.line};font-size:0;line-height:0">&nbsp;</div>` : "&nbsp;"}</td>`;
  const dot = (i: number) => {
    const done = i < at, now = i === at;
    const style = done
      ? `background:${C.gold};color:#000000;border:2px solid ${C.gold}`
      : now
        ? `background:${C.card};color:${C.gold};border:2px solid ${C.gold};box-shadow:0 0 0 4px rgba(211,171,112,0.18)`
        : `background:${C.surface};color:${C.muted};border:2px solid ${C.line}`;
    return `<td valign="middle" style="padding:0"><div style="width:26px;height:26px;line-height:26px;border-radius:15px;text-align:center;font-size:12px;font-weight:700;${style}">${done ? "&#10003;" : i + 1}</div></td>`;
  };
  const cells = STEPS.map(
    (_, i) => `<td width="25%" align="center" valign="middle" style="padding:0">${T(`<tr>${half(i <= at, i > 0)}${dot(i)}${half(i < at, i < STEPS.length - 1)}</tr>`)}</td>`,
  ).join("");
  const labels = STEPS.map(
    (s, i) => `<td width="25%" align="center" style="padding:10px 2px 0;font-size:12px;line-height:1.3;font-weight:${i === at ? 700 : 500};color:${i === at ? C.gold : i < at ? C.text : C.muted}">${s}</td>`,
  ).join("");
  return `<div style="border-top:1px solid ${C.line};margin:6px 0 18px;font-size:0;line-height:0">&nbsp;</div>${T(`<tr>${cells}</tr><tr>${labels}</tr>`)}`;
}

// the bill, Swiggy-style: items, dashed rule, charges, dashed rule, big total
function bill(o: Order, totalLabel: string, cfg: Cfg) {
  const row = (l: string, r: string, rc = C.text) => `<tr><td colspan="2" style="padding:7px 0;font-size:15px;line-height:1.4;color:${C.muted}">${l}</td><td align="right" valign="top" style="padding:7px 0 7px 12px;font-size:15px;color:${rc};white-space:nowrap;font-family:${MONO}">${r}</td></tr>`;
  const dash = `<tr><td colspan="3" style="padding:6px 0"><div style="border-top:1px dashed ${C.line};font-size:0;line-height:0">&nbsp;</div></td></tr>`;
  const items = o.order_items
    .map((i) => {
      const slug = i.product_variants?.products?.slug ?? "";
      const ph = slug ? cfg.photo(slug, i.variant_label) : null;
      const src = ph ? (/^https?:/.test(ph) ? ph : `${cfg.site}${ph}`) : "";
      const thumb = src
        ? `<img src="${src}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:10px;object-fit:cover;background:${C.surface};border:0">`
        : `<div style="width:56px;height:56px;line-height:56px;border-radius:10px;background:${C.surface};color:${C.muted};text-align:center;font-size:20px;font-weight:700">${esc((i.product_name || "?").trim()[0].toUpperCase())}</div>`;
      return `<tr><td width="68" valign="top" style="padding:8px 12px 8px 0">${thumb}</td><td valign="top" style="padding:8px 0;font-size:15px;line-height:1.4;color:${C.text}">${esc(i.product_name)}${i.variant_label ? `<br><span style="color:${C.muted};font-size:13px">${esc(i.variant_label)}</span>` : ""}<br><span style="color:${C.muted};font-size:13px">Qty ${i.quantity}</span></td><td align="right" valign="top" style="padding:8px 0 8px 12px;font-size:15px;color:${C.text};white-space:nowrap;font-family:${MONO}">${inr(i.unit_price * i.quantity)}</td></tr>`;
    })
    .join("");
  const charges = [row("Shipping", o.shipping > 0 ? inr(o.shipping) : "<b>FREE</b>", o.shipping > 0 ? C.text : C.green), ...(o.gst_inclusive ? [] : [row("GST", inr(o.tax))])].join("");
  const total = `<tr><td colspan="2" style="padding:10px 0 0;font-size:16px;font-weight:600;color:${C.text}">${esc(totalLabel)}${o.gst_inclusive ? `<br><span style="font-size:12px;font-weight:400;color:${C.muted}">incl. GST</span>` : ""}</td><td align="right" valign="top" style="padding:8px 0 0 12px;font-size:24px;font-weight:700;color:${C.text};white-space:nowrap;font-family:${MONO}">${inr(o.total)}</td></tr>`;
  return card("Bill details", T(`${items}${dash}${charges}${dash}${total}`));
}

const kv = (rows: [string, string][]) => T(rows.map(([k, v]) => `<tr><td valign="top" style="padding:5px 0;font-size:14px;color:${C.muted};white-space:nowrap">${k}</td><td align="right" style="padding:5px 0 5px 14px;font-size:14px;color:${C.text}">${v}</td></tr>`).join(""));
const address = (o: Order) => [o.address_line1, o.address_line2, `${o.address_city}, ${o.address_state} ${o.address_pincode}`].filter(Boolean).map(esc).join("<br>");
const button = (href: string, label: string) => `<tr><td align="center" style="padding:4px 0 18px"><a href="${href}" style="display:inline-block;background:${C.gold};color:#000000;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:12px">${esc(label)}</a></td></tr>`;

function footer(cfg: Cfg, shop: Shop, to: "customer" | "shop") {
  const name = shop.legal_name || shop.store_name || "Babajee";
  const wa = shop.store_phone.replace(/\D/g, "");
  const icons = [
    cfg.instagram && [cfg.instagram, "instagram", "Instagram"],
    wa.length >= 10 && [`https://wa.me/${wa.length === 10 ? "91" + wa : wa}`, "whatsapp", "WhatsApp"],
    [`${cfg.site}/`, "web", "Website"],
  ].filter(Boolean) as [string, string, string][];
  const support = [
    shop.store_phone && `<span style="color:${C.muted}">Customer support:</span> <b style="color:${C.text}">${esc(shop.store_phone)}</b>`,
    shop.store_email && `<span style="color:${C.muted}">Write to us at</span> <a href="mailto:${esc(shop.store_email)}" style="color:${C.gold};text-decoration:none;font-weight:700">${esc(shop.store_email)}</a>`,
  ].filter(Boolean);
  const auto =
    to === "customer"
      ? "This is an automated email about your order. Please don't reply to it: this address isn't monitored."
      : "Automated alert from your Babajee shop admin.";
  return `<tr><td bgcolor="${C.surface}" style="background:${C.surface};border-radius:16px;padding:26px 20px 22px;text-align:center">
<a href="${cfg.site}/"><img src="${cfg.assets}/logo.png" width="170" alt="Babajee · The Smoke Shop" style="display:block;margin:0 auto 14px;width:170px;height:auto;border:0"></a>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${C.muted}">Rolling papers, grinders and smoking accessories, packed with care and delivered across India.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px"><tr>${icons.map(([href, icon, alt]) => `<td style="padding:0 6px"><a href="${href}"><img src="${cfg.assets}/${icon}.png" width="38" height="38" alt="${alt}" style="display:block;width:38px;height:38px;border:0"></a></td>`).join("")}</tr></table>
${support.map((s) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5">${s}</p>`).join("")}
<div style="border-top:1px solid ${C.line};margin:16px 0 14px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${C.muted}">${auto}</p>
<p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${C.muted}"><b style="color:${C.text}">${esc(name)}</b>${shop.gstin ? ` · GSTIN ${esc(shop.gstin)}` : ""}</p>
${shop.store_address ? `<p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${C.muted}">${esc(shop.store_address).replace(/\n/g, ", ")}</p>` : ""}
<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${C.muted}">For adults 18 and over. © ${new Date().getFullYear()} ${esc(name)}. All rights reserved.</p>
</td></tr>`;
}

function shell(cfg: Cfg, shop: Shop, to: "customer" | "shop", title: string, rows: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600;700&display=swap" rel="stylesheet"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}" bgcolor="${C.bg}">
${T(`<tr><td align="center" style="padding:20px 12px 28px">${T(`${rows}${footer(cfg, shop, to)}`, `style="max-width:560px;font-family:${FONT}"`)}</td></tr>`, `bgcolor="${C.bg}" style="background:${C.bg}"`)}
</body></html>`;
}

const STEP_OF: Record<string, number> = { paid: 0, packed: 1, shipped: 2, delivered: 3 };

export function compose(e: Event, shop: Shop, cfg: Cfg): Mail | null {
  const o = e.orders;
  const hi = p(`Hi <b>${esc(first(o.contact_name))}</b>,`);
  const view = button(`${cfg.site}/orders/view/?id=${o.id}`, "View your order");
  const details = card("Order details", kv([["Order", `<b style="color:${C.gold}">${esc(o.order_number)}</b>`], ["Placed on", day(o.created_at)], ["Deliver to", `<b>${esc(o.contact_name)}</b><br>${address(o)}`]]));
  switch (e.status) {
    case "paid":
      return {
        kind: "confirmed",
        subject: `Order ${o.order_number} confirmed`,
        html: shell(cfg, shop, "customer", "Order confirmed", `${hero(cfg, "confirmed", "Order confirmed", "Thanks! Your order is confirmed")}${card("", `${hi}${p("We've received your payment and we're getting your order ready. We'll email you again when it ships.", C.muted)}${tracker(STEP_OF.paid)}`)}${bill(o, "Total paid", cfg)}${details}${view}`),
      };
    case "shipped": {
      const s = [...o.shipments].sort((a, b) => (b.shipped_at ?? "").localeCompare(a.shipped_at ?? ""))[0];
      const t = s ? trackLink(s.carrier, s.tracking_number) : null;
      const track = s?.tracking_number
        ? card("Tracking", `${kv([["Courier", `<b>${esc(s.carrier || "Courier")}</b>`], ["Tracking number", `<b style="letter-spacing:.5px">${esc(s.tracking_number)}</b>`]])}${t && !t.direct ? p(`Copy the number and paste it on ${esc(t.site)}'s tracking page.`, C.muted, 13).replace("margin:0 0 12px", "margin:10px 0 0") : ""}`)
        : card("Tracking", p(s?.carrier ? `Sent with ${esc(s.carrier)}. We'll share tracking details as soon as the courier provides them.` : "We'll share tracking details as soon as the courier provides them.", C.muted).replace("margin:0 0 12px", "margin:0"));
      return {
        kind: "shipped",
        subject: `Order ${o.order_number} is on its way`,
        html: shell(cfg, shop, "customer", "Order shipped", `${hero(cfg, "shipped", "Order shipped", "Your order is on its way")}${card("", `${hi}${p("Good news: your order has left our shop and is with the courier.", C.muted)}${tracker(STEP_OF.shipped)}`)}${track}${t ? button(t.url, `Track on ${t.site}`) : ""}${bill(o, "Total paid", cfg)}${details}${t ? "" : view}`),
      };
    }
    case "refund":
    case "return": {
      const r = [...o.order_refunds].filter((x) => x.created_at <= e.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? [...o.order_refunds].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!r) return null;
      const cn = o.credit_notes.find((n) => n.refund_id === r.id);
      const ret = e.status === "return";
      const amount = card("Refund", `${T(`<tr><td style="font-size:15px;color:${C.muted}">Amount refunded</td><td align="right" style="font-size:26px;font-weight:700;color:${C.gold};white-space:nowrap;font-family:${MONO}">${inr(r.amount)}</td></tr>`)}${kv([...(r.reason ? ([["Reason", esc(r.reason)]] as [string, string][]) : []), ...(cn ? ([["Credit note", `<b>${esc(cn.number)}</b>`]] as [string, string][]) : []), ["Order", `<b style="color:${C.gold}">${esc(o.order_number)}</b>`]])}`);
      return {
        kind: "refund",
        subject: `Refund of ${inr(r.amount)} on order ${o.order_number}`,
        html: shell(cfg, shop, "customer", "Refund issued", `${hero(cfg, ret ? "return" : "refund", ret ? "Return refunded" : "Refund issued", ret ? "We've refunded your return" : "Your refund is on its way")}${card("", `${hi}${p(ret ? "We've received your return and refunded you." : "We've issued a refund on your order.", C.muted)}${p("It usually shows in your account within 5–7 working days, depending on your bank or payment method.", C.muted).replace("margin:0 0 12px", "margin:0")}`)}${amount}${view}`),
      };
    }
    case "cancelled":
      return {
        kind: "cancelled",
        subject: `Order ${o.order_number} cancelled`,
        html: shell(cfg, shop, "customer", "Order cancelled", `${hero(cfg, "cancelled", "Order cancelled", "Your order was cancelled")}${card("", `${hi}${p(`Your order has been cancelled.${e.note ? ` ${esc(e.note)}` : ""}`, C.muted)}${p("If you'd already paid, your refund follows separately and we'll email you when it's issued.", C.muted).replace("margin:0 0 12px", "margin:0")}`)}${bill(o, "Order total", cfg)}${details}${view}`),
      };
  }
  return null;
}

// the shop's own alert for a new paid order
export function alertMail(o: Order, shop: Shop, cfg: Cfg): Mail {
  const who = card("Customer", kv([["Name", `<b>${esc(o.contact_name)}</b>`], ["Email", `<a href="mailto:${esc(o.contact_email)}" style="color:${C.gold}">${esc(o.contact_email)}</a>`], ["Deliver to", address(o)]]));
  return {
    kind: "new-order",
    subject: `New order ${o.order_number} · ${inr(o.total)}`,
    html: shell(cfg, shop, "shop", "New order", `${hero(cfg, "new-order", "New order", `${o.order_number} · ${inr(o.total)}`)}${bill(o, "Total paid", cfg)}${who}${button(`${cfg.site}/admin/orders/view/?id=${o.id}`, "Open in admin")}`),
  };
}
