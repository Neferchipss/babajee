"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { creditSlip, getCounterSettings, receiptOrder, refundSlip, type CounterSettings, type CreditSlip, type ReceiptOrder, type RefundSlip } from "@/lib/counter";
import { gstSummary } from "@/lib/counter-math";
import { errText, getSettings, type StoreSettings } from "@/lib/orders-db";
import "./receipt.css";

// A till slip, sized for the till's printer
// (Settings › Counter: an 80 or 58 mm roll, or A4): the shop and its GSTIN,
// the receipt and invoice numbers, the items, the GST split, how it was paid
// and the change (?id=<order>); a refund made at the till (?refund=<id>);
// money collected on account (?credit=<id>). ?reprint=1 marks it REPRINT;
// ?print=1 opens the printer as soon as it's ready (straight after a sale).
// Plain black on white; only the slip prints.
export default function ReceiptPage() {
  return (
    <Suspense>
      <Receipt />
    </Suspense>
  );
}

const noop = () => () => {};
const amt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function Receipt() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const refund = sp.get("refund") ?? "";
  const credit = sp.get("credit") ?? "";
  const reprint = sp.get("reprint") === "1";
  const auto = sp.get("print") === "1";
  const back = sp.get("back") ?? "/admin/counter";
  const key = `${id}|${refund}|${credit}`;
  type Got = { key: string; shop: StoreSettings; till: CounterSettings | null; o?: ReceiptOrder; r?: RefundSlip; c?: CreditSlip };
  const [data, setData] = useState<Got | null>(null);
  const [err, setErr] = useState("");
  const onClient = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!id && !refund && !credit) return;
    let dead = false;
    Promise.all([getSettings(), getCounterSettings(), id ? receiptOrder(id) : null, refund ? refundSlip(refund) : null, credit ? creditSlip(credit) : null]).then(
      ([shop, till, o, r, c]) => !dead && setData({ key, shop, till, o: o ?? undefined, r: r ?? undefined, c: c ?? undefined }),
      (e) => !dead && setErr(errText(e)),
    );
    return () => {
      dead = true;
    };
  }, [key, id, refund, credit]);
  const ready = data?.key === key ? data : null;
  useEffect(() => {
    if (!ready || !auto) return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [ready, auto]);

  if (!onClient) return null;
  const size = ready?.till?.receiptSize ?? "80mm";
  const width = size === "A4" ? "210mm" : size;

  return createPortal(
    <div className={`rcp is-${size}`}>
      {/* the printer's paper, after any other print page's */}
      <style>{`@media print { @page { size: ${size === "A4" ? "A4" : `${size} auto`}; margin: ${size === "A4" ? "12mm" : "2mm"}; } }`}</style>
      <div className="rcp-bar">
        <Link href={back} className="rcp-back">
          {back.startsWith("/admin/counter") ? "← Back to the till" : "← Back"}
        </Link>
        <span className="rcp-gap" />
        {ready?.o && (
          <Link href={`/admin/orders/print?ids=${ready.o.id}&doc=invoice${reprint ? "&copy=duplicate" : ""}`} className="rcp-btn">
            A4 GST invoice
          </Link>
        )}
        {ready?.r && ready.r.credit_note && ready.o === undefined && (
          <Link href={`/admin/orders/print?ids=${ready.r.order_id}&doc=cn`} className="rcp-btn">
            A4 credit note
          </Link>
        )}
        <button type="button" className="rcp-btn is-pri" disabled={!ready} onClick={() => window.print()}>
          Print
        </button>
      </div>
      {!id && !refund && !credit && <p className="rcp-note">Nothing chosen to print.</p>}
      {err && <p className="rcp-note">{err}</p>}
      {!ready && !err && (id || refund || credit) && <p className="rcp-note">Getting it ready…</p>}
      {ready?.o && <Paper o={ready.o} shop={ready.shop} till={ready.till} width={width} reprint={reprint} />}
      {ready?.r && <RefundPaper r={ready.r} shop={ready.shop} till={ready.till} width={width} reprint={reprint} />}
      {ready?.c && <CreditPaper c={ready.c} shop={ready.shop} till={ready.till} width={width} reprint={reprint} />}
    </div>,
    document.body,
  );
}

// the shop's name, address and GSTIN at the top of every slip
function Head({ shop, till }: { shop: StoreSettings; till: CounterSettings | null }) {
  return (
    <header className="rcp-head">
      <b className="rcp-shop">{shop.store_name || "Babajee"}</b>
      {shop.legal_name && shop.legal_name !== shop.store_name && <span>{shop.legal_name}</span>}
      {shop.store_address && <span className="rcp-pre">{shop.store_address}</span>}
      {shop.store_phone && <span>Phone {shop.store_phone}</span>}
      {(till?.receiptGstin ?? true) && shop.gstin && <span>GSTIN {shop.gstin}</span>}
    </header>
  );
}

// a refund made at the till: what came back, how the money went, the credit note
function RefundPaper({ r, shop, till, width, reprint }: { r: RefundSlip; shop: StoreSettings; till: CounterSettings | null; width: string; reprint: boolean }) {
  return (
    <article className="rcp-paper" style={{ width }}>
      {reprint && <p className="rcp-title">REPRINT</p>}
      <Head shop={shop} till={till} />
      <p className="rcp-title">REFUND</p>
      <dl className="rcp-meta">
        {r.credit_note && (
          <>
            <dt>Credit note</dt>
            <dd>{r.credit_note}</dd>
          </>
        )}
        <dt>For sale</dt>
        <dd>{r.order_number}</dd>
        {r.invoice_number && (
          <>
            <dt>Invoice</dt>
            <dd>{r.invoice_number}</dd>
          </>
        )}
        <dt>Date</dt>
        <dd>{when(r.created_at)}</dd>
        <dt>Customer</dt>
        <dd>{r.contact_name}</dd>
      </dl>
      {r.lines.length > 0 && (
        <table className="rcp-items">
          <thead>
            <tr>
              <th>Returned</th>
              <th>Qty × price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, n) => (
              <tr key={n}>
                <td>
                  {l.name}
                  {l.label ? ` · ${l.label}` : ""}
                </td>
                <td>
                  {l.qty} × {amt(l.price)}
                </td>
                <td>{amt(l.qty * l.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="rcp-sum">
        <dt className="rcp-total">REFUNDED ₹</dt>
        <dd className="rcp-total">{amt(r.amount)}</dd>
        <dt>{r.method === "On account" ? "Taken off what's owed" : `Paid back by ${r.method || "—"}`}</dt>
        <dd>{amt(r.amount)}</dd>
        {r.restocked && (
          <>
            <dt>Back in stock</dt>
            <dd>Yes</dd>
          </>
        )}
      </dl>
      {r.reason && <p className="rcp-small">Reason: {r.reason}</p>}
      {!r.credit_note && <p className="rcp-small">The credit note is issued with the invoice.</p>}
      {till?.receiptFooter && <p className="rcp-foot">{till.receiptFooter}</p>}
    </article>
  );
}

// money collected against sales on account
function CreditPaper({ c, shop, till, width, reprint }: { c: CreditSlip; shop: StoreSettings; till: CounterSettings | null; width: string; reprint: boolean }) {
  return (
    <article className="rcp-paper" style={{ width }}>
      {reprint && <p className="rcp-title">REPRINT</p>}
      <Head shop={shop} till={till} />
      <p className="rcp-title">PAYMENT RECEIVED</p>
      <dl className="rcp-meta">
        <dt>Date</dt>
        <dd>{when(c.created_at)}</dd>
        <dt>From</dt>
        <dd>
          {c.name}
          {c.phone ? ` · ${c.phone}` : ""}
        </dd>
      </dl>
      {c.allocations.length > 0 && (
        <table className="rcp-items">
          <thead>
            <tr>
              <th>Towards sale</th>
              <th />
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {c.allocations.map((a, n) => (
              <tr key={n}>
                <td>{a.order_number}</td>
                <td />
                <td>{amt(a.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <dl className="rcp-sum">
        <dt className="rcp-total">PAID ₹</dt>
        <dd className="rcp-total">{amt(c.amount)}</dd>
        <dt>
          By {c.method}
          {c.reference ? ` · ${c.reference}` : ""}
        </dt>
        <dd />
        <dt>Still owed</dt>
        <dd>{amt(c.balance_after)}</dd>
      </dl>
      {till?.receiptFooter && <p className="rcp-foot">{till.receiptFooter}</p>}
    </article>
  );
}

function Paper({ o, shop, till, width, reprint }: { o: ReceiptOrder; shop: StoreSettings; till: CounterSettings | null; width: string; reprint?: boolean }) {
  const gstin = (till?.receiptGstin ?? true) && !!shop.gstin;
  const walkin = !till || o.contact_name === till.walkinName;
  const lines = o.items.map((i) => ({ ...i, gross: Math.round(i.qty * i.price * 100) / 100 }));
  const split = gstSummary(
    lines.map((l) => ({ gross: l.gross, rate: l.rate })),
    o.gst_inclusive,
  );
  const pieces = lines.reduce((n, l) => n + l.qty, 0);
  return (
    <article className="rcp-paper" style={{ width }}>
      {reprint && <p className="rcp-title">REPRINT</p>}
      <header className="rcp-head">
        <b className="rcp-shop">{shop.store_name || "Babajee"}</b>
        {shop.legal_name && shop.legal_name !== shop.store_name && <span>{shop.legal_name}</span>}
        {shop.store_address && <span className="rcp-pre">{shop.store_address}</span>}
        {shop.store_phone && <span>Phone {shop.store_phone}</span>}
        {gstin && <span>GSTIN {shop.gstin}</span>}
        {till?.receiptHeader && <span className="rcp-line">{till.receiptHeader}</span>}
      </header>
      <p className="rcp-title">{o.invoice_number ? (shop.gstin ? "TAX INVOICE" : "INVOICE") : "RECEIPT"}</p>
      <dl className="rcp-meta">
        {o.invoice_number && (
          <>
            <dt>Invoice</dt>
            <dd>{o.invoice_number}</dd>
          </>
        )}
        <dt>Receipt</dt>
        <dd>{o.order_number}</dd>
        <dt>Date</dt>
        <dd>{when(o.created_at)}</dd>
        {!walkin && (
          <>
            <dt>Customer</dt>
            <dd>
              {o.contact_name}
              {o.contact_phone ? ` · ${o.contact_phone}` : ""}
            </dd>
          </>
        )}
        {o.buyer_gstin && (
          <>
            <dt>Buyer GSTIN</dt>
            <dd>{o.buyer_gstin}</dd>
          </>
        )}
      </dl>
      <table className="rcp-items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty × price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, n) => (
            <tr key={n}>
              <td>
                {l.name}
                {l.label ? ` · ${l.label}` : ""}
              </td>
              <td>
                {l.qty} × {amt(l.price)}
              </td>
              <td>{amt(l.gross)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="rcp-sum">
        <dt>
          {pieces} item{pieces === 1 ? "" : "s"}
        </dt>
        <dd>{amt(o.subtotal)}</dd>
        {!o.gst_inclusive && (
          <>
            <dt>GST</dt>
            <dd>{amt(o.tax)}</dd>
          </>
        )}
        {o.cess > 0 && (
          <>
            <dt>Cess</dt>
            <dd>{amt(o.cess)}</dd>
          </>
        )}
        <dt className="rcp-total">TOTAL ₹</dt>
        <dd className="rcp-total">{amt(o.total)}</dd>
      </dl>
      {gstin && split.some((g) => g.tax > 0) && (
        <table className="rcp-gst">
          <thead>
            <tr>
              <th>GST</th>
              <th>Taxable</th>
              <th>CGST</th>
              <th>SGST</th>
            </tr>
          </thead>
          <tbody>
            {split.map((g) => (
              <tr key={g.rate}>
                <td>{g.rate}%</td>
                <td>{amt(g.taxable)}</td>
                <td>{amt(g.cgst)}</td>
                <td>{amt(g.sgst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {o.gst_inclusive && <p className="rcp-small">Prices include GST.</p>}
      <dl className="rcp-pay">
        {o.payments.map((p, n) => (
          <div key={n}>
            <dt>
              {p.method}
              {p.reference ? ` · ${p.reference}` : ""}
            </dt>
            <dd>{amt(p.amount)}</dd>
          </div>
        ))}
        {/* a sale on account (0086): what's still to pay */}
        {o.total - o.payments.reduce((n, p) => n + p.amount, 0) > 0.005 && (
          <div>
            <dt>On account (still to pay)</dt>
            <dd>{amt(Math.round((o.total - o.payments.reduce((n, p) => n + p.amount, 0)) * 100) / 100)}</dd>
          </div>
        )}
        {o.counter_tendered != null && o.counter_change > 0 && (
          <>
            <div>
              <dt>Cash given</dt>
              <dd>{amt(o.counter_tendered)}</dd>
            </div>
            <div>
              <dt>Change</dt>
              <dd>{amt(o.counter_change)}</dd>
            </div>
          </>
        )}
      </dl>
      {till?.receiptFooter && <p className="rcp-foot">{till.receiptFooter}</p>}
    </article>
  );
}
