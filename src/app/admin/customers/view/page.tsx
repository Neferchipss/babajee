"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import { money, StatusPill, when } from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import { addCustomerNote, customerDetail, errText, listCustomers, type Customer, type CustomerAddress, type CustomerNote, type Order } from "@/lib/orders-db";

// One customer: what they have spent, their orders, saved addresses and the
// staff's private notes about them.
export default function CustomerViewPage() {
  return (
    <Suspense>
      <CustomerView />
    </Suspense>
  );
}

function CustomerView() {
  const id = useSearchParams().get("id") ?? "";
  const { user } = useAuth();
  const [c, setC] = useState<Customer | null | undefined>(undefined);
  const [d, setD] = useState<{ orders: Order[]; addresses: CustomerAddress[]; notes: CustomerNote[] } | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(
    () =>
      Promise.all([listCustomers(), customerDetail(id)])
        .then(([all, detail]) => {
          setC(all.find((x) => x.id === id) ?? null);
          setD(detail);
        })
        .catch((e) => setErr(errText(e))),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (c === undefined) return <p className="adm-muted">{err || "Loading."}</p>;
  if (c === null)
    return (
      <div>
        <Link href="/admin/customers" className="adm-back">
          ← Customers
        </Link>
        <p className="adm-muted">No customer with this account.</p>
      </div>
    );

  const live = d?.orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded") ?? [];
  const aov = live.length ? live.reduce((n, o) => n + o.total, 0) / live.length : 0;

  return (
    <div>
      <Link href="/admin/customers" className="adm-back">
        ← Customers
      </Link>
      <header className="adm-head">
        <div className="grow">
          <h1 className={c.role === "admin" ? "is-admin" : ""}>
            {c.full_name || c.email}
            {c.role === "admin" && <span className="adm-role">Admin</span>}
          </h1>
          <p className="adm-sub">Customer since {when(c.joined).toLowerCase()}</p>
        </div>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-metrics" style={{ marginBottom: 16 }}>
        <div className="adm-metric">
          <div className="lab">Amount spent</div>
          <div className="val">{money(c.spent)}</div>
        </div>
        <div className="adm-metric">
          <div className="lab">Orders</div>
          <div className="val">{c.orders}</div>
        </div>
        <div className="adm-metric">
          <div className="lab">Average order</div>
          <div className="val">{aov ? money(Math.round(aov)) : "–"}</div>
        </div>
        <div className="adm-metric">
          <div className="lab">Last order</div>
          <div className="val" style={{ fontSize: "1.05rem" }}>
            {c.last_order ? when(c.last_order) : "Never"}
          </div>
        </div>
      </div>

      <div className="adm-two">
        <div className="adm-stack">
          <section className="adm-card">
            <h2>Orders</h2>
            {!d?.orders.length ? (
              <p className="adm-muted adm-small">No orders yet.</p>
            ) : (
              <div className="adm-tasks">
                {d.orders.map((o) => (
                  <Link key={o.id} href={`/admin/orders/view?id=${o.id}`} className="adm-task">
                    <span>
                      <strong>{o.order_number}</strong>
                      <br />
                      <small className="adm-muted">
                        {when(o.created_at)} · {money(o.total)}
                      </small>
                    </span>
                    <StatusPill status={o.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="adm-card">
            <h2>Notes</h2>
            <form
              style={{ display: "flex", gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!user || !note.trim()) return;
                addCustomerNote(c.id, user.id, note.trim())
                  .then(() => setNote(""))
                  .then(load)
                  .catch((x) => setErr(errText(x)));
              }}
            >
              <input className="adm-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Private note about this customer" aria-label="Note" />
              <button className="adm-btn" disabled={!note.trim()}>
                Add
              </button>
            </form>
            <ol className="adm-tl">
              {d?.notes.map((n) => (
                <li key={n.id} className="comment">
                  <span>{n.body}</span>
                  <time dateTime={n.created_at}>{when(n.created_at)}</time>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>Contact</h2>
            <p className="adm-small" style={{ margin: 0 }}>
              {c.phone && (
                <>
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>
                  <br />
                </>
              )}
              <span className="adm-muted">{c.email}</span>
            </p>
          </section>
          <section className="adm-card">
            <h2>Addresses</h2>
            {!d?.addresses.length ? (
              <p className="adm-muted adm-small">None saved.</p>
            ) : (
              d.addresses.map((a) => (
                <div key={a.id} className="adm-small" style={{ margin: "0 0 16px" }}>
                  <strong>{a.label}</strong>
                  {a.is_default && <span className="adm-muted"> · default</span>}
                  <br />
                  <span className="adm-muted">
                    {a.recipient_name}, {a.line1}
                    {a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.pincode}
                  </span>
                  <AddressMap lat={a.latitude} lng={a.longitude} label={`${a.label}, ${a.line1}`} />
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
