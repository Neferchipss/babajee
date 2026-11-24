"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLook, listRows, type MenuLink } from "@/lib/content";
import { applyColours } from "@/lib/shop-colours-apply";
import { inColoursPreview, startColoursPreview } from "@/lib/colours-preview";
import type { ShopColours } from "@/lib/shop-colours";
import "./site-extras.css";

// From Admin > Storefront (0073): the announcement line along the top of
// every page, and the extra header and footer links. Both read once per
// visit (kept for the browser tab), and show nothing until there is something.
const LOOK_KEY = "bj-look";
const MENU_KEY = "bj-menus";

function cached<T>(key: string): T | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function keep(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

let menusP: Promise<MenuLink[]> | null = null;
function menus(): Promise<MenuLink[]> {
  const had = cached<MenuLink[]>(MENU_KEY);
  if (had) return Promise.resolve(had);
  return (menusP ??= listRows("site_menus").then((l) => {
    const shown = l.filter((m) => m.is_visible).sort((a, b) => a.position - b.position);
    keep(MENU_KEY, shown);
    return shown;
  }));
}

export function Announcement() {
  const [a, setA] = useState<{ text: string; link: string } | null>(null);
  useEffect(() => {
    // the look (announcement and the shop's colours): the tab's last copy at
    // once, then the live one on every full page load, so a design switched in
    // Admin > Storefront shows on whichever page the shop is opened on
    const had = cached<{ text: string; link: string; colours?: ShopColours | null }>(LOOK_KEY);
    let live = true;
    // in the Colours preview, the editor's palette (sent by message) is the
    // one shown, not the saved one
    const preview = inColoursPreview();
    const stopPreview = preview ? startColoursPreview() : () => {};
    if (had) {
      setA(had);
      if (!preview) applyColours(had.colours ?? null);
    }
    getLook().then((l) => {
      if (!live) return;
      const x = { text: l.announcement, link: l.announcement_link, colours: l.colours };
      keep(LOOK_KEY, x);
      setA(x);
      if (!preview) applyColours(x.colours);
    });
    return () => {
      live = false;
      stopPreview();
    };
  }, []);
  if (!a?.text) return null;
  return (
    <div className="sx-announce" role="note">
      {a.link ? <Link href={a.link}>{a.text} →</Link> : <span>{a.text}</span>}
    </div>
  );
}

export function MenuLinks({ where, className = "" }: { where: "header" | "footer"; className?: string }) {
  const [list, setList] = useState<MenuLink[]>([]);
  useEffect(() => {
    let live = true;
    menus().then((l) => live && setList(l.filter((m) => m.location === where)));
    return () => {
      live = false;
    };
  }, [where]);
  if (!list.length) return null;
  return (
    <>
      {list.map((m) =>
        m.href.startsWith("/") ? (
          <li key={m.id} className={className}>
            <Link href={m.href}>{m.label}</Link>
          </li>
        ) : (
          <li key={m.id} className={className}>
            <a href={m.href} target="_blank" rel="noreferrer noopener">
              {m.label}
            </a>
          </li>
        ),
      )}
    </>
  );
}

// the header's: plain links beside the shop's own
export function MenuAnchors({ where, onClick }: { where: "header" | "footer"; onClick?: () => void }) {
  const [list, setList] = useState<MenuLink[]>([]);
  useEffect(() => {
    let live = true;
    menus().then((l) => live && setList(l.filter((m) => m.location === where)));
    return () => {
      live = false;
    };
  }, [where]);
  return (
    <>
      {list.map((m) =>
        m.href.startsWith("/") ? (
          <Link key={m.id} href={m.href} onClick={onClick}>
            {m.label}
          </Link>
        ) : (
          <a key={m.id} href={m.href} target="_blank" rel="noreferrer noopener">
            {m.label}
          </a>
        ),
      )}
    </>
  );
}
