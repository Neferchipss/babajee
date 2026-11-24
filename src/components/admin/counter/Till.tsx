"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { listCategories, listProducts, type AdminCategory, type AdminProduct } from "@/lib/admin-data";
import { counterSales, creditLimitOf, customerBalance, getCounterSettings, getCreditRules, NEEDS_0086, openSession, recordVoid, ringUp, saleKey, tillMethods, variantCosts, type CounterSettings, type CreditRules, type DrawerSession } from "@/lib/counter";
import { discounted, evenly, pctForAmount, pctOff, priceProblem, quickCash, settle, withOrderDiscount } from "@/lib/counter-math";
import { round2 } from "@/lib/currency";
import { bill } from "@/lib/gst";
import { errText, getSettings, listCustomers, type Customer, type StoreSettings } from "@/lib/orders-db";
import { useAuth } from "@/lib/auth";
import { can, useStaff } from "@/lib/staff";
import { ArIcon } from "../shells/aronium-kit";
import CounterSettingsForm from "./CounterSettings";
import { CreditPanel, ON_ACCOUNT, RefundPanel, SplitPanel } from "./TillMore";
import { DrawerPanel, HistoryPanel, ParkedPanel, type Parked } from "./TillPanels";
import "./till.css";

// The till: walk-in sales at the shop's counter, laid out like Aronium's
// sales screen. Across the top its buttons (Search, Customer, Discount,
// Price, New sale, Refund, Cash drawer, F9 Save sale, F10 Payment, then a
// button per quick way to pay, F12 for cash) and the ≡ menu; on the left the
// ticket (its lines, Subtotal / Tax / Total, Void order, Lock, Repeat round);
// on the right the products as buttons, group by group, with Aronium's four
// search modes and paging. A barcode scanner types into the search box and
// presses Enter: an exact code adds the item at once.
//
// A sale is rung up by counter_sale() (0085): paid in full (split if need
// be, change from cash), handed over, stock taken and the GST invoice issued
// like any paid order. The rules (ways to pay, drawer, discounts, prices,
// stock, receipt) are Settings › Counter (till).
//
// With 0086: a sale can go on a customer's account (all or part of it), the
// Refund button refunds at the till, ≡ › Credit payments takes money owed,
// Split moves lines to a ticket of their own, Payment › Split evenly shares
// a bill, reprints say so, and deleted lines and voided tickets are recorded
// for the Voided items report.

type Line = {
  key: string;
  variant: string;
  name: string;
  label: string;
  // its listed price, the price charged per piece, how many
  list: number;
  price: number;
  qty: number;
  rate: number;
  cess: number;
  track: boolean;
  stock: number;
  cost: number | null;
};
type Who = { id: string | null; name: string; phone: string; gstin: string };
type Panel = null | "pay" | "customer" | "discount" | "price" | "qty" | "drawer" | "history" | "parked" | "settings" | "menu" | "refund" | "credit" | "split";
type Mode = "all" | "barcode" | "code" | "name";
const PAGE = 30;
const PARK_KEY = "bj-till-parked";
const WALKIN: Who = { id: null, name: "", phone: "", gstin: "" };
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function readParked(): Parked[] {
  try {
    return JSON.parse(localStorage.getItem(PARK_KEY) ?? "[]") as Parked[];
  } catch {
    return [];
  }
}
function writeParked(p: Parked[]) {
  try {
    localStorage.setItem(PARK_KEY, JSON.stringify(p));
  } catch {}
}

export default function Till() {
  const router = useRouter();
  const role = useStaff().me?.role ?? null;
  const { profile, signOut } = useAuth();
  // "POS - <name>", as Aronium titles its menu with the person signed in
  const cashierName = profile?.first_name || profile?.full_name?.split(" ")[0] || "Staff";
  const [drawerTab, setDrawerTab] = useState<"now" | "move" | "close" | "past">("now");
  const [shop, setShop] = useState<StoreSettings | null>(null);
  const [rules, setRules] = useState<CounterSettings | null | undefined>(undefined);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [cats, setCats] = useState<AdminCategory[]>([]);
  const [costs, setCosts] = useState<Map<string, number>>(new Map());
  const [session, setSession] = useState<DrawerSession | null | undefined>(undefined);
  const [err, setErr] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [orderPct, setOrderPct] = useState(0);
  const [who, setWho] = useState<Who>(WALKIN);
  const [note, setNote] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [locked, setLocked] = useState(false);
  const [voidArmed, setVoidArmed] = useState(false);
  const [last, setLast] = useState<{ id: string; number: string; change: number; lines: Line[] } | null>(null);
  const [parked, setParked] = useState<Parked[]>(() => (typeof window === "undefined" ? [] : readParked()));
  const [busy, setBusy] = useState(false);
  // 0086: sales on account (null: not applied yet), the sale picked to refund,
  // what the picked customer owes
  const [credit, setCredit] = useState<CreditRules | null | undefined>(undefined);
  const [refundOf, setRefundOf] = useState<string | null>(null);
  const [owes, setOwes] = useState<{ id: string; balance: number | null; limit: number | null } | null>(null);

  // the product side
  const [group, setGroup] = useState<string | null>(null);
  const [pick, setPick] = useState<AdminProduct | null>(null);
  const [mode, setMode] = useState<Mode>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const search = useRef<HTMLInputElement>(null);

  const loadSession = () =>
    openSession().then(
      (s) => setSession(s),
      () => setSession(null),
    );
  useEffect(() => {
    getCreditRules().then(setCredit, () => setCredit(null));
    Promise.all([getSettings(), getCounterSettings(), listProducts(), listCategories(), variantCosts()]).then(
      ([s, r, p, c, k]) => {
        setShop(s);
        setRules(r);
        setProducts(p.filter((x) => x.status !== "archived"));
        setCats(c);
        setCosts(k);
        if (r?.drawer) void loadSession();
        else setSession(null);
      },
      (e) => setErr(errText(e)),
    );
  }, []);

  const inclusive = shop?.gst_inclusive ?? true;
  const methods = rules && shop ? tillMethods(rules, shop.payment_methods) : [];
  const cashName = rules?.cashMethod ?? "Cash";
  const charged = useMemo(() => withOrderDiscount(lines, orderPct), [lines, orderPct]);
  const sums = bill(
    charged.map((l) => ({ gross: round2(l.price * l.qty), rate: l.rate, cess: shop?.cess_enabled ? l.cess : 0 })),
    0,
    inclusive,
  );
  const due = sums.total;
  // what the customer on this ticket owes already, and their limit
  const owing = owes && owes.id === who.id ? owes : null;
  useEffect(() => {
    if (!who.id || credit == null) return;
    let live = true;
    const id = who.id;
    Promise.all([customerBalance(id), creditLimitOf(id)]).then(([b, l]) => live && setOwes({ id, balance: b, limit: l === undefined ? null : l }));
    return () => {
      live = false;
    };
  }, [who.id, credit]);
  const limit = owing?.limit ?? credit?.creditLimit ?? null;
  const room = limit == null ? null : Math.max(0, round2(limit - (owing?.balance ?? 0)));
  // why "On account" can't be used for this sale, or "" when it can
  const accountWhy = !credit ? (credit === null ? NEEDS_0086 : "Checking the customer's account…") : !credit.credit ? "Sales on account are off (Settings › Counter)" : !who.id ? "Pick the customer's account first (Customer)" : "";
  const drawerShut = !!rules?.drawer && session === null;

  // ------------------------------------------------------------ the ticket
  function add(pId: string, vId: string, qty = 1) {
    const p = products.find((x) => x.id === pId);
    const v = p?.variants.find((x) => x.id === vId);
    if (!p || !v) return;
    const at = lines.findIndex((l) => l.variant === vId && l.price === l.list);
    const have = at >= 0 ? lines[at].qty : 0;
    if (v.track_stock && have + qty > v.stock_qty && !rules?.negativeStock) {
      toast(`Only ${v.stock_qty} of ${p.name}${v.label !== "Default" ? ` · ${v.label}` : ""} in stock`);
      return;
    }
    if (!(v.price > 0)) toast(`${p.name} has no price: set one with Price`);
    if (at >= 0) {
      setLines(lines.map((l, i) => (i === at ? { ...l, qty: l.qty + qty } : l)));
      setSel(at);
    } else {
      const line: Line = {
        key: saleKey(),
        variant: v.id,
        name: p.name,
        label: v.label === "Default" ? "" : v.label,
        list: v.price,
        price: v.price,
        qty,
        rate: p.gst_rate ?? shop?.gst_rate ?? 0,
        cess: p.cess_rate ?? 0,
        track: v.track_stock,
        stock: v.stock_qty,
        cost: costs.get(v.id) ?? null,
      };
      setLines([...lines, line]);
      setSel(lines.length);
    }
    setPick(null);
    search.current?.focus();
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  function setQty(i: number, qty: number) {
    const l = lines[i];
    if (!l) return;
    if (qty < 1) return remove(i);
    if (l.track && qty > l.stock && !rules?.negativeStock) return toast(`Only ${l.stock} in stock`);
    setLine(i, { qty: Math.min(999, qty) });
  }
  function remove(i: number) {
    const l = charged[i];
    if (l) void recordVoid("line", [{ variant: l.variant, name: l.label ? `${l.name} · ${l.label}` : l.name, qty: l.qty, value: round2(l.qty * l.price) }]);
    setLines(lines.filter((_, n) => n !== i));
    setSel(lines.length > 1 ? Math.max(0, Math.min(i, lines.length - 2)) : null);
  }
  // Void order: the whole ticket, recorded, then cleared
  function voidOrder() {
    void recordVoid(
      "order",
      charged.map((l) => ({ variant: l.variant, name: l.label ? `${l.name} · ${l.label}` : l.name, qty: l.qty, value: round2(l.qty * l.price) })),
    );
    clear();
  }
  // Split: the pieces picked move to a new ticket, saved under open sales
  function split(move: Record<string, number>) {
    const moved = lines.filter((l) => (move[l.key] ?? 0) > 0).map((l) => ({ ...l, key: saleKey(), qty: move[l.key] }));
    if (!moved.length) return;
    const p: Parked = { id: saleKey(), at: new Date().toISOString(), lines: moved, orderPct, who, note: note ? `${note} (split)` : "Split from a ticket" };
    const next = [p, ...parked].slice(0, 30);
    setParked(next);
    writeParked(next);
    setLines(lines.map((l) => ({ ...l, qty: l.qty - (move[l.key] ?? 0) })).filter((l) => l.qty > 0));
    setSel(null);
    setPanel(null);
    toast("Split. The new ticket is under ≡ › View open sales");
  }
  // the last receipt again, marked REPRINT: this screen's last sale, or the
  // counter's latest today
  async function reprintLast() {
    let id = last?.id;
    if (!id) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      try {
        id = (await counterSales(since.toISOString()))[0]?.id;
      } catch (e) {
        return toastError(e);
      }
    }
    if (!id) return toast("No sale at the counter today yet");
    router.push(`/admin/counter/receipt?id=${id}&reprint=1&print=1`);
  }
  function clear() {
    setLines([]);
    setSel(null);
    setOrderPct(0);
    setWho(WALKIN);
    setNote("");
    setVoidArmed(false);
  }

  // ------------------------------------------------------------ products
  const cat = (id: string | null) => cats.find((c) => c.id === id);
  const needle = q.trim().toLowerCase();
  const found = useMemo(() => {
    if (!needle) return null;
    const out: { p: AdminProduct; v: AdminProduct["variants"][number] }[] = [];
    for (const p of products)
      for (const v of p.variants) {
        const code = (v.sku ?? "").toLowerCase();
        const bar = (v.barcode ?? "").toLowerCase();
        const name = `${p.name} ${v.label}`.toLowerCase();
        const hit =
          mode === "barcode" ? bar.includes(needle) : mode === "code" ? code.includes(needle) : mode === "name" ? name.includes(needle) : name.includes(needle) || code.includes(needle) || bar.includes(needle);
        if (hit) out.push({ p, v });
      }
    return out;
  }, [needle, mode, products]);
  type Tile = { key: string; label: string; sub: string; onClick: () => void; kind: "group" | "item" | "back"; low?: boolean };
  const tiles: Tile[] = useMemo(() => {
    const item = (p: AdminProduct, v: AdminProduct["variants"][number], showName = true): Tile => ({
      key: v.id,
      label: showName ? `${p.name}${v.label !== "Default" ? ` · ${v.label}` : ""}` : v.label,
      sub: v.price > 0 ? `₹${money(v.price)}${v.track_stock ? ` · ${v.stock_qty} left` : ""}` : "No price",
      kind: "item",
      low: v.track_stock && v.stock_qty <= 0,
      onClick: () => add(p.id, v.id),
    });
    if (found) return found.map(({ p, v }) => item(p, v));
    if (pick)
      return [
        { key: "back", label: "‹ Back", sub: pick.name, kind: "back", onClick: () => setPick(null) },
        ...pick.variants.map((v) => item(pick, v, false)),
      ];
    if (group) {
      const back: Tile = { key: "back", label: "‹ All groups", sub: cat(group)?.name ?? "", kind: "back", onClick: () => setGroup(null) };
      return [
        back,
        ...products
          .filter((p) => p.category_id === group)
          .map((p): Tile =>
            p.variants.length === 1
              ? item(p, p.variants[0])
              : { key: p.id, label: p.name, sub: `${p.variants.length} options`, kind: "group", onClick: () => setPick(p) },
          ),
      ];
    }
    return cats
      .filter((c) => products.some((p) => p.category_id === c.id))
      .map((c) => ({ key: c.id, label: c.name, sub: `${products.filter((p) => p.category_id === c.id).length} products`, kind: "group" as const, onClick: () => setGroup(c.id) }));
    // add() reads the ticket as it stands each time the tiles are drawn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, pick, group, cats, products, lines, rules, shop, costs]);
  const pages = Math.max(1, Math.ceil(tiles.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = tiles.slice(at * PAGE, at * PAGE + PAGE);

  // a scanner (or Enter): an exact barcode or code adds it; one match adds it
  function enter() {
    if (!needle) return;
    const exact = products.flatMap((p) => p.variants.map((v) => ({ p, v }))).find(({ v }) => (v.barcode ?? "").toLowerCase() === needle || (v.sku ?? "").toLowerCase() === needle);
    const one = exact ?? (found && found.length === 1 ? found[0] : null);
    if (one) {
      add(one.p.id, one.v.id);
      setQ("");
    } else if (found && !found.length) toast(`Nothing matches "${q.trim()}"`);
  }

  // ------------------------------------------------------------ paying
  async function complete(pays: { method: string; amount: number; reference?: string }[]) {
    if (!lines.length || busy) return;
    if (drawerShut) {
      setPanel("drawer");
      return toast("Open the cash drawer first");
    }
    const bad = charged.map((l) => (rules ? priceProblem(l.list, l.price, rules) : null)).find(Boolean);
    if (bad) return toast(bad);
    setBusy(true);
    try {
      const sale = await ringUp({
        key: saleKey(),
        lines: charged.map((l) => ({ variant: l.variant, qty: l.qty, ...(l.price !== l.list || !(l.list > 0) ? { price: l.price } : {}) })),
        payments: pays,
        customer: who.id,
        contact: { name: who.name.trim(), phone: who.phone.trim() },
        gstin: who.gstin.trim(),
        notes: note.trim(),
      });
      setLast({ ...sale, lines });
      // the stock on screen follows the sale
      setProducts((ps) =>
        ps.map((p) => ({
          ...p,
          variants: p.variants.map((v) => {
            const sold = lines.filter((l) => l.variant === v.id && l.track).reduce((n, l) => n + l.qty, 0);
            return sold ? { ...v, stock_qty: v.stock_qty - sold } : v;
          }),
        })),
      );
      clear();
      setPanel(null);
      toast(sale.change > 0 ? `Sale ${sale.number} done. Change ₹${money(sale.change)}` : `Sale ${sale.number} done`);
      if (rules?.autoPrint) router.push(`/admin/counter/receipt?id=${sale.id}&print=1`);
    } catch (e) {
      toastError(e);
      if (/drawer/i.test(errText(e))) void loadSession();
    }
    setBusy(false);
  }
  const payExact = (method: string) => void complete([{ method, amount: due }]);

  function park() {
    if (!lines.length) return toast("Nothing to save: the ticket is empty");
    const p: Parked = { id: saleKey(), at: new Date().toISOString(), lines, orderPct, who, note };
    const next = [p, ...parked].slice(0, 30);
    setParked(next);
    writeParked(next);
    clear();
    toast("Sale saved. Find it under ≡ › View open sales");
  }
  function resume(p: Parked) {
    if (lines.length) park();
    setLines(p.lines as Line[]);
    setOrderPct(p.orderPct);
    setWho(p.who);
    setNote(p.note);
    const next = parked.filter((x) => x.id !== p.id);
    setParked(next);
    writeParked(next);
    setPanel(null);
  }
  function dropParked(id: string) {
    const next = parked.filter((x) => x.id !== id);
    setParked(next);
    writeParked(next);
  }

  // ------------------------------------------------------------ keys
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      if (locked) return;
      const typing = (e.target as HTMLElement).closest("input, textarea, select") && (e.target as HTMLElement) !== search.current;
      if (e.key === "F9") {
        e.preventDefault();
        park();
      } else if (e.key === "F10") {
        e.preventDefault();
        if (lines.length) setPanel("pay");
      } else if (e.key === "F12") {
        e.preventDefault();
        if (lines.length && methods.some((m) => m.toLowerCase() === cashName.toLowerCase())) payExact(cashName);
      } else if (e.key === "Escape" && panel) setPanel(null);
      else if (typing) return;
      else if (e.key === "Delete" && sel != null) remove(sel);
      else if ((e.key === "+" || e.key === "-") && sel != null && !q) {
        e.preventDefault();
        setQty(sel, (lines[sel]?.qty ?? 0) + (e.key === "+" ? 1 : -1));
      }
    };
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  if (rules === null)
    return (
      <div className="tl-missing">
        <h2>Till</h2>
        <p>The till needs database update 0085 (counter sales). Once it&apos;s applied, this screen rings up walk-in sales.</p>
      </div>
    );
  if (err) return <p className="adm-err">{err}</p>;

  const line = sel != null ? lines[sel] : null;
  const quick = methods.slice(0, 3);
  const canDiscount = !!rules && (rules.discounts || rules.priceChange);
  const below = charged.some((l) => l.cost != null && l.price < l.cost);

  return (
    <div className="tl">
      <div className="tl-top" role="toolbar" aria-label="Till">
        <TopBtn icon="search" label="Search" onClick={() => search.current?.focus()} />
        <TopBtn icon="customer" label="Customer" onClick={() => setPanel("customer")} on={!!who.name || !!who.id} />
        <TopBtn icon="swap" label="Transfer" disabled title="For tables in a restaurant; a shop counter doesn't need it" />
        <TopBtn icon="percent" label="Discount" disabled={!lines.length || !canDiscount} onClick={() => setPanel("discount")} title={canDiscount ? undefined : "Discounts are off (Settings › Counter)"} />
        <TopBtn icon="tag" label="Price" disabled={!line || !canDiscount} onClick={() => setPanel("price")} />
        <TopBtn icon="add" label="New sale" onClick={() => (lines.length ? park() : clear())} title="Saves this ticket for later and starts a new one" />
        <TopBtn
          icon="refund"
          label="Refund"
          onClick={() => (credit === null ? setPanel("history") : (setRefundOf(null), setPanel("refund")))}
          title={credit === null ? `${NEEDS_0086} Until then: pick the sale, then refund it on its page` : "Scan or type the receipt number, or pick the sale"}
        />
        <TopBtn icon="drawer" label="Cash drawer" disabled={!rules?.drawer} onClick={() => setPanel("drawer")} on={drawerShut} title={rules?.drawer ? undefined : "The cash drawer is off (Settings › Counter)"} />
        <TopBtn icon="dinein" label="Dine-in" disabled title="For restaurants" />
        <span className="tl-sp" />
        <button type="button" className="tl-key" onClick={park}>
          <b>F9</b>
          <span>Save sale</span>
        </button>
        <button type="button" className="tl-key is-go" disabled={!lines.length || busy} onClick={() => setPanel("pay")}>
          <b>F10</b>
          <span>Payment</span>
        </button>
        {quick.map((m) => (
          <button key={m} type="button" className="tl-key" disabled={!lines.length || busy} onClick={() => payExact(m)} title={`Paid in full by ${m}`}>
            <b>{m.toLowerCase() === cashName.toLowerCase() ? "F12" : m.slice(0, 4)}</b>
            <span>{m}</span>
          </button>
        ))}
        <button type="button" className="tl-menu" aria-label="Menu" onClick={() => setPanel(panel === "menu" ? null : "menu")}>
          <svg viewBox="0 0 20 20" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
      </div>

      {drawerShut && (
        <div className="tl-band is-warn">
          The cash drawer is closed.{" "}
          <button type="button" onClick={() => setPanel("drawer")}>
            Open it
          </button>{" "}
          to start selling.
        </div>
      )}
      {last && (
        <div className="tl-band">
          Last sale {last.number}
          {last.change > 0 ? ` · change ₹${money(last.change)}` : ""}
          <span className="tl-sp" />
          <Link href={`/admin/counter/receipt?id=${last.id}&reprint=1`}>Receipt</Link>
          <Link href={`/admin/orders/print?ids=${last.id}&doc=invoice`}>GST invoice</Link>
          <Link href={`/admin/orders/view?id=${last.id}`}>Open</Link>
          <button type="button" aria-label="Hide" onClick={() => setLast(null)}>
            ×
          </button>
        </div>
      )}

      <div className="tl-body">
        <section className="tl-ticket" aria-label="This sale">
          <div className="tl-lbar">
            <button type="button" disabled={sel == null} onClick={() => sel != null && remove(sel)}>
              ✕ Delete
            </button>
            <button type="button" disabled={sel == null} onClick={() => setPanel("qty")}>
              Quantity
            </button>
            <button type="button" disabled={lines.reduce((n, l) => n + l.qty, 0) < 2} onClick={() => setPanel("split")} title="Move some lines to a ticket of their own">
              Split
            </button>
            <button type="button" disabled={!lines.length} onClick={() => setPanel("customer")} title="Customer and a note for this sale">
              ···
            </button>
          </div>
          {who.name || who.gstin ? (
            <p className="tl-who">
              {who.name || "Business buyer"}
              {who.phone ? ` · ${who.phone}` : ""}
              {who.gstin ? ` · GSTIN ${who.gstin}` : ""}
              {owing?.balance ? <em className="tl-owes"> · owes ₹{money(owing.balance)}</em> : null}
            </p>
          ) : null}
          <ol className="tl-lines">
            {!lines.length && <li className="tl-empty">No items</li>}
            {charged.map((l, i) => (
              <li key={l.key} className={i === sel ? "is-sel" : ""} onClick={() => setSel(i)}>
                <span className="tl-ln">
                  {l.name}
                  {l.label && <i> · {l.label}</i>}
                </span>
                <span className="tl-lq">
                  {l.qty} × {money(l.price)}
                  {l.price < l.list && <em> −{pctOff(l.list, l.price)}%</em>}
                </span>
                <b>{money(round2(l.qty * l.price))}</b>
              </li>
            ))}
          </ol>
          <dl className="tl-sums">
            <dt>Subtotal</dt>
            <dd>{money(sums.sub)}</dd>
            {orderPct > 0 && (
              <>
                <dt>Discount</dt>
                <dd>{orderPct.toFixed(2).replace(/\.?0+$/, "")}%</dd>
              </>
            )}
            <dt>{inclusive ? "Tax (included)" : "Tax"}</dt>
            <dd>{money(sums.tax + sums.cess)}</dd>
            <dt className="tl-total">Total</dt>
            <dd className="tl-total">{money(due)}</dd>
          </dl>
          {below && <p className="tl-warn">Below what it cost to buy</p>}
          <div className="tl-lfoot">
            <button type="button" className="is-void" disabled={!lines.length} onClick={() => (voidArmed ? voidOrder() : setVoidArmed(true))} onBlur={() => setVoidArmed(false)}>
              <ArIcon name="del" size={22} />
              <span>{voidArmed ? "Tap to void" : "Void order"}</span>
            </button>
            <button type="button" onClick={() => setLocked(true)}>
              <ArIcon name="key" size={22} />
              <span>Lock</span>
            </button>
            <button type="button" disabled={!last} onClick={() => last && setLines([...lines, ...last.lines.map((l) => ({ ...l, key: saleKey() }))])} title="Adds the last sale's items again">
              <ArIcon name="refresh" size={22} />
              <span>Repeat round</span>
            </button>
          </div>
        </section>

        <section className="tl-shelf" aria-label="Products">
          <div className="tl-sbar">
            {(
              [
                ["all", "star", "Search everything"],
                ["barcode", "barcode", "Search by barcode"],
                ["code", "hash", "Search by code"],
                ["name", "tag", "Search by name"],
              ] as const
            ).map(([m, icon, t]) => (
              <button key={m} type="button" className={mode === m ? "is-on" : ""} title={t} aria-label={t} onClick={() => setMode(m)}>
                <ArIcon name={icon} size={18} />
              </button>
            ))}
            <input
              ref={search}
              className="tl-q"
              placeholder={mode === "barcode" ? "Scan or type a barcode" : mode === "code" ? "Search products by code" : "Search products by name"}
              value={q}
              autoFocus
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  enter();
                } else if (e.key === "Escape") setQ("");
              }}
            />
          </div>
          <div className="tl-grid">
            {!products.length && !err && <p className="tl-empty">{rules === undefined ? "Loading…" : "No products yet"}</p>}
            {found && !found.length && <p className="tl-empty">Nothing matches</p>}
            {shown.map((t) => (
              <button key={t.key} type="button" className={`tl-tile is-${t.kind} ${t.low ? "is-low" : ""}`} onClick={t.onClick}>
                <span>{t.label}</span>
                <small>{t.sub}</small>
              </button>
            ))}
          </div>
          <div className="tl-pager">
            <span>
              Page {at + 1} / {pages}
            </span>
            <span className="tl-sp" />
            <button type="button" aria-label="All groups" onClick={() => (setGroup(null), setPick(null), setQ(""), setPage(0))}>
              ⌂
            </button>
            <button type="button" aria-label="First page" disabled={at === 0} onClick={() => setPage(0)}>
              |‹
            </button>
            <button type="button" aria-label="Previous page" disabled={at === 0} onClick={() => setPage(at - 1)}>
              ‹
            </button>
            <button type="button" aria-label="Next page" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
              ›
            </button>
            <button type="button" aria-label="Last page" disabled={at >= pages - 1} onClick={() => setPage(pages - 1)}>
              ›|
            </button>
          </div>
        </section>
      </div>

      {panel === "menu" && (
        <aside className="tl-side" aria-label="Till menu">
          {/* Aronium's ≡ menu, item for item: Management, then the till's
              jobs, then the person signed in, Feedback, and the settings /
              full screen / close buttons along the foot. Babajee adds
              Reprint last receipt and Split order among the jobs. */}
          <header>
            <h2>POS - {cashierName}</h2>
            <button type="button" aria-label="Close the menu" onClick={() => setPanel(null)}>
              →
            </button>
          </header>
          <Link href="/admin" className="tl-side-item">
            {sideIcon("M5 15.5 12.5 8M10 4.5a3.5 3.5 0 0 0 4.6 4.6l2.4 2.4-2 2-2.4-2.4A3.5 3.5 0 0 0 8 5.5l2 2-1.5 1.5-2-2A3.5 3.5 0 0 0 10 4.5zM3.5 13.5l3 3")}
            Management
          </Link>
          <hr />
          <button type="button" className="tl-side-item" onClick={() => setPanel("history")}>
            {sideIcon("M2.5 10.5l3 3 6-7M8.5 13.5l6-7M13 13.5l5-6")}
            View sales history
          </button>
          <button type="button" className="tl-side-item" onClick={() => setPanel("parked")}>
            {sideIcon("M10 3l7 3.5-7 3.5-7-3.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5")}
            View open sales{parked.length ? ` (${parked.length})` : ""}
          </button>
          <button type="button" className="tl-side-item" disabled={!rules?.drawer} title={rules?.drawer ? undefined : "The cash drawer is off (Settings › Counter)"} onClick={() => (setDrawerTab("move"), setPanel("drawer"))}>
            {sideIcon("M10 2.5v7M7 6.5l3 3 3-3M3 11h3l1.5 2h5l1.5-2h3v5.5H3z")}
            Cash In / Out
          </button>
          <button type="button" className="tl-side-item" disabled={credit === null} title={credit === null ? NEEDS_0086 : undefined} onClick={() => setPanel("credit")}>
            {sideIcon("M3 4.5h11v11H3zM5.5 8h6M5.5 11h4M12 14.5l5-5 1.5 1.5-5 5H12z")}
            Credit payments
          </button>
          <button type="button" className="tl-side-item" disabled={!rules?.drawer} title={rules?.drawer ? undefined : "The cash drawer is off (Settings › Counter)"} onClick={() => (setDrawerTab("close"), setPanel("drawer"))}>
            {sideIcon("M15.5 3v14M9 4.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM6 10l2.5-2 2 2 2 1M8.5 8l-1 4-2.5 3.5M7.5 12l2.5 1.5 1 3")}
            End of day
          </button>
          <button type="button" className="tl-side-item" onClick={() => void reprintLast()}>
            {sideIcon("M5.5 7V3h9v4M5.5 14h-2V8h13v6h-2M5.5 11.5h9v5.5h-9z")}
            Reprint last receipt
          </button>
          <button type="button" className="tl-side-item" disabled={lines.reduce((n, l) => n + l.qty, 0) < 2} onClick={() => setPanel("split")}>
            {sideIcon("M10 2.5v15M3 6h4.5M3 10h4.5M3 14h4.5M12.5 6H17M12.5 10H17M12.5 14H17")}
            Split order
          </button>
          <p className="tl-side-group">User</p>
          <Link href="/account" className="tl-side-item">
            {sideIcon("M10 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM3.5 17.5c.5-3.2 3.2-5 6.5-5s6 1.8 6.5 5")}
            User info
          </Link>
          <button type="button" className="tl-side-item" onClick={() => void signOut().then(() => router.push("/"))}>
            {sideIcon("M11 4.5V3H3.5v14H11v-1.5M8 10h9.5M14.5 7l3 3-3 3")}
            Sign out
          </button>
          <hr />
          <button type="button" className="tl-side-item" disabled title="Aronium's Feedback goes to Aronium's makers; Babajee has none">
            {sideIcon("M3 8h3l7-4v12l-7-4H3zM6 12l1 4h2l-1-4M15.5 8.5a2 2 0 0 1 0 3")}
            Feedback
          </button>
          <p className="tl-date">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-")}</p>
          <footer className="tl-side-foot">
            <button type="button" aria-label="Till settings" title="Till settings" onClick={() => setPanel("settings")}>
              {sideIcon("M4 6h7M14 6h2M4 14h2M9 14h7M11 4v4M6 12v4")}
            </button>
            <button type="button" aria-label="Full screen" title="Full screen" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
              {sideIcon("M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4")}
            </button>
            <button type="button" aria-label="Close the till" title="Close the till" onClick={() => router.push("/admin")}>
              {sideIcon("M10 2.5v7M6 5a6.5 6.5 0 1 0 8 0")}
            </button>
          </footer>
        </aside>
      )}

      {panel === "pay" && shop && rules && (
        <PayPanel due={due} methods={methods} cash={cashName} busy={busy} account={{ why: accountWhy, room, owes: owing?.balance ?? 0 }} onClose={() => setPanel(null)} onDone={(p) => void complete(p)} />
      )}
      {panel === "refund" && (
        <RefundPanel
          start={refundOf}
          methods={methods}
          cash={cashName}
          onClose={() => setPanel(null)}
          onDone={(id) => {
            setPanel(null);
            if (rules?.autoPrint) router.push(`/admin/counter/receipt?refund=${id}&print=1`);
            else toast("Refunded. Reprint it from ≡ › View sales history");
          }}
        />
      )}
      {panel === "credit" && (
        <CreditPanel
          methods={methods}
          cash={cashName}
          onClose={() => setPanel(null)}
          onDone={(id) => {
            setPanel(null);
            if (who.id) setOwes(null);
            router.push(`/admin/counter/receipt?credit=${id}${rules?.autoPrint ? "&print=1" : ""}`);
          }}
        />
      )}
      {panel === "split" && <SplitPanel lines={lines} onClose={() => setPanel(null)} onSplit={split} />}
      {panel === "customer" && <CustomerPanel who={who} note={note} credit={credit} onClose={() => setPanel(null)} onDone={(w, n) => (setWho(w), setNote(n), setPanel(null))} />}
      {panel === "discount" && rules && (
        <DiscountPanel
          line={line}
          sub={sums.sub}
          rules={rules}
          orderPct={orderPct}
          onClose={() => setPanel(null)}
          onLine={(pct) => {
            if (sel == null || !line) return;
            const price = discounted(line.list, pct);
            const bad = priceProblem(line.list, price, rules);
            if (bad) return toast(bad);
            setLine(sel, { price });
            setPanel(null);
          }}
          onOrder={(pct) => {
            const bad = lines.map((l) => priceProblem(l.list, discounted(l.price, pct), rules)).find(Boolean);
            if (bad) return toast(bad);
            setOrderPct(pct);
            setPanel(null);
          }}
        />
      )}
      {panel === "price" && line && rules && (
        <NumberPanel
          title={`Price · ${line.name}`}
          label={`Price per piece (listed at ₹${money(line.list)})`}
          start={line.price}
          onClose={() => setPanel(null)}
          onDone={(v) => {
            const bad = priceProblem(line.list, round2(v), rules);
            if (bad) return toast(bad);
            setLine(sel!, { price: round2(v) });
            setPanel(null);
          }}
        />
      )}
      {panel === "qty" && line && (
        <NumberPanel
          title={`Quantity · ${line.name}`}
          label={line.track ? `How many (${line.stock} in stock)` : "How many"}
          start={line.qty}
          whole
          onClose={() => setPanel(null)}
          onDone={(v) => {
            setQty(sel!, Math.round(v));
            setPanel(null);
          }}
        />
      )}
      {panel === "drawer" && rules && (
        <DrawerPanel
          session={session ?? null}
          float={rules.float}
          cash={cashName}
          mayClose={can(role, "money")}
          start={drawerTab}
          onClose={() => (setPanel(null), setDrawerTab("now"))}
          onChanged={() => void loadSession()}
        />
      )}
      {panel === "history" && <HistoryPanel onClose={() => setPanel(null)} onRefund={credit === null ? undefined : (id) => (setRefundOf(id), setPanel("refund"))} />}
      {panel === "parked" && <ParkedPanel parked={parked} onClose={() => setPanel(null)} onResume={resume} onDrop={dropParked} />}
      {panel === "settings" && (
        <aside className="tl-sheet is-wide" aria-label="Till settings">
          <header>
            <h2>Till settings</h2>
            <button type="button" aria-label="Close" onClick={() => setPanel(null)}>
              →
            </button>
          </header>
          <div className="tl-sheet-body tl-legacy">
            <CounterSettingsForm editable={can(role, "settings")} onSaved={(r) => setRules(r)} />
          </div>
        </aside>
      )}

      {locked && (
        <button type="button" className="tl-lock" onClick={() => setLocked(false)}>
          <ArIcon name="key" size={48} />
          <span>Locked. Click to unlock.</span>
        </button>
      )}
    </div>
  );
}

const TOP_ICONS: Record<string, string> = {
  customer: "M10 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 17.5c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6",
  refund: "M7.5 4 3.5 8l4 4M3.5 8h9a4 4 0 0 1 0 8H9",
  drawer: "M2.5 9.5h15v7h-15zM4 9.5 5.5 4h9L16 9.5M8 13h4",
  dinein: "M5 3v6M3.5 3v4a1.5 1.5 0 0 0 3 0V3M5 9v8.5M14 3c-1.5 1-2 3-2 5h2v9.5",
};
function TopBtn({ icon, label, onClick, disabled, title, on }: { icon: string; label: string; onClick?: () => void; disabled?: boolean; title?: string; on?: boolean }) {
  return (
    <button type="button" className={`tl-btn ${on ? "is-on" : ""}`} disabled={disabled} onClick={onClick} title={title}>
      {TOP_ICONS[icon] ? (
        <svg viewBox="0 0 20 20" width="30" height="30" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={TOP_ICONS[icon]} />
        </svg>
      ) : (
        <ArIcon name={icon} />
      )}
      <span>{label}</span>
    </button>
  );
}

// ------------------------------------------------------------ F10 Payment
// account: whether this sale can go on the customer's account ("" = it can,
// else why not), the room left under their credit limit, what they owe now
function PayPanel({
  due,
  methods,
  cash,
  busy,
  account,
  onClose,
  onDone,
}: {
  due: number;
  methods: string[];
  cash: string;
  busy: boolean;
  account: { why: string; room: number | null; owes: number };
  onClose: () => void;
  onDone: (p: { method: string; amount: number; reference?: string }[]) => void;
}) {
  const [ways, setWays] = useState("2");
  const [pays, setPays] = useState<{ method: string; amount: number; reference: string }[]>([]);
  const [method, setMethod] = useState(methods.find((m) => m.toLowerCase() === cash.toLowerCase()) ?? methods[0] ?? "");
  const s = settle(due, pays, cash);
  const [typed, setTyped] = useState(String(due));
  const [ref, setRef] = useState("");
  const isCash = method.toLowerCase() === cash.toLowerCase();
  const isAccount = method === ON_ACCOUNT;
  const owedHere = pays.filter((p) => p.method === ON_ACCOUNT).reduce((n, p) => n + p.amount, 0);
  const overLimit = account.room != null && owedHere > account.room + 0.005;
  // Split evenly: N payments of the chosen way, what's left shared equally
  function splitEvenly() {
    const n = Math.floor(Number(ways));
    if (!(n >= 2) || !method || !(s.short > 0)) return;
    const next = [...pays, ...evenly(s.short, n).map((amount) => ({ method, amount, reference: "" }))];
    setPays(next);
    setTyped("");
  }
  function addPay(amount: number) {
    if (!(amount > 0) || !method) return;
    const next = [...pays, { method, amount: round2(amount), reference: isCash ? "" : ref.trim() }];
    setPays(next);
    const left = settle(due, next, cash).short;
    setTyped(left > 0 ? String(left) : "");
    setRef("");
  }
  return (
    <aside className="tl-sheet" aria-label="Payment">
      <header>
        <h2>Payment</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          →
        </button>
      </header>
      <div className="tl-sheet-body">
        <div className="tl-due">
          <span>Total</span>
          <b>₹{money(due)}</b>
        </div>
        <div className="tl-methods">
          {methods.map((m) => (
            <button key={m} type="button" className={m === method ? "is-on" : ""} onClick={() => setMethod(m)}>
              {m}
            </button>
          ))}
          {account.why !== NEEDS_0086 && (
            <button type="button" className={isAccount ? "is-on" : ""} disabled={!!account.why} title={account.why || "The customer pays later: it goes on what they owe"} onClick={() => (setMethod(ON_ACCOUNT), setTyped(String(s.short || due)))}>
              {ON_ACCOUNT}
            </button>
          )}
        </div>
        {isAccount && (
          <p className="adm-small">
            They owe ₹{money(account.owes)} now{account.room != null ? `; ₹${money(account.room)} more fits their credit limit` : ""}. The invoice is still issued with the sale.
          </p>
        )}
        <label className="tl-field">
          {isCash ? "Cash given" : isAccount ? "Amount owed (unpaid)" : `Amount by ${method}`}
          <input className="adm-input" inputMode="decimal" autoFocus value={typed} onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPay(Number(typed)))} />
        </label>
        {isCash && (
          <div className="tl-notes">
            {quickCash(s.short || due).map((n) => (
              <button key={n} type="button" onClick={() => addPay(n)}>
                ₹{money(n)}
              </button>
            ))}
          </div>
        )}
        {!isCash && !isAccount && (
          <label className="tl-field">
            Reference (optional: UPI ref, card slip no.)
            <input className="adm-input" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} />
          </label>
        )}
        <button type="button" className="tl-add" disabled={!(Number(typed) > 0)} onClick={() => addPay(Number(typed))}>
          + Add payment
        </button>
        <div className="tl-even">
          <span>Split evenly by</span>
          <input className="adm-input" inputMode="numeric" value={ways} maxLength={2} onChange={(e) => setWays(e.target.value.replace(/\D/g, ""))} aria-label="How many ways" />
          <button type="button" disabled={!(Number(ways) >= 2) || !(s.short > 0) || !method} onClick={splitEvenly} title={`${Number(ways) || 0} payments by ${method} of what's still to pay`}>
            Split
          </button>
        </div>
        {pays.length > 0 && (
          <ul className="tl-pays">
            {pays.map((p, i) => (
              <li key={i}>
                <span>
                  {p.method}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <b>₹{money(p.amount)}</b>
                <button type="button" aria-label="Remove" onClick={() => setPays(pays.filter((_, n) => n !== i))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <dl className="tl-settle">
          <dt>Paid</dt>
          <dd>₹{money(s.paid)}</dd>
          {s.short > 0 && (
            <>
              <dt>Still to pay</dt>
              <dd className="is-bad">₹{money(s.short)}</dd>
            </>
          )}
          {s.change > 0 && (
            <>
              <dt>Change</dt>
              <dd className="is-good">₹{money(s.change)}</dd>
            </>
          )}
        </dl>
        {overLimit && <p className="adm-err">That&apos;s over their credit limit: ₹{money(account.room ?? 0)} more is allowed.</p>}
        {s.overNotCash && <p className="adm-err">Only cash can be paid over the total. Lower the {pays.find((p) => p.method.toLowerCase() !== cash.toLowerCase())?.method} payment to what&apos;s due.</p>}
      </div>
      <footer>
        <button type="button" className="tl-ok" disabled={!s.ok || busy || overLimit} onClick={() => onDone(pays)}>
          ✓ {busy ? "Saving…" : s.change > 0 ? `Done · change ₹${money(s.change)}` : "Done"}
        </button>
        <button type="button" onClick={onClose}>
          ✕ Cancel
        </button>
      </footer>
    </aside>
  );
}

// ------------------------------------------------------------ Customer
function CustomerPanel({ who, note, credit, onClose, onDone }: { who: Who; note: string; credit: CreditRules | null | undefined; onClose: () => void; onDone: (w: Who, note: string) => void }) {
  // what each customer found owes (0086), shown beside them
  const [owe, setOwe] = useState<Record<string, number>>({});
  const [w, setW] = useState(who);
  const [n, setN] = useState(note);
  const [all, setAll] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    listCustomers().then(
      (c) => setAll(c.filter((x) => !x.is_test)),
      () => setAll([]),
    );
  }, []);
  const k = q.trim().toLowerCase();
  const hits = useMemo(() => (k && all ? all.filter((c) => `${c.full_name} ${c.phone} ${c.email}`.toLowerCase().includes(k)).slice(0, 8) : []), [k, all]);
  useEffect(() => {
    if (credit == null) return;
    const ids = [...hits.map((c) => c.id), ...(w.id ? [w.id] : [])].filter((id) => !(id in owe));
    if (!ids.length) return;
    let live = true;
    Promise.all(ids.map((id) => customerBalance(id).then((b) => [id, b ?? 0] as const))).then((got) => live && setOwe((o) => ({ ...o, ...Object.fromEntries(got) })));
    return () => {
      live = false;
    };
  }, [hits, w.id, credit, owe]);
  const gstinBad = !!w.gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(w.gstin.trim().toUpperCase());
  return (
    <aside className="tl-sheet" aria-label="Customer">
      <header>
        <h2>Customer</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          →
        </button>
      </header>
      <div className="tl-sheet-body">
        <label className="tl-field">
          Find a customer
          <input className="adm-input" value={q} autoFocus placeholder="Name, phone or email" onChange={(e) => setQ(e.target.value)} />
        </label>
        {hits.length > 0 && (
          <ul className="tl-hits">
            {hits.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => (setW({ ...w, id: c.id, name: c.full_name, phone: c.phone }), setQ(""))}>
                  {c.full_name || c.email} <small>{c.phone}</small>
                  {owe[c.id] ? <small className="tl-owes">owes ₹{money(owe[c.id])}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {w.id && (
          <p className="adm-small">
            On their account{owe[w.id] ? ` · owes ₹${money(owe[w.id])}` : ""}.{" "}
            <button type="button" className="tl-link" onClick={() => setW({ ...w, id: null })}>
              Take it off
            </button>
          </p>
        )}
        <label className="tl-field">
          Name (empty: walk-in)
          <input className="adm-input" value={w.name} maxLength={80} onChange={(e) => setW({ ...w, name: e.target.value })} />
        </label>
        <label className="tl-field">
          Phone
          <input className="adm-input" inputMode="tel" value={w.phone} maxLength={20} onChange={(e) => setW({ ...w, phone: e.target.value })} />
        </label>
        <label className="tl-field">
          Business GSTIN (for a B2B invoice)
          <input className={`adm-input ${gstinBad ? "is-required" : ""}`} value={w.gstin} maxLength={15} onChange={(e) => setW({ ...w, gstin: e.target.value.toUpperCase() })} />
        </label>
        <label className="tl-field">
          Note on this sale
          <textarea className="adm-input" rows={2} value={n} maxLength={1000} onChange={(e) => setN(e.target.value)} />
        </label>
      </div>
      <footer>
        <button type="button" className="tl-ok" disabled={gstinBad} onClick={() => onDone({ ...w, gstin: w.gstin.trim().toUpperCase() }, n)}>
          ✓ OK
        </button>
        <button type="button" onClick={() => onDone(WALKIN, "")}>
          Walk-in
        </button>
      </footer>
    </aside>
  );
}

// ------------------------------------------------------------ Discount
function DiscountPanel({ line, sub, rules, orderPct, onClose, onLine, onOrder }: { line: Line | null; sub: number; rules: CounterSettings; orderPct: number; onClose: () => void; onLine: (pct: number) => void; onOrder: (pct: number) => void }) {
  const [on, setOn] = useState<"line" | "order">(line ? "line" : "order");
  const [kind, setKind] = useState<"pct" | "amt">("pct");
  const [v, setV] = useState("");
  const n = Number(v) || 0;
  const pct = kind === "pct" ? n : on === "line" && line ? pctForAmount(line.list, n) : pctForAmount(sub, n);
  const cap = rules.priceChange ? 100 : rules.maxDiscount;
  return (
    <aside className="tl-sheet" aria-label="Discount">
      <header>
        <h2>Discount</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          →
        </button>
      </header>
      <div className="tl-sheet-body">
        <div className="tl-methods">
          <button type="button" className={on === "line" ? "is-on" : ""} disabled={!line} onClick={() => setOn("line")}>
            This item
          </button>
          <button type="button" className={on === "order" ? "is-on" : ""} onClick={() => setOn("order")}>
            Whole sale
          </button>
        </div>
        <div className="tl-methods">
          <button type="button" className={kind === "pct" ? "is-on" : ""} onClick={() => setKind("pct")}>
            Percent
          </button>
          <button type="button" className={kind === "amt" ? "is-on" : ""} onClick={() => setKind("amt")}>
            Amount (₹)
          </button>
        </div>
        <label className="tl-field">
          {kind === "pct" ? "Percent off" : on === "line" ? "Rupees off each piece" : "Rupees off the sale"}
          <input className="adm-input" inputMode="decimal" autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
        <p className="adm-small">
          {on === "line" && line ? `${line.name}: ₹${money(line.list)} → ₹${money(discounted(line.list, pct))}` : `₹${money(sub)} → about ₹${money(round2(sub * (1 - pct / 100)))}`}
          {cap < 100 ? ` · up to ${cap}% allowed` : ""}
        </p>
        {orderPct > 0 && on === "order" && <p className="adm-small">Now {orderPct.toFixed(2).replace(/\.?0+$/, "")}% off the sale.</p>}
      </div>
      <footer>
        <button type="button" className="tl-ok" disabled={pct < 0 || pct > 100} onClick={() => (on === "line" ? onLine(pct) : onOrder(pct))}>
          ✓ Apply
        </button>
        <button type="button" onClick={() => (on === "line" ? onLine(0) : onOrder(0))}>
          Remove discount
        </button>
      </footer>
    </aside>
  );
}

// a number typed into a small panel (Price, Quantity)
function NumberPanel({ title, label, start, whole, onClose, onDone }: { title: string; label: string; start: number; whole?: boolean; onClose: () => void; onDone: (v: number) => void }) {
  const [v, setV] = useState(String(start));
  const n = Number(v);
  return (
    <aside className="tl-sheet is-small" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          →
        </button>
      </header>
      <div className="tl-sheet-body">
        <label className="tl-field">
          {label}
          <input
            className="adm-input"
            inputMode={whole ? "numeric" : "decimal"}
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value.replace(whole ? /\D/g : /[^\d.]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && n >= 0 && (e.preventDefault(), onDone(n))}
          />
        </label>
      </div>
      <footer>
        <button type="button" className="tl-ok" disabled={!(n >= 0) || v === ""} onClick={() => onDone(n)}>
          ✓ OK
        </button>
        <button type="button" onClick={onClose}>
          ✕ Cancel
        </button>
      </footer>
    </aside>
  );
}

// the ≡ menu's line icons
function sideIcon(d: string) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
