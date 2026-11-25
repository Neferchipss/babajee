"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { getCounterSettings, getCreditRules, NEEDS_0086, saveCounterSettings, saveCreditRules, type CounterSettings as Rules, type CreditRules, type ReceiptSize } from "@/lib/counter";
import { errText, getSettings } from "@/lib/orders-db";

// Settings › Counter (till): how the till at the shop's counter works. Every
// choice is the shop's: which ways to pay it offers, whether there's a cash
// drawer to count, discounts and price changes, selling with no stock, and
// the printed receipt. Saved on its own, like the topics above it. Shown on
// the settings page (both designs) and from the till's ≡ menu.
export default function CounterSettings({ editable, onSaved }: { editable: boolean; onSaved?: (r: Rules) => void }) {
  const [r, setR] = useState<Rules | null>(null);
  const [was, setWas] = useState("");
  const [shopMethods, setShopMethods] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);
  const [methods, setMethods] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([getCounterSettings(), getSettings()]).then(
      ([c, s]) => {
        setShopMethods(s.payment_methods);
        if (!c) return setMissing(true);
        setR(c);
        setMethods(c.methods.join(", "));
        setWas(JSON.stringify({ ...c, methods: c.methods.join(", ") }));
      },
      (e) => setErr(errText(e)),
    );
  }, []);

  if (missing)
    return (
      <section className="adm-card">
        <h2 style={{ margin: 0 }}>Counter (till)</h2>
        <p className="adm-muted">The till needs database update 0085 before it can be set up.</p>
      </section>
    );
  if (!r) return err ? <p className="adm-err">{err}</p> : <p className="adm-muted">Loading the till&apos;s settings…</p>;

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setR({ ...r, [k]: v });
  const dirty = JSON.stringify({ ...r, methods }) !== was;
  const list = methods
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const shown = list.length ? list : shopMethods;
  const problem =
    list.length > 12
      ? "Twelve ways to pay at most."
      : !r.walkinName.trim()
        ? "Give walk-in customers a name, like Walk-in customer."
        : r.maxDiscount < 0 || r.maxDiscount > 100
          ? "The biggest discount is a percent from 0 to 100."
          : !shown.some((m) => m.toLowerCase() === r.cashMethod.trim().toLowerCase()) && r.cashMethod.trim()
            ? `"${r.cashMethod}" isn't one of the till's ways to pay, so the till can't give change.`
            : "";

  async function save() {
    if (!r || problem) return;
    setBusy(true);
    setErr("");
    const next = { ...r, methods: list, cashMethod: r.cashMethod.trim(), walkinName: r.walkinName.trim(), receiptHeader: r.receiptHeader.trim(), receiptFooter: r.receiptFooter.trim() };
    try {
      await saveCounterSettings(next);
      setR(next);
      setWas(JSON.stringify({ ...next, methods }));
      toast("Counter settings saved");
      onSaved?.(next);
    } catch (e) {
      setErr(errText(e));
      toastError(e);
    }
    setBusy(false);
  }

  const tick = (k: "drawer" | "discounts" | "priceChange" | "negativeStock" | "autoPrint" | "receiptGstin", label: string, note: string) => (
    <label className="adm-check" style={{ alignItems: "flex-start" }}>
      <input type="checkbox" checked={r[k]} disabled={!editable} onChange={(e) => set(k, e.target.checked)} />
      <span>
        {label}
        <span className="adm-muted adm-small" style={{ display: "block" }}>
          {note}
        </span>
      </span>
    </label>
  );

  return (
    <section className="adm-card" style={{ display: "grid", gap: 16 }}>
      <h2 id="set-counter" style={{ margin: 0 }}>
        Counter (till)
      </h2>
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        For sales rung up at the shop&apos;s counter (Admin › Till). A counter sale is paid and handed over on the spot: stock comes off and its GST invoice is issued like any paid order. Online orders don&apos;t change.
      </p>

      <fieldset disabled={!editable} style={{ display: "grid", gap: 16, border: 0, padding: 0, margin: 0 }}>
        <h3 style={{ margin: 0 }}>Paying</h3>
        <label className="adm-label">
          Ways to pay at the till, in order
          <input className="adm-input" value={methods} placeholder={shopMethods.join(", ")} onChange={(e) => setMethods(e.target.value)} />
          <span className="adm-muted adm-small">
            Separated by commas, like Cash, UPI, Card. Empty uses the shop&apos;s payment methods ({shopMethods.join(", ") || "none"}). The first three get their own buttons on the till.
          </span>
        </label>
        <label className="adm-label">
          Which of them is cash
          <input className="adm-input" value={r.cashMethod} onChange={(e) => set("cashMethod", e.target.value)} />
          <span className="adm-muted adm-small">Only cash can be paid over the total; the till works out the change. F12 pays the whole bill in it.</span>
        </label>

        <h3 style={{ margin: 0 }}>Cash drawer</h3>
        {tick("drawer", "Keep a cash drawer", "Open it with a float at the start of the day, record cash paid in and out, and count it at the end of the day (end-of-day report). While it's on, the till sells only with the drawer open.")}
        {r.drawer && (
          <label className="adm-label">
            Float to suggest when opening (₹)
            <input className="adm-input" inputMode="decimal" value={String(r.float)} onChange={(e) => set("float", Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0))} />
          </label>
        )}

        <CreditBlock editable={editable} />

        <h3 style={{ margin: 0 }}>Prices</h3>
        {tick("discounts", "Allow discounts", "Staff can take a percent or an amount off one item or the whole sale.")}
        {r.discounts && (
          <label className="adm-label">
            Biggest discount allowed (%)
            <input className="adm-input" inputMode="decimal" value={String(r.maxDiscount)} onChange={(e) => set("maxDiscount", Number(e.target.value.replace(/[^\d.]/g, "")) || 0)} />
            <span className="adm-muted adm-small">100 means no limit. Doesn&apos;t apply while typing any price is allowed.</span>
          </label>
        )}
        {tick("priceChange", "Allow typing any price", "Staff can type a different price for an item, higher or lower. Off: the till sells at the listed price (less any discount allowed above).")}
        {tick("negativeStock", "Sell items with no stock left", "For products that count stock: sell even when the count says none are left, and the count goes below zero. Off: the till stops at what's in stock.")}

        <h3 style={{ margin: 0 }}>Receipt</h3>
        {tick("autoPrint", "Print a receipt after every sale", "Opens the printer straight after payment. Off: print it from the sale's screen when the customer asks.")}
        <label className="adm-label">
          Receipt size
          <select className="adm-input" value={r.receiptSize} onChange={(e) => set("receiptSize", e.target.value as ReceiptSize)}>
            <option value="80mm">80 mm till roll</option>
            <option value="58mm">58 mm till roll</option>
            <option value="A4">A4 page</option>
          </select>
        </label>
        <label className="adm-label">
          Line at the top
          <input className="adm-input" value={r.receiptHeader} maxLength={300} placeholder="Like: Open 10 am to 10 pm, every day" onChange={(e) => set("receiptHeader", e.target.value)} />
        </label>
        <label className="adm-label">
          Line at the bottom
          <input className="adm-input" value={r.receiptFooter} maxLength={300} onChange={(e) => set("receiptFooter", e.target.value)} />
        </label>
        {tick("receiptGstin", "Print the shop's GSTIN and the GST split", "The receipt shows the shop's GSTIN and each rate's CGST and SGST.")}
        <label className="adm-label">
          Name on a sale with no customer
          <input className="adm-input" value={r.walkinName} maxLength={60} onChange={(e) => set("walkinName", e.target.value)} />
        </label>
      </fieldset>

      {(problem || err) && <p className="adm-err">{problem || err}</p>}
      {editable && (
        <div className="adm-actions">
          <button type="button" className="adm-btn pri" disabled={!dirty || !!problem || busy} onClick={() => void save()}>
            Save counter settings
          </button>
        </div>
      )}
    </section>
  );
}

// Sales on account (0086): on or off, and the shop's credit limit for
// customers without their own (set on the customer's page). Saved apart
// from the rest, so it works whether or not 0086 is applied yet.
function CreditBlock({ editable }: { editable: boolean }) {
  const [c, setC] = useState<CreditRules | null | undefined>(undefined);
  const [limit, setLimit] = useState("");
  const [was, setWas] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getCreditRules().then(
      (x) => {
        setC(x);
        const l = x?.creditLimit == null ? "" : String(x.creditLimit);
        setLimit(l);
        setWas(JSON.stringify([x?.credit, l]));
      },
      () => setC(null),
    );
  }, []);
  if (c === undefined) return null;
  if (c === null)
    return (
      <>
        <h3 style={{ margin: 0 }}>Sales on account</h3>
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          {NEEDS_0086}
        </p>
      </>
    );
  const dirty = JSON.stringify([c.credit, limit]) !== was;
  async function save() {
    if (!c) return;
    setBusy(true);
    const next = { credit: c.credit, creditLimit: limit.trim() === "" ? null : Math.max(0, Number(limit) || 0) };
    try {
      await saveCreditRules(next);
      setWas(JSON.stringify([next.credit, limit]));
      toast("Sales on account saved");
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  return (
    <>
      <h3 style={{ margin: 0 }}>Sales on account</h3>
      <label className="adm-check" style={{ alignItems: "flex-start" }}>
        <input type="checkbox" checked={c.credit} disabled={!editable} onChange={(e) => setC({ ...c, credit: e.target.checked })} />
        <span>
          Allow sales on account (credit)
          <span className="adm-muted adm-small" style={{ display: "block" }}>
            A customer with an account can pay later, all or part of a sale: the till&apos;s Payment shows On account. The GST invoice is still issued with the sale; what they owe is collected under ≡ › Credit payments.
          </span>
        </span>
      </label>
      {c.credit && (
        <label className="adm-label">
          Credit limit for each customer (₹)
          <input className="adm-input" inputMode="decimal" value={limit} placeholder="No limit" onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} />
          <span className="adm-muted adm-small">Empty: no limit. A customer&apos;s own limit, on their page, wins over this one.</span>
        </label>
      )}
      {dirty && (
        <button type="button" className="adm-btn" style={{ justifySelf: "start" }} disabled={busy || !editable} onClick={() => void save()}>
          {busy ? "Saving…" : "Save sales on account"}
        </button>
      )}
    </>
  );
}
