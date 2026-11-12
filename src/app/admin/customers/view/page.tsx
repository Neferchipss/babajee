"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import CustomerActivity from "@/components/admin/CustomerActivity";
import { toast, toastError } from "@/components/admin/Toaster";
import { money, StatusPill, when } from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import { customerDetail, customerSaved, errText, listCustomers, setCustomerTags, type Customer, type CustomerAddress, type CustomerNote, type CustomerSaved, type Order } from "@/lib/orders-db";
import { deviceOf, loginEvents, type LoginEvent } from "@/lib/logins";
import SupportHistory from "@/components/admin/SupportHistory";

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
  // what they saved for later (empty until the table exists, or for guests)
  const [saved, setSaved] = useState<CustomerSaved[]>([]);
  // their latest sign-ins and failed attempts (0040)
  const [logins, setLogins] = useState<LoginEvent[] | null>(null);

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
  useEffect(() => {
    customerSaved(id).then(setSaved, () => setSaved([]));
    loginEvents({ profile: id, limit: 8 }).then(setLogins, () => setLogins([]));
  }, [id]);

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

  const digits = (c.phone ?? "").replace(/\D/g, "");
  const wa = digits.length === 10 ? `91${digits}` : digits.length === 12 && digits.startsWith("91") ? digits : "";
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
            {c.is_test && <span className="adm-role is-test" title="A seeded test account: it can't sign in">Test</span>}
          </h1>
          <p className="adm-sub">Customer since {when(c.joined).toLowerCase()}</p>
        </div>
        {/* get in touch, or take an order for them, from the top of the page */}
        <div className="adm-actions">
          {wa && (
            <a className="adm-btn" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
          {c.phone && (
            <a className="adm-btn" href={`tel:${c.phone.replace(/\s/g, "")}`}>
              Call
            </a>
          )}
          {c.email && (
            <a className="adm-btn" href={`mailto:${c.email}`}>
              Email
            </a>
          )}
          <Link className="adm-btn pri" href={`/admin/orders/new?customer=${c.id}`}>
            Create an order
          </Link>
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

          <CustomerActivity id={id} orders={d?.orders ?? []} saved={saved} />

          <SupportHistory customerId={c.id} userId={user?.id} notes={d?.notes ?? []} orders={d?.orders ?? []} onChange={load} />
        </div>

        <div className="adm-stack">
          <section className="adm-card">
            <h2>Tags</h2>
            <CustomerTags
              key={c.id + c.tags.join("|")}
              tags={c.tags}
              onChange={(tags) =>
                setCustomerTags(c.id, tags)
                  .then(load)
                  .then(() => toast("Tags saved"))
                  .catch((x) => (setErr(errText(x)), toastError(x)))
              }
            />
            <p className="adm-muted adm-small" style={{ margin: "8px 0 0" }}>
              For grouping customers: wholesale, regular, café owner. Only staff see them.
            </p>
          </section>
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
          <section className="adm-card">
            <h2>Sign-ins</h2>
            {!logins ? (
              <p className="adm-muted adm-small">Loading.</p>
            ) : !logins.length ? (
              <p className="adm-muted adm-small">None recorded yet.</p>
            ) : (
              <ul className="adm-small" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {logins.map((l) => (
                  <li key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>
                      {l.ok ? "Signed in" : <span style={{ color: "var(--adm-bad)" }}>{l.reason || "Failed attempt"}</span>}
                      <span className="adm-muted"> · {deviceOf(l.user_agent)}</span>
                    </span>
                    <span className="adm-muted" style={{ whiteSpace: "nowrap" }}>{when(l.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/customers/sign-ins" className="adm-link adm-small" style={{ display: "inline-block", marginTop: 10 }}>
              All sign-ins →
            </Link>
          </section>
          <section className="adm-card">
            <h2>Saved for later</h2>
            {!saved.length ? (
              <p className="adm-muted adm-small">Nothing saved with the heart.</p>
            ) : (
              <ul className="adm-small" style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {saved.map((s) => (
                  <li key={s.slug} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>
                      {s.href ? (
                        <a href={s.href} target="_blank" rel="noreferrer">
                          {s.name}
                        </a>
                      ) : (
                        s.name
                      )}
                      {s.price ? <span className="adm-muted"> · {money(s.price)}</span> : null}
                    </span>
                    <span className="adm-muted">{when(s.saved_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Tags as chips: type and press Enter or a comma to add, × to take one off.
function CustomerTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [list, setList] = useState(tags);
  const [draft, setDraft] = useState("");
  const commit = (next: string[]) => {
    setList(next);
    onChange(next);
  };
  function add(raw: string) {
    const fresh = raw
      .split(",")
      .map((t) => t.trim().replace(/\s+/g, " "))
      .filter((t, i, all) => t && !list.some((x) => x.toLowerCase() === t.toLowerCase()) && all.findIndex((y) => y.toLowerCase() === t.toLowerCase()) === i);
    setDraft("");
    if (fresh.length) commit([...list, ...fresh].slice(0, 20));
  }
  return (
    <div className="cus-tagbox">
      {list.map((t) => (
        <span key={t} className="cus-tag">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => commit(list.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="Add a tag"
        value={draft}
        placeholder={list.length ? "Add another" : "wholesale, regular…"}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && list.length) {
            commit(list.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  );
}
