"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast, toastError } from "@/components/admin/Toaster";
import { cashMoves, closeDrawer, counterSales, drawerTotals, moveCash, openDrawer, recentSessions, type CashMove, type CounterSale, type DrawerSession, type DrawerTotals } from "@/lib/counter";
import { errText } from "@/lib/orders-db";
// the end-of-day report prints as a till slip, like a receipt
import "@/app/admin/counter/receipt/receipt.css";

// The till's side panels (Till.tsx): the cash drawer (open with a float,
// cash in and out, end of day with the count and its report), the counter's
// sales (receipt, GST invoice, open to refund) and the sales saved for later.

const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const noop = () => () => {};

export type Parked = { id: string; at: string; lines: { name: string; qty: number; price: number }[]; orderPct: number; who: { id: string | null; name: string; phone: string; gstin: string }; note: string };

export function Sheet({ title, onClose, wide, children, foot }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <aside className={`tl-sheet ${wide ? "is-wide" : ""}`} aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          →
        </button>
      </header>
      <div className="tl-sheet-body">{children}</div>
      {foot && <footer>{foot}</footer>}
    </aside>
  );
}

// ------------------------------------------------------------ the drawer
export function DrawerPanel({ session, float, cash, mayClose, onClose, onChanged, start = "now" }: { session: DrawerSession | null; float: number; cash: string; mayClose: boolean; onClose: () => void; onChanged: () => void; start?: "now" | "move" | "close" | "past" }) {
  // which tab it opens on: ≡ › Cash In / Out opens Cash in / out, ≡ › End of day the count
  const [tab, setTab] = useState<"now" | "move" | "close" | "past">(start);
  const [totals, setTotals] = useState<DrawerTotals | null>(null);
  const [moves, setMoves] = useState<CashMove[]>([]);
  const [past, setPast] = useState<DrawerSession[] | null>(null);
  const [z, setZ] = useState<DrawerTotals | null>(null);
  const [printing, setPrinting] = useState(false);
  const [amount, setAmount] = useState(session ? "" : String(float || ""));
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"in" | "out">("out");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const onClient = useSyncExternalStore(noop, () => true, () => false);

  const load = (id: string) =>
    Promise.all([drawerTotals(id), cashMoves(id)]).then(
      ([t, m]) => {
        setTotals(t);
        setMoves(m);
      },
      (e) => toastError(e),
    );
  useEffect(() => {
    if (session) void load(session.id);
  }, [session]);
  useEffect(() => {
    if (tab !== "past") return;
    recentSessions(30).then(setPast, (e) => toastError(e));
  }, [tab]);
  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 200);
    return () => clearTimeout(t);
  }, [printing]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done);
      setAmount("");
      setReason("");
      onChanged();
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  const n = Number(amount);

  if (!session && !z)
    return (
      <Sheet
        title="Cash drawer"
        onClose={onClose}
        foot={
          <>
            <button type="button" className="tl-ok" disabled={busy || amount === "" || !(n >= 0)} onClick={() => void run(() => openDrawer(n), "Drawer open")}>
              ✓ Open drawer
            </button>
            <button type="button" onClick={onClose}>
              ✕ Cancel
            </button>
          </>
        }
      >
        <p>The drawer is closed. Count the cash you&apos;re starting with (the float) and open it to start selling.</p>
        <label className="tl-field">
          Float in the drawer (₹)
          <input className="adm-input" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <button type="button" className="tl-link" onClick={() => setTab("past")}>
          Past days
        </button>
        {tab === "past" && <Past past={past} />}
      </Sheet>
    );

  if (z)
    return (
      <Sheet
        title="End of day"
        onClose={onClose}
        wide
        foot={
          <>
            <button type="button" className="tl-ok" onClick={() => setPrinting(true)}>
              🖨 Print
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </>
        }
      >
        <ZReport t={z} cash={cash} />
        {printing && onClient && createPortal(<div className="rcp is-80mm"><style>{"@media print { @page { size: 80mm auto; margin: 2mm; } }"}</style><article className="rcp-paper"><ZReport t={z} cash={cash} paper /></article></div>, document.body)}
      </Sheet>
    );

  const counted = Number(amount);
  return (
    <Sheet title="Cash drawer" onClose={onClose} wide>
      <div className="tl-methods">
        {(
          [
            ["now", "Now"],
            ["move", "Cash in / out"],
            ["close", "End of day"],
            ["past", "Past days"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "now" && totals && (
        <>
          <p className="adm-small">Open since {time(totals.opened_at)}.</p>
          <Totals t={totals} cash={cash} />
          {moves.length > 0 && (
            <ul className="tl-pays">
              {moves.map((m) => (
                <li key={m.id}>
                  <span>
                    {m.kind === "in" ? "In" : "Out"} · {m.reason}
                  </span>
                  <b>
                    {m.kind === "in" ? "+" : "−"}₹{money(m.amount)}
                  </b>
                  <small>{time(m.created_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "move" && (
        <>
          <div className="tl-methods">
            <button type="button" className={kind === "in" ? "is-on" : ""} onClick={() => setKind("in")}>
              Cash in
            </button>
            <button type="button" className={kind === "out" ? "is-on" : ""} onClick={() => setKind("out")}>
              Cash out
            </button>
          </div>
          <label className="tl-field">
            Amount (₹)
            <input className="adm-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="tl-field">
            Why
            <input className="adm-input" value={reason} maxLength={200} placeholder={kind === "in" ? "Like: change from the bank" : "Like: tea, courier, paid a supplier"} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="button" className="tl-add" disabled={busy || !(n > 0) || !reason.trim()} onClick={() => void run(() => moveCash(kind, n, reason.trim()), kind === "in" ? "Cash in recorded" : "Cash out recorded")}>
            ✓ Record cash {kind}
          </button>
        </>
      )}

      {tab === "close" &&
        (mayClose ? (
          <>
            {totals && <Totals t={totals} cash={cash} />}
            <label className="tl-field">
              Cash counted in the drawer (₹)
              <input className="adm-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            {totals && amount !== "" && (
              <p className={Math.abs(counted - totals.expected_cash) < 0.005 ? "adm-small" : "adm-err"}>
                {Math.abs(counted - totals.expected_cash) < 0.005 ? "Matches what should be there." : `${counted > totals.expected_cash ? "Over" : "Short"} by ₹${money(Math.abs(counted - totals.expected_cash))}.`}
              </p>
            )}
            <label className="tl-field">
              Note (optional)
              <input className="adm-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button
              type="button"
              className="tl-add"
              disabled={busy || amount === "" || !(counted >= 0)}
              onClick={async () => {
                setBusy(true);
                try {
                  const t = await closeDrawer(counted, note.trim());
                  setZ(t);
                  toast("Drawer closed");
                  onChanged();
                } catch (e) {
                  toastError(e);
                }
                setBusy(false);
              }}
            >
              ✓ Close the drawer
            </button>
          </>
        ) : (
          <p>Owners, admins and the store account close the drawer.</p>
        ))}

      {tab === "past" && <Past past={past} />}
    </Sheet>
  );
}

function Totals({ t, cash }: { t: DrawerTotals; cash: string }) {
  return (
    <dl className="tl-settle">
      <dt>Float</dt>
      <dd>₹{money(t.opening_float)}</dd>
      <dt>
        Sales ({t.sales})
      </dt>
      <dd>₹{money(t.sales_total)}</dd>
      {Object.entries(t.by_method).map(([m, a]) => (
        <span key={m} style={{ display: "contents" }}>
          <dt className="is-sub">{m}</dt>
          <dd className="is-sub">₹{money(a)}</dd>
        </span>
      ))}
      {t.on_account > 0 && (
        <>
          <dt className="is-sub">On account (owed)</dt>
          <dd className="is-sub">₹{money(t.on_account)}</dd>
        </>
      )}
      {Object.entries(t.collected).map(([m, a]) => (
        <span key={m} style={{ display: "contents" }}>
          <dt>Credit collected · {m}</dt>
          <dd>₹{money(a)}</dd>
        </span>
      ))}
      <dt>Cash in</dt>
      <dd>₹{money(t.cash_in)}</dd>
      <dt>Cash out</dt>
      <dd>−₹{money(t.cash_out)}</dd>
      {t.refunds > 0 && (
        <>
          <dt>Refunds (cash: ₹{money(t.cash_refunds)})</dt>
          <dd>−₹{money(t.refunds)}</dd>
        </>
      )}
      <dt className="tl-total">{cash} that should be in the drawer</dt>
      <dd className="tl-total">₹{money(t.expected_cash)}</dd>
    </dl>
  );
}

function ZReport({ t, cash, paper }: { t: DrawerTotals; cash: string; paper?: boolean }) {
  const diff = t.counted_cash == null ? 0 : t.counted_cash - t.expected_cash;
  return (
    <div className={paper ? "" : "tl-z"}>
      {paper && <p className="rcp-title">END OF DAY</p>}
      <p className="adm-small">
        {time(t.opened_at)} to {t.closed_at ? time(t.closed_at) : "now"}
      </p>
      <dl className={paper ? "rcp-sum" : "tl-settle"}>
        <dt>Float</dt>
        <dd>{money(t.opening_float)}</dd>
        <dt>Sales ({t.sales})</dt>
        <dd>{money(t.sales_total)}</dd>
        {Object.entries(t.by_method).map(([m, a]) => (
          <span key={m} style={{ display: "contents" }}>
            <dt>· {m}</dt>
            <dd>{money(a)}</dd>
          </span>
        ))}
        {t.on_account > 0 && (
          <>
            <dt>· On account</dt>
            <dd>{money(t.on_account)}</dd>
          </>
        )}
        {Object.entries(t.collected).map(([m, a]) => (
          <span key={m} style={{ display: "contents" }}>
            <dt>Credit collected · {m}</dt>
            <dd>{money(a)}</dd>
          </span>
        ))}
        <dt>Cash in</dt>
        <dd>{money(t.cash_in)}</dd>
        <dt>Cash out</dt>
        <dd>-{money(t.cash_out)}</dd>
        <dt>Refunds</dt>
        <dd>-{money(t.refunds)}</dd>
        <dt>{cash} expected</dt>
        <dd>{money(t.expected_cash)}</dd>
        <dt>{cash} counted</dt>
        <dd>{t.counted_cash == null ? "-" : money(t.counted_cash)}</dd>
        <dt className={paper ? "rcp-total" : "tl-total"}>{diff >= 0 ? "Over" : "Short"}</dt>
        <dd className={paper ? "rcp-total" : "tl-total"}>{money(Math.abs(diff))}</dd>
      </dl>
      {t.note && <p className="adm-small">{t.note}</p>}
    </div>
  );
}

function Past({ past }: { past: DrawerSession[] | null }) {
  const [open, setOpen] = useState<DrawerTotals | null>(null);
  if (!past) return <p className="adm-small">Loading…</p>;
  if (!past.length) return <p className="adm-small">No days yet.</p>;
  return (
    <>
      <table className="tl-table">
        <thead>
          <tr>
            <th>Opened</th>
            <th>Closed</th>
            <th>Expected</th>
            <th>Counted</th>
            <th>Over / short</th>
          </tr>
        </thead>
        <tbody>
          {past.map((s) => (
            <tr key={s.id} onClick={() => void drawerTotals(s.id).then(setOpen, (e) => toastError(e))}>
              <td>{time(s.opened_at)}</td>
              <td>{s.closed_at ? time(s.closed_at) : "Open"}</td>
              <td>{s.expected_cash == null ? "" : money(s.expected_cash)}</td>
              <td>{s.counted_cash == null ? "" : money(s.counted_cash)}</td>
              <td>{s.counted_cash == null || s.expected_cash == null ? "" : money(s.counted_cash - s.expected_cash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <Totals t={open} cash="Cash" />}
    </>
  );
}

// ------------------------------------------------------------ sales history
// onRefund: the till's own refund (0086), when it's there
export function HistoryPanel({ onClose, onRefund }: { onClose: () => void; onRefund?: (id: string) => void }) {
  const [days, setDays] = useState(1);
  const [sales, setSales] = useState<CounterSale[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    counterSales(since.toISOString()).then(setSales, (e) => setErr(errText(e)));
  }, [days]);
  const total = (sales ?? []).filter((s) => s.status !== "cancelled").reduce((n, s) => n + s.total, 0);
  return (
    <Sheet title="Sales history" onClose={onClose} wide>
      <div className="tl-methods">
        {(
          [
            [1, "Today"],
            [7, "7 days"],
            [30, "30 days"],
          ] as const
        ).map(([d, label]) => (
          <button key={d} type="button" className={days === d ? "is-on" : ""} onClick={() => setDays(d)}>
            {label}
          </button>
        ))}
      </div>
      {err && <p className="adm-err">{err}</p>}
      {!sales && !err && <p className="adm-small">Loading…</p>}
      {sales && (
        <>
          <p className="adm-small">
            {sales.length} sale{sales.length === 1 ? "" : "s"} · ₹{money(total)}. Reprints say REPRINT (receipt) or DUPLICATE (invoice).
          </p>
          <table className="tl-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Sale</th>
                <th>Customer</th>
                <th>Paid by</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={s.status === "refunded" || s.status === "cancelled" ? "is-off" : ""}>
                  <td>{time(s.created_at)}</td>
                  <td>
                    {s.order_number}
                    {s.status === "refunded" ? " · refunded" : ""}
                  </td>
                  <td>{s.contact_name}</td>
                  <td>{[...new Set(s.payments.map((p) => p.method))].join(" + ") || "On account"}</td>
                  <td>₹{money(s.total)}</td>
                  <td className="tl-acts">
                    <Link href={`/admin/counter/receipt?id=${s.id}&reprint=1&print=1`}>Reprint</Link>
                    <Link href={`/admin/orders/print?ids=${s.id}&doc=invoice&copy=duplicate`}>Invoice</Link>
                    {onRefund && s.status !== "refunded" && s.status !== "cancelled" && (
                      <button type="button" className="tl-link" onClick={() => onRefund(s.id)}>
                        Refund
                      </button>
                    )}
                    <Link href={`/admin/orders/view?id=${s.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------ saved sales
export function ParkedPanel({ parked, onClose, onResume, onDrop }: { parked: Parked[]; onClose: () => void; onResume: (p: Parked) => void; onDrop: (id: string) => void }) {
  return (
    <Sheet title="Open sales" onClose={onClose}>
      <p className="adm-small">Sales saved with F9 on this device, waiting to be paid.</p>
      {!parked.length && <p>None saved.</p>}
      <ul className="tl-pays">
        {parked.map((p) => {
          const sum = p.lines.reduce((n, l) => n + l.qty * l.price, 0);
          return (
            <li key={p.id}>
              <span>
                {time(p.at)} · {p.who.name || "Walk-in"} · {p.lines.length} line{p.lines.length === 1 ? "" : "s"}
              </span>
              <b>₹{money(sum)}</b>
              <button type="button" onClick={() => onResume(p)}>
                Resume
              </button>
              <button type="button" aria-label="Delete" onClick={() => onDrop(p.id)}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
