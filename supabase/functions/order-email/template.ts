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
  contact_phone: string;
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
export type Shop = { store_name: string; legal_name: string; store_address: string; gstin: string; store_phone: string; store_email: string; return_days?: number | null; unpaid_hours?: number | null };
// photo: the product photo path for a slug and option, or null (product-photos maps)
export type Cfg = { site: string; assets: string; instagram: string; photo: (slug: string, option: string) => string | null };
export type Mail = { kind: string; subject: string; html: string };

// The site's own light and dark themes (src/app/themes/modes.css), following
// the reader's system setting. Inline styles carry the light theme; the dark
// one swaps each colour in a prefers-color-scheme block (Apple Mail, iOS,
// Outlook for Mac). Gmail ignores that block and adapts the light one itself.
// The rasta colours belong to the logo only.
const C = { bg: "#f0f2f5", card: "#ffffff", surface: "#f5f6f8", line: "#e7eaee", text: "#0c0f14", muted: "#686f78", gold: "#d3ab70", goldText: "#9c7a3c", green: "#0f8a5f" };
const DARK: [string, string][] = [
  [C.bg, "#000000"],
  [C.card, "#121213"],
  [C.surface, "#1b1b1c"],
  [C.line, "#272729"],
  [C.text, "#f2f3f5"],
  [C.muted, "#96979d"],
  [C.goldText, "#d3ab70"],
  [C.green, "#23a55a"],
];
const DARK_CSS = `@media (prefers-color-scheme: dark){${DARK.map(
  ([l, d]) => `[style*="background:${l}"],[bgcolor="${l}"]{background:${d}!important}[style*="color:${l}"]{color:${d}!important}[style*="solid ${l}"],[style*="dashed ${l}"]{border-color:${d}!important}`,
).join("")}}`;
// the site's type: Geist, Geist Mono for prices (mail apps without web fonts fall back)
const FONT = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
// accent per message
const TONE = {
  received: { accent: C.goldText },
  confirmed: { accent: C.green },
  shipped: { accent: C.goldText },
  delivered: { accent: C.green },
  refund: { accent: C.goldText },
  return: { accent: C.goldText },
  cancelled: { accent: C.muted },
  "new-order": { accent: C.goldText },
} as const;
type Kind = keyof typeof TONE;

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
// "16 Nov, 6:30 pm", in India time
const when = (d: Date) =>
  d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
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
      `<tr><td valign="middle"><div style="font-size:12px;font-weight:700;letter-spacing:2px;color:${t.accent};text-transform:uppercase;margin:0 0 8px">${esc(kicker)}</div><div style="font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:${C.text}">${esc(title)}</div></td><td width="96" align="right" valign="middle"><div style="width:88px;height:88px;border-radius:44px;background:${C.surface};text-align:center"><img src="${cfg.assets}/${kind}.png" width="52" height="52" alt="" style="display:inline-block;width:52px;height:52px;margin-top:18px;border:0"></div></td></tr>`,
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
    // the last step, once reached, is done too (a delivered order is finished)
    const done = i < at || (i === at && at === STEPS.length - 1), now = i === at && !done;
    const style = done
      ? `background:${C.gold};color:#000000;border:2px solid ${C.gold}`
      : now
        ? `background:${C.card};color:${C.goldText};border:2px solid ${C.gold};box-shadow:0 0 0 4px rgba(211,171,112,0.18)`
        : `background:${C.surface};color:${C.muted};border:2px solid ${C.line}`;
    return `<td valign="middle" style="padding:0"><div style="width:26px;height:26px;line-height:26px;border-radius:15px;text-align:center;font-size:12px;font-weight:700;${style}">${done ? "&#10003;" : i + 1}</div></td>`;
  };
  const cells = STEPS.map(
    (_, i) => `<td width="25%" align="center" valign="middle" style="padding:0">${T(`<tr>${half(i <= at, i > 0)}${dot(i)}${half(i < at, i < STEPS.length - 1)}</tr>`)}</td>`,
  ).join("");
  const labels = STEPS.map(
    (s, i) => `<td width="25%" align="center" style="padding:10px 2px 0;font-size:12px;line-height:1.3;font-weight:${i === at ? 700 : 500};color:${i === at ? C.goldText : i < at ? C.text : C.muted}">${s}</td>`,
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

// numbered steps: a gold number, a bold line and a muted one under it
function nextSteps(steps: [string, string][]) {
  return steps
    .map(
      ([head, sub], i) =>
        `<tr><td width="40" valign="top" style="padding:0 0 ${i === steps.length - 1 ? 0 : 14}px"><div style="width:28px;height:28px;line-height:28px;border-radius:14px;text-align:center;font-size:13px;font-weight:700;background:${C.gold};color:#000000">${i + 1}</div></td><td valign="top" style="padding:3px 0 ${i === steps.length - 1 ? 0 : 14}px"><div style="font-size:15px;font-weight:700;color:${C.text}">${head}</div><div style="font-size:13px;line-height:1.5;color:${C.muted};margin-top:2px">${sub}</div></td></tr>`,
    )
    .join("");
}

// a small grid of outlined links, two to a row: label in bold, a muted line under it
function quickLinks(links: [string, string, string][]) {
  const cell = ([href, label, sub]: [string, string, string]) =>
    `<td width="50%" valign="top" style="padding:5px"><a href="${href}" style="display:block;border:1px solid ${C.line};border-radius:12px;background:${C.surface};padding:12px 14px;text-decoration:none"><span style="display:block;font-size:14px;font-weight:700;color:${C.text}">${esc(label)} <span style="color:${C.goldText}">&rarr;</span></span><span style="display:block;font-size:12px;line-height:1.45;color:${C.muted};margin-top:2px">${esc(sub)}</span></a></td>`;
  const rows: string[] = [];
  for (let i = 0; i < links.length; i += 2) rows.push(`<tr>${cell(links[i])}${links[i + 1] ? cell(links[i + 1]) : '<td width="50%"></td>'}</tr>`);
  return card("Quick links", T(rows.join("")));
}

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
    shop.store_email && `<span style="color:${C.muted}">Write to us at</span> <a href="mailto:${esc(shop.store_email)}" style="color:${C.goldText};text-decoration:none;font-weight:700">${esc(shop.store_email)}</a>`,
  ].filter(Boolean);
  const auto =
    to === "customer"
      ? "This is an automated email about your order. Please don't reply to it: this address isn't monitored."
      : "Automated alert from your Babajee shop admin.";
  return `<tr><td bgcolor="${C.surface}" style="background:${C.surface};border-radius:16px;padding:26px 20px 22px;text-align:center">
<a href="${cfg.site}/"><img src="${cfg.assets}/logo.png" width="170" alt="Babajee · The Smoke Shop" style="display:block;margin:0 auto 14px;width:170px;height:auto;border:0"></a>
<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:${C.muted}">Rolling papers, grinders and smoking accessories, packed with care and delivered across India.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px"><tr>${icons.map(([href, icon, alt]) => `<td style="padding:0 6px"><a href="${href}" style="display:block;width:38px;height:38px;border-radius:19px;border:1px solid ${C.line};background:${C.card};text-align:center"><img src="${cfg.assets}/${icon}.png" width="20" height="20" alt="${alt}" style="display:inline-block;width:20px;height:20px;margin-top:9px;border:0"></a></td>`).join("")}</tr></table>
${support.map((s) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5">${s}</p>`).join("")}
<div style="border-top:1px solid ${C.line};margin:16px 0 14px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${C.muted}">${auto}</p>
<p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${C.muted}"><b style="color:${C.text}">${esc(name)}</b>${shop.gstin ? ` · GSTIN ${esc(shop.gstin)}` : ""}</p>
${shop.store_address ? `<p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${C.muted}">${esc(shop.store_address).replace(/\n/g, ", ")}</p>` : ""}
<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:${C.muted}">For adults 18 and over. © ${new Date().getFullYear()} ${esc(name)}. All rights reserved.</p>
</td></tr>`;
}

function shell(cfg: Cfg, shop: Shop, to: "customer" | "shop", title: string, rows: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>:root{color-scheme:light dark}${DARK_CSS}</style><link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;600;700&display=swap" rel="stylesheet"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}" bgcolor="${C.bg}">
${T(`<tr><td align="center" style="padding:20px 12px 28px">${T(`<tr><td align="center" style="padding:6px 0 20px"><a href="${cfg.site}/"><img src="${cfg.assets}/logo.png" width="150" alt="Babajee · The Smoke Shop" style="display:block;width:150px;height:auto;border:0"></a></td></tr>${rows}${footer(cfg, shop, to)}`, `style="max-width:560px;font-family:${FONT}"`)}</td></tr>`, `bgcolor="${C.bg}" style="background:${C.bg}"`)}
</body></html>`;
}

const STEP_OF: Record<string, number> = { paid: 0, packed: 1, shipped: 2, delivered: 3 };

export function compose(e: Event, shop: Shop, cfg: Cfg): Mail | null {
  const o = e.orders;
  const hi = p(`Hi <b>${esc(first(o.contact_name))}</b>,`);
  const view = button(`${cfg.site}/orders/view/?id=${o.id}`, "View your order");
  const details = card("Order details", kv([["Order", `<b style="color:${C.goldText}">${esc(o.order_number)}</b>`], ["Placed on", day(o.created_at)], ["Deliver to", `<b>${esc(o.contact_name)}</b><br>${address(o)}`]]));
  switch (e.status) {
    case "pending": {
      // only when the order is first placed; payment is arranged by hand
      if (e.note !== "Order placed") return null;
      const hrs = shop.unpaid_hours ?? 48;
      const until = hrs > 0 ? new Date(new Date(o.created_at).getTime() + hrs * 3600 * 1000) : null;
      const reach = [o.contact_phone && `<b style="color:${C.text}">${esc(o.contact_phone)}</b>`, o.contact_email && `<b style="color:${C.text}">${esc(o.contact_email)}</b>`].filter(Boolean).join(" or ");
      const wa = shop.store_phone.replace(/\D/g, "");
      const waLink = wa ? `https://wa.me/${wa.length === 10 ? `91${wa}` : wa}?text=${encodeURIComponent(`Hi, I'd like to pay for my order ${o.order_number}.`)}` : "";
      const steps = card(
        "What happens next",
        T(
          nextSteps([
            ["We get in touch", `Someone from our team will contact you${reach ? ` on ${reach}` : ""} to take payment.`],
            ["You pay", "They'll tell you how to pay and confirm the amount with you."],
            ["We pack and ship", "As soon as payment is in, we'll email you and get your order ready."],
          ]),
        ) + (until ? p(`We're holding your items until <b style="color:${C.text}">${when(until)}</b>. If payment isn't sorted by then, the order is cancelled and nothing is charged.`, C.muted, 13).replace("margin:0 0 12px", "margin:16px 0 0;padding-top:14px;border-top:1px solid " + C.line) : ""),
      );
      return {
        kind: "received",
        subject: `Order ${o.order_number} received: we'll contact you for payment`,
        html: shell(cfg, shop, "customer", "Order received", `${hero(cfg, "received", "Order received", "We've got your order")}${card("", `${hi}${p("Thanks for your order. We take payment personally, so there's nothing to pay online.", C.muted).replace("margin:0 0 12px", "margin:0")}`)}${steps}${waLink ? button(waLink, "Message us on WhatsApp") : ""}${bill(o, "Amount to pay", cfg)}${details}${view}`),
      };
    }
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
    case "delivered": {
      const s = [...o.shipments].sort((a, b) => (b.shipped_at ?? "").localeCompare(a.shipped_at ?? ""))[0];
      const order = `${cfg.site}/orders/view/?id=${o.id}`;
      const days = shop.return_days ?? 0;
      const links: [string, string, string][] = [
        [order, "Rate your items", "Tell others what you thought"],
        ...(days > 0 ? ([[order, "Start a return", `Within ${days} day${days === 1 ? "" : "s"} of delivery`]] as [string, string, string][]) : []),
        [`${cfg.site}/shop/`, "Shop again", "Papers, grinders, trays and more"],
        [`${cfg.site}/support/`, "Get help", "Missing or damaged? We'll fix it"],
      ];
      return {
        kind: "delivered",
        subject: `Order ${o.order_number} delivered`,
        html: shell(cfg, shop, "customer", "Order delivered", `${hero(cfg, "delivered", "Order delivered", "Your order has arrived")}${card("", `${hi}${p(`Your order was delivered${s?.carrier ? ` by ${esc(s.carrier)}` : ""}. We hope you enjoy it.`, C.muted)}${tracker(STEP_OF.delivered)}`)}${quickLinks(links)}${bill(o, "Total paid", cfg)}${details}${view}`),
      };
    }
    case "refund":
    case "return": {
      const r = [...o.order_refunds].filter((x) => x.created_at <= e.created_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? [...o.order_refunds].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!r) return null;
      const cn = o.credit_notes.find((n) => n.refund_id === r.id);
      const ret = e.status === "return";
      const amount = card("Refund", `${T(`<tr><td style="font-size:15px;color:${C.muted}">Amount refunded</td><td align="right" style="font-size:26px;font-weight:700;color:${C.goldText};white-space:nowrap;font-family:${MONO}">${inr(r.amount)}</td></tr>`)}${kv([...(r.reason ? ([["Reason", esc(r.reason)]] as [string, string][]) : []), ...(cn ? ([["Credit note", `<b>${esc(cn.number)}</b>`]] as [string, string][]) : []), ["Order", `<b style="color:${C.goldText}">${esc(o.order_number)}</b>`]])}`);
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

// the shop's own alert for a new order, as it's placed: unpaid, so someone
// needs to contact the customer for payment
export function alertMail(o: Order, shop: Shop, cfg: Cfg): Mail {
  const digits = (o.contact_phone || "").replace(/\D/g, "");
  const wa = digits.length === 10 ? `91${digits}` : digits;
  const link = (href: string, text: string) => `<a href="${href}" style="color:${C.goldText};font-weight:700">${text}</a>`;
  const who = card(
    "Customer",
    kv([
      ["Name", `<b>${esc(o.contact_name)}</b>`],
      ...(o.contact_phone ? ([["Phone", `${link(`tel:${esc(o.contact_phone)}`, esc(o.contact_phone))}${wa ? ` · ${link(`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${first(o.contact_name)}, this is Babajee about your order ${o.order_number} (${inr(o.total)}).`)}`, "WhatsApp")}` : ""}`]] as [string, string][]) : []),
      ["Email", link(`mailto:${esc(o.contact_email)}`, esc(o.contact_email))],
      ["Deliver to", address(o)],
    ]),
  );
  const todo = card("", p(`Not paid yet. Contact ${esc(first(o.contact_name))} to take payment, then mark the order paid in the admin.`, C.muted).replace("margin:0 0 12px", "margin:0"));
  return {
    kind: "new-order",
    subject: `New order ${o.order_number} · ${inr(o.total)} · contact for payment`,
    html: shell(cfg, shop, "shop", "New order", `${hero(cfg, "new-order", "New order", `${o.order_number} · ${inr(o.total)}`)}${todo}${who}${bill(o, "Amount to collect", cfg)}${button(`${cfg.site}/admin/orders/view/?id=${o.id}`, "Open in admin")}`),
  };
}
