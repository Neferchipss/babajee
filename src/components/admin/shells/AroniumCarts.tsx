"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { money, when } from "@/components/admin/ui";
import { adminCarts, cartConversion, errText, getSettings, markCartReminded, type AdminCart, type CartConversion } from "@/lib/orders-db";
import { ArSection, ArToolbar, menuOf, useArKeys, useArMenu } from "./aronium-kit";
import { DocTabs } from "./aronium-docs";
import "./aronium-screens-docs.css";

// Carts in the Aronium-style design, as an Aronium grid screen: the toolbar
// (Refresh, Open customer, Remind on WhatsApp, Mark reminded, Cart settings),
// Abandoned | Active now as tabs, and the carts in a grid (double-click opens
// the customer; right-click for its menu). Babajee's "Cart to order" counts
// sit above the grid. Same data and rules as the ordinary Carts page:
// signed-in customers' carts, abandoned after the window in Settings › Carts,
// and reminders sent by hand on WhatsApp.
const HOUR = 60 * 60 * 1000;
const cartValue = (c: AdminCart) => c.lines.reduce((n, l) => n + (l.price ?? 0) * l.qty, 0);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "–");
const optionOf = (variant: string) => (variant && variant !== "Default" && variant !== "Standard" ? variant : "");
function whatsapp(c: AdminCart) {
  let digits = c.phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11) return null;
  const first = (c.full_name || "there").split(" ")[0];
  const items = c.lines.map((l) => `• ${l.qty} × ${l.name}${optionOf(l.variant) ? ` (${optionOf(l.variant)})` : ""}`).join("\n");
  const cart = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/cart/`;
  const text = `Hi ${first}, you left these in your Babajee jar:\n${items}\n\nThey're still waiting for you: ${cart}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
type Tab = "abandoned" | "active";

export default function AroniumCarts() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminCart[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("abandoned");
  const [idleHours, setIdleHours] = useState(1);
  const [days, setDays] = useState(30);
  const [conv, setConv] = useState<CartConversion | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sel, setSel] = useState<string | null>(null);
  const menu = useArMenu();

  // the clock moves on with each load, so a refresh re-sorts active and abandoned
  const load = () =>
    adminCarts().then(
      (r) => (setRows(r), setErr(""), setNow(new Date().valueOf())),
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
    getSettings().then((s) => setIdleHours(s.cart_abandon_hours), () => {});
  }, []);
  useEffect(() => {
    const to = new Date();
    cartConversion(new Date(to.getTime() - days * 24 * HOUR), to).then(setConv, () => setConv(null));
  }, [days]);
  const refresh = () => void load();
  useArKeys({ refresh });

  const { abandoned, active } = useMemo(() => {
    const isActive = (c: AdminCart) => now - new Date(c.updated_at).getTime() < idleHours * HOUR;
    const isAbandoned = (c: AdminCart) => !isActive(c) && (!c.last_order_at || new Date(c.last_order_at) < new Date(c.updated_at));
    return { abandoned: (rows ?? []).filter(isAbandoned), active: (rows ?? []).filter(isActive) };
  }, [rows, idleHours, now]);
  const shown = tab === "abandoned" ? abandoned : active;
  const worth = abandoned.reduce((n, c) => n + cartValue(c), 0);
  const picked = shown.find((c) => c.profile_id === sel) ?? null;
  const wa = picked && tab === "abandoned" ? whatsapp(picked) : null;

  async function reminded(c: AdminCart) {
    try {
      await markCartReminded(c.profile_id);
      setRows((r) => (r ?? []).map((x) => (x.profile_id === c.profile_id ? { ...x, reminded_at: new Date().toISOString(), reminders: x.reminders + 1 } : x)));
      toast(`Marked ${c.full_name || c.email} as reminded`);
    } catch (x) {
      toastError(x);
    }
  }
  const openCustomer = (c: AdminCart | null) => c && router.push(`/admin/customers/view?id=${c.profile_id}`);
  const rowMenu = (c: AdminCart | null) => {
    const link = c && tab === "abandoned" ? whatsapp(c) : null;
    return menuOf(
      [{ label: "Open customer", disabled: !c, onClick: () => openCustomer(c) }],
      [
        { label: "Remind on WhatsApp", disabled: !link, onClick: () => link && window.open(link, "_blank", "noreferrer") },
        { label: "Mark reminded", disabled: !c || tab !== "abandoned", onClick: () => c && void reminded(c) },
      ],
      [{ label: "Refresh", key: "F5", onClick: refresh }],
    );
  };

  return (
    <div className="arx arx-list">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: refresh },
          { icon: "open", label: "Open customer", disabled: !picked, onClick: () => openCustomer(picked) },
          { icon: "export", label: "Remind on WhatsApp", href: wa ?? undefined, target: "_blank", disabled: !wa, title: picked && tab === "abandoned" && !wa ? "No phone number" : undefined },
          { icon: "paid", label: "Mark reminded", disabled: !picked || tab !== "abandoned", onClick: () => picked && void reminded(picked) },
          { icon: "edit", label: "Cart settings", href: "/admin/settings#set-carts" },
        ]}
      />
      <DocTabs<Tab>
        tabs={[
          ["abandoned", `Abandoned (${abandoned.length})`],
          ["active", `Active now (${active.length})`],
        ]}
        on={tab}
        onPick={(t) => (setTab(t), setSel(null))}
      />
      <div className="arx-info">
        <p>
          Carts of signed-in customers. A cart counts as abandoned when it has been left for over {idleHours === 1 ? "an hour" : `${idleHours} hours`} without an order (change it in{" "}
          <Link href="/admin/settings#set-carts">Settings › Carts</Link>). Guests&apos; carts stay in their own browser, so they are not listed. Reminders are sent by you on WhatsApp; the site never sends anything.
        </p>
      </div>
      {err && <p className="adm-err">{err}</p>}

      <ArSection title="Cart to order">
        <select className="arx-input" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Over">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </ArSection>
      {conv ? (
        <p className="arx-kpis">
          <span>
            <b>{conv.visits}</b> visits
          </span>
          <span>
            <b>{conv.carted}</b> added to cart · {pct(conv.carted, conv.visits)}
          </span>
          <span>
            <b>{conv.checkout}</b> reached checkout · {pct(conv.checkout, conv.carted)}
          </span>
          <span>
            <b>{conv.carted_ordered}</b> ordered · {pct(conv.carted_ordered, conv.carted)} of carts
          </span>
          <span>
            <b>{pct(conv.accounts_ordered, conv.accounts_carted)}</b> of signed-in carts ordered ({conv.accounts_ordered} of {conv.accounts_carted})
          </span>
        </p>
      ) : (
        <p className="arx-kpis">Counting needs the cart rules update (0067).</p>
      )}

      <ArSection title={tab === "abandoned" ? "Abandoned carts" : "Active carts"} n={rows ? shown.length : undefined}>
        {tab === "abandoned" && abandoned.length > 0 && (
          <span className="arx-sub">
            worth <b>{money(worth)}</b> left without an order
          </span>
        )}
      </ArSection>
      <div className="aro-grid" style={{ maxHeight: "none" }} onContextMenu={(e) => menu.open(e, rowMenu(null))}>
        <table className="adm-table aro-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone number</th>
              <th>Email</th>
              <th>In the cart</th>
              <th className="r">Lines</th>
              <th className="r">Value</th>
              <th>Last change</th>
              {tab === "abandoned" && <th>Reminded</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr
                key={c.profile_id}
                className={c.profile_id === sel ? "is-sel" : ""}
                onClick={() => setSel(c.profile_id)}
                onDoubleClick={() => openCustomer(c)}
                onContextMenu={(e) => {
                  setSel(c.profile_id);
                  e.stopPropagation();
                  menu.open(e, rowMenu(c));
                }}
              >
                <td>{c.full_name || c.email}</td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td style={{ whiteSpace: "normal" }}>
                  {c.lines.map((l) => (
                    <span key={l.key} className="arx-lines">
                      <span>
                        {l.qty} × {l.name}
                        {optionOf(l.variant) ? <span className="adm-muted"> · {optionOf(l.variant)}</span> : null}
                      </span>
                    </span>
                  ))}
                </td>
                <td className="r">{c.lines.length}</td>
                <td className="r">{money(cartValue(c))}</td>
                <td>{when(c.updated_at)}</td>
                {tab === "abandoned" && <td>{c.reminded_at ? `${c.reminders > 1 ? `${c.reminders}× · last ` : ""}${when(c.reminded_at)}` : whatsapp(c) ? "" : "No phone number"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {rows === null && !err ? (
          <p className="aro-none">Loading.</p>
        ) : shown.length === 0 ? (
          <p className="aro-none">
            {tab === "abandoned"
              ? `No abandoned carts.${active.length ? ` ${active.length} ${active.length === 1 ? "cart is" : "carts are"} active right now.` : ""}`
              : `No one is shopping right now.${abandoned.length ? ` ${abandoned.length} abandoned ${abandoned.length === 1 ? "cart" : "carts"} to follow up.` : ""}`}
          </p>
        ) : null}
        {menu.node}
      </div>
    </div>
  );
}
