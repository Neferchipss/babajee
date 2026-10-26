"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { cartCount, LANDED_EVENT, useCart } from "@/lib/cart";
import { setModePref, useModePref, type ModePref } from "@/lib/mode";
import { JarIcon, UserIcon } from "./icons";
import "./shop-bar.css";
import "./profile-panel.css";

const OUT_MS = 280;

const I = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PIN = "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z";
const BOX = "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8";
const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";

const LIST: { href: string; label: string; d: string }[] = [
  { href: "/shop", label: "Shop", d: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6" },
  { href: "/", label: "Home", d: "M3 11l9-7 9 7M5 9.5V20h14V9.5" },
  { href: "/about", label: "About Babajee", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01" },
  { href: "/support", label: "Help and support", d: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4zM20 14h-3v5h2a1 1 0 0 0 1-1v-4z" },
  { href: "/contact", label: "Contact us", d: "M4 6h16v12H4zM4 7l8 6 8-6" },
  { href: "/terms", label: "Terms and conditions", d: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" },
  { href: "/legal", label: "Legal", d: "M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0L7 7zM17 7l-3 7a3 3 0 0 0 6 0l-3-7M8 21h8" },
];

// The cart and the profile buttons, side by side at the end of the bar (the
// same bar on the landing, the shelves and the cart). The cart's badge counts
// what is in it, and products thrown into the cart fly here.
//
// The profile button, and the screen it opens: sliding in from the right,
// after the delivery apps. Who you are across the top, shortcuts (addresses,
// orders, wishlist) under it, then the site's pages. Back, Escape, a
// tap beside it (wide screens) or a swipe to the right closes it.
export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const count = cartCount(useCart());
  const closed = useCallback(() => setOpen(false), []);
  const path = usePathname().replace(/\/$/, "");
  // a wobble each time something lands in the cart
  const [plop, setPlop] = useState(0);
  useEffect(() => {
    const onLand = () => setPlop((p) => p + 1);
    window.addEventListener(LANDED_EVENT, onLand);
    return () => window.removeEventListener(LANDED_EVENT, onLand);
  }, []);
  return (
    <div className="sb-me">
      <Link
        href="/cart"
        className="sb-profile sb-cart"
        data-jar="header"
        aria-current={path === "/cart" ? "page" : undefined}
        aria-label={count === 0 ? "Cart, empty" : `Cart, ${count} item${count === 1 ? "" : "s"}`}
      >
        <span key={plop} className="sb-cart-icon" data-plop={plop > 0 || undefined}>
          <JarIcon size={22} />
        </span>
        <span className="sb-label">Cart</span>
        {count > 0 && (
          <b key={`n${count}`} className="sb-badge">
            {count > 99 ? "99+" : count}
          </b>
        )}
      </Link>
      <button
        type="button"
        className="sb-profile"
        aria-label="Profile and menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <UserIcon size={22} />
        <span className="sb-label">Profile</span>
      </button>
      {open && <ProfilePanel onClosed={closed} />}
    </div>
  );
}

function ProfilePanel({ onClosed }: { onClosed: () => void }) {
  const { status, user, profile, signOut } = useAuth();
  const path = usePathname();
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const gone = useRef(false);
  const shut = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    setLeaving(true);
    window.setTimeout(onClosed, OUT_MS);
  }, [onClosed]);

  // the page behind stays put; Escape closes; focus moves in, and back after
  useEffect(() => {
    const was = document.body.style.overflow;
    const from = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const sheet = root.dataset.sheet;
    document.body.style.overflow = "hidden";
    // a sheet is up: Baba's pull-down and the floating jar stand aside
    root.dataset.sheet = "profile";
    panel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && shut();
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = was;
      if (sheet) root.dataset.sheet = sheet;
      else delete root.dataset.sheet;
      window.removeEventListener("keydown", key);
      from?.focus?.();
    };
  }, [shut]);

  // a page picked here: close once it has arrived
  const at = useRef(path);
  useEffect(() => {
    if (path !== at.current) shut();
  }, [path, shut]);

  // a swipe to the right drags it away
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let way: "x" | "y" | null = null;
    let dx = 0;
    const start = (e: TouchEvent) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
      way = null;
      dx = 0;
    };
    const move = (e: TouchEvent) => {
      const mx = e.touches[0].clientX - x0;
      const my = e.touches[0].clientY - y0;
      if (!way) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        way = Math.abs(mx) > Math.abs(my) && mx > 0 ? "x" : "y";
      }
      if (way !== "x") return;
      if (e.cancelable) e.preventDefault();
      dx = Math.max(0, mx);
      el.style.transition = "none";
      el.style.transform = `translateX(${dx}px)`;
    };
    const end = () => {
      if (way !== "x") return;
      const fast = dx / Math.max(1, performance.now() - t0) > 0.5;
      el.style.transition = "";
      if (dx > el.offsetWidth * 0.3 || (fast && dx > 40)) {
        // on from where the finger left it
        el.style.transform = "translateX(100%)";
        shut();
      } else el.style.transform = "";
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [shut]);

  const signedIn = status === "in" && user;
  const name = profile?.full_name?.trim() || (signedIn ? "Your account" : "Hello there");
  const go = (href: string) => () => {
    if (href.split("#")[0] === path) shut();
  };

  const tile = (href: string, label: ReactNode, d: string, extra?: ReactNode) => (
    <Link href={href} className="pp-tile" onClick={go(href)}>
      <I d={d} />
      <span>{label}</span>
      {extra}
    </Link>
  );

  return createPortal(
    <div className="pp" data-leaving={leaving || undefined}>
      <div className="pp-scrim" onClick={() => shut()} aria-hidden="true" />
      <div ref={panel} className="pp-panel" role="dialog" aria-modal="true" aria-label="Profile and menu" tabIndex={-1}>
        {/* a plain bar: back and the title */}
        <div className="pp-bar">
          <button type="button" className="pp-back" onClick={() => shut()} aria-label="Close">
            <I d="M15 18l-6-6 6-6" size={22} />
          </button>
          <h2 className="pp-title">Profile</h2>
        </div>

        {/* who you are: a picture, the name, the number */}
        <header className="pp-head">
          <span className="pp-avatar" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <defs>
                <linearGradient id="pp-avatar-ink" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#a54ee0" />
                  <stop offset="1" stopColor="#6a3fc0" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="25" r="11" />
              <path d="M10 60c2-12 11-19 22-19s20 7 22 19z" />
            </svg>
          </span>
          <div className="pp-who">
            <p className="pp-name">{name}</p>
            {signedIn ? (
              <span>{profile?.phone ? phoneLine(profile.phone) : user.email}</span>
            ) : status === "loading" ? (
              <span>Checking your account…</span>
            ) : (
              <Link href="/account/login" className="pp-login" onClick={go("/account/login")}>
                Log in or sign up
              </Link>
            )}
          </div>
        </header>

        <div className="pp-body">
          <div className="pp-tiles">
            {tile("/account#addresses-heading", <>Saved<br />addresses</>, PIN)}
            {tile("/orders", <>Your<br />orders</>, BOX)}
            {tile("/cart#saved-title", <>Your<br />wishlist</>, HEART)}
          </div>

          <ModeSwitch />

          <nav className="pp-list" aria-label="Pages">
            {signedIn && (
              <Link href="/account" className="pp-row" onClick={go("/account")}>
                <UserIcon size={22} />
                <span>Your account</span>
              </Link>
            )}
            {profile?.role === "admin" && (
              <Link href="/admin" className="pp-row" onClick={go("/admin")}>
                <I d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
                <span>Admin</span>
              </Link>
            )}
            {LIST.map((r) => (
              <Link key={r.href} href={r.href} className="pp-row" onClick={go(r.href)}>
                <I d={r.d} />
                <span>{r.label}</span>
              </Link>
            ))}
          </nav>

          {signedIn && (
            <button
              type="button"
              className="pp-out"
              onClick={async () => {
                await signOut();
                shut();
              }}
            >
              Log out
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// "+91 70073 53834", as a phone shows it
function phoneLine(raw: string) {
  const d = raw.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw;
}

const MODES: { id: ModePref; label: string; d: string }[] = [
  { id: "system", label: "System", d: "M4 5h16v11H4zM9 20h6M12 16v4" },
  { id: "light", label: "Light", d: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { id: "dark", label: "Dark", d: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" },
];

// Light, dark, or as the device is set (the default)
function ModeSwitch() {
  const pref = useModePref();
  return (
    <div className="pp-mode">
      <p className="pp-mode-title" id="pp-mode-title">
        Appearance
      </p>
      <div className="pp-mode-opts" role="radiogroup" aria-labelledby="pp-mode-title">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={pref === m.id} className="pp-mode-opt" onClick={() => setModePref(m.id)}>
            <I d={m.d} size={18} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
