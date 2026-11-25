"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LogContactForm, MarkPaidForm } from "@/components/admin/PaymentForms";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money, SortTh, StatusPill, useSort, when } from "@/components/admin/ui";
import { STATUSES } from "@/lib/order-status";
import { useAuth } from "@/lib/auth";
import { contactsFor, errText, getSettings, listOrders, updateOrder, type Order, type OrderContact } from "@/lib/orders-db";
import { BULK, ExportForm, openRequest, TABS, telOf, waiting, waOf, type Step } from "@/components/admin/order/list";
import AroniumOrders from "@/components/admin/shells/AroniumOrders";
import { useAdminStyle } from "@/lib/admin-style";

// The order list: one tab per kind of work (unpaid, to pack, to ship, ...),
// a search box, bulk "mark as" for ticked orders, and export to a spreadsheet.
// The Aronium-style design shows it as Aronium's Documents screen instead.
export default function OrdersPage() {
  const style = useAdminStyle();
  return <Suspense>{style === "aronium" ? <AroniumOrders /> : <Orders />}</Suspense>;
}

function Orders() {
  const params = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(params.get("tab") ?? "all");
  // the sidebar's Orders › To pack while already here: switch in place
  useEffect(() => {
    const go = (e: Event) => {
      setTab((e as CustomEvent<{ tab: string }>).detail.tab || "all");
    };
    window.addEventListener("adm-nav", go);
    return () => window.removeEventListener("adm-nav", go);
  }, []);
  // ?q= from a link (a message's order number) starts the search
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();
  // manual payment: the hold time, the methods, and the contacts logged on unpaid orders
  const [hold, setHold] = useState(48);
  const [methods, setMethods] = useState<string[]>(["UPI", "Bank transfer", "Cash"]);
  const [contacts, setContacts] = useState<Map<string, OrderContact[]>>(new Map());
  const [paying, setPaying] = useState<Order | null>(null);
  const [logging, setLogging] = useState<Order | null>(null);

  const load = () =>
    listOrders()
      .then(async (list) => {
        setRows(list);
        const unpaid = list.filter((o) => o.status === "pending").map((o) => o.id);
        setContacts(await contactsFor(unpaid).catch(() => new Map()));
      })
      .catch((e) => setErr(errText(e)));
  useEffect(() => {
    void load();
    getSettings()
      .then((s) => {
        setHold(s.unpaid_hours);
        setMethods(s.payment_methods);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    if (tab === "all") u.delete("tab");
    else u.set("tab", tab);
    window.history.replaceState(null, "", `${window.location.pathname}${u.size ? `?${u}` : ""}`);
  }, [tab]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows?.filter((o) => t.match(o)).length ?? 0])), [rows]);
  const shown = useMemo(() => {
    const t = TABS.find((x) => x.id === tab) ?? TABS[0];
    const s = q.trim().toLowerCase();
    const list = t.id === "pending" ? [...(rows ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)) : (rows ?? []);
    return list.filter(
      (o) =>
        t.match(o) &&
        (!s || o.order_number.toLowerCase().includes(s) || o.contact_name.toLowerCase().includes(s) || o.contact_phone.replace(/\D/g, "").includes(s.replace(/\D/g, "") || "§") || o.contact_email.toLowerCase().includes(s)),
    );
  }, [rows, tab, q]);

  const { sorted, sort, toggle: sortBy } = useSort(shown, {
    order: { get: (o) => Number(o.order_number.replace(/\D/g, "")) || o.order_number },
    date: { get: (o) => o.created_at },
    customer: { get: (o) => o.contact_name, text: true },
    status: { get: (o) => STATUSES.indexOf(o.status), text: true },
    items: { get: (o) => o.order_items?.reduce((n, i) => n + i.quantity, 0) ?? 0 },
    total: { get: (o) => o.total },
  });

  const bulkTo = BULK[tab];
  const here = TABS.find((t) => t.id === tab) ?? TABS[0];
  const [moving, setMoving] = useState("");
  // the row's own next step, without opening the order
  async function step(o: Order, s: Step) {
    if (s.to === "ship") return router.push(`/admin/orders/view?id=${o.id}&step=shipped`);
    if (s.to === "open") return router.push(`/admin/orders/view?id=${o.id}`);
    if (s.to === "paid") return setPaying(o);
    setMoving(o.id);
    try {
      await updateOrder(o.id, s.to);
      await load();
      toast(`${o.order_number} ${s.done}`);
    } catch (e) {
      toastError(e);
    }
    setMoving("");
  }
  async function bulk() {
    if (!bulkTo) return;
    setBusy(true);
    setErr("");
    try {
      const n = picked.size;
      for (const id of picked) await updateOrder(id, bulkTo);
      setPicked(new Set());
      await load();
      toast(`${n} order${n === 1 ? "" : "s"} marked as ${bulkTo}`);
    } catch (e) {
      setErr(errText(e));
      toastError(e);
    }
    setBusy(false);
  }

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <header className="adm-pagehead">
        <h1>
          {here.label}
          {rows && <span className="adm-pagehead-n">{counts[here.id]}</span>}
        </h1>
        <p>{here.note}</p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      {/* phones: the tabs (a wide screen has them in the sidebar) */}
      <div className="adm-chips adm-only-narrow" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`adm-chip ${tab === t.id ? "is-on" : ""}`} onClick={() => (setTab(t.id), setPicked(new Set()))}>
            {t.label}
            {t.id !== "all" && counts[t.id] > 0 && <b>{counts[t.id]}</b>}
          </button>
        ))}
        {/* carts customers have not checked out yet: a page of its own */}
        <Link href="/admin/orders/carts" className="adm-chip">
          Carts →
        </Link>
      </div>

      <div className="adm-toolbar">
        <input className="adm-input" type="search" placeholder="Search by order number, name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        {bulkTo && picked.size > 0 && (
          <button type="button" className="adm-btn pri" disabled={busy} onClick={bulk}>
            {busy ? "Saving" : `Mark ${picked.size} as ${bulkTo}`}
          </button>
        )}
        {picked.size > 0 && (
          <>
            <Link href={`/admin/orders/print?ids=${[...picked].join(",")}&doc=invoice`} className="adm-btn" target="_blank">
              Invoices ({picked.size})
            </Link>
          </>
        )}
        <button type="button" className="adm-btn" disabled={!shown.length} onClick={() => setExporting(true)}>
          Export
        </button>
        <Link href="/admin/orders/new" className="adm-btn pri ord-new" aria-label="New order">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4v12M4 10h12" />
          </svg>
          <span>New order</span>
        </Link>
      </div>

      <Dialog open={exporting} onClose={() => setExporting(false)}>
        {exporting && (
          <ExportForm
            shown={shown}
            picked={shown.filter((o) => picked.has(o.id))}
            tab={TABS.find((t) => t.id === tab)?.label ?? "All"}
            searching={!!q.trim()}
            onClose={() => setExporting(false)}
          />
        )}
      </Dialog>

      <Dialog open={paying !== null} onClose={() => setPaying(null)}>
        {paying && (
          <MarkPaidForm
            order={paying}
            methods={methods}
            onCancel={() => setPaying(null)}
            onDone={() => {
              toast(`${paying.order_number} marked as paid`);
              setPaying(null);
              void load();
            }}
          />
        )}
      </Dialog>
      <Dialog open={logging !== null} onClose={() => setLogging(null)}>
        {logging && (
          <LogContactForm
            order={logging}
            userId={user?.id}
            onCancel={() => setLogging(null)}
            onDone={() => {
              toast(`Logged on ${logging.order_number}`);
              setLogging(null);
              void load();
            }}
          />
        )}
      </Dialog>

      <div className="adm-card adm-tablecard">
        {rows && shown.length === 0 ? (
          <p className="adm-empty">{rows.length === 0 ? "No orders yet. They appear here the moment a customer checks out." : "No orders match."}</p>
        ) : (
          <table className="adm-table ord-table">
            <thead>
              <tr>
                {bulkTo && <th aria-label="Select" />}
                <SortTh k="order" label="Order" sort={sort} onSort={sortBy} />
                <SortTh k="date" label="Date" sort={sort} onSort={sortBy} />
                <SortTh k="customer" label="Customer" sort={sort} onSort={sortBy} />
                <SortTh k="status" label="Status" sort={sort} onSort={sortBy} />
                <SortTh k="items" label="Items" sort={sort} onSort={sortBy} />
                <SortTh k="total" label="Total" sort={sort} onSort={sortBy} right />
                {here.step && <th aria-label="Next step" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => {
                const items = o.order_items?.reduce((n, i) => n + i.quantity, 0) ?? 0;
                const href = `/admin/orders/view?id=${o.id}`;
                return (
                  <tr key={o.id} data-href onClick={(e) => !(e.target as HTMLElement).closest("input,a,button") && router.push(href)}>
                    {bulkTo && (
                      <td data-hide-sm>
                        <input type="checkbox" aria-label={`Select ${o.order_number}`} checked={picked.has(o.id)} onChange={() => toggle(o.id)} />
                      </td>
                    )}
                    <td className="c-num">
                      <Link href={href} className="row-link">
                        {o.order_number}
                      </Link>
                      {o.is_test && <span className="adm-muted adm-small"> · test</span>}
                      {o.channel === "counter" && <span className="adm-muted adm-small"> · counter</span>}
                    </td>
                    <td className="adm-muted c-date">
                      {when(o.created_at)}
                      {o.status === "pending" && !o.is_test && (
                        <div className={`adm-small pay-left ${waiting(o, hold).urgent ? "is-urgent" : ""}`}>{waiting(o, hold).text}</div>
                      )}
                    </td>
                    <td className="c-who">
                      {o.contact_name}
                      <div className="adm-muted adm-small">{o.address_city}</div>
                      {tab === "pending" && (
                        <>
                          <div className="pay-reach">
                            <a href={`tel:${telOf(o.contact_phone)}`}>Call</a>
                            <a
                              href={`https://wa.me/${waOf(o.contact_phone)}?text=${encodeURIComponent(`Hi ${o.contact_name.split(" ")[0]}, this is Babajee about your order ${o.order_number} for ${money(o.total)}.`)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                            <button type="button" onClick={() => setLogging(o)}>
                              Log
                            </button>
                          </div>
                          {contacts.get(o.id)?.[0] && (
                            <div className="adm-small pay-last" title={contacts.get(o.id)![0].body}>
                              {when(contacts.get(o.id)![0].created_at)}: {contacts.get(o.id)![0].body.replace(`Payment for ${o.order_number}: `, "")}
                              {(contacts.get(o.id)?.length ?? 0) > 1 && <span className="adm-muted"> · {contacts.get(o.id)!.length} contacts</span>}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="c-status">
                      <StatusPill status={o.status} />
                      {o.status !== "refunded" && (o.order_refunds?.length ?? 0) > 0 && <div className="adm-small adm-refunded">Partly refunded</div>}
                      {openRequest(o) && (
                        <div className="adm-small adm-asked">
                          {openRequest(o)!.kind === "cancel" ? "Cancellation request" : "Return request"}
                          {tab === "requests" && openRequest(o)!.reason ? <span className="adm-muted adm-reason">: &ldquo;{openRequest(o)!.reason}&rdquo;</span> : null}
                        </div>
                      )}
                      {o.status === "shipped" && o.delivery_failed_at && <div className="adm-small adm-asked">Delivery failed</div>}
                    </td>
                    <td className="adm-muted" data-hide-sm>
                      {items} item{items === 1 ? "" : "s"}
                    </td>
                    <td className="r c-total">
                      <strong>{money(o.total)}</strong>
                    </td>
                    {here.step && (
                      <td className="r c-step">
                        {openRequest(o) && here.step.to !== "open" ? (
                          // the customer asked to cancel or return: that comes first
                          <Link href={href} className="adm-btn adm-btn-sm is-warn">
                            Review request
                          </Link>
                        ) : (
                          <button type="button" className="adm-btn adm-btn-sm" disabled={moving === o.id || busy} onClick={() => step(o, here.step!)}>
                            {moving === o.id ? "Saving" : here.step.label}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

