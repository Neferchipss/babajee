"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogContactForm, MarkPaidForm } from "@/components/admin/PaymentForms";
import { PreviewLayer } from "@/components/admin/print/ArPrintPreview";
import { invoiceSrc, printFrame } from "@/components/admin/print/printing";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money, SortTh, StatusPill, useSort, when } from "@/components/admin/ui";
import { BULK, ExportForm, openRequest, TABS, telOf, waiting, waOf, type Step } from "@/components/admin/order/list";
import { useAuth } from "@/lib/auth";
import { STATUSES } from "@/lib/order-status";
import { contactsFor, errText, getSettings, listOrders, updateOrder, type Order, type OrderContact } from "@/lib/orders-db";
import { ArSection, ArToolbar, menuOf, useArKeys, useArMenu, type ArMenuItem } from "./aronium-kit";
import "./aronium-screens-a.css";

// Orders in the Aronium-style design, laid out as Aronium's Management •
// Documents: a toolbar of big buttons, a filter panel (product, customer,
// kind of work, paid or not, order number, dates), the orders in a grid, and
// under it the selected order's lines. Click a row to select it, double-click
// (or Open) to open the order. The kinds of work are the same as the
// ordinary Orders page's tabs, and the menu's Orders pages switch them here.
const istDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const ICON: Record<string, string> = { paid: "paid", packed: "box", ship: "truck", delivered: "paid", open: "open" };

export default function AroniumOrders() {
  const params = useSearchParams();
  const router = useRouter();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [err, setErr] = useState("");
  const [hold, setHold] = useState(48);
  const [methods, setMethods] = useState<string[]>(["UPI", "Bank transfer", "Cash"]);

  // the filter panel
  const [type, setType] = useState(params.get("tab") ?? "all");
  const [product, setProduct] = useState("");
  const [customer, setCustomer] = useState(params.get("q") ?? "");
  const [paid, setPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [number, setNumber] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [sel, setSel] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [exporting, setExporting] = useState(false);
  // manual payment (0056): the contacts logged on unpaid orders, and the one being logged now
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Map<string, OrderContact[]>>(new Map());
  const [logging, setLogging] = useState<Order | null>(null);

  const load = () =>
    listOrders()
      .then(async (list) => {
        setRows(list);
        setErr("");
        setContacts(await contactsFor(list.filter((o) => o.status === "pending").map((o) => o.id)).catch(() => new Map()));
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
  // the menu's Orders › To pack while already here: switch in place
  useEffect(() => {
    const go = (e: Event) => {
      setType((e as CustomEvent<{ tab: string }>).detail.tab || "all");
      setTicked(new Set());
    };
    window.addEventListener("adm-nav", go);
    return () => window.removeEventListener("adm-nav", go);
  }, []);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    if (type === "all") u.delete("tab");
    else u.set("tab", type);
    window.history.replaceState(null, "", `${window.location.pathname}${u.size ? `?${u}` : ""}`);
  }, [type]);

  const kind = TABS.find((t) => t.id === type) ?? TABS[0];
  const shown = useMemo(() => {
    const p = product.trim().toLowerCase();
    const c = customer.trim().toLowerCase();
    const n = number.trim().toLowerCase();
    return (rows ?? []).filter((o) => {
      if (!kind.match(o)) return false;
      if (paid === "paid" && o.paid_total == null) return false;
      if (paid === "unpaid" && o.paid_total != null) return false;
      if (n && !o.order_number.toLowerCase().includes(n) && !(o.invoice_number ?? "").toLowerCase().includes(n)) return false;
      if (c && ![o.contact_name, o.contact_email, o.contact_phone, o.address_city].some((x) => (x ?? "").toLowerCase().includes(c))) return false;
      if (p && !(o.order_items ?? []).some((i) => `${i.product_name} ${i.variant_label} ${i.sku ?? ""}`.toLowerCase().includes(p))) return false;
      const d = istDay(o.created_at);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [rows, kind, product, customer, paid, number, from, to]);

  const { sorted, sort, toggle: sortBy } = useSort(shown, {
    number: { get: (o) => Number(o.order_number.replace(/\D/g, "")) || o.order_number },
    date: { get: (o) => o.created_at },
    customer: { get: (o) => o.contact_name, text: true },
    status: { get: (o) => STATUSES.indexOf(o.status), text: true },
    paid: { get: (o) => o.paid_total ?? -1 },
    items: { get: (o) => o.order_items?.reduce((n, i) => n + i.quantity, 0) ?? 0 },
    total: { get: (o) => o.total },
  });

  const picked = rows?.find((o) => o.id === sel) ?? null;
  // the step that moves the selected order on: from its kind of work if one
  // is chosen, otherwise from its own status
  const stepFor = (o: Order): Step | undefined => (kind.step && kind.match(o) ? kind.step : TABS.find((t) => t.id !== "all" && t.step && t.match(o) && !["requests", "problems"].includes(t.id))?.step);
  const step = picked ? stepFor(picked) : undefined;
  const bulkTo = BULK[type];

  async function move(o: Order, s: Step) {
    if (s.to === "ship") return router.push(`/admin/orders/view?id=${o.id}&step=shipped`);
    if (s.to === "open") return router.push(`/admin/orders/view?id=${o.id}`);
    if (s.to === "paid") return setPaying(o);
    setBusy(true);
    try {
      await updateOrder(o.id, s.to);
      await load();
      toast(`${o.order_number} ${s.done}`);
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  async function bulk() {
    if (!bulkTo) return;
    setBusy(true);
    try {
      const n = ticked.size;
      for (const id of ticked) await updateOrder(id, bulkTo);
      setTicked(new Set());
      await load();
      toast(`${n} order${n === 1 ? "" : "s"} marked as ${bulkTo}`);
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  const clear = () => {
    setType("all");
    setProduct("");
    setCustomer("");
    setPaid("all");
    setNumber("");
    setFrom("");
    setTo("");
  };
  const tick = (id: string) =>
    setTicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allTicked = shown.length > 0 && shown.every((o) => ticked.has(o.id));
  const printIds = ticked.size ? [...ticked] : picked ? [picked.id] : [];
  const items = picked?.order_items ?? [];

  // right-click: on an order, what can be done to it; on the empty grid, the screen's own actions
  const ctx = useArMenu();
  const openOrder = (o: Order) => router.push(`/admin/orders/view?id=${o.id}`);
  // Print and Save as PDF send the GST invoice straight to the print window;
  // Print preview shows it first, in Aronium's preview
  const [preview, setPreview] = useState<{ title: string; src: string } | null>(null);
  const printDoc = (ids: string[]) => ids.length && printFrame(invoiceSrc(ids), ".prt-page", (m) => toastError(new Error(m)));
  // Aronium's Documents menu (Add | Edit | Print, Print preview, Save as PDF |
  // Delete | Refresh), with Babajee's groups in between: the order's next step,
  // reaching an unpaid order's customer (as the ordinary page's Payment
  // pending tab does), and ticking for bulk steps and export
  const rowMenu = (o: Order | null): ArMenuItem[] => {
    const s = o ? stepFor(o) : undefined;
    const unpaid = !!o && o.status === "pending";
    return menuOf(
      [{ label: "Add", key: "Ctrl+N", onClick: () => router.push("/admin/orders/new") }],
      [
        { label: "Edit", disabled: !o, onClick: () => o && openOrder(o) },
        { label: s?.label.replace("…", "") ?? "Next step", disabled: !o || !s || busy, onClick: () => o && s && move(o, s) },
      ],
      [
        { label: "Print", key: "Ctrl+P", disabled: !o, onClick: () => o && printDoc(ticked.has(o.id) ? [...ticked] : [o.id]) },
        { label: "Print preview", key: "Ctrl+F2", disabled: !o, onClick: () => o && setPreview({ title: o.order_number, src: invoiceSrc([o.id]) }) },
        { label: "Save as PDF", disabled: !o, onClick: () => o && printDoc(ticked.has(o.id) ? [...ticked] : [o.id]) },
      ],
      unpaid && o
        ? [
            { label: "Call", onClick: () => (window.location.href = `tel:${telOf(o.contact_phone)}`), disabled: !o.contact_phone },
            {
              label: "WhatsApp",
              disabled: !o.contact_phone,
              onClick: () => window.open(`https://wa.me/${waOf(o.contact_phone)}?text=${encodeURIComponent(`Hi ${o.contact_name.split(" ")[0]}, this is Babajee about your order ${o.order_number} for ${money(o.total)}.`)}`, "_blank", "noreferrer"),
            },
            { label: "Log contact", onClick: () => setLogging(o) },
          ]
        : [],
      [
        { label: ticked.has(o?.id ?? "") ? "Untick" : "Tick", disabled: !o, onClick: () => o && tick(o.id) },
        { label: "Export to Excel", disabled: !shown.length, onClick: () => setExporting(true) },
      ],
      [{ label: "Delete", key: "Del", disabled: true }],
      [{ label: "Refresh", key: "F5", onClick: () => void load() }],
    );
  };
  useArKeys({ add: () => router.push("/admin/orders/new"), refresh: () => void load(), edit: () => picked && openOrder(picked) });

  return (
    <div className="aro">
      {preview && <PreviewLayer title={preview.title} src={preview.src} onClose={() => setPreview(null)} />}
      <ArToolbar
        tools={[
          { icon: "add", label: "Add", href: "/admin/orders/new", title: "New order" },
          { icon: "open", label: "Open", disabled: !picked, onClick: () => picked && router.push(`/admin/orders/view?id=${picked.id}`) },
          bulkTo && ticked.size > 0
            ? { icon: ICON[bulkTo] ?? "paid", label: `Mark ${ticked.size} ${bulkTo}`, disabled: busy, onClick: bulk }
            : { icon: step ? (ICON[step.to] ?? "paid") : "paid", label: step?.label.replace("…", "") ?? "Next step", disabled: !picked || !step || busy, onClick: () => picked && step && move(picked, step) },
          { icon: "print", label: "Print", disabled: !printIds.length, onClick: () => printDoc(printIds), title: "Print the GST invoice of the ticked orders, or the selected one" },
          { icon: "excel", label: "Excel", disabled: !shown.length, onClick: () => setExporting(true) },
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "list", label: "Carts", href: "/admin/orders/carts", title: "Carts not checked out yet" },
        ]}
      />

      <form
        className="aro-filter"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          <span>Product</span>
          <input className="adm-input" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="All products" />
        </label>
        <label>
          <span>Order type</span>
          <select className="adm-input" value={type} onChange={(e) => {
              setType(e.target.value);
              setTicked(new Set());
            }}>
            {TABS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id === "all" ? "All orders" : t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Paid status</span>
          <select className="adm-input" value={paid} onChange={(e) => setPaid(e.target.value as typeof paid)}>
            <option value="all">All transactions</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Not paid</option>
          </select>
        </label>
        <label>
          <span>Customer</span>
          <input className="adm-input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="All customers" />
        </label>
        <label>
          <span>Order number</span>
          <input className="adm-input" value={number} onChange={(e) => setNumber(e.target.value)} />
        </label>
        <label className="aro-period">
          <span>Period</span>
          <span className="aro-dates">
            <input className="adm-input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input className="adm-input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </span>
        </label>
        <div className="aro-go">
          <button className="art-btn">
            <svg viewBox="0 0 20 20" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M8.5 14a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM12.5 12.5l5 5" />
            </svg>
            <span>Search</span>
          </button>
          <button type="button" className="art-btn" onClick={clear}>
            <svg viewBox="0 0 20 20" width="30" height="30" fill="currentColor" aria-hidden="true">
              <path d="M3 4h14l-5.5 6.5V16l-3-1.5v-4z" />
            </svg>
            <span>Clear</span>
          </button>
        </div>
      </form>

      {err && <p className="adm-err">{err}</p>}
      <ArSection title={kind.id === "all" ? "Orders" : kind.label} n={rows ? shown.length : undefined} />
      <div className="aro-grid" onContextMenu={(e) => ctx.open(e, rowMenu(null))}>
        {ctx.node}
        <table className="adm-table aro-table">
          <thead>
            <tr>
              <th className="aro-tick">
                <input type="checkbox" aria-label="Tick all" checked={allTicked} onChange={() => setTicked(allTicked ? new Set() : new Set(shown.map((o) => o.id)))} />
              </th>
              <SortTh k="number" label="Number" sort={sort} onSort={sortBy} />
              <SortTh k="date" label="Date" sort={sort} onSort={sortBy} />
              <SortTh k="customer" label="Customer" sort={sort} onSort={sortBy} />
              <th>City</th>
              <SortTh k="status" label="Status" sort={sort} onSort={sortBy} />
              <SortTh k="paid" label="Paid" sort={sort} onSort={sortBy} right />
              <SortTh k="items" label="Items" sort={sort} onSort={sortBy} right />
              <th>Invoice</th>
              <SortTh k="total" label="Total" sort={sort} onSort={sortBy} right />
            </tr>
          </thead>
          <tbody>
            {sorted.map((o) => {
              const n = o.order_items?.reduce((a, i) => a + i.quantity, 0) ?? 0;
              const ask = openRequest(o);
              return (
                <tr
                  key={o.id}
                  className={o.id === sel ? "is-sel" : ""}
                  tabIndex={0}
                  aria-selected={o.id === sel}
                  onClick={(e) => !(e.target as HTMLElement).closest("input") && setSel(o.id)}
                  onDoubleClick={() => openOrder(o)}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    setSel(o.id);
                    ctx.open(e, rowMenu(o));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/admin/orders/view?id=${o.id}`);
                    if (e.key === " ") {
                      e.preventDefault();
                      setSel(o.id);
                    }
                  }}
                >
                  <td className="aro-tick">
                    <input type="checkbox" aria-label={`Tick ${o.order_number}`} checked={ticked.has(o.id)} onChange={() => tick(o.id)} />
                  </td>
                  <td>
                    {o.order_number}
                    {o.is_test && <span className="adm-muted"> · test</span>}
                    {o.channel === "counter" && <span className="adm-muted"> · counter</span>}
                  </td>
                  <td>{when(o.created_at)}</td>
                  <td>{o.contact_name}</td>
                  <td>{o.address_city}</td>
                  <td>
                    <StatusPill status={o.status} />
                    {ask && <span className="aro-flag">{ask.kind === "cancel" ? "Cancel asked" : "Return asked"}</span>}
                    {o.status === "shipped" && o.delivery_failed_at && <span className="aro-flag">Delivery failed</span>}
                    {o.status === "pending" && !o.is_test && <span className={`aro-clock ${waiting(o, hold).urgent ? "is-urgent" : ""}`}>{waiting(o, hold).text}</span>}
                    {o.status === "pending" && contacts.get(o.id)?.[0] && (
                      <span className="aro-last" title={contacts.get(o.id)![0].body}>
                        {when(contacts.get(o.id)![0].created_at)}: {contacts.get(o.id)![0].body.replace(`Payment for ${o.order_number}: `, "")}
                        {(contacts.get(o.id)?.length ?? 0) > 1 && ` · ${contacts.get(o.id)!.length} contacts`}
                      </span>
                    )}
                  </td>
                  <td className="r">{o.paid_total == null ? "" : money(o.paid_total)}</td>
                  <td className="r">{n}</td>
                  <td>{o.invoice_number ?? ""}</td>
                  <td className="r">{money(o.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows && !shown.length && <p className="aro-none">{rows.length ? "No orders match the filter." : "No orders yet."}</p>}
      </div>

      <div className="aro-split" aria-hidden="true">
        •••
      </div>
      <ArSection title={picked ? `Order items · ${picked.order_number}` : "Order items"} n={items.length} />
      <div className="aro-grid aro-items">
        <table className="adm-table aro-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Option</th>
              <th className="r">Quantity</th>
              <th className="r">Price</th>
              <th className="r">Tax</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, k) => (
              <tr key={`${i.sku ?? ""}-${i.product_name}-${i.variant_label}-${k}`}>
                <td>{i.sku ?? ""}</td>
                <td>{i.product_name}</td>
                <td>{i.variant_label}</td>
                <td className="r">{i.quantity}</td>
                <td className="r">{money(i.unit_price)}</td>
                <td className="r">{(i.gst_rate ?? picked?.gst_rate) == null ? "" : `${i.gst_rate ?? picked?.gst_rate}%`}</td>
                <td className="r">{money(i.unit_price * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!picked && <p className="aro-none">Select an order to see its items.</p>}
      </div>

      <Dialog open={exporting} onClose={() => setExporting(false)}>
        {exporting && <ExportForm shown={shown} picked={shown.filter((o) => ticked.has(o.id))} tab={kind.id === "all" ? "All" : kind.label} searching={!!(product || customer || number || from || to || paid !== "all")} onClose={() => setExporting(false)} />}
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
    </div>
  );
}
