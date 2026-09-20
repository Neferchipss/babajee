"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CartIcon, SearchIcon, UserIcon } from "./icons";
import Logo from "./Logo";

const NAV = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/support", label: "Support" },
  { href: "/contact", label: "Contact" },
];

// The markup is the same in every theme; the theme CSS decides where things
// sit and whether the tools show as text or as icons.
export default function SiteHeader() {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const navLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      onClick={() => setOpen(false)}
      aria-current={isActive(href) ? "page" : undefined}
    >
      {label}
    </Link>
  );

  return (
    <header className="hdr">
      <div className="hdr-inner">
        <Link href="/" aria-label="Babajee home" className="hdr-logo" onClick={() => setOpen(false)}>
          <Logo className="hdr-logo-img" priority />
        </Link>

        <nav aria-label="Main" className="hdr-nav">
          {NAV.map((n) => navLink(n.href, n.label))}
        </nav>

        <div className="hdr-tools">
          <Link href="/shop/search" className="hdr-tool hdr-search" onClick={() => setOpen(false)}>
            <SearchIcon />
            <span className="hdr-label">Search</span>
          </Link>
          <Link href="/account" className="hdr-tool" onClick={() => setOpen(false)}>
            <UserIcon />
            <span className="hdr-label">Account</span>
          </Link>
          <Link href="/cart" className="hdr-tool hdr-cart" onClick={() => setOpen(false)}>
            <CartIcon />
            <span className="hdr-label">Cart</span>
            <b className="hdr-count" aria-hidden="true">
              0
            </b>
          </Link>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          className="hdr-menu"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <div className="hdr-stripe" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Main" className="hdr-mobile">
          {NAV.map((n) => navLink(n.href, n.label))}
          <Link href="/shop/search" onClick={() => setOpen(false)}>
            Search
          </Link>
          <Link href="/cart" onClick={() => setOpen(false)}>
            Cart
          </Link>
          <Link href="/account" onClick={() => setOpen(false)}>
            Account
          </Link>
        </nav>
      )}
    </header>
  );
}
