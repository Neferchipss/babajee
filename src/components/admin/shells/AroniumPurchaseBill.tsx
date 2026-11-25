"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PreviewLayer } from "@/components/admin/print/ArPrintPreview";
import { billSheet, companyOf, type Company } from "@/components/admin/print/docs";
import { printSheets } from "@/components/admin/print/printing";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { formatPrice } from "@/lib/currency";
import { errText, getSettings } from "@/lib/orders-db";
import { getReceipt, getReceiptFlags, listSuppliers, setReceiptFlags, voidReceipt, type Receipt } from "@/lib/stock-in/db";
import { paisa } from "@/lib/stock-in/price";
import { menuOf, useArKeys, useArMenu } from "./aronium-kit";
import { Band, DocFooter, DocHead, DocNotes, DocStrip, DocTabs, DocTotals, dmy, dmyTime, HF, HV, MiniBar, PaidSwitch } from "./aronium-docs";

// One purchase in the Aronium-style design, as Aronium's Purchase document
// (100 - Purchase) open in its tab: Number, External document (the bill
// number), Supplier; Date, Due date, Stock date; the Paid switch; Document
// items and Payments; the totals; the note; and the footer, where Delete
// voids the bill (its stock taken back out). A posted bill can't be edited,
// so the lines are read-only. Babajee's extras: the CGST/SGST/IGST split
// under the totals, why GST can't be claimed, and a "For the GST return"
// tab (in GSTR-2B and its month). Payments keeps the day it was paid to the
// supplier. Same data and saves as the ordinary bill page. Print, Print
// preview and Save as PDF give an A4 purchase document (print/docs.ts
// billSheet): the company and the supplier, the bill's number and dates, the
// lines with their tax, the GST split and the totals.
type Flags = { in_2b: boolean; in_2b_month: string | null; paid_on: string | null };
type Tab = "items" | "payments" | "gst";
const money = (n: number) => formatPrice(n, { paise: true });

export default function AroniumPurchaseBill() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [r, setR] = useState<Receipt | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(params.get("void") === "1");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("items");
  const [flags, setFlags] = useState<{ id: string; f: Flags } | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const menu = useArMenu();
  const [company, setCompany] = useState<Company | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    getSettings().then((st) => setCompany(companyOf(st)), () => {});
    listSuppliers().then((list) => setPhones(Object.fromEntries(list.map((x) => [x.id, x.phone]))), () => {});
  }, []);

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
  useEffect(() => {
    let live = true;
    if (id)
      getReceiptFlags(id).then(
        (x) => live && setFlags({ id, f: x }),
        () => live && setFlags({ id, f: { in_2b: false, in_2b_month: null, paid_on: null } }),
      );
    return () => {
      live = false;
    };
  }, [id]);
  useArKeys({ refresh: () => void load(), del: () => r?.status === "posted" && setAsking(true) });

  const f = flags?.id === id ? flags.f : null;
  const paidText = paid ?? f?.paid_on ?? "";

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
  async function saveFlags(next: Flags) {
    setBusy(true);
    try {
      await setReceiptFlags(id, next);
      setFlags({ id, f: next });
      setPaid(null);
      toast("Saved");
    } catch (e) {
      toastError(e);
      setPaid(null);
    }
    setBusy(false);
  }

  if (r === undefined && id)
    return (
      <div className="arx">
        <DocStrip listHref="/admin/inventory/purchases" tab="…" closeHref="/admin/inventory/purchases" />
        <p className="arx-dim">Loading.</p>
      </div>
    );
  if (!r)
    return (
      <div className="arx">
        <DocStrip listHref="/admin/inventory/purchases" tab="Not found" closeHref="/admin/inventory/purchases" />
        {err && <p className="adm-err">{err}</p>}
        <p className="arx-dim">
          Bill not found. <Link href="/admin/inventory/purchases">Back to Purchases</Link>
        </p>
      </div>
    );

  const void_ = r.status === "void";
  const sum = (k: "cgst" | "sgst" | "igst" | "gst") => r.lines.reduce((a, l) => a + Number(l[k]), 0);
  const taxable = r.lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price), 0);
  const gst = sum("gst");
  const unclaimable = r.lines.some((l) => !l.claimable);
  const unsplit = Math.round((gst - sum("cgst") - sum("sgst") - sum("igst")) * 100) / 100;
  const why =
    r.kind === "opening"
      ? "It's opening stock, so its GST can't be claimed."
      : r.kind === "quick"
        ? "It was added without a supplier bill, so its GST can't be claimed."
        : !r.supplier_gstin
          ? "The supplier has no GSTIN, so the GST on this bill can't be claimed."
          : "Some of the GST on this can't be claimed.";
  const title = r.kind === "opening" ? "Opening stock" : r.kind === "quick" ? "Stock added (no bill)" : r.bill_no || "(no number)";
  const items = r.lines.reduce((a, l) => a + l.qty, 0);
  const isBill = r.kind === "bill" && !void_;
  const month = f ? (f.in_2b_month ?? r.bill_date).slice(0, 7) : "";
  const doc = () => billSheet(r, { company, paidOn: f?.paid_on ?? null, inTwoB: f?.in_2b, supplierPhone: r.supplier_id ? phones[r.supplier_id] : undefined });
  const print = () => printSheets([doc()]);

  return (
    <div className="arx">
      <DocStrip listHref="/admin/inventory/purchases" tab={title} closeHref="/admin/inventory/purchases" />
      {err && <p className="adm-err">{err}</p>}
      {void_ && (
        <div className="arx-info is-bad">
          <p>
            <b>Voided</b>
            {r.voided_at ? ` ${when(r.voided_at)}` : ""}. Its stock was taken back out, and its GST no longer counts.
          </p>
        </div>
      )}
      <DocHead>
        <HF label="Number">
          <HV>{r.kind === "bill" ? `100 - Purchase` : title}</HV>
        </HF>
        <HF label="External document">
          <HV muted={r.kind !== "bill"}>{r.kind === "bill" ? r.bill_no || "(no number)" : "No bill"}</HV>
        </HF>
        <HF label="Supplier" wide>
          <HV muted={!r.supplier}>
            {r.supplier || "No supplier"}
            {r.supplier_gstin && <small className="arx-sub">{r.supplier_gstin}</small>}
          </HV>
        </HF>
        <HF label="Date">
          <HV>{dmy(r.bill_date)}</HV>
        </HF>
        <HF label="Due date">
          <HV muted>Not kept</HV>
        </HF>
        <HF label="Stock date">
          <HV>{dmyTime(r.created_at)}</HV>
        </HF>
        <div className="arx-hcell">
          <PaidSwitch on={!!f?.paid_on} disabled={!isBill || busy} onClick={() => setTab("payments")} title={f?.paid_on ? `Paid to the supplier on ${dmy(f.paid_on)}` : "Set the day it was paid under Payments"} />
          <span className="arx-sub">{f?.paid_on ? `Paid ${dmy(f.paid_on)}` : r.kind === "bill" ? "Not paid yet" : ""}</span>
        </div>
        <div className="arx-hcell">
          <span className={`arx-flag ${void_ ? "" : "is-off"}`}>{void_ ? "Voided" : "Posted"}</span>
          <span className="arx-sub">posted {when(r.created_at)}</span>
        </div>
      </DocHead>

      <DocTabs<Tab>
        tabs={[["items", "Document items"], ["payments", "Payments"], ...(isBill ? ([["gst", "For the GST return"]] as const) : [])]}
        on={tab}
        onPick={setTab}
      />

      {tab === "items" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "edit", label: "Edit", disabled: true, title: "A posted bill can't be changed: void it and post it again" },
                { icon: "clear", label: "Delete", disabled: true, title: "A posted bill can't be changed: void it and post it again" },
              ]}
            >
              <span className="arx-sub">
                {items} item{items === 1 ? "" : "s"}
              </span>
            </MiniBar>
            <div
              className="aro-grid"
              onContextMenu={(e) =>
                menu.open(
                  e,
                  menuOf([{ label: "Edit", disabled: true }], [{ label: "Delete", key: "Del", disabled: true }]),
                )
              }
            >
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Unit of measure</th>
                    <th className="r">Quantity</th>
                    <th className="r">Price before tax</th>
                    <th className="r">Tax</th>
                    <th className="r">Price</th>
                    <th className="r">Discount</th>
                    <th className="r">Total before tax</th>
                    <th className="r">Total</th>
                    <th>GST claim</th>
                  </tr>
                </thead>
                <tbody>
                  {r.lines.map((l, n) => (
                    <tr key={l.id} className={`${l.id === sel ? "is-sel" : ""} ${void_ ? "is-struck" : ""}`} onClick={() => setSel(l.id)} onContextMenu={() => setSel(l.id)}>
                      <td>{n + 1}</td>
                      <td />
                      <td>
                        {l.product}
                        {l.option ? `, ${l.option}` : ""}
                      </td>
                      <td>pcs</td>
                      <td className="r">{l.qty}</td>
                      <td className="r">{money(l.unit_price)}</td>
                      <td className="r">{l.gst_rate}%</td>
                      <td className="r">{money(paisa(l.unit_price * (1 + l.gst_rate / 100)))}</td>
                      <td className="r">0.00</td>
                      <td className="r">{money(l.qty * l.unit_price)}</td>
                      <td className="r">{money(paisa(l.qty * l.unit_price + Number(l.gst)))}</td>
                      <td>
                        {l.claimable ? (
                          "✓"
                        ) : (
                          <span className="arx-sub">{r.kind === "opening" ? "Opening stock: " : r.kind === "quick" ? "No supplier bill: " : !r.supplier_gstin ? "Supplier has no GSTIN: " : ""}can&apos;t be claimed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {menu.node}
            </div>
            <DocTotals
              rows={[
                [`Total before tax (${items} item${items === 1 ? "" : "s"}):`, money(taxable)],
                ["Tax:", money(gst)],
                ["of which CGST:", money(sum("cgst")), "is-muted"],
                ["of which SGST:", money(sum("sgst")), "is-muted"],
                ["of which IGST:", money(sum("igst")), "is-muted"],
                unsplit !== 0 && ["of which not split:", money(unsplit), "is-muted"],
              ]}
              total={money(taxable + gst)}
            >
              {unclaimable && <span>{why}</span>}
            </DocTotals>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "add", label: "New", bordered: true, disabled: !isBill || !f || !!f.paid_on || busy, onClick: () => setPaid(new Date().toLocaleDateString("en-CA")) },
                { icon: "edit", label: "Edit", disabled: !isBill || !f?.paid_on, onClick: () => document.getElementById("pb-paid")?.focus() },
                { icon: "clear", label: "Delete", disabled: !isBill || !f?.paid_on || busy, onClick: () => f && void saveFlags({ ...f, paid_on: null }) },
              ]}
            />
            <div className="arx-cards">
              <section className="arx-card">
                <h3>Paid to supplier on</h3>
                {isBill && f ? (
                  <>
                    <input
                      id="pb-paid"
                      className="arx-input"
                      type="date"
                      min={r.bill_date}
                      value={paidText}
                      disabled={busy}
                      onChange={(e) => setPaid(e.target.value)}
                      onBlur={() => paidText !== (f.paid_on ?? "") && void saveFlags({ ...f, paid_on: paidText || null })}
                    />
                    <p className="arx-sub">ITC on a bill still unpaid 180 days after its date has to be reversed.</p>
                  </>
                ) : (
                  <p className="arx-sub">{void_ ? "A voided bill isn't paid." : r.kind === "bill" ? "Loading." : "Opening stock and stock added without a bill have no supplier payment."}</p>
                )}
              </section>
            </div>
            <DocTotals rows={[["Document total:", money(taxable + gst)]]} totalLabel="Payments total:" total={money(f?.paid_on ? taxable + gst : 0)} />
          </div>
        </div>
      )}

      {tab === "gst" && isBill && f && (
        <div className="arx-cards">
          <section className="arx-card">
            <h3>For the GST return</h3>
            <label className="arx-row">
              <input type="checkbox" checked={f.in_2b} disabled={busy} onChange={(e) => void saveFlags({ ...f, in_2b: e.target.checked, in_2b_month: e.target.checked ? `${month}-01` : null })} />
              <span>
                Appears in GSTR-2B
                <span className="arx-sub">Tick once the supplier&apos;s filing shows this bill. Only ticked bills count as input tax credit.</span>
              </span>
            </label>
            {f.in_2b && (
              <label className="arx-hf">
                <span>In the GSTR-2B for</span>
                <input className="adm-input" type="month" value={month} disabled={busy} onChange={(e) => e.target.value && void saveFlags({ ...f, in_2b_month: `${e.target.value}-01` })} />
              </label>
            )}
            {f.in_2b && <p className="arx-sub">The ITC is claimed in that month&apos;s GSTR-3B.</p>}
          </section>
        </div>
      )}

      {tab === "items" && <DocNotes internal={<p className="arx-note-ro">{r.notes || ""}</p>} note={<p className="arx-note-ro arx-dim">A bill keeps one note: Internal note.</p>} />}

      <DocFooter
        del={{ label: void_ ? "Voided" : "Delete", disabled: void_ || busy, onClick: () => setAsking(true), title: "Void the bill: its stock is taken back out" }}
        pdf={{ onClick: print, title: "Pick “Save as PDF” as the printer" }}
        preview={{ onClick: () => setPreview(true) }}
        print={{ onClick: print }}
        save={{ disabled: true, title: "A posted bill is saved; there's nothing to change" }}
        saveMenu={menuOf([{ label: "Void bill", disabled: void_ || busy, onClick: () => setAsking(true) }])}
      />

      {preview && <PreviewLayer title={title} docs={[doc()]} onClose={() => setPreview(false)} />}

      <Band open={asking && !void_} title="Void this bill? Its stock will be reversed." ok={busy ? "Voiding" : "Yes, void it"} okDanger busy={busy} onCancel={() => setAsking(false)} onOk={() => void doVoid()}>
        <p>
          The {items} item{items === 1 ? "" : "s"} on it are taken back out of stock, and its GST stops counting. The bill stays here, marked as voided.
        </p>
      </Band>
    </div>
  );
}
