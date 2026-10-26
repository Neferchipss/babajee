"use client";

import Link from "next/link";
import SceneLink, { isScenePath } from "@/components/SceneLink";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cartCount, useCart } from "@/lib/cart";
import { JarIcon, SearchIcon, UserIcon } from "./icons";
import Logo from "./Logo";
import ProfileMenu from "./ProfileMenu";

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
  const count = cartCount(useCart());
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const navLink = (href: string, label: string) => {
    const L = isScenePath(href) ? SceneLink : Link;
    return (
      <L key={href} href={href} onClick={() => setOpen(false)} aria-current={isActive(href) ? "page" : undefined}>
        {label}
      </L>
    );
  };

  // the landing: the shop's bar, with only the logo and the profile button
  // (its menu holds the rest)
  if (pathname === "/") {
    return (
      <header className="lb">
        <SceneLink href="/" aria-label="Babajee home" className="lb-logo">
          <Logo className="lb-logo-img" priority />
        </SceneLink>
        <ProfileMenu />
      </header>
    );
  }

  return (
    <header className="hdr">
      <div className="hdr-inner">
        <SceneLink href="/" aria-label="Babajee home" className="hdr-logo" onClick={() => setOpen(false)}>
          <Logo className="hdr-logo-img" priority />
        </SceneLink>

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
          <Link href="/cart" className="hdr-tool hdr-cart" data-jar="header" onClick={() => setOpen(false)}>
            <JarIcon />
            <span className="hdr-label">Cart</span>
            <b className="hdr-count" aria-hidden="true">
              {count > 99 ? "99+" : count}
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
            Cart{count > 0 && ` (${count})`}
          </Link>
          <Link href="/account" onClick={() => setOpen(false)}>
            Account
          </Link>
        </nav>
      )}
    </header>
  );
}
