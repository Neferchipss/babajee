"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/components/admin/ui";
import { listProducts, type AdminProduct } from "@/lib/admin-data";
import { STATES } from "@/lib/addresses";
import { bill } from "@/lib/gst";
import { refundsOf, type EditAddress, type EditContact, type EditLine, type Order } from "@/lib/orders-db";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));

export function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="ofm-step" role="group" aria-label={label}>
      <button type="button" aria-label="Fewer" disabled={value <= 0} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

// ---------------------------------------------------------------- refund / return

export type RefundInput = { lines: { item: string; qty: number }[]; shipping: number; amount: number; restock: boolean; returned: boolean; reason: string };

// Pick what's being refunded; the amount follows (items, their GST if it was
// added on top, and any delivery) and can be typed over for a part refund or
// goodwill. "Return" is the same form with items required and restock on.
export function RefundForm({
  order: o,
  mode,
  busy,
  onCancel,
  onSubmit,
  onEdit,
}: {
  order: Order;
  mode: "refund" | "return";
  busy: boolean;
  onCancel: () => void;
  onSubmit: (r: RefundInput) => void;
  // offered when part of the order was never paid and it can still be edited
  onEdit?: () => void;
}) {
  const done = refundsOf(o);
  const paid = o.paid_total ?? o.total;
  const left = r2(paid - done.amount);
  const shipLeft = r2(o.shipping - done.shipping);
  const items = (o.order_items ?? []).map((i) => ({ ...i, open: i.quantity - (done.byItem.get(i.id) ?? 0) })).filter((i) => i.open > 0);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [ship, setShip] = useState("");
  const [typed, setTyped] = useState<string | null>(null);
  const [restock, setRestock] = useState(mode === "return");
  const [reason, setReason] = useState("");

  const itemsValue = items.reduce((n, i) => n + (qty[i.id] ?? 0) * i.unit_price, 0);
  const picked = items.some((i) => (qty[i.id] ?? 0) > 0);
  const withGst = o.gst_inclusive ? itemsValue : itemsValue * (1 + o.gst_rate / 100);
  const full = r2(withGst + num(ship));
  // a refund only sends back money that came in: never more than is left of what was paid
  const auto = Math.min(full, left);
  const capped = full > left;
  // an edit after payment can leave part of the order never paid for
  const unpaid = r2(o.total - paid);
  const amount = typed == null ? auto : num(typed);

  const problem =
    mode === "return" && !picked
      ? "Pick the items that came back."
      : !(amount > 0)
        ? "Enter an amount to refund."
        : amount > left
          ? `Up to ${money(left)} can be refunded.`
          : num(ship) > shipLeft
            ? `Delivery refund can be up to ${money(shipLeft)}.`
            : num(ship) > amount
              ? "The amount must cover the delivery being refunded."
              : "";

  function everything() {
    setQty(Object.fromEntries(items.map((i) => [i.id, i.open])));
    setShip(shipLeft > 0 ? String(shipLeft) : "");
    setTyped(null);
  }

  return (
    <form
      method="dialog"
      className="ofm"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        onSubmit({
          lines: items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ item: i.id, qty: qty[i.id] })),
          shipping: num(ship),
          amount: r2(amount),
          restock: picked && restock,
          returned: mode === "return",
          reason,
        });
      }}
    >
      <div className="ofm-head">
        <h2>
          {mode === "return" ? "Return items from" : "Refund"} {o.order_number}
        </h2>
        <button type="button" className="adm-link" onClick={everything}>
          Select everything
        </button>
      </div>

      {unpaid > 0 && (
        <div className="ofm-diff owe">
          {money(unpaid)} of this order was never paid: it was added by an edit and not collected yet. A refund only sends back money that came in.
          {onEdit ? (
            <>
              {" "}To take that item off, edit the order instead.{" "}
              <button type="button" className="adm-link" onClick={onEdit}>
                Edit order
              </button>
            </>
          ) : (
            " It can no longer be edited, so mark the balance as settled or refund what was paid."
          )}
        </div>
      )}

      {items.length > 0 ? (
        <ul className="ofm-lines">
          {items.map((i) => (
            <li key={i.id}>
              <span>
                <strong>{i.product_name}</strong>
                {i.variant_label && <span className="adm-muted"> · {i.variant_label}</span>}
                <span className="adm-muted adm-small ofm-sub">
                  {money(i.unit_price)} each · {i.open} of {i.quantity} can be {mode === "return" ? "returned" : "refunded"}
                </span>
              </span>
              <Stepper label={i.product_name} value={qty[i.id] ?? 0} max={i.open} onChange={(n) => (setQty({ ...qty, [i.id]: n }), setTyped(null))} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          Every item has been refunded already.
        </p>
      )}

      {mode === "refund" && shipLeft > 0 && (
        <label className="adm-label">
          Refund delivery (up to {money(shipLeft)})
          <input className="adm-input" inputMode="decimal" value={ship} placeholder="0" onChange={(e) => (setShip(e.target.value.replace(/[^\d.]/g, "")), setTyped(null))} />
        </label>
      )}

      <label className="adm-label">
        Amount to refund
        <input
          className="adm-input ofm-amount"
          inputMode="decimal"
          value={typed ?? (auto ? String(auto) : "")}
          placeholder="0"
          onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))}
        />
        <span className="adm-muted adm-small">
          {typed != null && typed !== String(auto) ? (
            <>
              Typed over. The items come to {money(auto)}.{" "}
              <button type="button" className="adm-link" onClick={() => setTyped(null)}>
                Use that
              </button>
            </>
          ) : (
            <>
              {capped
                ? `These come to ${money(full)}, but only ${money(left)} of what was paid is left to refund, so the refund stops there.`
                : `${money(left)} left to refund of ${money(paid)} paid.`}
              {!o.gst_inclusive && picked ? ` Includes ${o.gst_rate}% GST on the items.` : ""}
            </>
          )}
        </span>
      </label>

      {picked && (
        <label className="adm-check">
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          Put {mode === "return" ? "the returned items" : "these items"} back in stock
        </label>
      )}

      <label className="adm-label">
        Reason (for the timeline)
        <input className="adm-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "return" ? "Damaged, wrong size, changed mind…" : "Goodwill, late delivery…"} />
      </label>

      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        This records the refund. Send the money back yourself.
        {amount >= left && left > 0 && " The order will be marked as refunded."}
      </p>
      {problem && (picked || typed != null || num(ship) > 0) && <p className="adm-err" style={{ margin: 0 }}>{problem}</p>}

      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Back
        </button>
        <button className="adm-btn bad" disabled={busy || !!problem}>
          {busy ? "Saving" : `Refund ${amount > 0 ? money(r2(amount)) : ""}`}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- product picker

export type Pick = { variant: string; name: string; label: string; price: number; stock: number | null };

let catalogue: Promise<AdminProduct[]> | null = null;

// Type a name, pick an option. The catalogue loads once, on first typing.
// Unpriced options are offered only when the caller can take a typed price.
export function ProductPicker({ onPick, unpriced = false, placeholder = "Add a product: type its name" }: { onPick: (p: Pick) => void; unpriced?: boolean; placeholder?: string }) {
  const [find, setFind] = useState("");
  const [products, setProducts] = useState<AdminProduct[] | null>(null);

  useEffect(() => {
    if (!find || products) return;
    catalogue ??= listProducts();
    catalogue.then(setProducts).catch(() => (catalogue = null));
  }, [find, products]);

  const options = useMemo(() => {
    const w = find.trim().toLowerCase();
    if (!w || !products) return [];
    const out: Pick[] = [];
    for (const p of products) {
      if (!p.name.toLowerCase().includes(w)) continue;
      for (const v of p.variants)
        if (v.price > 0 || unpriced) out.push({ variant: v.id, name: p.name, label: v.label === "Default" ? "" : v.label, price: v.price, stock: v.track_stock ? v.stock_qty : null });
      if (out.length >= 8) break;
    }
    return out.slice(0, 8);
  }, [find, products, unpriced]);

  return (
    <div className="ofm-find">
      <input className="adm-input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={placeholder} aria-label="Add a product" />
      {find.trim() && (
        <ul>
          {!products ? (
            <li className="adm-muted adm-small">Loading products…</li>
          ) : options.length === 0 ? (
            <li className="adm-muted adm-small">{unpriced ? "No product matches." : "No priced product matches."}</li>
          ) : (
            options.map((x) => (
              <li key={x.variant}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(x);
                    setFind("");
                  }}
                >
                  <span>
                    {x.name}
                    {x.label && <span className="adm-muted"> · {x.label}</span>}
                  </span>
                  <span className="adm-muted adm-small">
                    {x.price > 0 ? money(x.price) : "No price"}
                    {x.stock != null && ` · ${x.stock} in stock`}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- edit

export type EditInput = { lines: EditLine[]; shipping: number | null; contact: EditContact | null; address: EditAddress | null };

type Row = { key: string; item?: string; variant?: string; name: string; label: string; price: number; qty: number; was: number };

// Before it ships: change quantities, take items off, add items at today's
// price, change delivery, contact or address. The new total shows as you go,
// with what that means for a paid order.
export function EditForm({ order: o, busy, onCancel, onSubmit }: { order: Order; busy: boolean; onCancel: () => void; onSubmit: (e: EditInput) => void }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (o.order_items ?? []).map((i) => ({ key: i.id, item: i.id, name: i.product_name, label: i.variant_label, price: i.unit_price, qty: i.quantity, was: i.quantity })),
  );
  const [ship, setShip] = useState(String(o.shipping));
  const [who, setWho] = useState(false);
  const [contact, setContact] = useState<EditContact>({ name: o.contact_name, phone: o.contact_phone, email: o.contact_email });
  const [addr, setAddr] = useState<EditAddress>({
    line1: o.address_line1,
    line2: o.address_line2,
    landmark: o.address_landmark,
    city: o.address_city,
    state: o.address_state,
    pincode: o.address_pincode,
  });
  const sub = rows.reduce((n, r) => n + r.qty * r.price, 0);
  const now = bill(sub, num(ship), { rate: o.gst_rate, inclusive: o.gst_inclusive });
  const diff = o.paid_total == null ? 0 : r2(now.total - o.paid_total);
  const set = (key: string, qty: number) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, qty } : r)));

  function add(x: Pick) {
    setRows((rs) => {
      const same = rs.find((r) => r.variant === x.variant);
      if (same) return rs.map((r) => (r === same ? { ...r, qty: Math.min(99, r.qty + 1) } : r));
      return [...rs, { key: `n${x.variant}`, variant: x.variant, name: x.name, label: x.label, price: x.price, qty: 1, was: 0 }];
    });
  }

  const empty = !rows.some((r) => r.qty > 0);
  const badWho = who && (!contact.name.trim() || !contact.phone.trim() || !addr.line1.trim() || !addr.city.trim() || !addr.state || !addr.pincode.trim());

  return (
    <form
      method="dialog"
      className="ofm"
      onSubmit={(e) => {
        e.preventDefault();
        if (empty || badWho) return;
        const lines: EditLine[] = [];
        for (const r of rows) {
          if (r.item && r.qty !== r.was) lines.push({ item: r.item, qty: r.qty });
          if (r.variant && r.qty > 0) lines.push({ variant: r.variant, qty: r.qty });
        }
        onSubmit({ lines, shipping: num(ship) === o.shipping ? null : num(ship), contact: who ? contact : null, address: who ? addr : null });
      }}
    >
      <h2>Edit {o.order_number}</h2>

      <ul className="ofm-lines">
        {rows.map((r) => (
          <li key={r.key} className={r.qty === 0 ? "is-gone" : ""}>
            <span>
              <strong>{r.name}</strong>
              {r.label && <span className="adm-muted"> · {r.label}</span>}
              <span className="adm-muted adm-small ofm-sub">
                {money(r.price)} each
                {r.was === 0 ? " · new" : r.qty === 0 ? " · will be removed" : r.qty !== r.was ? ` · was ${r.was}` : ""}
              </span>
            </span>
            <Stepper label={r.name} value={r.qty} max={99} onChange={(n) => set(r.key, n)} />
          </li>
        ))}
      </ul>

      <ProductPicker onPick={add} />

      <label className="adm-label">
        Delivery (₹)
        <input className="adm-input" inputMode="decimal" value={ship} onChange={(e) => setShip(e.target.value.replace(/[^\d.]/g, ""))} />
      </label>

      <button type="button" className="adm-link" style={{ justifySelf: "start" }} aria-expanded={who} onClick={() => setWho(!who)}>
        {who ? "Keep the customer and address as they are" : "Change customer or address"}
      </button>
      {who && (
        <div className="ofm-who">
          <label className="adm-label">
            Name
            <input className="adm-input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          </label>
          <label className="adm-label">
            Phone
            <input className="adm-input" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          </label>
          <label className="adm-label wide">
            Email
            <input className="adm-input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          </label>
          <label className="adm-label wide">
            Address
            <input className="adm-input" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
          </label>
          <label className="adm-label wide">
            Area, street (optional)
            <input className="adm-input" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} />
          </label>
          <label className="adm-label wide">
            Landmark (optional)
            <input className="adm-input" value={addr.landmark} onChange={(e) => setAddr({ ...addr, landmark: e.target.value })} />
          </label>
          <label className="adm-label">
            City
            <input className="adm-input" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
          </label>
          <label className="adm-label">
            Pincode
            <input className="adm-input" inputMode="numeric" value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} />
          </label>
          <label className="adm-label wide">
            State
            <select className="adm-input" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })}>
              {!STATES.includes(addr.state) && <option value={addr.state}>{addr.state || "Pick a state"}</option>}
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <p className="adm-muted adm-small wide" style={{ margin: 0 }}>
            A new address drops the map pin, since it pointed at the old one.
          </p>
        </div>
      )}

      <div className="adm-kv ofm-total">
        <span>Items</span>
        <span>{money(now.sub)}</span>
        <span>Delivery</span>
        <span>{now.ship ? money(now.ship) : "Free"}</span>
        {now.tax > 0 && (
          <>
            <span>{o.gst_inclusive ? `Includes GST (${o.gst_rate}%)` : `GST (${o.gst_rate}%)`}</span>
            <span>{money(now.tax)}</span>
          </>
        )}
        <span className="tot">New total</span>
        <span className="tot">{money(now.total)}</span>
      </div>
      {o.paid_total != null && diff !== 0 && (
        <p className={`ofm-diff ${diff > 0 ? "owe" : "back"}`}>
          {diff > 0 ? `${money(diff)} more to collect from the customer.` : `${money(-diff)} to pay back to the customer.`} The order page keeps a reminder until you mark it settled.
        </p>
      )}
      {empty && <p className="adm-err" style={{ margin: 0 }}>An order needs at least one item. Cancel it instead.</p>}
      {badWho && <p className="adm-err" style={{ margin: 0 }}>Fill in the name, phone and full address.</p>}

      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Back
        </button>
        <button className="adm-btn pri" disabled={busy || empty || badWho}>
          {busy ? "Saving" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
