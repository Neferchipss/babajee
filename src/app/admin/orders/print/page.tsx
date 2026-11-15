"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import logo from "@/assets/logo.webp";
import { createPortal } from "react-dom";
import { amountInWords, invoiceOf, stateCode } from "@/lib/invoice";
import { errText, getOrders, getSettings, issueInvoices, type Order, type StoreSettings } from "@/lib/orders-db";
import "./print.css";

// Invoices for one order or many, as A4 pages: print them,
// or "Save as PDF" in the print dialog to download. Opened from an order
// (/admin/orders/print?ids=<id>&doc=invoice) or from ticked orders in the list.
// The pages sit on their own layer over the admin, so only they print.
export default function PrintPage() {
  return (
    <Suspense>
      <Print />
    </Suspense>
  );
}

const inr = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
// plain amounts for table cells, two decimals, Indian grouping
const num = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const noop = () => () => {};
// 210 mm is 794 CSS px; narrower screens shrink the sheet to fit
const sheetZoom = () => Math.min(1, (window.innerWidth - 20) / 794);
const onResize = (fn: () => void) => {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
};

function Print() {
  const sp = useSearchParams();
  const ids = (sp.get("ids") ?? "").split(",").filter(Boolean);
  const key = ids.join(",");
  const [data, setData] = useState<{ key: string; orders: Order[]; shop: StoreSettings } | null>(null);
  const [err, setErr] = useState("");
  const onClient = useSyncExternalStore(noop, () => true, () => false);
  const zoom = useSyncExternalStore(onResize, sheetZoom, () => 1);

  useEffect(() => {
    let dead = false;
    (async () => {
      // invoices get their numbers first (paid orders only), then everything is read
      await issueInvoices(ids);
      const [orders, shop] = await Promise.all([getOrders(ids), getSettings()]);
      if (!dead) setData({ key, orders, shop });
    })().catch((e) => !dead && setErr(errText(e)));
    return () => {
      dead = true;
    };
    // key carries the ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!onClient) return null;
  const ready = data?.key === key ? data : null;
  const printable = ready ? ready.orders.filter((o) => o.invoice_number) : [];
  const skipped = ready ? ready.orders.filter((o) => !o.invoice_number) : [];
  const what = "invoice";

  return createPortal(
    <div className="prt" style={{ ["--prt-zoom" as string]: zoom }}>
      <div className="prt-bar">
        <Link href={ids.length === 1 ? `/admin/orders/view?id=${ids[0]}` : "/admin/orders"} className="prt-back">
          ← Back
        </Link>
        <b>
          {ready ? printable.length : "…"} {what}
          {printable.length === 1 ? "" : "s"}
        </b>
        <span className="prt-gap" />
        <button type="button" className="prt-btn is-pri" disabled={!printable.length} onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      {err && <p className="prt-note is-bad">{err}</p>}
      {!ready && !err && <p className="prt-note">Getting the {what}s ready…</p>}
      {skipped.length > 0 && (
        <p className="prt-note">
          No invoice for {skipped.map((o) => o.order_number).join(", ")}: {skipped.length === 1 ? "it hasn't" : "they haven't"} been paid
          {skipped.some((o) => o.status === "cancelled") ? " or were cancelled" : ""}. An invoice is made once an order is paid.
        </p>
      )}
      {ready && !ready.shop.gstin && printable.length > 0 && (
        <p className="prt-note">
          No GSTIN yet, so these say &ldquo;Invoice&rdquo; rather than &ldquo;Tax invoice&rdquo;. Add it, with the legal name and address, in{" "}
          <Link href="/admin/settings">Settings</Link>.
        </p>
      )}
      {ready && printable.map((o) => <InvoicePage key={o.id} o={o} shop={ready.shop} />)}
    </div>,
    document.body,
  );
}

function Address({ o }: { o: Order }) {
  return (
    <>
      <b>{o.contact_name}</b>
      <div>{[o.address_line1, o.address_line2].filter(Boolean).join(", ")}</div>
      {o.address_landmark && <div>{o.address_landmark}</div>}
      <div>
        {o.address_city}, {o.address_state} {o.address_pincode}
      </div>
      <div>{o.contact_phone}</div>
    </>
  );
}

// The GST tax invoice, laid out the way Indian invoices usually are (one ruled
// box: seller and invoice details, buyer, items with HSN and tax per line, a
// tax summary per bracket, totals, declaration and signatory), so it can go
// to an accountant or into a file as it is.
function InvoicePage({ o, shop }: { o: Order; shop: StoreSettings }) {
  const inv = invoiceOf(o, shop.store_state);
  const intra = inv.split === "intra";
  const taxCols = intra ? ["CGST", "SGST"] : [inv.split === "inter" ? "IGST" : "GST"];
  const anyHsn = inv.lines.some((l) => l.hsn);
  const units = inv.lines.reduce((n, l) => n + l.qty, 0);
  const shopCode = shop.store_state ? stateCode(shop.store_state) || shop.gstin.slice(0, 2) : shop.gstin.slice(0, 2);
  const taxOf = (x: { cgst: number; sgst: number; igst: number; gst: number }) => (intra ? [x.cgst, x.sgst] : [inv.split === "inter" ? x.igst : x.gst]);
  return (
    <article className="prt-page prt-inv">
      {o.is_test && <div className="prt-test">Test order</div>}
      <div className="inv-title">
        <h2>{shop.gstin ? "Tax invoice" : "Invoice"}</h2>
        <span>ORIGINAL FOR RECIPIENT</span>
      </div>

      <div className="inv-box">
        <div className="inv-row inv-head">
          <div className="inv-seller">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt="" className="inv-logo" />
            <div>
              <h1>{shop.store_name || "Babajee"}</h1>
              {shop.legal_name && shop.legal_name !== shop.store_name && <div className="inv-legal">{shop.legal_name}</div>}
              {shop.store_address && <div className="prt-pre">{shop.store_address}</div>}
              {shop.gstin && (
                <div>
                  <b>GSTIN</b> {shop.gstin}
                </div>
              )}
              {shop.store_state && (
                <div>
                  <b>State</b> {shop.store_state}
                  {shopCode && `, code ${shopCode}`}
                </div>
              )}
              {(shop.store_phone || shop.store_email) && <div>{[shop.store_phone, shop.store_email].filter(Boolean).join(" · ")}</div>}
            </div>
          </div>
          <dl className="inv-meta">
            <dt>Invoice no.</dt>
            <dd>
              <b>{o.invoice_number}</b>
            </dd>
            <dt>Invoice date</dt>
            <dd>{o.invoice_date ? day(o.invoice_date) : ""}</dd>
            <dt>Order no.</dt>
            <dd>{o.order_number}</dd>
            <dt>Order date</dt>
            <dd>{day(o.created_at)}</dd>
            <dt>Place of supply</dt>
            <dd>{inv.placeOfSupply}</dd>
            {shop.gstin && (
              <>
                <dt>Reverse charge</dt>
                <dd>No</dd>
              </>
            )}
          </dl>
        </div>

        <div className="inv-row inv-parties">
          <div>
            <span className="prt-label">Billed to (receiver)</span>
            <Address o={o} />
            {o.contact_email && <div>{o.contact_email}</div>}
          </div>
          <div>
            <span className="prt-label">Shipped to (consignee)</span>
            <Address o={o} />
          </div>
        </div>

        <table className="inv-items">
          <thead>
            <tr>
              <th className="c">#</th>
              <th>Description of goods</th>
              {anyHsn && <th className="c">HSN</th>}
              <th className="r">Qty</th>
              <th className="r">Rate (excl. GST)</th>
              <th className="r">Taxable value</th>
              <th className="r">GST rate</th>
              {taxCols.map((c) => (
                <th key={c} className="r">
                  {c}
                </th>
              ))}
              <th className="r">Amount (incl. GST)</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td className="c">{i + 1}</td>
                <td>
                  {l.name}
                  {(l.option || l.sku) && <small>{[l.option, l.sku && `SKU ${l.sku}`].filter(Boolean).join(" · ")}</small>}
                </td>
                {anyHsn && <td className="c">{l.hsn || "–"}</td>}
                <td className="r">{l.qty}</td>
                <td className="r">{num(l.unit)}</td>
                <td className="r">{num(l.taxable)}</td>
                <td className="r">{l.rate}%</td>
                {taxOf(l).map((t, k) => (
                  <td key={k} className="r">
                    {num(t)}
                  </td>
                ))}
                <td className="r">{num(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total</td>
              {anyHsn && <td />}
              <td className="r">{units}</td>
              <td />
              <td className="r">{num(inv.taxable)}</td>
              <td />
              {taxOf(inv).map((t, k) => (
                <td key={k} className="r">
                  {num(t)}
                </td>
              ))}
              <td className="r">{num(r2(inv.taxable + inv.gst))}</td>
            </tr>
          </tfoot>
        </table>

        <div className="inv-row inv-bottom">
          <div className="inv-left">
            <div>
              <span className="prt-label">Amount in words</span>
              <b>{amountInWords(inv.total)}</b>
            </div>
            <table className="inv-sum">
              <thead>
                <tr>
                  {anyHsn && <th>HSN</th>}
                  <th className="r">GST rate</th>
                  <th className="r">Taxable value</th>
                  {taxCols.map((c) => (
                    <th key={c} className="r">
                      {c}
                    </th>
                  ))}
                  <th className="r">Total tax</th>
                </tr>
              </thead>
              <tbody>
                {inv.summary.map((t, i) => (
                  <tr key={i}>
                    {anyHsn && <td>{t.hsn || "–"}</td>}
                    <td className="r">{t.rate}%</td>
                    <td className="r">{num(t.taxable)}</td>
                    {taxOf(t).map((x, k) => (
                      <td key={k} className="r">
                        {num(x)}
                      </td>
                    ))}
                    <td className="r">{num(t.gst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="inv-totals">
            <dt>Taxable value</dt>
            <dd>{inr(inv.taxable)}</dd>
            {intra ? (
              <>
                <dt>CGST</dt>
                <dd>{inr(inv.cgst)}</dd>
                <dt>SGST</dt>
                <dd>{inr(inv.sgst)}</dd>
              </>
            ) : (
              <>
                <dt>{inv.split === "inter" ? "IGST" : "GST"}</dt>
                <dd>{inr(inv.gst)}</dd>
              </>
            )}
            <dt>Shipping charges</dt>
            <dd>{inv.shipping > 0 ? inr(inv.shipping) : "Free"}</dd>
            <dt className="inv-grand">Grand total</dt>
            <dd className="inv-grand">{inr(inv.total)}</dd>
            {o.paid_total != null && (
              <>
                <dt>Amount received</dt>
                <dd>{inr(o.paid_total)}</dd>
              </>
            )}
          </dl>
        </div>
        {inv.refunded > 0 && <p className="inv-refund">{inr(inv.refunded)} of this was refunded later; see the credit note or the order&apos;s refunds.</p>}

        <div className="inv-row inv-sign">
          <div>
            <span className="prt-label">Declaration</span>
            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
          </div>
          <div className="inv-signbox">
            <span>For {shop.legal_name || shop.store_name || "Babajee"}</span>
            <span className="inv-signline">Authorised signatory</span>
          </div>
        </div>
      </div>

      <footer className="inv-foot">
        {shop.invoice_note && <p>{shop.invoice_note}</p>}
        <p className="prt-small">This is a computer-generated invoice.</p>
      </footer>
    </article>
  );
}
