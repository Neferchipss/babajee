"use client";

import { useState } from "react";
import { type OrderAction } from "@/lib/order-status";
import { updateOrder, type Order } from "@/lib/orders-db";
import { knownCouriers } from "./Steps";

export function Confirm({
  action,
  order,
  busy,
  onCancel,
  onConfirm,
}: {
  action: OrderAction;
  order: Order;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (opts: Parameters<typeof updateOrder>[2]) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm({ carrier, tracking, note });
      }}
    >
      {action.to === "shipped" && (
        <>
          <h2>Ship {order.order_number}</h2>
          <label className="adm-label">
            Courier
            <input className="adm-input" list="ov-couriers" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Delhivery, DTDC, India Post…" autoFocus />
            <datalist id="ov-couriers">
              {knownCouriers().map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="adm-label">
            Tracking number
            <input className="adm-input" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </label>
        </>
      )}
      {action.to === "cancelled" && (
        <>
          <h2>Cancel {order.order_number}?</h2>
          <p className="adm-muted" style={{ margin: 0 }}>
            Tracked stock goes back on the shelf. This can&apos;t be undone.
          </p>
          <label className="adm-label">
            Reason (for the timeline)
            <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Customer asked, didn't pay…" />
          </label>
        </>
      )}
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Back
        </button>
        <button className={`adm-btn ${action.danger ? "bad" : "pri"}`} disabled={busy}>
          {busy ? "Saving" : action.label}
        </button>
      </div>
    </form>
  );
}
