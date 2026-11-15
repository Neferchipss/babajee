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
      toast("Bill voided. Its stock has been taken back out.");
      setAsking(false);
      await load();
    } catch (x) {
      toastError(x);
    }
    setBusy(false);
  }

  const back = (
    <Link href="/admin/products/stock-in" className="adm-back adm-only-narrow">
      ← Stock in
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
        <Link href="/admin/products/stock-in" className="adm-btn">
          Back to Stock in
        </Link>
      </div>
    );

  const void_ = r.status === "void";
  const sum = (k: "cgst" | "sgst" | "igst" | "gst") => r.lines.reduce((a, l) => a + Number(l[k]), 0);
  const taxable = r.lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0);
  const gst = sum("gst");
  const unclaimable = r.lines.some((l) => !l.claimable);
  const title = r.kind === "opening" ? "Opening count" : r.kind === "quick" ? "Stock added" : `Bill ${r.bill_no || "(no number)"}`;
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
                      {!l.claimable && <small className="adm-muted" style={{ display: "block" }}>GST can&apos;t be claimed</small>}
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
            <span>CGST</span>
            <b>{money(sum("cgst"))}</b>
          </div>
          <div>
            <span>SGST</span>
            <b>{money(sum("sgst"))}</b>
          </div>
          <div>
            <span>IGST</span>
            <b>{money(sum("igst"))}</b>
          </div>
          <div className="is-total">
            <span>Total</span>
            <b>{money(taxable + gst)}</b>
          </div>
          {unclaimable && <p className="adm-muted adm-small">Some of the GST on this can&apos;t be claimed because it has no supplier GSTIN.</p>}
        </section>

        {!void_ &&
          (asking ? (
            <div className="sti-confirm" role="alertdialog" aria-label="Void this bill">
              <p className="sti-voidnote">Void this bill?</p>
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
                Void this bill
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
