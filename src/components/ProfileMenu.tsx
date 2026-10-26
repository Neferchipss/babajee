"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cartCount, useCart } from "@/lib/cart";
import { JarIcon, UserIcon } from "./icons";
import "./shop-bar.css";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/support", label: "Support" },
  { href: "/contact", label: "Contact" },
];

// The profile button, holding what the site header held (the shop's
// header takes its place on the shelves): your account, the cart, and the
// site's pages, home among them. A badge on it counts what is in the cart.
export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const count = cartCount(useCart());
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div ref={root} className="sb-me">
      <button
        type="button"
        className="sb-profile"
        aria-label={count ? `Menu, ${count} in your cart` : "Menu"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <UserIcon size={22} />
        <span className="sb-label">Profile</span>
        {count > 0 && <b className="sb-badge">{count > 99 ? "99+" : count}</b>}
      </button>
      {open && (
        <nav className="sb-menu" aria-label="Menu">
          <Link href="/account" className="sb-menu-item" onClick={close}>
            <UserIcon size={20} />
            <span>Your account</span>
          </Link>
          <Link href="/cart" className="sb-menu-item" onClick={close}>
            <JarIcon size={20} />
            <span>Cart</span>
            {count > 0 && <b className="sb-menu-count">{count > 99 ? "99+" : count}</b>}
          </Link>
          <span className="sb-menu-rule" role="presentation" />
          {PAGES.map((pg) => (
            <Link key={pg.href} href={pg.href} className="sb-menu-item sb-menu-page" onClick={close}>
              {pg.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

