"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import logo from "@/assets/logo.webp";
import { createPortal } from "react-dom";
import { amountInWords, invoiceOf, stateCode } from "@/lib/invoice";
import { creditNoteOf, type CreditNoteRow } from "@/lib/credit-note";
import { errText, getOrders, getSettings, issueCreditNotes, issueInvoices, type Order, type StoreSettings } from "@/lib/orders-db";
import "./print.css";

// Invoices, or credit notes (&doc=cn), for one order or many, as A4 pages: print them,
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
  const doc: "invoice" | "cn" = sp.get("doc") === "cn" ? "cn" : "invoice";
  const key = `${doc}:${ids.join(",")}`;
  const [data, setData] = useState<{ key: string; orders: Order[]; shop: StoreSettings; notes: CreditNoteRow[] } | null>(null);
  const [err, setErr] = useState("");
  const onClient = useSyncExternalStore(noop, () => true, () => false);
  const zoom = useSyncExternalStore(onResize, sheetZoom, () => 1);

  useEffect(() => {
    let dead = false;
    (async () => {
      // invoices get their numbers first (paid orders only), then everything is read
      await issueInvoices(ids);
      const notes = doc === "cn" ? await issueCreditNotes(ids) : [];
      const [orders, shop] = await Promise.all([getOrders(ids), getSettings()]);
      if (!dead) setData({ key, orders, shop, notes });
    })().catch((e) => !dead && setErr(errText(e)));
    return () => {
      dead = true;
    };
    // key carries doc and ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!onClient) return null;
  const ready = data?.key === key ? data : null;
  const printable = ready ? ready.orders.filter((o) => o.invoice_number) : [];
  const skipped = ready ? ready.orders.filter((o) => !o.invoice_number) : [];
  const notes = ready && doc === "cn" ? ready.notes : [];
  const count = doc === "cn" ? notes.length : printable.length;
  const what = doc === "cn" ? "credit note" : "invoice";

  return createPortal(
    <div className="prt" style={{ ["--prt-zoom" as string]: zoom }}>
      <div className="prt-bar">
        <Link href={ids.length === 1 ? `/admin/orders/view?id=${ids[0]}` : "/admin/orders"} className="prt-back">
          ← Back
        </Link>
        <b>
          {ready ? count : "…"} {what}
          {count === 1 ? "" : "s"}
        </b>
        <span className="prt-gap" />
        <button type="button" className="prt-btn is-pri" disabled={!count} onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      {err && <p className="prt-note is-bad">{err}</p>}
      {!ready && !err && <p className="prt-note">Getting the {what}s ready…</p>}
      {ready && doc === "cn" && !notes.length && <p className="prt-note">No credit notes: there are no refunds on invoiced orders here.</p>}
      {doc === "invoice" && skipped.length > 0 && (
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
      {ready &&
        (doc === "cn"
          ? notes.map((n) => {
              const o = ready.orders.find((x) => x.id === n.order_id);
              return o ? <CreditNotePage key={n.id} n={n} o={o} shop={ready.shop} /> : null;
            })
          : printable.map((o) => <InvoicePage key={o.id} o={o} shop={ready.shop} />))}
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
  // a Cess column only when the invoice carries cess (0060)
  const hasCess = inv.cess > 0;
  const taxCols = [...(intra ? ["CGST", "SGST"] : [inv.split === "inter" ? "IGST" : "GST"]), ...(hasCess ? ["Cess"] : [])];
  const anyHsn = inv.lines.some((l) => l.hsn);
  const units = inv.lines.reduce((n, l) => n + l.qty, 0);
  const shopCode = shop.store_state ? stateCode(shop.store_state) || shop.gstin.slice(0, 2) : shop.gstin.slice(0, 2);
  const taxOf = (x: { cgst: number; sgst: number; igst: number; gst: number; cess: number }) => [...(intra ? [x.cgst, x.sgst] : [inv.split === "inter" ? x.igst : x.gst]), ...(hasCess ? [x.cess] : [])];
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
            {o.buyer_gstin && (
              <div>
                <b>GSTIN</b> {o.buyer_gstin}
              </div>
            )}
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
              <td className="r">{num(r2(inv.taxable + inv.gst + inv.cess))}</td>
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
                    <td className="r">{num(r2(t.gst + t.cess))}</td>
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
            {hasCess && (
              <>
                <dt>Cess</dt>
                <dd>{inr(inv.cess)}</dd>
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

// A GST credit note for one refund, set out like the invoice it corrects.
function CreditNotePage({ n, o, shop }: { n: CreditNoteRow; o: Order; shop: StoreSettings }) {
  const cn = creditNoteOf(n, o, shop.store_state);
  const intra = cn.split === "intra";
  const cnCess = cn.cess > 0;
  const taxCols = [...(intra ? ["CGST", "SGST"] : [cn.split === "inter" ? "IGST" : "GST"]), ...(cnCess ? ["Cess"] : [])];
  const taxOf = (x: { cgst: number; sgst: number; igst: number; gst: number; cess: number }) => [...(intra ? [x.cgst, x.sgst] : [cn.split === "inter" ? x.igst : x.gst]), ...(cnCess ? [x.cess] : [])];
  const reason = (o.order_refunds ?? []).find((r) => r.id === n.refund_id)?.reason;
  return (
    <article className="prt-page prt-inv">
      {o.is_test && <div className="prt-test">Test order</div>}
      <div className="inv-title">
        <h2>Credit note</h2>
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
            </div>
          </div>
          <dl className="inv-meta">
            <dt>Credit note no.</dt>
            <dd>
              <b>{n.number}</b>
            </dd>
            <dt>Date</dt>
            <dd>{day(n.issued_at)}</dd>
            <dt>Against invoice</dt>
            <dd>{o.invoice_number}</dd>
            <dt>Invoice date</dt>
            <dd>{o.invoice_date ? day(o.invoice_date) : ""}</dd>
            <dt>Place of supply</dt>
            <dd>{`${o.address_state}${stateCode(o.address_state) ? ` (${stateCode(o.address_state)})` : ""}`}</dd>
          </dl>
        </div>
        <div className="inv-row inv-parties">
          <div>
            <span className="prt-label">Issued to</span>
            <Address o={o} />
            {o.buyer_gstin && (
              <div>
                <b>GSTIN</b> {o.buyer_gstin}
              </div>
            )}
          </div>
          <div>
            <span className="prt-label">Reason</span>
            {reason || "Refund"}
          </div>
        </div>
        <table className="inv-items">
          <thead>
            <tr>
              <th className="c">#</th>
              <th>Description of goods</th>
              <th className="r">Qty</th>
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
            {cn.lines.map((l, i) => (
              <tr key={i}>
                <td className="c">{i + 1}</td>
                <td>
                  {l.name}
                  {(l.option || l.hsn) && <small>{[l.option, l.hsn && `HSN ${l.hsn}`].filter(Boolean).join(" · ")}</small>}
                </td>
                <td className="r">{l.qty}</td>
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
              <td />
              <td className="r">{num(cn.taxable)}</td>
              <td />
              {taxOf(cn).map((t, k) => (
                <td key={k} className="r">
                  {num(t)}
                </td>
              ))}
              <td className="r">{num(cn.total)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="inv-row inv-bottom">
          <div className="inv-left">
            <span className="prt-label">Amount in words</span>
            <b>{amountInWords(n.amount)}</b>
          </div>
          <dl className="inv-totals">
            <dt>Taxable value</dt>
            <dd>{inr(cn.taxable)}</dd>
            <dt>GST</dt>
            <dd>{inr(cn.gst)}</dd>
            {cnCess && (
              <>
                <dt>Cess</dt>
                <dd>{inr(cn.cess)}</dd>
              </>
            )}
            <dt className="inv-grand">Credit amount</dt>
            <dd className="inv-grand">{inr(n.amount)}</dd>
          </dl>
        </div>
        <div className="inv-row inv-sign">
          <div>
            <span className="prt-label">Declaration</span>
            This credit note reduces the value of the invoice above by the amount shown.
          </div>
          <div className="inv-signbox">
            <span>For {shop.legal_name || shop.store_name || "Babajee"}</span>
            <span className="inv-signline">Authorised signatory</span>
          </div>
        </div>
      </div>
      <footer className="inv-foot">
        <p className="prt-small">This is a computer-generated credit note.</p>
      </footer>
    </article>
  );
}
