"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { formatPrice } from "@/lib/currency";
import { dayLabel } from "@/lib/dates";
import { errText } from "@/lib/orders-db";
import { getReceipt, voidReceipt, type Receipt } from "@/lib/stock-in/db";
import "@/components/admin/stock/stockin.css";

const money = (n: number) => formatPrice(n, { paise: true });

// One bill: who it came from, its lines, the GST split, and Void.
export default function BillPage() {
  return (
    <Suspense>
      <Bill />
    </Suspense>
  );
}

function Bill() {
  const id = useSearchParams().get("id") ?? "";
  const [r, setR] = useState<Receipt | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getReceipt(id).then(setR, (e) => {
      setErr(errText(e));
      setR(null);
    });
  useEffect(() => {
    if (id) void load();
    // load follows the id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function doVoid() {
    setBusy(true);
    try {
      await voidReceipt(id);
      toast("Bill voided, stock reversed.");
      setAsking(false);
      await load();
    } catch (x) {
      toastError(x);
    }
    setBusy(false);
  }

  const back = (
    <Link href="/admin/inventory/purchases" className="adm-back adm-only-narrow">
      ← Purchases
    </Link>
  );
  if (r === undefined && id) return <div>{back}<p className="adm-muted">Loading.</p></div>;
  if (!r)
    return (
      <div>
        {back}
        <header className="adm-pagehead">
          <h1>Bill not found</h1>
        </header>
        {err && <p className="adm-err">{err}</p>}
        <Link href="/admin/inventory/purchases" className="adm-btn">
          Back to Purchases
        </Link>
      </div>
    );

  const void_ = r.status === "void";
  const sum = (k: "cgst" | "sgst" | "igst" | "gst") => r.lines.reduce((a, l) => a + Number(l[k]), 0);
  const taxable = r.lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0);
  const gst = sum("gst");
  const unclaimable = r.lines.some((l) => !l.claimable);
  // GST with no CGST/SGST/IGST split (the shop's or the supplier's GSTIN missing)
  const unsplit = Math.round((gst - sum("cgst") - sum("sgst") - sum("igst")) * 100) / 100;
  // why the GST here can't be claimed back
  const why =
    r.kind === "opening"
      ? "It's opening stock, so its GST can't be claimed."
      : r.kind === "quick"
        ? "It was added without a supplier bill, so its GST can't be claimed."
        : !r.supplier_gstin
          ? "The supplier has no GSTIN, so the GST on this bill can't be claimed."
          : "Some of the GST on this can't be claimed.";
  const title = r.kind === "opening" ? "Opening stock" : r.kind === "quick" ? "Stock added (no bill)" : `Bill ${r.bill_no || "(no number)"}`;
  const items = r.lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div style={{ maxWidth: 720 }}>
      {back}
      <header className="adm-pagehead">
        <h1 className={void_ ? "sti-struck" : undefined}>{title}</h1>
        <p>
          <span className={`adm-pill ${void_ ? "off" : "done"}`}>{void_ ? "Voided" : "Posted"}</span>{" "}
          {void_ && r.voided_at ? `Voided ${when(r.voided_at)}. Its stock was taken back out.` : `${dayLabel(r.bill_date)} · posted ${when(r.created_at)}`}
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <div className="sti-stack">
        <section className="adm-card">
          <dl style={{ margin: 0, display: "grid", gap: 6 }}>
            <div>
              <dt className="adm-muted adm-small">Supplier</dt>
              <dd style={{ margin: 0 }}>{r.supplier || "No supplier"}{r.supplier_gstin ? ` · ${r.supplier_gstin}` : ""}</dd>
            </div>
            <div>
              <dt className="adm-muted adm-small">Bill date</dt>
              <dd style={{ margin: 0 }}>{dayLabel(r.bill_date)}</dd>
            </div>
            {r.notes && (
              <div>
                <dt className="adm-muted adm-small">Notes</dt>
                <dd style={{ margin: 0 }}>{r.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="adm-card">
          <div className="sti-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="r">Qty</th>
                  <th className="r">Price</th>
                  <th className="r">GST</th>
                  <th className="r">Before GST</th>
                </tr>
              </thead>
              <tbody>
                {r.lines.map((l) => (
                  <tr key={l.id} className={void_ ? "sti-struck" : undefined}>
                    <td>
                      {l.product}
                      {l.option ? `, ${l.option}` : ""}
                      {!l.claimable && (
                        <small className="adm-muted" style={{ display: "block" }}>
                          {r.kind === "opening" ? "Opening stock: " : r.kind === "quick" ? "No supplier bill: " : !r.supplier_gstin ? "Supplier has no GSTIN: " : ""}GST can&apos;t be claimed
                        </small>
                      )}
                    </td>
                    <td className="r">{l.qty}</td>
                    <td className="r">{money(l.unit_price)}</td>
                    <td className="r">{l.gst_rate}%</td>
                    <td className="r">{money(l.qty * l.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`sti-totals ${void_ ? "sti-struck" : ""}`}>
          <div>
            <span>Before GST ({items} item{items === 1 ? "" : "s"})</span>
            <b>{money(taxable)}</b>
          </div>
          <div>
            <span>GST</span>
            <b>{money(gst)}</b>
          </div>
          <div className="adm-muted">
            <span>of which CGST</span>
            <b>{money(sum("cgst"))}</b>
          </div>
          <div className="adm-muted">
            <span>of which SGST</span>
            <b>{money(sum("sgst"))}</b>
          </div>
          <div className="adm-muted">
            <span>of which IGST</span>
            <b>{money(sum("igst"))}</b>
          </div>
          {unsplit !== 0 && (
            <div className="adm-muted">
              <span>of which not split</span>
              <b>{money(unsplit)}</b>
            </div>
          )}
          <div className="is-total">
            <span>Total</span>
            <b>{money(taxable + gst)}</b>
          </div>
          {unclaimable && <p className="adm-muted adm-small">{why}</p>}
        </section>

        {!void_ && r.kind === "bill" && <BillTicks id={r.id} billDate={r.bill_date} />}

        {!void_ &&
          (asking ? (
            <div className="sti-confirm" role="alertdialog" aria-label="Void bill">
              <p className="sti-voidnote">Void this bill? Its stock will be reversed.</p>
              <p className="adm-small">The {items} item{items === 1 ? "" : "s"} on it are taken back out of stock, and its GST stops counting. The bill stays here, marked as voided.</p>
              <div className="adm-actions">
                <button type="button" className="adm-btn bad" disabled={busy} onClick={doVoid}>
                  {busy ? "Voiding" : "Yes, void it"}
                </button>
                <button type="button" className="adm-btn" disabled={busy} onClick={() => setAsking(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="adm-actions">
              <button type="button" className="adm-btn bad" onClick={() => setAsking(true)}>
                Void bill
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}

// Ticks on a supplier bill for the GST return: it shows in GSTR-2B (its ITC
// belongs to that 2B month), and when it was paid (ITC on a bill unpaid 180
// days after its date is reversed).
function BillTicks({ id, billDate }: { id: string; billDate: string }) {
  type F = { in_2b: boolean; in_2b_month: string | null; paid_on: string | null };
  const [f, setF] = useState<F | null>(null);
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    import("@/lib/stock-in/db")
      .then((m) => m.getReceiptFlags(id))
      .then(
        (x) => live && (setF(x), setPaid(x.paid_on ?? "")),
        () => live && setF({ in_2b: false, in_2b_month: null, paid_on: null }),
      );
    return () => {
      live = false;
    };
  }, [id]);
  async function save(next: F) {
    setBusy(true);
    try {
      const m = await import("@/lib/stock-in/db");
      await m.setReceiptFlags(id, next);
      setF(next);
      toast("Saved");
    } catch (e) {
      toastError(e);
      setPaid(f?.paid_on ?? "");
    }
    setBusy(false);
  }
  if (!f) return null;
  const month = (f.in_2b_month ?? billDate).slice(0, 7);
  return (
    <section className="adm-card sti-ticks">
      <h2>For the GST return</h2>
      <label className="sti-tick">
        <input type="checkbox" checked={f.in_2b} disabled={busy} onChange={(e) => save({ ...f, in_2b: e.target.checked, in_2b_month: e.target.checked ? `${month}-01` : null })} />
        <span>
          Appears in GSTR-2B
          <small>Tick once the supplier&apos;s filing shows this bill. Only ticked bills count as input tax credit.</small>
        </span>
      </label>
      {f.in_2b && (
        <label className="adm-label">
          In the GSTR-2B for
          <input className="adm-input" type="month" value={month} disabled={busy} onChange={(e) => e.target.value && save({ ...f, in_2b_month: `${e.target.value}-01` })} />
          <small className="adm-muted adm-small">The ITC is claimed in that month&apos;s GSTR-3B.</small>
        </label>
      )}
      <label className="adm-label">
        Paid to supplier on
        <input className="adm-input" type="date" min={billDate} value={paid} disabled={busy} onChange={(e) => setPaid(e.target.value)} onBlur={() => paid !== (f.paid_on ?? "") && save({ ...f, paid_on: paid || null })} />
        <small className="adm-muted adm-small">ITC on a bill still unpaid 180 days after its date has to be reversed.</small>
      </label>
    </section>
  );
}
