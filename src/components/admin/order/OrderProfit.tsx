"use client";

import { useEffect, useState } from "react";
import { money } from "@/components/admin/ui";
import { unitProfit } from "@/lib/gst";
import { getSettings, getPurchases, soldCosts, type SoldCost, type Order } from "@/lib/orders-db";

// What the shop made on this order: each kept unit's sale with GST taken out,
// less what every unit that left the shelf for good cost (as it was when sold;
// today's cost if it was entered later). Refunds beyond the items they name
// (goodwill) come off too. Delivery is left out: the courier's charge isn't
// recorded. Same rules as Analytics (supabase/migrations/0017).
export function OrderProfit({ order: o }: { order: Order }) {
  const items = o.order_items ?? [];
  const [data, setData] = useState<{ sold: Map<string, SoldCost>; now: Map<string, SoldCost>; credit: boolean } | null>(null);

  useEffect(() => {
    const its = o.order_items ?? [];
    Promise.all([soldCosts(its.map((i) => i.id)), getPurchases(its.flatMap((i) => (i.variant_id ? [i.variant_id] : []))), getSettings()])
      .then(([sold, now, s]) =>
        setData({ sold, now: new Map([...now].map(([id, p]) => [id, { cost: p.cost, gst: p.gstPaid, itc: p.gstClaimable }])), credit: s.gst_input_credit }),
      )
      .catch(() => setData(null));
  }, [o.order_items]);

  if (!data) return null;
  const rs = o.order_refunds ?? [];
  const back = new Map<string, number>();
  const shelved = new Map<string, number>();
  let extra = 0;
  for (const r of rs) {
    let named = 0;
    for (const ri of r.order_refund_items ?? []) {
      back.set(ri.order_item_id, (back.get(ri.order_item_id) ?? 0) + ri.quantity);
      if (r.restocked) shelved.set(ri.order_item_id, (shelved.get(ri.order_item_id) ?? 0) + ri.quantity);
      named += ri.quantity * (items.find((i) => i.id === ri.order_item_id)?.unit_price ?? 0);
    }
    extra += r.subtotal - named;
  }
  // the goodwill part with GST, and without it
  const extraG = o.gst_inclusive || !o.subtotal ? extra : (extra * (o.subtotal + o.tax)) / o.subtotal;
  const extraEx = o.gst_inclusive && o.subtotal ? (extra * (o.subtotal - o.tax)) / o.subtotal : extra;
  let sale = 0;
  let cost = 0;
  let kept = 0;
  let missing = 0;
  let later = 0;
  for (const i of items) {
    const c = data.sold.get(i.id) ?? (i.variant_id ? data.now.get(i.variant_id) : undefined);
    if (c === undefined) {
      missing++;
      continue;
    }
    if (!data.sold.has(i.id)) later++;
    const u = unitProfit(i.unit_price, c.cost, { rate: i.gst_rate ?? o.gst_rate ?? 0, inclusive: o.gst_inclusive, credit: data.credit }, { paid: c.gst, claimable: c.itc });
    const q = i.quantity - (back.get(i.id) ?? 0);
    const out = i.quantity - (shelved.get(i.id) ?? 0);
    sale += u.sale * q;
    cost += u.cost * out;
    // after GST: the sale without GST less the cost, less the GST paid to
    // the supplier that is claimed back
    kept += u.net * q - (u.cost - u.itc) * out;
  }
  if (missing === 0) {
    sale -= extraG;
    kept -= extraEx;
  }
  // the client's rule: selling price with GST - cost price with GST
  const profit = sale - cost;
  const gone = o.status === "cancelled";

  return (
    <section className="adm-card">
      <h2>Profit</h2>
      {missing === items.length ? (
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          No cost price entered for {items.length === 1 ? "this item" : "these items"}. Add it in Inventory → Stock to see the profit.
        </p>
      ) : (
        <>
          <div className="adm-kv">
            <span>Gross sales (incl. GST)</span>
            <span>{money(Math.round(sale * 100) / 100)}</span>
            <span>Cost price with GST</span>
            <span>−{money(Math.round(cost * 100) / 100)}</span>
            <span className="tot">Profit</span>
            <span className={`tot ${profit < 0 ? "adm-profit-neg" : "adm-profit-pos"}`}>
              {money(Math.round(profit * 100) / 100)}
              {sale > 0 && <small className="adm-muted"> · {((profit / sale) * 100).toFixed(1)}%</small>}
            </span>
            <span>Profit after GST is paid</span>
            <span>{money(Math.round(kept * 100) / 100)}</span>
          </div>
          <p className="adm-muted adm-small" style={{ margin: "12px 0 0" }}>
            {gone && "This order was cancelled, so it counts for nothing in Analytics. "}
            {rs.length > 0 && "Refunded items are taken off; returned items that went back in stock cost nothing. "}
            {missing > 0 && `${missing} item${missing === 1 ? " has" : "s have"} no cost price and ${missing === 1 ? "is" : "are"} left out. `}
            {later > 0 && `${later === 1 ? "One item uses" : `${later} items use`} today's cost, entered after the sale. `}
            Shipping charges are not counted.
          </p>
        </>
      )}
    </section>
  );
}
