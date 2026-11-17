"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLook, listRows, type MenuLink } from "@/lib/content";
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
    const had = cached<{ text: string; link: string }>(LOOK_KEY);
    let live = true;
    (had ? Promise.resolve(had) : getLook().then((l) => ({ text: l.announcement, link: l.announcement_link }))).then((x) => {
      if (!live) return;
      keep(LOOK_KEY, x);
      setA(x);
    });
    return () => {
      live = false;
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
