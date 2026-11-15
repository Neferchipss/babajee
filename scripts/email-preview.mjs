// Writes every order email as HTML into the folder given (default
// .email-preview/), with images from brand/email, for looking at in a browser
// before deploying: node scripts/email-preview.mjs [out-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { alertMail, compose } from "../supabase/functions/order-email/template.ts";

const out = resolve(process.argv[2] ?? ".email-preview");
mkdirSync(out, { recursive: true });
const cfg = { site: "https://neferchipss.github.io/babajee", assets: pathToFileURL(resolve("brand/email")).href, instagram: "https://instagram.com/" };
const shop = { store_name: "Babajee", legal_name: "Babajee The Smoke Shop", store_address: "Shop 4, Example Road\nMumbai, Maharashtra 400001", gstin: "27ABCDE1234F1Z5", store_phone: "+91 98765 43210", store_email: "help@babajee.in" };
const at = "2026-11-15T10:00:00Z";
const base = {
  id: "00000000-0000-0000-0000-000000000000",
  order_number: "BJ-1529",
  status: "paid",
  is_test: true,
  created_at: "2026-11-14T08:30:00Z",
  contact_name: "Shruti Rodrigues",
  contact_email: "shruti@example.com",
  address_line1: "2103, Bhavani Housing Society",
  address_line2: "Tilak Road",
  address_city: "Mumbai",
  address_state: "Maharashtra",
  address_pincode: "400028",
  subtotal: 1198,
  shipping: 0,
  tax: 0,
  total: 1198,
  gst_inclusive: true,
  order_items: [
    { product_name: "3 in 1 Aluminium Grinder", variant_label: "Black", quantity: 1, unit_price: 899 },
    { product_name: "King Size Rolling Papers", variant_label: "", quantity: 2, unit_price: 149.5 },
  ],
  shipments: [{ carrier: "Delhivery", tracking_number: "1490817263541", shipped_at: at }],
  order_refunds: [{ id: "r1", amount: 299, reason: "One pack arrived damaged", created_at: at }],
  credit_notes: [{ number: "CN/26-27/0001", refund_id: "r1" }],
};
const ev = (status, o = {}, note = "") => ({ id: "e", status, note, created_at: "2026-11-15T11:00:00Z", orders: { ...base, ...o } });
const mails = {
  "1-confirmed": compose(ev("paid"), shop, cfg),
  "2-shipped": compose(ev("shipped"), shop, cfg),
  "3-shipped-dtdc": compose(ev("shipped", { shipments: [{ carrier: "DTDC", tracking_number: "D7781234", shipped_at: at }] }), shop, cfg),
  "4-shipped-no-tracking": compose(ev("shipped", { shipments: [] }), shop, cfg),
  "5-refund": compose(ev("refund"), shop, cfg),
  "6-return": compose(ev("return", { credit_notes: [] }), shop, cfg),
  "7-cancelled": compose(ev("cancelled", { shipping: 49, total: 1247 }), shop, cfg),
  "8-new-order": alertMail(base, shop, cfg),
};
for (const [name, m] of Object.entries(mails)) writeFileSync(resolve(out, `${name}.html`), m.html);
console.log(out, Object.keys(mails).length);
