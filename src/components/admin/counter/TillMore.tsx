"use client";

import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { balances, collect, findSale, refundAtTill, saleById, NEEDS_0086, type Balance, type RefundableSale } from "@/lib/counter";
import { round2 } from "@/lib/currency";
import { errText } from "@/lib/orders-db";
import { Sheet } from "./TillPanels";

// The till's part two (0086): Refund (find a sale by its number or from the
// sales history, pick what comes back, pay it back), Credit payments (who
// owes the shop, and taking a payment), and Split (move lines off this
// ticket onto a new one, each paid as its own sale).

const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const ON_ACCOUNT = "On account";

// ------------------------------------------------------------ Refund
// The money: the share of what was paid that the returned pieces make up
// (so GST-exclusive sales give back their GST too), never more than is left.
export function RefundPanel({ start, methods, cash, onClose, onDone }: { start: string | null; methods: string[]; cash: string; onClose: () => void; onDone: (refundId: string) => void }) {
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<RefundableSale | null>(null);
  const [looking, setLooking] = useState(!!start);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [typed, setTyped] = useState<string | null>(null);
  const [method, setMethod] = useState(methods.find((m) => m.toLowerCase() === cash.toLowerCase()) ?? methods[0] ?? "");
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const got = (p: Promise<RefundableSale | null>) =>
    p.then(
      (s) => {
        setLooking(false);
        if (!s) return toast(`No sale numbered "${q.trim()}"`);
        setSale(s);
        setQty({});
        setTyped(null);
        if (s.on_account && s.owed > 0) setMethod(ON_ACCOUNT);
      },
      (e) => {
        setLooking(false);
        toastError(e);
      },
    );
  const load = (p: Promise<RefundableSale | null>) => {
    setLooking(true);
    void got(p);
  };
  useEffect(() => {
    if (start) void got(saleById(start));
    // once, for the sale picked in the history
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const gross = sale ? sale.lines.reduce((n, l) => n + l.qty * l.price, 0) : 0;
  const paid = sale ? (sale.paid_total ?? sale.total) : 0;
  const left = round2(paid - (sale?.refunded ?? 0));
  const picked = sale ? sale.lines.reduce((n, l) => n + (qty[l.id] ?? 0) * l.price, 0) : 0;
  const auto = gross > 0 ? Math.min(left, round2((sale!.total * picked) / gross)) : 0;
  const amount = typed == null ? auto : Number(typed) || 0;
  const anyLines = Object.values(qty).some((n) => n > 0);
  const ways = sale?.on_account && sale.owed > 0 ? [ON_ACCOUNT, ...methods] : methods;
  const overOwed = method === ON_ACCOUNT && sale ? amount > sale.owed + 0.005 : false;
  const ok = !!sale && amount > 0 && amount <= left + 0.005 && !!method && !overOwed && !busy && !["pending", "cancelled", "refunded"].includes(sale.status);

  async function go() {
    if (!sale || !ok) return;
    setBusy(true);
    try {
      const id = await refundAtTill({
        order: sale.id,
        lines: sale.lines.filter((l) => (qty[l.id] ?? 0) > 0).map((l) => ({ item: l.id, qty: qty[l.id] })),
        amount: round2(amount),
        method,
        restock: restock && anyLines,
        reason: reason.trim(),
      });
      toast(`Refunded ₹${money(amount)} on ${sale.order_number}`);
      onDone(id);
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }

  return (
    <Sheet
      title="Refund"
      onClose={onClose}
      wide
      foot={
        sale && (
          <>
            <button type="button" className="tl-ok" disabled={!ok} onClick={() => void go()}>
              ✓ {busy ? "Saving…" : `Refund ₹${money(amount)}`}
            </button>
            <button type="button" onClick={onClose}>
              ✕ Cancel
            </button>
          </>
        )
      }
    >
      <label className="tl-field">
        Receipt, order or invoice number (scan or type)
        <input
          className="adm-input"
          autoFocus={!start}
          value={q}
          placeholder="BJ-1234"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              e.preventDefault();
              load(findSale(q));
            }
          }}
        />
      </label>
      <p className="adm-small">Or pick it in ≡ › View sales history and tap Refund. Any sale can be refunded here, online ones too.</p>
      {looking && <p className="adm-small">Finding the sale…</p>}
      {sale && (
        <>
          <p className="tl-who">
            {sale.order_number}
            {sale.invoice_number ? ` · ${sale.invoice_number}` : ""} · {day(sale.created_at)} · {sale.contact_name} · ₹{money(sale.total)}
            {sale.channel === "online" ? " · online" : ""}
          </p>
          {["pending", "cancelled", "refunded"].includes(sale.status) && (
            <p className="adm-err">{sale.status === "pending" ? "Nothing was paid on this order yet: cancel it instead." : `This order is already ${sale.status}.`}</p>
          )}
          <table className="tl-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Sold</th>
                <th>Price</th>
                <th>Returning</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => {
                const can = l.qty - l.refunded;
                const n = qty[l.id] ?? 0;
                return (
                  <tr key={l.id} className={can <= 0 ? "is-off" : ""}>
                    <td>
                      {l.name}
                      {l.label ? ` · ${l.label}` : ""}
                    </td>
                    <td>
                      {l.qty}
                      {l.refunded ? ` (${l.refunded} back)` : ""}
                    </td>
                    <td>₹{money(l.price)}</td>
                    <td className="tl-step">
                      <button type="button" disabled={n <= 0} onClick={() => (setQty({ ...qty, [l.id]: n - 1 }), setTyped(null))}>
                        −
                      </button>
                      <b>{n}</b>
                      <button type="button" disabled={n >= can} onClick={() => (setQty({ ...qty, [l.id]: n + 1 }), setTyped(null))}>
                        +
                      </button>
                      <button type="button" className="tl-link" disabled={n >= can} onClick={() => (setQty({ ...qty, [l.id]: can }), setTyped(null))}>
                        All
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <label className="tl-field">
            Amount to give back (up to ₹{money(left)})
            <input className="adm-input" inputMode="decimal" value={typed ?? String(auto)} onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <div className="tl-methods">
            {ways.map((m) => (
              <button key={m} type="button" className={m === method ? "is-on" : ""} onClick={() => setMethod(m)}>
                {m === ON_ACCOUNT ? `Off what's owed (₹${money(sale.owed)})` : m}
              </button>
            ))}
          </div>
          {method.toLowerCase() === cash.toLowerCase() && <p className="adm-small">The cash comes out of the open drawer.</p>}
          {overOwed && <p className="adm-err">Only ₹{money(sale.owed)} is still owed on this sale.</p>}
          <label className="tl-check">
            <input type="checkbox" checked={restock && anyLines} disabled={!anyLines} onChange={(e) => setRestock(e.target.checked)} /> Put the returned items back in stock
          </label>
          <label className="tl-field">
            Reason (optional)
            <input className="adm-input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
          <p className="adm-small">A credit note is issued against the invoice, as for any refund.</p>
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------ Credit payments
export function CreditPanel({ methods, cash, onClose, onDone }: { methods: string[]; cash: string; onClose: () => void; onDone: (paymentId: string) => void }) {
  const [list, setList] = useState<Balance[] | null>(null);
  const [err, setErr] = useState("");
  const [who, setWho] = useState<Balance | null>(null);
  const [q, setQ] = useState("");
  const [typed, setTyped] = useState("");
  const [method, setMethod] = useState(methods.find((m) => m.toLowerCase() === cash.toLowerCase()) ?? methods[0] ?? "");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    balances().then(setList, (e) => setErr(errText(e)));
  }, []);
  const k = q.trim().toLowerCase();
  const shown = (list ?? []).filter((b) => !k || `${b.name} ${b.phone}`.toLowerCase().includes(k));
  const total = (list ?? []).reduce((n, b) => n + b.balance, 0);
  const amount = Number(typed) || 0;
  const ok = !!who && amount > 0 && amount <= who.balance + 0.005 && !!method && !busy;

  async function go() {
    if (!who || !ok) return;
    setBusy(true);
    try {
      const id = await collect(who.profile_id, round2(amount), method, method.toLowerCase() === cash.toLowerCase() ? "" : ref.trim());
      toast(`₹${money(amount)} collected from ${who.name}`);
      onDone(id);
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }

  return (
    <Sheet
      title="Credit payments"
      onClose={onClose}
      wide
      foot={
        who && (
          <>
            <button type="button" className="tl-ok" disabled={!ok} onClick={() => void go()}>
              ✓ {busy ? "Saving…" : `Take ₹${money(amount)}`}
            </button>
            <button type="button" onClick={() => setWho(null)}>
              ‹ Everyone
            </button>
          </>
        )
      }
    >
      {err && <p className="adm-err">{err === NEEDS_0086 ? err : `${err}`}</p>}
      {!list && !err && <p className="adm-small">Loading…</p>}
      {list && !who && (
        <>
          <p className="adm-small">
            {list.length ? `${list.length} customer${list.length === 1 ? "" : "s"} owe ₹${money(total)} in all.` : "No one owes the shop anything."} Tap a customer to take a payment.
          </p>
          {list.length > 6 && <input className="adm-input" placeholder="Find by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />}
          <table className="tl-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Sales</th>
                <th>Since</th>
                <th>Owes</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.profile_id} className="is-pick" onClick={() => (setWho(b), setTyped(String(b.balance)))}>
                  <td>{b.name}</td>
                  <td>{b.phone}</td>
                  <td>{b.sales}</td>
                  <td>{day(b.oldest)}</td>
                  <td>
                    ₹{money(b.balance)}
                    {b.credit_limit != null && b.balance > b.credit_limit ? " · over limit" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {who && (
        <>
          <div className="tl-due">
            <span>{who.name} owes</span>
            <b>₹{money(who.balance)}</b>
          </div>
          <div className="tl-methods">
            {methods.map((m) => (
              <button key={m} type="button" className={m === method ? "is-on" : ""} onClick={() => setMethod(m)}>
                {m}
              </button>
            ))}
          </div>
          <label className="tl-field">
            Amount they&apos;re paying (all or part)
            <input className="adm-input" inputMode="decimal" autoFocus value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void go())} />
          </label>
          {method.toLowerCase() === cash.toLowerCase() ? (
            <p className="adm-small">The cash goes in the open drawer.</p>
          ) : (
            <label className="tl-field">
              Reference (optional)
              <input className="adm-input" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} />
            </label>
          )}
          {amount > who.balance + 0.005 && <p className="adm-err">That&apos;s more than they owe.</p>}
          <p className="adm-small">It pays off their oldest sales first. A receipt prints after.</p>
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------ Split
// lines: the ticket as it stands. onSplit gets, per line, how many move to
// the new ticket.
export function SplitPanel({ lines, onClose, onSplit }: { lines: { key: string; name: string; label: string; qty: number; price: number }[]; onClose: () => void; onSplit: (move: Record<string, number>) => void }) {
  const [move, setMove] = useState<Record<string, number>>({});
  const moving = useMemo(() => lines.reduce((n, l) => n + (move[l.key] ?? 0), 0), [lines, move]);
  const staying = lines.reduce((n, l) => n + l.qty, 0) - moving;
  const value = lines.reduce((n, l) => n + (move[l.key] ?? 0) * l.price, 0);
  return (
    <Sheet
      title="Split order"
      onClose={onClose}
      wide
      foot={
        <>
          <button type="button" className="tl-ok" disabled={!moving || !staying} onClick={() => onSplit(move)}>
            ✓ Split off {moving} piece{moving === 1 ? "" : "s"} · ₹{money(value)}
          </button>
          <button type="button" onClick={onClose}>
            ✕ Cancel
          </button>
        </>
      }
    >
      <p className="adm-small">Pick what goes on a second ticket. It&apos;s saved under ≡ › View open sales and paid as its own sale, with its own receipt and invoice; split again for a third. To share one bill between people, use Payment › Split evenly.</p>
      <table className="tl-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>On this ticket</th>
            <th>To the new ticket</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const n = move[l.key] ?? 0;
            return (
              <tr key={l.key}>
                <td>
                  {l.name}
                  {l.label ? ` · ${l.label}` : ""}
                </td>
                <td>{l.qty - n}</td>
                <td className="tl-step">
                  <button type="button" disabled={n <= 0} onClick={() => setMove({ ...move, [l.key]: n - 1 })}>
                    −
                  </button>
                  <b>{n}</b>
                  <button type="button" disabled={n >= l.qty} onClick={() => setMove({ ...move, [l.key]: n + 1 })}>
                    +
                  </button>
                  <button type="button" className="tl-link" disabled={n >= l.qty} onClick={() => setMove({ ...move, [l.key]: l.qty })}>
                    All
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Sheet>
  );
}
