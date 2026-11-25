"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Pick } from "@/components/admin/OrderForms";
import { toast, toastError } from "@/components/admin/Toaster";
import { money } from "@/components/admin/ui";
import { listCategories, listProducts } from "@/lib/admin-data";
import { STATES } from "@/lib/addresses";
import { round2 as r2 } from "@/lib/currency";
import { bill, gstLabel } from "@/lib/gst";
import { createOrder, customerAccount, customerAddresses, errText, getSettings, listCustomers, type Customer, type CustomerAddress, type StoreSettings } from "@/lib/orders-db";
import { menuOf, useArMenu } from "./aronium-kit";
import { DocFooter, DocHead, DocNotes, DocStrip, DocTabs, DocTotals, dmy, dmyTime, HF, HV, MiniBar, PaidSwitch, ProductTree, type PickRow } from "./aronium-docs";

// A new order in the Aronium-style design, as Aronium's new Sales document
// (200 - Sales): the header (Number given on save, Customer with a search,
// Date, the Paid switch for payment already received), Document items with
// the product picker on the left (search by name, barcode or code, or the
// Products tree by category) and the lines on the right, the totals, the
// note, and Save. Babajee needs more than Aronium for a sale it delivers:
// the customer's contact and delivery address and a business buyer's GSTIN,
// on their own tabs. Same rules and save as the ordinary New order page.
type Line = Pick & { qty: number; typed: string };
type Addr = { line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; latitude: number | null; longitude: number | null };
type Tab = "items" | "payments" | "delivery" | "gstin";
const NO_ADDR: Addr = { line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", latitude: null, longitude: null };
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export default function AroniumNewSale() {
  const router = useRouter();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [picks, setPicks] = useState<Map<string, Pick> | null>(null);
  const [rows, setRows] = useState<PickRow[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [ship, setShip] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [who, setWho] = useState<Customer | null>(null);
  const [find, setFind] = useState("");
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [saved, setSaved] = useState<CustomerAddress[]>([]);
  const [addr, setAddr] = useState<Addr>(NO_ADDR);
  const [notes, setNotes] = useState("");
  const [paid, setPaid] = useState(false);
  const [gstin, setGstin] = useState("");
  const gstinOk = gstin === "" || GSTIN_RE.test(gstin);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("items");
  const [now] = useState(() => new Date().toISOString());
  const menu = useArMenu();

  const loadProducts = () =>
    Promise.all([listProducts(), listCategories()])
      .then(([ps, cats]) => {
        const cat = new Map(cats.map((c) => [c.id, c.name]));
        const m = new Map<string, Pick>();
        const out: PickRow[] = [];
        for (const p of ps)
          for (const v of p.variants) {
            const label = v.label === "Default" ? "" : v.label;
            m.set(v.id, { variant: v.id, name: p.name, label, price: v.price, stock: v.track_stock ? v.stock_qty : null, gst: p.gst_rate, cess: p.cess_rate ?? 0 });
            out.push({ key: v.id, group: cat.get(p.category_id) ?? p.category_name ?? "Products", name: p.name, label, code: v.sku, barcode: v.barcode, note: v.price > 0 ? money(v.price) : "no price" });
          }
        setPicks(m);
        setRows(out);
      })
      .catch((e) => (setErr(errText(e)), setRows([])));

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => setErr(errText(e)));
    void loadProducts();
  }, []);

  useEffect(() => {
    if (!find || customers) return;
    listCustomers()
      .then(setCustomers)
      .catch((e) => setErr(errText(e)));
  }, [find, customers]);

  const matches = useMemo(() => {
    const w = find.trim().toLowerCase();
    const d = w.replace(/\D/g, "");
    if (!w || !customers) return [];
    return customers.filter((c) => `${c.full_name} ${c.email}`.toLowerCase().includes(w) || (d.length >= 3 && c.phone.replace(/\D/g, "").includes(d))).slice(0, 6);
  }, [find, customers]);

  function applyAddress(a: CustomerAddress) {
    setAddr({ line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode, latitude: a.latitude, longitude: a.longitude });
    if (a.recipient_name || a.phone) setContact((c) => ({ ...c, name: a.recipient_name || c.name, phone: a.phone || c.phone }));
  }
  function pickCustomer(c: Customer) {
    setWho(c);
    setFind("");
    setContact({ name: c.full_name, phone: c.phone, email: c.email });
    customerAddresses(c.id)
      .then((as) => {
        setSaved(as);
        if (as[0]) applyAddress(as[0]);
      })
      .catch(() => setSaved([]));
    customerAccount(c.id)
      .then((a) => setGstin(a?.customer_type === "business" && a.gstin ? a.gstin.toUpperCase() : ""))
      .catch(() => {});
  }
  // from a customer's page (?customer=id): that customer, already picked
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("customer");
    if (!id) return;
    listCustomers()
      .then((all) => {
        setCustomers(all);
        const c = all.find((x) => x.id === id);
        if (c) pickCustomer(c);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function clearCustomer() {
    setWho(null);
    setSaved([]);
    setGstin("");
    setContact({ name: "", phone: "", email: "" });
    setAddr(NO_ADDR);
  }

  function add(key: string) {
    const p = picks?.get(key);
    if (!p) return;
    setLines((ls) => {
      const same = ls.find((l) => l.variant === p.variant);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...ls, { ...p, qty: 1, typed: "" }];
    });
    setSel(p.variant);
  }
  const patch = (v: string, p: Partial<Line>) => setLines((ls) => ls.map((x) => (x.variant === v ? { ...x, ...p } : x)));
  const remove = (v: string | null) => v && (setLines((ls) => ls.filter((x) => x.variant !== v)), setSel(null));

  const priceOf = (l: Line) => (l.typed.trim() !== "" ? Number(l.typed) : l.price);
  const live = lines.filter((l) => l.qty > 0);
  const sub = r2(live.reduce((n, l) => n + priceOf(l) * l.qty, 0));
  const autoShip = settings ? (settings.free_shipping_over != null && sub >= settings.free_shipping_over ? 0 : settings.shipping) : 0;
  const shipping = ship == null ? autoShip : Number(ship) || 0;
  const total = settings ? bill(live.map((l) => ({ gross: priceOf(l) * l.qty, rate: l.gst ?? settings.gst_rate, cess: settings.cess_enabled ? l.cess : 0 })), shipping, settings.gst_inclusive) : null;
  const problem = !live.length
    ? "Add at least one item."
    : live.some((l) => !(priceOf(l) > 0))
      ? "Type a price for every item without one."
      : !contact.name.trim() || !contact.phone.trim()
        ? "Add the customer's name and phone number (Customer & delivery)."
        : !addr.line1.trim() || !addr.city.trim() || !addr.state || !addr.pincode.trim()
          ? "Add a full delivery address (Customer & delivery)."
          : !gstinOk
            ? "The buyer's GSTIN doesn't look right."
            : "";

  async function create(asPaid = paid) {
    if (problem || !settings || !gstinOk) return;
    setBusy(true);
    setErr("");
    try {
      const o = await createOrder({
        customer: who?.id ?? null,
        contact,
        address: addr,
        lines: live.map((l) => ({ variant: l.variant, qty: l.qty, ...(l.typed.trim() !== "" ? { price: Number(l.typed) } : {}) })),
        shipping: ship == null ? null : shipping,
        notes,
        paid: asPaid,
        gstin,
      });
      toast(`Order ${o.number} created${asPaid ? " as paid" : ""}`);
      router.push(`/admin/orders/view?id=${o.id}`);
    } catch (e) {
      setErr(errText(e));
      toastError(e);
      setBusy(false);
    }
  }

  const inclusive = !!settings?.gst_inclusive;
  const shown = lines.map((l, n) => {
    const rate = l.gst ?? settings?.gst_rate ?? 0;
    const unit = priceOf(l) || 0;
    const pbt = inclusive ? unit / (1 + rate / 100) : unit;
    const price = inclusive ? unit : unit * (1 + rate / 100);
    return { l, n: n + 1, rate, pbt: r2(pbt), price: r2(price), totalBefore: r2(pbt * l.qty), total: r2(price * l.qty) };
  });
  const yy = now.slice(2, 4);
  const count = live.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="arx">
      <DocStrip listHref="/admin/orders" tab={`${yy}-200-??????`} closeHref="/admin/orders" />
      {err && <p className="adm-err">{err}</p>}
      <DocHead>
        <HF label="Number">
          <HV muted>{yy}-200-?????? (given on save)</HV>
        </HF>
        <HF label="External document">
          <HV muted>Invoice is issued once paid</HV>
        </HF>
        <HF label="Customer" wide>
          <span className="arx-find">
            {who ? (
              <HV>
                {who.full_name || who.email}
                <small className="arx-sub">
                  {who.orders} earlier order{who.orders === 1 ? "" : "s"}
                </small>
                <button type="button" className="arx-link" onClick={clearCustomer} title="Walk-in: type the details on Customer & delivery">
                  ↻ Change
                </button>
              </HV>
            ) : (
              <input className="adm-input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Walk-in customer · find by name, phone or email" aria-label="Find a customer" />
            )}
            {!who && find.trim() && (
              <ul>
                {!customers ? (
                  <li className="arx-dim">Loading customers…</li>
                ) : matches.length === 0 ? (
                  <li className="arx-dim">No customer matches. Fill in the details on Customer &amp; delivery.</li>
                ) : (
                  matches.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => pickCustomer(c)}>
                        <span>{c.full_name || c.email}</span>
                        <small className="arx-sub">{c.phone || c.email}</small>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </span>
        </HF>
        <HF label="Date">
          <HV>{dmy(now)}</HV>
        </HF>
        <HF label="Due date">
          <HV muted>{paid ? dmy(now) : "On contact"}</HV>
        </HF>
        <HF label="Stock date">
          <HV>{dmyTime(now)}</HV>
        </HF>
        <div className="arx-hcell">
          <PaidSwitch on={paid} onClick={() => setPaid((p) => !p)} title="Payment already received" />
          <span className="arx-sub">{paid ? "Payment already received" : "Unpaid: the customer is contacted to pay"}</span>
        </div>
      </DocHead>

      <DocTabs<Tab>
        tabs={[
          ["items", "Document items"],
          ["payments", "Payments"],
          ["delivery", "Customer & delivery", !contact.name.trim() || !addr.line1.trim() ? 1 : undefined],
          ["gstin", "Business buyer (GSTIN)", gstinOk ? undefined : 1],
        ]}
        on={tab}
        onPick={setTab}
      />

      {tab === "items" && (
        <div className="arx-body">
          <ProductTree rows={rows} onPick={add} onRefresh={() => void loadProducts()} />
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "edit", label: "Edit", disabled: !sel, onClick: () => sel && document.getElementById(`ns-qty-${sel}`)?.focus() },
                { icon: "clear", label: "Delete", disabled: !sel, onClick: () => remove(sel) },
              ]}
            >
              <span className="arx-sub">
                {count} item{count === 1 ? "" : "s"}
              </span>
            </MiniBar>
            <div
              className="aro-grid"
              onKeyDown={(e) => e.key === "Delete" && !(e.target as HTMLElement).closest("input, select") && remove(sel)}
              onContextMenu={(e) =>
                menu.open(
                  e,
                  menuOf([{ label: "Edit", disabled: !sel, onClick: () => sel && document.getElementById(`ns-qty-${sel}`)?.focus() }], [{ label: "Delete", key: "Del", disabled: !sel, onClick: () => remove(sel) }]),
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
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ l, n, rate, pbt, price, totalBefore, total: t }) => (
                    <tr key={l.variant} tabIndex={0} className={`${l.variant === sel ? "is-sel" : ""} ${l.qty === 0 ? "is-back" : ""}`} onClick={() => setSel(l.variant)} onContextMenu={() => setSel(l.variant)}>
                      <td>{n}</td>
                      <td>{rows?.find((r) => r.key === l.variant)?.code ?? ""}</td>
                      <td>
                        {l.name}
                        {l.label && <span className="adm-muted"> · {l.label}</span>}
                        <span className="arx-sub">
                          {l.stock != null && `${l.stock} in stock · `}
                          {l.qty === 0 ? "will be left off" : l.price > 0 ? `${money(l.price)} on the shelf` : "no shelf price"}
                        </span>
                      </td>
                      <td>pcs</td>
                      <td className="r">
                        <input
                          id={`ns-qty-${l.variant}`}
                          className="arx-cell-in"
                          type="number"
                          min={0}
                          max={l.stock ?? 99}
                          value={l.qty}
                          aria-label={`Quantity of ${l.name}`}
                          onChange={(e) => patch(l.variant, { qty: Math.max(0, Math.min(l.stock ?? 99, Math.floor(Number(e.target.value) || 0))) })}
                        />
                      </td>
                      <td className="r">{money(pbt)}</td>
                      <td className="r">{rate}%</td>
                      <td className="r">
                        <input
                          className="arx-cell-in"
                          inputMode="decimal"
                          value={l.typed}
                          placeholder={l.price > 0 ? String(l.price) : "Price"}
                          aria-label={`Price each for ${l.name}`}
                          aria-invalid={l.qty > 0 && !(priceOf(l) > 0)}
                          title={`Shelf price${inclusive ? " (includes GST)" : " (before GST)"}; type another for this order`}
                          onChange={(e) => patch(l.variant, { typed: e.target.value.replace(/[^\d.]/g, "") })}
                        />
                        <span className="arx-sub">{inclusive ? "" : `${money(price)} with tax`}</span>
                      </td>
                      <td className="r">0.00</td>
                      <td className="r">{money(totalBefore)}</td>
                      <td className="r">{money(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!lines.length && <p className="aro-none">Pick products on the left (or search and press Enter). The shelf price is used unless you type another.</p>}
              {menu.node}
            </div>
            <DocTotals
              rows={[
                ["Items:", money(sub), "is-muted"],
                [
                  "Delivery:",
                  <input
                    key="ship"
                    className="arx-cell-in"
                    inputMode="decimal"
                    aria-label="Shipping charges"
                    title={ship == null && settings?.free_shipping_over != null ? `Follows Settings: free on ${money(settings.free_shipping_over)} or more. Type to change it for this order.` : "Type to change it for this order"}
                    value={ship ?? String(autoShip)}
                    onChange={(e) => setShip(e.target.value.replace(/[^\d.]/g, ""))}
                  />,
                ],
                ["Total before tax:", money(r2((total?.total ?? 0) - (total?.tax ?? 0) - (total?.cess ?? 0)))],
                [`Tax${total && total.tax > 0 ? ` (${gstLabel(inclusive, total.rate)})` : ""}:`, money(total?.tax ?? 0)],
                total && total.cess > 0 && [`${inclusive ? "Includes cess" : "Cess"}:`, money(total.cess)],
              ]}
              total={money(total?.total ?? 0)}
            >
              <select className="arx-input" disabled aria-label="Apply discount" title="Babajee orders carry no discount">
                <option>Apply discount after tax</option>
              </select>
              <select className="arx-input" disabled aria-label="Discount type" title="Babajee orders carry no discount">
                <option>Discount percent</option>
              </select>
              <span className="arx-input" aria-disabled="true">
                0 %
              </span>
            </DocTotals>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "add", label: "New", bordered: true, disabled: paid, onClick: () => setPaid(true), title: "Payment already received" },
                { icon: "edit", label: "Edit", disabled: true },
                { icon: "clear", label: "Delete", disabled: !paid, onClick: () => setPaid(false) },
              ]}
            />
            <div className="aro-grid">
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Payment type</th>
                    <th>Date</th>
                    <th className="r">Amount</th>
                    <th className="r">Rounding adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {paid && (
                    <tr>
                      <td>1</td>
                      <td>Paid</td>
                      <td>Recorded on the order afterwards</td>
                      <td>{dmy(now)}</td>
                      <td className="r">{money(total?.total ?? 0)}</td>
                      <td className="r">0.00</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {!paid && <p className="aro-none">Unpaid. New marks the payment as already received; otherwise the order waits for payment.</p>}
            </div>
            <DocTotals rows={[["Document total:", money(total?.total ?? 0)]]} totalLabel="Payments total:" total={money(paid ? (total?.total ?? 0) : 0)} />
          </div>
        </div>
      )}

      {tab === "delivery" && (
        <div className="arx-cards">
          <section className="arx-card">
            <h3>Customer</h3>
            <div className="arx-fields">
              <label className="arx-hf is-wide">
                <span>Name</span>
                <input className="adm-input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} aria-invalid={!contact.name.trim()} />
              </label>
              <label className="arx-hf">
                <span>Phone number</span>
                <input className="adm-input" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} aria-invalid={!contact.phone.trim()} />
              </label>
              <label className="arx-hf is-wide">
                <span>Email (optional)</span>
                <input className="adm-input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </label>
            </div>
          </section>
          <section className="arx-card">
            <h3>Deliver to</h3>
            {saved.length > 0 && (
              <div className="arx-row" role="group" aria-label="Saved addresses">
                {saved.map((a) => (
                  <button key={a.id} type="button" className={`arx-minib ${addr.line1 === a.line1 && addr.pincode === a.pincode ? "is-b" : ""}`} onClick={() => applyAddress(a)}>
                    {a.label || "Address"} · {a.city}
                  </button>
                ))}
              </div>
            )}
            <div className="arx-fields">
              <label className="arx-hf is-wide">
                <span>Street name</span>
                <input className="adm-input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value, latitude: null, longitude: null })} />
              </label>
              <label className="arx-hf is-wide">
                <span>Additional street name</span>
                <input className="adm-input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
              </label>
              <label className="arx-hf is-wide">
                <span>Landmark</span>
                <input className="adm-input" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
              </label>
              <label className="arx-hf">
                <span>City</span>
                <input className="adm-input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              </label>
              <label className="arx-hf">
                <span>Postal code</span>
                <input className="adm-input" inputMode="numeric" value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value, latitude: null, longitude: null })} />
              </label>
              <label className="arx-hf is-wide">
                <span>State / Province</span>
                <select className="adm-input" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })}>
                  <option value="">Pick a state</option>
                  {STATES.map((st) => (
                    <option key={st}>{st}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>
      )}

      {tab === "gstin" && (
        <div className="arx-cards">
          <section className="arx-card">
            <h3>Buyer&apos;s GSTIN (B2B)</h3>
            <label className="arx-hf">
              <span>Tax number</span>
              <input className="adm-input" maxLength={15} placeholder="Only for a business buyer" aria-label="Buyer's GSTIN" aria-invalid={!gstinOk} value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().trim())} />
            </label>
            {!gstinOk && <p className="arx-red">That GSTIN doesn&apos;t look right: it&apos;s 15 characters, like 27ABCDE1234F1Z5.</p>}
            <p className="arx-sub">Printed on the invoice and reported as a B2B sale. It can&apos;t change once the invoice is issued (on payment).</p>
          </section>
        </div>
      )}

      {tab === "items" && (
        <DocNotes
          internal={<p className="arx-note-ro arx-dim">Staff comments are posted on the order once it&apos;s saved.</p>}
          note={<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember: how they paid, when to deliver…" aria-label="Order notes" />}
        />
      )}

      <DocFooter
        del={{ label: "Delete", title: "Nothing saved yet" }}
        pdf={{ disabled: true, title: "The invoice can be printed once the order is saved and paid" }}
        preview={{ disabled: true }}
        print={{ disabled: true }}
        save={{ label: busy ? "Creating" : "Save", disabled: busy || !!problem || !settings, onClick: () => void create(), title: problem || (total?.total ? `Create order · ${money(total.total)}` : undefined) }}
        saveMenu={menuOf(
          [
            { label: "Save", onClick: () => void create(), disabled: busy || !!problem || !settings },
            { label: "Save as paid", onClick: () => (setPaid(true), void create(true)), disabled: busy || !!problem || !settings || paid },
          ],
          [{ label: "Clear the lines", onClick: () => (setLines([]), setSel(null)), disabled: !lines.length }],
        )}
      >
        {problem && (live.length > 0 || contact.name) && <span className="arx-sub">{problem}</span>}
      </DocFooter>
    </div>
  );
}
