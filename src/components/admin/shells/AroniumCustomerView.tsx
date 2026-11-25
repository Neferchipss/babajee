"use client";

import CustomerCredit from "@/components/admin/counter/CustomerCredit";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import { toast, toastError } from "@/components/admin/Toaster";
import { money, when } from "@/components/admin/ui";
import { ageOf, dobLabel } from "@/lib/age";
import { useAuth } from "@/lib/auth";
import { deviceOf, loginEvents, type LoginEvent } from "@/lib/logins";
import { customerAccount, customerDetail, customerSaved, errText, getCustomer, setCustomerTags, updateCustomer, type Customer, type CustomerAccount, type CustomerAddress, type CustomerNote, type CustomerSaved, type Order } from "@/lib/orders-db";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArSection, ArToolbar, menuOf, useArKeys, type ArCol } from "./aronium-kit";
import { ArHelp, ArInfo } from "./aronium-help";
import { ArActivity, ArSupport } from "./aronium-customer-tabs";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Customers & suppliers • one customer, opened the way Aronium
// opens a document: a tab with their name beside "Customers & suppliers",
// the toolbar (Save, and Babajee's New order, Call, WhatsApp, Email), and the
// editor's tabs. General is Aronium's form, labels on the left (name, buying
// as, GSTIN as the tax number, status, tags, contact); Babajee's tabs follow:
// Orders, Activity, Notes & support, Addresses, Sign-ins, Wishlist.
type Tab = "general" | "orders" | "activity" | "notes" | "addresses" | "logins" | "saved";
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATUS: Record<string, string> = { pending: "Awaiting payment", paid: "Paid", packed: "Packed", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded" };

export default function AroniumCustomerView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { user } = useAuth();
  const [c, setC] = useState<Customer | null | undefined>(undefined);
  const [d, setD] = useState<{ orders: Order[]; addresses: CustomerAddress[]; notes: CustomerNote[] } | null>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<CustomerSaved[]>([]);
  const [logins, setLogins] = useState<LoginEvent[] | null>(null);
  const [acct, setAcct] = useState<CustomerAccount | null>(null);
  const [was, setWas] = useState("");
  const [tab, setTab] = useState<Tab>("general");
  const [sel, setSel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([getCustomer(id), customerDetail(id)])
        .then(([one, detail]) => {
          setC(one);
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
    customerAccount(id).then(
      (a) => {
        setAcct(a);
        setWas(JSON.stringify(a));
      },
      () => setAcct(null),
    );
  }, [id]);

  const gstOk = !acct || acct.gstin === "" || GSTIN_RE.test(acct.gstin);
  const dirty = !!acct && JSON.stringify(acct) !== was;
  async function saveAccount() {
    if (!acct || !gstOk) return;
    try {
      await updateCustomer(id, acct);
      setWas(JSON.stringify(acct));
      toast("Account saved");
    } catch (e) {
      toastError(errText(e));
    }
  }
  useArKeys({ refresh: () => void load() });

  if (c === undefined) return <p className="arc-note arc-pane">{err || "Loading."}</p>;
  if (c === null)
    return (
      <ArScreen className="arc">
        <ArEmpty title="No customer with this account" action="Back to Customers & suppliers" href="/admin/customers" />
      </ArScreen>
    );

  const orders = d?.orders ?? [];
  const live = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded");
  const by = (test: (o: Order) => boolean) => orders.filter(test).length;
  const counts = [
    ["Awaiting payment", by((o) => o.status === "pending")],
    ["In progress", by((o) => ["paid", "packed", "shipped"].includes(o.status))],
    ["Delivered", by((o) => o.status === "delivered")],
    ["Cancelled", by((o) => o.status === "cancelled")],
    ["Refunded or returned", by((o) => o.status === "refunded" || (o.order_refunds ?? []).some((r) => r.returned))],
  ] as const;
  const aov = live.length ? live.reduce((n, o) => n + o.total, 0) / live.length : 0;
  const digits = (c.phone ?? "").replace(/\D/g, "");
  const wa = digits.length === 10 ? `91${digits}` : digits.length === 12 && digits.startsWith("91") ? digits : "";
  const set = (patch: Partial<CustomerAccount>) => acct && setAcct({ ...acct, ...patch });
  const go = (href: string) => (href.startsWith("/") ? router.push(href) : window.open(href, href.startsWith("http") ? "_blank" : "_self"));

  const orderCols: ArCol<Order>[] = [
    { k: "n", label: "Number", render: (o) => o.order_number, sort: (o) => o.order_number },
    { k: "at", label: "Date", render: (o) => when(o.created_at), sort: (o) => o.created_at },
    { k: "st", label: "Status", render: (o) => STATUS[o.status] ?? o.status, sort: (o) => o.status },
    { k: "t", label: "Total", right: true, render: (o) => money(o.total), sort: (o) => o.total },
  ];
  const loginCols: ArCol<LoginEvent>[] = [
    { k: "at", label: "Date", render: (l) => when(l.at) },
    { k: "r", label: "Result", render: (l) => (l.ok ? <span className="arc-pos">Signed in</span> : <span className="arc-neg">{l.reason || "Failed attempt"}</span>) },
    { k: "d", label: "Device", render: (l) => deviceOf(l.user_agent) },
  ];
  const savedCols: ArCol<CustomerSaved>[] = [
    { k: "n", label: "Product", render: (s) => (s.href ? <a href={s.href} target="_blank" rel="noreferrer">{s.name}</a> : s.name), sort: (s) => s.name },
    { k: "p", label: "Price", right: true, render: (s) => (s.price ? money(s.price) : ""), sort: (s) => s.price ?? 0 },
    { k: "at", label: "Saved", render: (s) => when(s.saved_at), sort: (s) => s.saved_at },
  ];
  const tabs: [Tab, string][] = [
    ["general", "General"],
    ["orders", `Orders (${orders.length})`],
    ["activity", "Activity"],
    ["notes", "Notes & support"],
    ["addresses", `Addresses (${d?.addresses.length ?? 0})`],
    ["logins", "Sign-ins"],
    ["saved", `Wishlist (${saved.length})`],
  ];

  return (
    <ArScreen className="arc">
      <div className="ars-chiprow" role="tablist">
        <Link href="/admin/customers" className="ars-chip">
          <ArIcon name="search" size={13} />
          Customers &amp; suppliers
        </Link>
        <span className="ars-chip ars-chip-x is-on">
          <button type="button" role="tab" aria-selected>
            {c.full_name || c.email}
          </button>
          <button type="button" aria-label="Close" onClick={() => router.push("/admin/customers")}>
            ×
          </button>
        </span>
      </div>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "save", label: "Save", disabled: !dirty || !gstOk, onClick: saveAccount },
          { icon: "add", label: "New order", href: `/admin/orders/new?customer=${c.id}` },
          !!c.phone && { icon: "info", label: "Call", onClick: () => go(`tel:${c.phone.replace(/\s/g, "")}`) },
          !!wa && { icon: "open", label: "WhatsApp", onClick: () => go(`https://wa.me/${wa}`) },
          !!c.email && { icon: "export", label: "Email", onClick: () => go(`mailto:${c.email}`) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <div className="arc-pane">
        <div className="arc-head">
          <h2>{c.full_name || c.email}</h2>
          {c.role === "admin" && <span className="arc-role">Admin</span>}
          {c.is_test && (
            <span className="arc-role is-test" title="A seeded test account: it can't sign in">
              Test
            </span>
          )}
          <span>
            {c.date_of_birth ? `${ageOf(c.date_of_birth)} years old (born ${dobLabel(c.date_of_birth)}) · ` : ""}
            Customer since {when(c.joined).toLowerCase()}
          </span>
        </div>
        <div className="arc-stats">
          <div>
            <small>Amount spent</small>
            <b>{money(c.spent)}</b>
          </div>
          <div>
            <small>Orders</small>
            <b>{c.orders}</b>
          </div>
          <div>
            <small>Average order value</small>
            <b>{aov ? money(Math.round(aov)) : "–"}</b>
          </div>
          <div>
            <small>Last order</small>
            <b>{c.last_order ? when(c.last_order) : "Never"}</b>
          </div>
        </div>
        <p className="arc-counts">
          {counts.map(([label, n]) => (
            <span key={label}>
              {label} <b>{n}</b>
            </span>
          ))}
        </p>
        <CustomerCredit id={c.id} aronium />
      </div>

      <div className="ars-innertabs" role="tablist" aria-label="Customer">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "is-on" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="arc-pane">
          <ArSection title="General info" />
          {acct ? (
            <div className="arc-form">
              <label>
                <span>First name</span>
                <input className="adm-input" value={acct.first_name} onChange={(e) => set({ first_name: e.target.value })} />
              </label>
              <label>
                <span>Last name</span>
                <input className="adm-input" value={acct.last_name} onChange={(e) => set({ last_name: e.target.value })} />
              </label>
              <label>
                <span>Gender</span>
                <select className="adm-input is-mid" value={acct.gender} onChange={(e) => set({ gender: e.target.value as CustomerAccount["gender"] })}>
                  <option value="">Not said</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                <span>Buying as</span>
                <select className="adm-input is-mid" value={acct.customer_type} onChange={(e) => set({ customer_type: e.target.value as CustomerAccount["customer_type"] })}>
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </label>
              {acct.customer_type === "business" && (
                <>
                  <label>
                    <span>Business name</span>
                    <input className="adm-input" value={acct.business_name} onChange={(e) => set({ business_name: e.target.value })} />
                  </label>
                  <label>
                    <span>Tax number (GSTIN)</span>
                    <input className="adm-input is-mid" value={acct.gstin} maxLength={15} aria-invalid={!gstOk} onChange={(e) => set({ gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} />
                  </label>
                  {!gstOk && <small>A GSTIN is 15 characters, like 27ABCDE1234F1Z5.</small>}
                </>
              )}
              <label>
                <span>Status</span>
                <select className="adm-input is-mid" value={acct.status} onChange={(e) => set({ status: e.target.value as CustomerAccount["status"] })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked: can&apos;t order</option>
                </select>
              </label>
              {acct.status !== "active" && (
                <label>
                  <span>Why (staff only)</span>
                  <input className="adm-input" value={acct.status_note} maxLength={300} onChange={(e) => set({ status_note: e.target.value })} />
                </label>
              )}
              {acct.status === "blocked" && <small>Blocked: they can&apos;t order for themselves; the shop still can, from New order.</small>}
              <div className="arc-row">
                <span />
                <span>
                  <button type="button" className="arc-btn is-pri" disabled={!dirty || !gstOk} onClick={saveAccount}>
                    ✓ Save
                  </button>
                </span>
              </div>
            </div>
          ) : (
            <p className="arc-note">The account&apos;s names and status show here once the database has them.</p>
          )}
          <ArSection title="Tags" />
          <ArTags
            key={c.id + c.tags.join("|")}
            tags={c.tags}
            onChange={(tags) =>
              setCustomerTags(c.id, tags)
                .then(load)
                .then(() => toast("Tags saved"))
                .catch((x) => (setErr(errText(x)), toastError(x)))
            }
          />
          <p className="arc-note">For grouping customers: wholesale, regular, café owner. Only staff see them.</p>
          <ArSection title="Contact" />
          <div className="arc-form">
            <div className="arc-row">
              <span>Phone number</span>
              <span>{c.phone ? <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a> : <span className="arc-grey">(none)</span>}</span>
            </div>
            <div className="arc-row">
              <span>Email</span>
              <span>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="arc-grey">(none)</span>}</span>
            </div>
          </div>
        </div>
      )}

      {tab === "orders" &&
        (orders.length ? (
          <ArGrid
            cols={orderCols}
            rows={orders}
            keyOf={(o) => o.id}
            sel={sel}
            onSel={setSel}
            onOpen={(o) => router.push(`/admin/orders/view?id=${o.id}`)}
            menu={(o) =>
              menuOf(
                [{ label: "New order", key: "Ctrl+N", onClick: () => router.push(`/admin/orders/new?customer=${c.id}`) }],
                [{ label: "Open order", disabled: !o, onClick: () => o && router.push(`/admin/orders/view?id=${o.id}`) }],
                [{ label: "Refresh", key: "F5", onClick: () => void load() }],
              )
            }
            className="arc-grid"
          />
        ) : (
          <ArEmpty title="No orders yet" action="New order" href={`/admin/orders/new?customer=${c.id}`} />
        ))}

      {tab === "activity" && (
        <div className="arc-pane">
          <ArActivity id={id} orders={orders} saved={saved} />
        </div>
      )}
      {tab === "notes" && (
        <div className="arc-pane">
          <ArSupport customerId={c.id} userId={user?.id} notes={d?.notes ?? []} orders={orders} onChange={load} />
        </div>
      )}
      {tab === "addresses" && (
        <div className="arc-pane">
          {!d?.addresses.length ? (
            <ArEmpty title="No addresses saved" />
          ) : (
            d.addresses.map((a) => (
              <div key={a.id} className="arc-addr">
                <b>
                  {a.label}
                  {a.is_default && <span className="arc-grey"> · default</span>}
                </b>
                <span className="arc-grey">
                  {a.recipient_name}, {a.line1}
                  {a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.pincode}
                </span>
                <AddressMap lat={a.latitude} lng={a.longitude} label={`${a.label}, ${a.line1}`} />
              </div>
            ))
          )}
        </div>
      )}
      {tab === "logins" && (
        <>
          {!logins ? (
            <p className="arc-note arc-pane">Loading.</p>
          ) : !logins.length ? (
            <ArEmpty title="None recorded yet" />
          ) : (
            <ArGrid cols={loginCols} rows={logins} keyOf={(l) => String(l.id)} className="arc-grid" />
          )}
          <div className="arc-more">
            <Link href="/admin/customers/sign-ins" className="arc-btn">
              All sign-ins
            </Link>
          </div>
        </>
      )}
      {tab === "saved" && (saved.length ? <ArGrid cols={savedCols} rows={saved} keyOf={(s) => s.slug} className="arc-grid" /> : <ArEmpty title="Nothing saved with the heart" />)}

      <ArHelp open={help} onClose={() => setHelp(false)} title="Customer">
        <p>One customer: what they have spent, their orders, and everything the shop knows about them.</p>
        <p>General holds their account (names, individual or business with its GSTIN, and status), their tags and contact. Change it and press Save. Blocked customers can&apos;t order for themselves; the shop still can, from New order.</p>
        <p>The other tabs: their orders (double-click to open one), activity on the shop, staff notes and support, saved addresses with a map, their latest sign-ins, and their wishlist.</p>
      </ArHelp>
      {dirty && (
        <div className="arc-pane">
          <ArInfo>Account changed: press Save to keep it.</ArInfo>
        </div>
      )}
    </ArScreen>
  );
}

// Tags as Aronium's inline add row: type and press Enter (or a comma) or +
// Add, × to take one off
function ArTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
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
    <>
      <div className="arc-inline">
        <input
          className="adm-input"
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
        <button type="button" className="arc-btn" disabled={!draft.trim()} onClick={() => add(draft)}>
          + Add tag
        </button>
      </div>
      <div className="arc-tags">
        {list.map((t) => (
          <span key={t} className="arc-tag">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => commit(list.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
      </div>
    </>
  );
}
