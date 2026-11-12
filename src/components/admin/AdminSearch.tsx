"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { money, StatusPill, when } from "@/components/admin/ui";
import { listProducts, type AdminProduct } from "@/lib/admin-data";
import { listCustomers, listOrders, type Customer, type Order } from "@/lib/orders-db";

// One search box across the admin: orders (number, name, phone, email, city,
// pincode), products (name, category, options, SKU), customers and the admin
// pages themselves. Everything is fetched once on first use and searched in
// the browser, so results come as you type. Ctrl+K or / jumps to it.

type Hit = { key: string; group: string; href: string; title: string; meta?: string; order?: Order };

const PAGES: { title: string; href: string; words: string }[] = [
  { title: "Home", href: "/admin", words: "home today dashboard" },
  { title: "Orders", href: "/admin/orders", words: "orders unpaid pack ship" },
  { title: "Create an order", href: "/admin/orders/new", words: "new order create phone whatsapp counter manual draft" },
  { title: "Carts", href: "/admin/orders/carts", words: "carts abandoned active jar left recovery remind" },
  { title: "Products", href: "/admin/products", words: "products catalogue inventory stock categories" },
  { title: "Add a product", href: "/admin/products/new", words: "new product add create" },
  { title: "Reviews", href: "/admin/products/reviews", words: "reviews ratings stars approve moderate feedback" },
  { title: "Collections", href: "/admin/products/collections", words: "collections staff picks gift ideas hand-picked lists featured" },
  { title: "Sign-ins", href: "/admin/customers/sign-ins", words: "sign-ins logins login history failed password security" },
  { title: "Admins", href: "/admin/settings/team", words: "admins team staff users access people" },
  { title: "Activity log", href: "/admin/settings/activity", words: "activity log audit history changes who changed" },
  { title: "Customers", href: "/admin/customers", words: "customers people buyers" },
  { title: "Analytics", href: "/admin/analytics", words: "analytics stats sales profit visitors" },
  { title: "Reports", href: "/admin/analytics/reports", words: "reports export csv download finance gst stock sales by product customer" },
  { title: "Settings", href: "/admin/settings", words: "settings delivery shipping charge gst rate tax state input credit" },
];

type Data = { orders: Order[]; products: AdminProduct[]; customers: Customer[] };
let cache: { at: number; data: Promise<Data> } | null = null;

// fresh for a minute, so a new order shows without a reload
function load(): Promise<Data> {
  if (!cache || Date.now() - cache.at > 60_000) {
    const data = Promise.all([listOrders(), listProducts(), listCustomers()]).then(([orders, products, customers]) => ({ orders, products, customers }));
    data.catch(() => (cache = null));
    cache = { at: Date.now(), data };
  }
  return cache.data;
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const digits = (s: string) => s.replace(/\D/g, "");

// every word typed must appear somewhere; a run of digits also matches a
// phone number written with spaces or a +91
function matches(words: string[], text: string, phone = "") {
  const t = fold(text);
  const p = digits(phone);
  return words.every((w) => t.includes(w) || (p && /^\d{3,}$/.test(w) && p.includes(w)));
}

function search(q: string, d: Data | null): Hit[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: Hit[] = [];

  for (const p of PAGES) if (matches(words, `${p.title} ${p.words}`)) hits.push({ key: `p${p.href}`, group: "Pages", href: p.href, title: p.title });
  if (!d) return hits;

  const orders = d.orders.filter((o) =>
    matches(words, `${o.order_number} ${o.contact_name} ${o.contact_email} ${o.address_city} ${o.address_state} ${o.address_pincode} ${o.status}`, o.contact_phone),
  );
  for (const o of orders.slice(0, 6))
    hits.push({ key: `o${o.id}`, group: "Orders", href: `/admin/orders/view?id=${o.id}`, title: `${o.order_number} · ${o.contact_name}`, meta: `${money(o.total)} · ${when(o.created_at)}`, order: o });

  const products = d.products.filter((p) =>
    matches(words, `${p.name} ${p.slug} ${p.brand} ${p.product_type} ${p.tags.join(" ")} ${p.category_name ?? ""} ${p.variants.map((v) => v.label).join(" ")}`),
  );
  for (const p of products.slice(0, 6)) {
    const prices = p.variants.map((v) => v.price).filter((x) => x > 0);
    const opts = p.variants.length > 1 ? `${p.variants.length} options` : "";
    hits.push({
      key: `r${p.id}`,
      group: "Products",
      href: `/admin/products/edit?id=${p.id}`,
      title: p.name,
      meta: [p.brand, p.category_name, prices.length ? money(Math.min(...prices)) : "No price", opts, p.is_visible ? "" : "Hidden"].filter(Boolean).join(" · "),
    });
  }

  const customers = d.customers.filter((c) => matches(words, `${c.full_name} ${c.email}`, c.phone));
  for (const c of customers.slice(0, 6))
    hits.push({
      key: `c${c.id}`,
      group: "Customers",
      href: `/admin/customers/view?id=${c.id}`,
      title: c.full_name || c.email || "No name",
      meta: [c.role === "admin" ? "Admin" : "", c.phone, `${c.orders} order${c.orders === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
    });

  return hits;
}

export function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useId();

  const hits = useMemo(() => search(q, data), [q, data]);
  const cur = Math.min(at, Math.max(hits.length - 1, 0));

  function warm() {
    load()
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }

  // Ctrl+K anywhere, or / when not already typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(h.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAt((cur + 1) % Math.max(hits.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAt((cur - 1 + hits.length) % Math.max(hits.length, 1));
    } else if (e.key === "Enter" && hits[cur]) {
      e.preventDefault();
      go(hits[cur]);
    } else if (e.key === "Escape") {
      if (q) setQ("");
      else input.current?.blur();
      setOpen(false);
    }
  }

  const show = open && q.trim() !== "";

  return (
    <div className="asr" ref={box}>
      <div className="asr-field">
        <svg viewBox="0 0 20 20" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4 4" />
        </svg>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={list}
          aria-activedescendant={show && hits[cur] ? `${list}-${cur}` : undefined}
          aria-label="Search orders, products, customers and pages"
          placeholder="Search"
          value={q}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => {
            warm();
            setOpen(true);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <kbd aria-hidden>/</kbd>
      </div>

      {show && (
        <div className="asr-pop">
          <ul id={list} role="listbox" aria-label="Results">
            {hits.map((h, i) => {
              const head = i === 0 || hits[i - 1].group !== h.group;
              return (
                <li key={h.key} role="presentation">
                  {head && <div className="asr-group">{h.group}</div>}
                  <a
                    id={`${list}-${i}`}
                    role="option"
                    aria-selected={i === cur}
                    href={h.href}
                    className={i === cur ? "is-on" : ""}
                    onMouseMove={() => i !== cur && setAt(i)}
                    onClick={(e) => {
                      e.preventDefault();
                      go(h);
                    }}
                  >
                    <span className="asr-title">{h.title}</span>
                    {h.order && <StatusPill status={h.order.status} />}
                    {h.meta && <span className="asr-meta">{h.meta}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
          {!data && !failed && <p className="asr-note">Searching…</p>}
          {failed && <p className="asr-note">Couldn&apos;t load orders and products. Pages only.</p>}
          {data && hits.length === 0 && <p className="asr-note">Nothing matches “{q.trim()}”.</p>}
        </div>
      )}
    </div>
  );
}
