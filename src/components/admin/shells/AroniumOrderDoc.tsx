"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AddressMap from "@/components/admin/AddressMap";
import { EditForm, RefundForm, type EditInput, type RefundInput } from "@/components/admin/OrderForms";
import { LogContactForm, MarkPaidForm } from "@/components/admin/PaymentForms";
import { PreviewLayer } from "@/components/admin/print/ArPrintPreview";
import { invoiceSrc, printFrame } from "@/components/admin/print/printing";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money, StatusPill, when } from "@/components/admin/ui";
import { BuyerGstin } from "@/components/admin/order/BuyerGstin";
import { Confirm } from "@/components/admin/order/Confirm";
import { OrderProfit } from "@/components/admin/order/OrderProfit";
import { Roadmap, STEP_DO, STEP_LABEL, StepForm } from "@/components/admin/order/Steps";
import { useAuth } from "@/lib/auth";
import { gstLabel } from "@/lib/gst";
import { actionsFor, eventText, STEPS, type OrderAction, type OrderStatus } from "@/lib/order-status";
import {
  addOrderComment,
  cameBack,
  contactsFor,
  deliveryFailed,
  DELIVERY_DEFAULTS,
  editOrder,
  errText,
  getDeliveryRules,
  getOrder,
  getSettings,
  paymentsFor,
  refundOrder,
  refundsOf,
  resolveRequest,
  sendAgain,
  setBuyerGstin,
  setOrderNotes,
  setStep,
  settleBalance,
  undoRefund,
  updateOrder,
  type Order,
  type OrderContact,
  type OrderRequest,
  type Payment,
  type Refund,
} from "@/lib/orders-db";
import { trackLink } from "@/lib/tracking";
import { ArIcon, ArToolbar, menuOf, useArKeys, useArMenu } from "./aronium-kit";
import { Band, DocFooter, DocHead, DocNotes, DocStrip, DocTabs, DocTotals, dmy, dmyTime, HF, HV, MiniBar, PaidSwitch } from "./aronium-docs";

// One order in the Aronium-style design, as Aronium's document editor (a tab
// of Management • Documents): the header fields (Number, External document =
// the invoice number, Customer; Date, Due date, Stock date; the Paid switch),
// the Document items | Payments tabs, the totals, Internal note (a staff
// comment) and Note (the order's note), and the footer bar. Babajee's own
// work on an order sits on top: a toolbar of its actions (the next step, mark
// paid, log a contact, delivery failed, send again, returned to origin,
// edit, return, refund, cancel, invoice, credit notes) and more tabs
// (Delivery & tracking, Customer, Customer requests, Returns & refunds,
// History with the road of steps, Notes, Profit). Same data and saves as the
// ordinary order page.
type Tab = "items" | "payments" | "delivery" | "customer" | "requests" | "returns" | "history" | "notes" | "profit";
const NEXT_ICON: Record<string, string> = { paid: "paid", packed: "box", shipped: "truck", delivered: "paid" };
const CH: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", email: "Email" };
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function AroniumOrderDoc() {
  const id = useSearchParams().get("id") ?? "";
  const { user } = useAuth();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("items");
  const [selLine, setSelLine] = useState<string | null>(null);
  const [selPay, setSelPay] = useState<string | null>(null);
  const [asking, setAsking] = useState<OrderAction | null>(null);
  const [form, setForm] = useState<"refund" | "return" | "edit" | null>(null);
  const [undoing, setUndoing] = useState<Refund | null>(null);
  const [stepping, setStepping] = useState<OrderStatus | null>(null);
  const [answering, setAnswering] = useState<OrderRequest | null>(null);
  const [declining, setDeclining] = useState<OrderRequest | null>(null);
  const [failing, setFailing] = useState(false);
  const [reasons, setReasons] = useState(DELIVERY_DEFAULTS.fail_reasons);
  const [failWhy, setFailWhy] = useState(DELIVERY_DEFAULTS.fail_reasons[0]);
  const [failNote, setFailNote] = useState("");
  const [resending, setResending] = useState(false);
  const [reCarrier, setReCarrier] = useState("");
  const [reTracking, setReTracking] = useState("");
  const [comingBack, setComingBack] = useState(false);
  const [backConfirm, setBackConfirm] = useState(false);
  // the GST invoice or credit notes in Aronium's print preview
  const [preview, setPreview] = useState<"invoice" | "cn" | null>(null);
  const [reply, setReply] = useState("");
  const [comment, setComment] = useState("");
  const [notes, setNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [logging, setLogging] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contacts, setContacts] = useState<OrderContact[]>([]);
  const [methods, setMethods] = useState<string[]>(["UPI", "Bank transfer", "Cash"]);
  const lineMenu = useArMenu();
  const payMenu = useArMenu();

  useEffect(() => {
    getSettings()
      .then((s) => setMethods(s.payment_methods))
      .catch(() => {});
    getDeliveryRules()
      .then((r) => r && setReasons(r.fail_reasons))
      .catch(() => {});
  }, []);

  const load = useCallback(
    () =>
      getOrder(id)
        .then((r) => {
          setO(r);
          if (r) paymentsFor([r.id]).then(setPayments).catch(() => setPayments([]));
          if (r)
            contactsFor([r.id])
              .then((m) => setContacts(m.get(r.id) ?? []))
              .catch(() => setContacts([]));
          setNotes(r?.notes ?? "");
          // from the list's "Ship…": straight to the courier form
          const u = new URLSearchParams(window.location.search);
          if (u.get("step") === "shipped") {
            if (r?.status === "packed") setStepping("shipped");
            u.delete("step");
            window.history.replaceState(null, "", `${window.location.pathname}?${u}`);
          }
        })
        .catch((e) => setErr(errText(e))),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useArKeys({ refresh: () => void load() });

  async function run(a: OrderAction, opts: Parameters<typeof updateOrder>[2] = {}) {
    if (!o) return;
    setBusy(true);
    setErr("");
    try {
      await updateOrder(o.id, a.to, opts);
      setAsking(null);
      await load();
      toast(`${o.order_number} ${a.to === "cancelled" ? "cancelled" : `marked as ${STEP_DO[a.to] ?? a.to}`}`);
    } catch (e) {
      setErr(errText(e));
      toastError(e);
    }
    setBusy(false);
  }

  async function act(f: () => Promise<void>, done?: string) {
    setBusy(true);
    setErr("");
    try {
      await f();
      if (done) toast(done);
      setForm(null);
      setUndoing(null);
      setStepping(null);
      setAnswering(null);
      setDeclining(null);
      setFailing(false);
      setResending(false);
      setComingBack(false);
      setBackConfirm(false);
      await load();
    } catch (e) {
      setErr(errText(e));
      toastError(e);
      setForm(null);
      setUndoing(null);
      setStepping(null);
    }
    setBusy(false);
  }

  // Save: the order's note if it changed, and the internal note as a staff comment
  async function save(which: "both" | "note" | "comment" = "both") {
    if (!o) return;
    const noteChanged = notes !== o.notes && which !== "comment";
    const said = which !== "note" && comment.trim() !== "" && !!user;
    if (!noteChanged && !said) return;
    setBusy(true);
    setErr("");
    try {
      if (noteChanged) await setOrderNotes(o.id, notes);
      if (said) {
        await addOrderComment(o.id, user!.id, comment.trim());
        setComment("");
      }
      await load();
      toast(noteChanged && said ? "Note saved, comment posted" : noteChanged ? "Note saved" : "Comment posted");
    } catch (e) {
      setErr(errText(e));
      toastError(e);
    }
    setBusy(false);
  }

  if (o === undefined)
    return (
      <div className="arx">
        <DocStrip listHref="/admin/orders" tab="…" closeHref="/admin/orders" />
        <p className="arx-dim">{err || "Loading the order."}</p>
      </div>
    );
  if (o === null)
    return (
      <div className="arx">
        <DocStrip listHref="/admin/orders" tab="Not found" closeHref="/admin/orders" />
        <p className="arx-dim">This order doesn&apos;t exist, or was removed.</p>
      </div>
    );

  const actions = actionsFor(o.status);
  const items = o.order_items ?? [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const ship = o.shipments?.[0];
  const refunds = refundsOf(o);
  const paid = o.paid_total;
  const left = (paid ?? 0) - refunds.amount;
  const openReq = (o.order_requests ?? []).find((r) => r.status === "open");
  const canEdit = ["pending", "paid", "packed"].includes(o.status) && refunds.amount === 0 && !o.invoice_number;
  const canRefund = ["paid", "packed", "shipped", "delivered"].includes(o.status) && left > 0;
  const canReturn = ["shipped", "delivered"].includes(o.status) && left > 0 && items.some((i) => i.quantity > (refunds.byItem.get(i.id) ?? 0));
  const balance = paid == null || o.status === "cancelled" || o.status === "refunded" ? 0 : Math.round((o.total - paid) * 100) / 100;
  const failed = o.status === "shipped" && !!o.delivery_failed_at;
  const closedAt = (o.order_events ?? []).find((e) => e.status === o.status)?.created_at;
  const cameBackAt = o.status === "refunded" ? (o.order_events ?? []).find((e) => e.status === "refunded" && e.note.startsWith("Came back undelivered"))?.created_at : undefined;
  const cancel = actions.find((a) => a.to === "cancelled");
  const nextStep = actions.find((a) => a.primary);
  const canUndo = o.status !== "cancelled" && !o.invoice_number;
  function pickStep(to: OrderStatus) {
    if (!o || to === o.status) return;
    const forward = STEPS.indexOf(to) > STEPS.indexOf(o.status);
    if (forward && o.status === "pending") return setPaying(true);
    if (!forward || to === "shipped" || (to === "delivered" && !ship)) setStepping(to);
    else void act(() => setStep(o.id, to), `${o.order_number} marked as ${STEP_DO[to]}`);
  }
  const phone = o.contact_phone.replace(/\D/g, "");
  const wa = phone.length === 10 ? `91${phone}` : phone.length === 12 && phone.startsWith("91") ? phone : "";
  const first = o.contact_name.split(" ")[0];
  const timeline = [
    ...(o.order_events ?? [])
      .filter((e) => ["comment", "edited", "refund", "return", "balance", "refund_undone", "request", "delivery_failed", "sent_again"].includes(e.status) || ((e.status === "cancelled" || e.status === "refunded") && e.note))
      .map((e) => ({ id: e.id, kind: e.status, text: eventText(e.status, e.note), at: e.created_at })),
    ...contacts.map((c) => ({ id: c.id, kind: "contact", text: `${CH[c.channel] ?? "Contact"}: ${c.body}${c.status === "open" ? " · follow-up open" : ""}`, at: c.created_at })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const history = [...(o.order_events ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const next =
    o.status === "pending"
      ? `Waiting for ${money(o.total)}. Contact ${first} to take payment, then mark it paid.`
      : o.status === "paid"
        ? `Paid. Pack the ${count} item${count === 1 ? "" : "s"} next.`
        : o.status === "packed"
          ? "Packed. Mark it shipped once it's with the courier."
          : failed
            ? "The courier couldn't deliver it. Send it again, or take it back in once it returns."
            : o.status === "shipped"
              ? `On its way${ship?.carrier ? ` with ${ship.carrier}` : ""}. Mark it delivered when it arrives.`
              : o.status === "delivered"
                ? `Delivered${ship?.delivered_at ? ` ${when(ship.delivered_at).toLowerCase()}` : ""}. Nothing left to do.`
                : o.status === "cancelled"
                  ? `Cancelled${closedAt ? ` ${when(closedAt).toLowerCase()}` : ""}.`
                  : cameBackAt
                    ? `Came back undelivered ${when(cameBackAt).toLowerCase()}. ${money(refunds.amount)} refunded${refunds.amount < (paid ?? 0) ? `, ${money((paid ?? 0) - refunds.amount)} kept` : ""}.`
                    : `Refunded in full: ${money(refunds.amount)} sent back.`;

  // the lines, as Aronium's columns: price before tax, tax, price, totals
  const lines = items.map((i, n) => {
    const rate = i.gst_rate ?? o.gst_rate ?? 0;
    const pbt = o.gst_inclusive ? i.unit_price / (1 + rate / 100) : i.unit_price;
    const price = o.gst_inclusive ? i.unit_price : i.unit_price * (1 + rate / 100);
    return { i, n: n + 1, rate, pbt: r2(pbt), price: r2(price), totalBefore: r2(pbt * i.quantity), total: r2(price * i.quantity), back: refunds.byItem.get(i.id) ?? 0 };
  });
  const cess = o.cess ?? 0;
  const before = r2(o.total - o.tax - cess);
  const captured = payments.filter((x) => x.status === "captured");
  const paidSum = r2(captured.reduce((n, x) => n + x.amount, 0));
  // Print and Save as PDF go straight to the print window (the invoice is
  // issued on first print, as before); Print preview shows it first
  const printDoc = (doc: "invoice" | "cn") =>
    printFrame(invoiceSrc([o.id], doc), ".prt-page", (m) => toastError(new Error(m)));
  const canInvoice = o.paid_total != null && o.status !== "cancelled";
  const reqs = o.order_requests ?? [];
  const dirty = notes !== o.notes || comment.trim() !== "";

  const startFail = () => (setFailWhy(reasons[0]), setFailNote(""), setFailing(true));
  const startResend = () => (setReCarrier(ship?.carrier ?? ""), setReTracking(""), setResending(true));
  const startRto = () => {
    if (canReturn) {
      setComingBack(true);
      setForm("return");
    } else setBackConfirm(true);
  };
  const lineItems = (r: Refund) =>
    (r.order_refund_items ?? [])
      .map((ri) => {
        const it = items.find((i) => i.id === ri.order_item_id);
        return `${it?.product_name ?? "an item"}${ri.quantity > 1 ? ` ×${ri.quantity}` : ""}`;
      })
      .join(", ");

  return (
    <div className="arx">
      <DocStrip listHref="/admin/orders" tab={o.order_number} closeHref="/admin/orders" />
      <ArToolbar
        tools={[
          { icon: nextStep ? (NEXT_ICON[nextStep.to] ?? "open") : "open", label: nextStep?.label ?? "Next step", disabled: busy || !nextStep || !!openReq || failed, onClick: () => nextStep && pickStep(nextStep.to) },
          { icon: "history", label: "Log a contact", disabled: !(o.status === "pending" || o.profile_id), onClick: () => setLogging(true) },
          { icon: "truck", label: failed ? "Send again" : "Delivery failed", disabled: busy || o.status !== "shipped", onClick: failed ? startResend : startFail },
          { icon: "import", label: "Returned (RTO)", disabled: busy || !failed, onClick: startRto, title: "Returned to origin" },
          { icon: "edit", label: "Edit order", disabled: busy || !canEdit, onClick: () => setForm("edit") },
          { icon: "import", label: "Return items", disabled: busy || !canReturn, onClick: () => setForm("return") },
          { icon: "export", label: "Refund", disabled: busy || !canRefund, onClick: () => setForm("refund") },
          { icon: "clear", label: cancel?.label ?? "Cancel order", disabled: busy || !cancel, onClick: () => cancel && setAsking(cancel) },
          { icon: "print", label: o.invoice_number ? "Invoice" : "Issue invoice", onClick: () => setPreview("invoice"), disabled: !canInvoice, title: o.invoice_number ? `Invoice ${o.invoice_number}` : "Issued on first print" },
          { icon: "print", label: "Credit notes", onClick: () => setPreview("cn"), disabled: !(o.invoice_number && (o.order_refunds ?? []).length > 0) },
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}

      {failed && (
        <div className="arx-info is-bad" role="status">
          <p>
            <b>Delivery failed{(o.delivery_attempts ?? 0) > 1 ? ` (${o.delivery_attempts} times)` : ""}</b> · {o.delivery_failed_reason || "Not delivered"} · {when(o.delivery_failed_at!)}
            {wa && (
              <>
                {" · "}
                <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${first}, the courier couldn't deliver your Babajee order ${o.order_number}. Could you confirm your address and a good time to deliver?`)}`} target="_blank" rel="noreferrer">
                  Message on WhatsApp
                </a>
              </>
            )}
          </p>
          <button type="button" className="arx-minib is-b" disabled={busy} onClick={startResend}>
            Send again
          </button>
          <button type="button" className="arx-minib" disabled={busy} onClick={startRto}>
            Returned to origin (RTO)
          </button>
        </div>
      )}
      {openReq && (
        <div className="arx-info is-warn" role="status">
          <p>
            <b>{openReq.kind === "cancel" ? "The customer asks to cancel this order" : "The customer asks to return items"}</b> ·{" "}
            {openReq.kind === "return" &&
              openReq.items
                .map((x) => {
                  const it = items.find((i) => i.id === x.item);
                  return `${it?.product_name ?? "An item"}${x.qty > 1 ? ` ×${x.qty}` : ""}`;
                })
                .join(", ") + " · "}
            {openReq.reason ? `“${openReq.reason}”` : "No reason given"} · {when(openReq.created_at)}
          </p>
          <button
            type="button"
            className="arx-minib is-b"
            disabled={busy || !canRefund}
            title={canRefund ? undefined : "Nothing left to refund on this order"}
            onClick={() => {
              setAnswering(openReq);
              setForm(openReq.kind === "cancel" ? "refund" : "return");
            }}
          >
            {openReq.kind === "cancel" ? "Accept and refund everything" : "Accept and refund"}
          </button>
          <button type="button" className="arx-minib" disabled={busy} onClick={() => (setReply(""), setDeclining(openReq))}>
            Decline
          </button>
        </div>
      )}
      {balance !== 0 && (
        <div className="arx-info" role="status">
          <p>
            <b>{balance > 0 ? `Amount due: ${money(balance)}` : `Amount refundable: ${money(-balance)}`}</b> · the order was edited after it was paid.
          </p>
          <button type="button" className="arx-minib is-b" disabled={busy} onClick={() => act(() => settleBalance(o.id), balance > 0 ? `${money(balance)} marked as received` : `${money(-balance)} marked as refunded`)}>
            {balance > 0 ? "Mark payment received" : "Mark refund paid"}
          </button>
        </div>
      )}

      <DocHead>
        <HF label="Number">
          <HV>
            {o.order_number}
            {o.is_test && <span className="arx-flag is-off">Test</span>}
            {o.channel === "counter" && (
              <Link className="arx-flag" href={`/admin/counter/receipt?id=${o.id}&back=${encodeURIComponent(`/admin/orders/view?id=${o.id}`)}`} title="Sold at the counter: print its till receipt">
                Counter · receipt
              </Link>
            )}
          </HV>
        </HF>
        <HF label="External document">
          <HV muted={!o.invoice_number}>{o.invoice_number ? `Invoice ${o.invoice_number}` : "(no invoice yet)"}</HV>
        </HF>
        <HF label="Customer" wide>
          <HV>{o.profile_id ? <Link href={`/admin/customers/view?id=${o.profile_id}`}>{o.contact_name}</Link> : o.contact_name}</HV>
        </HF>
        <HF label="Date">
          <HV>{dmy(o.created_at)}</HV>
        </HF>
        <HF label="Due date">
          <HV muted>{o.status === "pending" ? "On contact" : dmy(o.created_at)}</HV>
        </HF>
        <HF label="Stock date">
          <HV>{dmyTime(o.created_at)}</HV>
        </HF>
        <div className="arx-hcell">
          <PaidSwitch
            on={paid != null}
            disabled={busy || o.status !== "pending"}
            onClick={() => setPaying(true)}
            title={paid == null ? (o.status === "pending" ? "Mark it paid: how was it paid?" : "Not paid") : refunds.amount > 0 ? `${money(paid - refunds.amount)} kept after refunds` : `${money(paid)} paid`}
          />
          <span className="arx-sub">{paid == null ? "Not paid yet" : refunds.amount > 0 ? `${money(paid - refunds.amount)} kept after refunds` : paid === o.total ? "Paid" : `${money(paid)} paid`}</span>
        </div>
        <div className="arx-hcell">
          <span className="arx-status">
            <StatusPill status={o.status} />
            {refunds.amount > 0 && o.status !== "refunded" && <span className="arx-flag is-off">Partly refunded</span>}
            {failed && <span className="arx-flag is-warn">Delivery failed</span>}
          </span>
        </div>
        <div className="arx-hcell">
          <span className="arx-sub" style={{ maxWidth: 420, whiteSpace: "normal" }}>
            {next}
          </span>
        </div>
      </DocHead>

      <DocTabs<Tab>
        tabs={[
          ["items", "Document items"],
          ["payments", "Payments"],
          ["delivery", "Delivery & tracking", failed ? 1 : undefined],
          ["customer", "Customer"],
          ["requests", "Customer requests", reqs.filter((r) => r.status === "open").length || undefined],
          ["returns", "Returns & refunds"],
          ["history", "History"],
          ["notes", "Notes"],
          ["profit", "Profit"],
        ]}
        on={tab}
        onPick={setTab}
      />

      {tab === "items" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "edit", label: "Edit", disabled: busy || !canEdit, onClick: () => setForm("edit"), title: canEdit ? undefined : o.invoice_number ? "An issued invoice can't change: refund instead" : "This order can't be edited now" },
                { icon: "clear", label: "Delete", disabled: busy || !canEdit || !selLine, onClick: () => setForm("edit") },
                { icon: "import", label: "Return items", disabled: busy || !canReturn, onClick: () => setForm("return") },
                { icon: "export", label: "Refund", disabled: busy || !canRefund, onClick: () => setForm("refund") },
              ]}
            >
              <span className="arx-sub">
                {count} item{count === 1 ? "" : "s"}
              </span>
            </MiniBar>
            <div
              className="aro-grid"
              onContextMenu={(e) =>
                lineMenu.open(
                  e,
                  menuOf(
                    [{ label: "Edit", onClick: () => setForm("edit"), disabled: !canEdit || !selLine }],
                    [{ label: "Delete", key: "Del", onClick: () => setForm("edit"), disabled: !canEdit || !selLine }],
                    [
                      { label: "Return items", onClick: () => setForm("return"), disabled: !canReturn },
                      { label: "Refund", onClick: () => setForm("refund"), disabled: !canRefund },
                    ],
                  ),
                )
              }
            >
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Unit of measure</th>
                    <th className="r">Quantity</th>
                    <th className="r">Price before tax</th>
                    <th className="r">Tax</th>
                    <th className="r">Price</th>
                    <th className="r">Discount</th>
                    <th className="r">Total before tax</th>
                    <th className="r">Total</th>
                    <th>Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr
                      key={l.i.id}
                      className={`${l.i.id === selLine ? "is-sel" : ""} ${l.back === l.i.quantity ? "is-back" : ""}`}
                      onClick={() => setSelLine(l.i.id)}
                      onContextMenu={() => setSelLine(l.i.id)}
                      onDoubleClick={() => canEdit && setForm("edit")}
                    >
                      <td>{l.n}</td>
                      <td>{l.i.sku ?? ""}</td>
                      <td>
                        {l.i.product_name}
                        {l.i.variant_label && <span className="adm-muted"> · {l.i.variant_label}</span>}
                      </td>
                      <td>{(l.i.pack ?? 1) > 1 ? `Box of ${l.i.pack}` : "pcs"}</td>
                      <td className="r">{l.i.quantity}</td>
                      <td className="r">{money(l.pbt)}</td>
                      <td className="r">{l.rate}%</td>
                      <td className="r">{money(l.price)}</td>
                      <td className="r">0.00</td>
                      <td className="r">{money(l.totalBefore)}</td>
                      <td className="r">{money(l.total)}</td>
                      <td>{l.back > 0 ? <span className="arx-red">{l.back === l.i.quantity ? "Refunded" : `${l.back} refunded`}</span> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lineMenu.node}
            </div>
            <DocTotals
              rows={[
                ["Items:", money(o.subtotal), "is-muted"],
                ["Delivery:", o.shipping ? money(o.shipping) : "Free", "is-muted"],
                ["Total before tax:", money(before)],
                [`Tax${o.tax > 0 ? ` (${gstLabel(o.gst_inclusive, o.gst_rate)})` : ""}:`, money(o.tax)],
                cess > 0 && [`${o.gst_inclusive ? "Includes cess" : "Cess"}:`, money(cess)],
              ]}
              total={money(o.total)}
            >
              <select className="arx-input" disabled aria-label="Apply discount" title="Babajee orders carry no discount">
                <option>Apply discount after tax</option>
              </select>
              <select className="arx-input" disabled aria-label="Discount type" title="Babajee orders carry no discount">
                <option>Discount percent</option>
              </select>
              <span className="arx-input" aria-disabled="true">0 %</span>
            </DocTotals>
            {(paid != null || refunds.amount > 0) && (
              <DocTotals
                totalLabel={refunds.amount > 0 ? "Kept after refunds:" : "Paid:"}
                total={money(refunds.amount > 0 ? (paid ?? 0) - refunds.amount : (paid ?? 0))}
                rows={[
                  refunds.amount > 0 && ["Paid:", paid == null ? "Not yet" : money(paid), "is-muted"],
                  ...(o.order_refunds ?? []).map(
                    (r) =>
                      [
                        <>
                          {r.returned ? "Returned" : "Refunded"} {when(r.created_at).toLowerCase()}
                          {r.reason && <span className="arx-sub">{r.reason}</span>}
                          {canUndo && (
                            <button type="button" className="arx-link" disabled={busy} onClick={() => setUndoing(r)}>
                              {" "}
                              Undo
                            </button>
                          )}
                        </>,
                        `−${money(r.amount)}`,
                        "is-bad",
                      ] as const,
                  ),
                ]}
              />
            )}
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "add", label: "New", bordered: true, disabled: busy || !(o.status === "pending" || balance > 0), onClick: () => (o.status === "pending" ? setPaying(true) : void act(() => settleBalance(o.id), `${money(balance)} marked as received`)), title: o.status === "pending" ? "Mark it paid" : balance > 0 ? "Mark the amount due received" : "Nothing left to pay" },
                { icon: "edit", label: "Edit", disabled: true, title: "A payment stays as recorded; refund instead" },
                { icon: "clear", label: "Delete", disabled: true, title: "A payment stays as recorded; refund instead" },
                balance < 0 && { icon: "export", label: "Mark refund paid", disabled: busy, onClick: () => void act(() => settleBalance(o.id), `${money(-balance)} marked as refunded`) },
                { icon: "history", label: "Log a contact", disabled: !(o.status === "pending" || o.profile_id), onClick: () => setLogging(true) },
              ]}
            />
            <div
              className="aro-grid"
              onContextMenu={(e) =>
                payMenu.open(
                  e,
                  menuOf(
                    [
                      { label: "Add payment", onClick: () => setPaying(true), disabled: o.status !== "pending" },
                      { label: "Edit", disabled: true },
                    ],
                    [{ label: "Delete", key: "Del", disabled: true }],
                  ),
                )
              }
            >
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Payment type</th>
                    <th>Date</th>
                    <th className="r">Amount</th>
                    <th className="r">Rounding adjustment</th>
                    <th>Reference</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((x, n) => (
                    <tr key={x.id} className={x.id === selPay ? "is-sel" : ""} onClick={() => setSelPay(x.id)} onContextMenu={() => setSelPay(x.id)}>
                      <td>{n + 1}</td>
                      <td>{x.status === "captured" ? "Paid" : x.status}</td>
                      <td>{x.method || "(not recorded)"}</td>
                      <td>{dmy(x.received_on ?? x.created_at)}</td>
                      <td className="r">{money(x.amount)}</td>
                      <td className="r">0.00</td>
                      <td>{x.reference}</td>
                      <td>{x.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!payments.length && <p className="aro-none">{o.status === "pending" ? "No payment yet. Contact the customer, then New marks it paid." : "No payment recorded."}</p>}
              {payMenu.node}
            </div>
            <DocTotals rows={[["Document total:", money(o.total)]]} totalLabel="Payments total:" total={money(paidSum || (paid ?? 0))} />
          </div>
        </div>
      )}

      {tab === "delivery" && (
        <div className="arx-cards">
          <section className="arx-card">
            <h3>Deliver to</h3>
            <p className="arx-lines">
              {[o.address_line1, o.address_line2, o.address_landmark && (/^near\b/i.test(o.address_landmark.trim()) ? o.address_landmark.trim() : `Near ${o.address_landmark}`), `${o.address_city}, ${o.address_state} ${o.address_pincode}`]
                .filter(Boolean)
                .map((l) => (
                  <span key={String(l)}>{l}</span>
                ))}
            </p>
            <AddressMap lat={o.address_latitude} lng={o.address_longitude} label={`${o.contact_name}, ${o.address_line1}`} />
          </section>
          <section className="arx-card">
            <h3>Courier</h3>
            {ship ? (
              <div className="arx-kv">
                <span>Courier</span>
                <span>{ship.carrier || "Courier not noted"}</span>
                <span>Tracking</span>
                <span>
                  {ship.tracking_number ? <b>{ship.tracking_number}</b> : "None"}
                  {trackLink(ship.carrier, ship.tracking_number) && (
                    <>
                      {" · "}
                      <a href={trackLink(ship.carrier, ship.tracking_number)!.url} target="_blank" rel="noopener noreferrer">
                        Track on {trackLink(ship.carrier, ship.tracking_number)!.site}
                      </a>
                    </>
                  )}
                </span>
                <span>Shipped</span>
                <span>{ship.shipped_at ? when(ship.shipped_at) : ""}</span>
                <span>Delivered</span>
                <span>{ship.delivered_at ? when(ship.delivered_at) : "Not yet"}</span>
              </div>
            ) : (
              <p className="arx-sub">Not shipped yet. The courier and tracking number are asked for when it&apos;s marked shipped.</p>
            )}
            <div className="arx-row">
              <button type="button" className="arx-minib is-b" disabled={busy || o.status !== "packed"} onClick={() => setStepping("shipped")}>
                <ArIcon name="truck" size={16} />
                Ship with courier
              </button>
              <button type="button" className="arx-minib" disabled={busy || o.status !== "shipped" || failed} onClick={startFail}>
                Delivery failed
              </button>
              <button type="button" className="arx-minib" disabled={busy || !failed} onClick={startResend}>
                Send again
              </button>
              <button type="button" className="arx-minib" disabled={busy || !failed} onClick={startRto}>
                Returned to origin (RTO)
              </button>
              <button type="button" className="arx-minib" disabled={busy || o.status !== "shipped" || failed} onClick={() => pickStep("delivered")}>
                Mark delivered
              </button>
            </div>
            {failed && (
              <p className="arx-red">
                Delivery failed{(o.delivery_attempts ?? 0) > 1 ? ` ${o.delivery_attempts} times` : ""}: {o.delivery_failed_reason || "Not delivered"} · {when(o.delivery_failed_at!)}
              </p>
            )}
          </section>
        </div>
      )}

      {tab === "customer" && (
        <div className="arx-cards">
          <section className="arx-card">
            <h3>Customer</h3>
            <div className="arx-kv">
              <span>Name</span>
              <span>{o.profile_id ? <Link href={`/admin/customers/view?id=${o.profile_id}`}>{o.contact_name}</Link> : o.contact_name}</span>
              <span>Email</span>
              <span>{o.contact_email}</span>
              <span>Phone number</span>
              <span>{o.contact_phone}</span>
            </div>
            <div className="arx-row">
              <a className="arx-minib" href={`tel:${o.contact_phone.replace(/\s/g, "")}`}>
                Call {o.contact_phone}
              </a>
              {wa && (
                <a className="arx-minib" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              )}
              <button type="button" className="arx-minib" disabled={!(o.status === "pending" || o.profile_id)} onClick={() => setLogging(true)}>
                Log a call or message
              </button>
            </div>
          </section>
          <section className="arx-card">
            <h3>Bill to</h3>
            {o.billing_line1 ? (
              <p className="arx-lines">
                {[o.billing_name, o.billing_line1, o.billing_line2, [o.billing_city, o.billing_state].filter(Boolean).join(", ") + (o.billing_pincode ? ` ${o.billing_pincode}` : "")]
                  .filter(Boolean)
                  .map((l, i) => (
                    <span key={i}>{l}</span>
                  ))}
              </p>
            ) : (
              <p className="arx-sub">Same as the delivery address.</p>
            )}
            <BuyerGstin key={`${o.id}-${o.buyer_gstin ?? ""}`} o={o} busy={busy} onSave={(g) => act(() => setBuyerGstin(o.id, g), g ? "Buyer's GSTIN saved" : "Buyer's GSTIN removed")} />
          </section>
        </div>
      )}

      {tab === "requests" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <div className="aro-grid">
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Request</th>
                    <th>Items</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Reply</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r) => (
                    <tr key={r.id}>
                      <td>{dmy(r.created_at)}</td>
                      <td>{r.kind === "cancel" ? "Cancel the order" : "Return items"}</td>
                      <td>
                        {r.items
                          .map((x) => {
                            const it = items.find((i) => i.id === x.item);
                            return `${it?.product_name ?? "An item"}${x.qty > 1 ? ` ×${x.qty}` : ""}`;
                          })
                          .join(", ")}
                      </td>
                      <td>{r.reason}</td>
                      <td>{r.status === "open" ? "Open" : r.status === "accepted" ? "Accepted" : r.status === "declined" ? "Declined" : "Withdrawn"}</td>
                      <td>{r.reply}</td>
                      <td>
                        {r.status === "open" && (
                          <span className="arx-row">
                            <button
                              type="button"
                              className="arx-minib is-b"
                              disabled={busy || !canRefund}
                              onClick={() => {
                                setAnswering(r);
                                setForm(r.kind === "cancel" ? "refund" : "return");
                              }}
                            >
                              Accept
                            </button>
                            <button type="button" className="arx-minib" disabled={busy} onClick={() => (setReply(""), setDeclining(r))}>
                              Decline
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!reqs.length && <p className="aro-none">The customer hasn&apos;t asked to cancel or return anything.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "returns" && (
        <div className="arx-body is-one">
          <div className="arx-pane">
            <MiniBar
              tools={[
                { icon: "import", label: "Return items", bordered: true, disabled: busy || !canReturn, onClick: () => setForm("return") },
                { icon: "export", label: "Refund", disabled: busy || !canRefund, onClick: () => setForm("refund") },
                { icon: "print", label: "Credit notes", onClick: () => setPreview("cn"), disabled: !(o.invoice_number && (o.order_refunds ?? []).length > 0) },
              ]}
            />
            <div className="aro-grid">
              <table className="adm-table aro-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Kind</th>
                    <th>Items</th>
                    <th>Reason</th>
                    <th>Back on the shelf</th>
                    <th className="r">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(o.order_refunds ?? []).map((r) => (
                    <tr key={r.id}>
                      <td>{dmy(r.created_at)}</td>
                      <td>{r.returned ? "Return" : "Refund"}</td>
                      <td>{lineItems(r) || "An amount on its own"}</td>
                      <td>{r.reason}</td>
                      <td>{r.restocked ? "✓" : ""}</td>
                      <td className="r arx-red">−{money(r.amount)}</td>
                      <td>
                        {canUndo && (
                          <button type="button" className="arx-link" disabled={busy} onClick={() => setUndoing(r)}>
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(o.order_refunds ?? []).length && <p className="aro-none">No returns or refunds on this order.</p>}
            </div>
            <DocTotals rows={[["Paid:", paid == null ? "Not yet" : money(paid)], ["Refunded:", `−${money(refunds.amount)}`, "is-bad"]]} totalLabel="Kept:" total={money((paid ?? 0) - refunds.amount)} />
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="arx-cards">
          <section className="arx-card" style={{ gridColumn: "1 / -1" }}>
            <h3>Steps</h3>
            <Roadmap order={o} busy={busy} onStep={pickStep} />
            {STEPS.includes(o.status) && <p className="arx-sub">Click a step on the road to move the order, forward or back.</p>}
          </section>
          <section className="arx-card" style={{ gridColumn: "1 / -1" }}>
            <h3>Everything that happened</h3>
            <ol className="arx-tl">
              {history.map((e) => (
                <li key={e.id} className={e.status === "comment" ? "is-note" : ""}>
                  <span>{eventText(e.status, e.note)}</span>
                  <time dateTime={e.created_at}>{when(e.created_at)}</time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {tab === "notes" && (
        <div className="arx-cards">
          <section className="arx-card" style={{ gridColumn: "1 / -1" }}>
            <h3>Notes and activity</h3>
            <form
              className="arx-row"
              onSubmit={(e) => {
                e.preventDefault();
                void save("comment");
              }}
            >
              <input className="arx-input" style={{ flex: "1 1 280px" }} placeholder="Comment for staff (the customer never sees it)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" />
              <button className="arx-minib is-b" disabled={busy || !comment.trim()}>
                Post
              </button>
              {o.profile_id && (
                <button type="button" className="arx-minib" onClick={() => setLogging(true)}>
                  Log a call or message
                </button>
              )}
            </form>
            {timeline.length ? (
              <ol className="arx-tl">
                {timeline.map((e) => (
                  <li key={e.id} className={e.kind === "comment" || e.kind === "contact" ? "is-note" : ""}>
                    <span>{e.text}</span>
                    <time dateTime={e.at}>{when(e.at)}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="arx-sub">Nothing yet. Comments, calls and messages, edits and refunds show here; status changes are under History.</p>
            )}
          </section>
        </div>
      )}

      {tab === "profit" && (
        <div className="arx-cards">
          <div style={{ gridColumn: "1 / -1" }}>
            <OrderProfit order={o} />
          </div>
        </div>
      )}

      {tab === "items" && (
        <DocNotes
          internal={<textarea value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Internal note" placeholder="A comment for staff; Save posts it to Notes" />}
          note={
            <>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Note" placeholder="The customer's note at checkout, or yours" />
              {notes !== o.notes && (
                <div className="arx-note-do">
                  <button type="button" className="arx-link" onClick={() => setNotes(o.notes)}>
                    Undo
                  </button>
                </div>
              )}
            </>
          }
        />
      )}

      <DocFooter
        del={{ label: "Delete", title: "An order isn't deleted; cancel it instead" }}
        pdf={{ onClick: () => printDoc("invoice"), disabled: !canInvoice, title: "Pick “Save as PDF” as the printer" }}
        preview={{ onClick: () => setPreview("invoice"), disabled: !canInvoice }}
        print={{ onClick: () => printDoc("invoice"), disabled: !canInvoice }}
        save={{ disabled: busy || !dirty, onClick: () => void save() }}
        saveMenu={menuOf(
          [
            { label: "Save note", onClick: () => void save("note"), disabled: busy || notes === o.notes },
            { label: "Post comment", onClick: () => void save("comment"), disabled: busy || !comment.trim() },
          ],
          [
            { label: o.invoice_number ? `Print invoice ${o.invoice_number}` : "Issue invoice", onClick: () => printDoc("invoice"), disabled: !canInvoice },
            { label: "Print credit notes", onClick: () => printDoc("cn"), disabled: !(o.invoice_number && (o.order_refunds ?? []).length > 0) },
          ],
        )}
      />

      {preview && (
        <PreviewLayer
          title={preview === "cn" ? `Credit notes · ${o.order_number}` : o.invoice_number ? `Invoice ${o.invoice_number}` : `Invoice · ${o.order_number}`}
          src={invoiceSrc([o.id], preview)}
          onClose={() => {
            setPreview(null);
            // an invoice may have just been issued
            void load();
          }}
        />
      )}

      {/* the same forms as the ordinary order page */}
      <Dialog open={asking !== null} onClose={() => setAsking(null)}>
        {asking && <Confirm action={asking} order={o} busy={busy} onCancel={() => setAsking(null)} onConfirm={(opts) => run(asking, opts)} />}
      </Dialog>
      <Dialog open={paying} onClose={() => setPaying(false)}>
        {paying && (
          <MarkPaidForm
            order={o}
            methods={methods}
            onCancel={() => setPaying(false)}
            onDone={() => {
              setPaying(false);
              toast(`${o.order_number} marked as paid`);
              void load();
            }}
          />
        )}
      </Dialog>
      <Dialog open={logging} onClose={() => setLogging(false)}>
        {logging && (
          <LogContactForm
            order={o}
            userId={user?.id}
            onCancel={() => setLogging(false)}
            onDone={() => {
              setLogging(false);
              toast(`Logged on ${o.order_number}`);
              void load();
            }}
          />
        )}
      </Dialog>
      <Dialog open={stepping !== null} onClose={() => setStepping(null)}>
        {stepping && (
          <StepForm
            order={o}
            to={stepping}
            busy={busy}
            onCancel={() => setStepping(null)}
            onConfirm={(opts) =>
              act(
                () => setStep(o.id, stepping, opts),
                STEPS.indexOf(stepping) < STEPS.indexOf(o.status) ? `${o.order_number} moved back to ${STEP_LABEL[stepping].toLowerCase()}` : `${o.order_number} marked as ${STEP_DO[stepping]}`,
              )
            }
          />
        )}
      </Dialog>
      <Dialog open={form !== null} onClose={() => (setForm(null), setAnswering(null), setComingBack(false))} wide={form === "edit"}>
        {(form === "refund" || form === "return") && (
          <RefundForm
            order={o}
            mode={form}
            busy={busy}
            onCancel={() => (setForm(null), setAnswering(null), setComingBack(false))}
            onSubmit={(r: RefundInput) =>
              act(
                async () => {
                  await refundOrder(o.id, r);
                  if (answering) await resolveRequest(answering.id, true, "");
                  if (comingBack) await cameBack(o.id, o.delivery_failed_reason ?? "");
                },
                comingBack
                  ? `${o.order_number} came back · ${money(r.amount)} refunded`
                  : answering
                    ? `${answering.kind === "cancel" ? "Cancellation" : "Return"} approved · ${money(r.amount)} refunded`
                    : `${r.returned ? "Return recorded" : "Refunded"} · ${money(r.amount)} on ${o.order_number}`,
              )
            }
            onEdit={canEdit && !answering ? () => setForm("edit") : undefined}
            preset={
              comingBack
                ? { everything: true, restock: true, keepDelivery: true, title: "Came back:", note: `Came back undelivered${o.delivery_failed_reason ? `: ${o.delivery_failed_reason}` : ""}` }
                : answering
                  ? answering.kind === "cancel"
                    ? { everything: true, restock: true, note: `Cancelled at the customer's request${answering.reason ? `: ${answering.reason}` : ""}` }
                    : { qty: Object.fromEntries(answering.items.map((x) => [x.item, x.qty])), restock: true, note: answering.reason }
                  : undefined
            }
          />
        )}
        {form === "edit" && <EditForm order={o} busy={busy} onCancel={() => setForm(null)} onSubmit={(e: EditInput) => act(() => editOrder(o.id, e), `${o.order_number} updated`)} />}
      </Dialog>

      {/* the small confirmations, as Aronium's band */}
      <Band
        open={undoing !== null}
        title={undoing ? `Undo this ${money(undoing.amount)} refund?` : ""}
        ok="Reverse refund"
        okDanger
        busy={busy}
        onCancel={() => setUndoing(null)}
        onOk={() => undoing && void act(() => undoRefund(undoing.id), `Refund of ${money(undoing.amount)} undone`)}
      >
        {undoing && (
          <>
            <p>
              {(undoing.order_refund_items?.length ?? 0) > 0 ? `It covered ${lineItems(undoing)}.` : "It was an amount on its own, with no items."} {undoing.restocked && "Those items come back off the shelf. "}
              {o.status === "refunded" && "The order reopens where it was before. "}
              Then you can record the right refund. The activity keeps a note of this.
            </p>
            <p className="arx-sub">If the money really went out, keep the refund. Undo is for a refund recorded by mistake.</p>
          </>
        )}
      </Band>
      <Band open={failing} title="Delivery failed?" ok="Record it" busy={busy} onCancel={() => setFailing(false)} onOk={() => void act(() => deliveryFailed(o.id, failWhy, failNote.trim()), `${o.order_number}: delivery failed recorded`)}>
        <p className="arx-sub">From what the courier told you. The order stays shipped; next you send it again, or take it back in when it returns.</p>
        <label>
          What happened
          <select className="arx-input" value={failWhy} onChange={(e) => setFailWhy(e.target.value)}>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          Note (optional, only staff see it)
          <input className="arx-input" value={failNote} onChange={(e) => setFailNote(e.target.value)} placeholder="Courier tried twice, gate locked" />
        </label>
      </Band>
      <Band open={resending} title="Send it again" ok="Sent again" busy={busy} onCancel={() => setResending(false)} onOk={() => void act(() => sendAgain(o.id, { carrier: reCarrier, tracking: reTracking }), `${o.order_number} sent again`)}>
        <p className="arx-sub">The order carries on as shipped. Add the new tracking number if the courier gave one.</p>
        <label>
          Courier
          <input className="arx-input" value={reCarrier} onChange={(e) => setReCarrier(e.target.value)} placeholder="Delhivery" />
        </label>
        <label>
          New tracking number (optional)
          <input className="arx-input" value={reTracking} onChange={(e) => setReTracking(e.target.value)} />
        </label>
      </Band>
      <Band open={backConfirm} title="Returned to origin (RTO)?" ok="Close the order" busy={busy} onCancel={() => setBackConfirm(false)} onOk={() => void act(() => cameBack(o.id, o.delivery_failed_reason ?? ""), `${o.order_number} closed: came back`)}>
        <p>Nothing is left to refund on this order, so it&apos;s simply closed as came back undelivered.</p>
      </Band>
      <Band
        open={declining !== null}
        title={declining ? `Decline the ${declining.kind === "cancel" ? "cancellation" : "return"}?` : ""}
        ok="Decline"
        okDanger
        canOk={!!reply.trim()}
        busy={busy}
        onCancel={() => setDeclining(null)}
        onOk={() => declining && reply.trim() && void act(() => resolveRequest(declining.id, false, reply.trim()), `${declining.kind === "cancel" ? "Cancellation" : "Return"} request declined`)}
      >
        <p className="arx-sub">The customer sees your reply on their order page, so say what happens next.</p>
        <label>
          Reply to the customer
          <textarea
            className="arx-input"
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={declining?.kind === "cancel" ? "It's already with the courier. You can return it once it arrives." : "Returns need the item unopened. Get in touch and we'll sort it out."}
            autoFocus
          />
        </label>
      </Band>
    </div>
  );
}
