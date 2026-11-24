"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { deleteRow, listRows, reorder, saveRow, type MenuLink } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import "@/components/admin/storefront.css";
import AroniumMenus from "@/components/admin/shells/AroniumMenus";
import { useAdminStyle } from "@/lib/admin-style";

// Storefront > Menus (0073): extra links in the shop's header and footer, in
// order, beside the shop's own (Shop, categories, account).
const PLACES: ["header" | "footer", string, string][] = [
  ["header", "Header", "Along the top, after the shop's own links. Keep it to two or three."],
  ["footer", "Footer", "At the bottom of every page: policies, the blog, about us."],
];

export default function MenusPage() {
  return useAdminStyle() === "aronium" ? <AroniumMenus /> : <MenusPageOriginal />;
}

function MenusPageOriginal() {
  const [list, setList] = useState<MenuLink[] | null>(null);
  const load = () => listRows("site_menus").then(setList);
  useEffect(() => {
    void load();
  }, []);

  async function add(location: "header" | "footer") {
    try {
      await saveRow("site_menus", { location, label: "New link", href: "/", position: (list ?? []).filter((m) => m.location === location).length, is_visible: false });
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function move(location: string, i: number, d: number) {
    const mine = (list ?? []).filter((m) => m.location === location);
    [mine[i], mine[i + d]] = [mine[i + d], mine[i]];
    setList([...(list ?? []).filter((m) => m.location !== location), ...mine]);
    await reorder("site_menus", mine.map((m) => m.id)).catch(toastError);
  }

  return (
    <div className="sfm">
      <header className="adm-pagehead">
        <h1>Menus</h1>
        <p>Links to your pages, blog posts, collections or anywhere else, in the shop&apos;s header and footer.</p>
      </header>
      {PLACES.map(([loc, name, about]) => {
        const mine = (list ?? []).filter((m) => m.location === loc);
        return (
          <section key={loc} className="adm-card sfm-item">
            <h2>{name}</h2>
            <p className="adm-muted adm-small" style={{ margin: 0 }}>
              {about}
            </p>
            {mine.map((m, i) => (
              <MenuRow key={m.id} m={m} first={i === 0} last={i === mine.length - 1} onMove={(d) => move(loc, i, d)} onChanged={load} />
            ))}
            <button type="button" className="adm-btn" style={{ justifySelf: "start" }} onClick={() => add(loc)}>
              + Add a link
            </button>
          </section>
        );
      })}
    </div>
  );
}

function MenuRow({ m, first, last, onMove, onChanged }: { m: MenuLink; first: boolean; last: boolean; onMove: (d: number) => void; onChanged: () => void }) {
  const [d, setD] = useState(m);
  const dirty = JSON.stringify(d) !== JSON.stringify(m);
  // Shown: saves at once, on its own, with Undo
  async function show(on: boolean) {
    setD((x) => ({ ...x, is_visible: on }));
    try {
      await saveRow("site_menus", { id: d.id, is_visible: on });
      toast(on ? `${d.label} shown` : `${d.label} hidden`, { undo: () => void show(!on) });
      onChanged();
    } catch (e) {
      setD((x) => ({ ...x, is_visible: !on }));
      toastError(errText(e));
    }
  }
  async function save(x: Partial<MenuLink> = {}) {
    const next = { ...d, ...x };
    if (!/^(https:\/\/|\/)/.test(next.href)) {
      toastError("A link starts with / (a page on the shop) or https://");
      return;
    }
    try {
      await saveRow("site_menus", next);
      toast("Saved");
      onChanged();
    } catch (e) {
      toastError(errText(e));
    }
  }
  return (
    <div className="sfm-sec-fields">
      <label className="adm-small sfm-show">
        <input type="checkbox" checked={d.is_visible} onChange={(e) => show(e.target.checked)} /> Shown
      </label>
      <input className="adm-input" maxLength={40} value={d.label} aria-label="Words" onChange={(e) => setD({ ...d, label: e.target.value })} />
      <input className="adm-input" maxLength={300} value={d.href} aria-label="Goes to" placeholder="/pages/view/?slug=about-us" onChange={(e) => setD({ ...d, href: e.target.value })} />
      <button type="button" className="adm-btn pri" disabled={!dirty} onClick={() => save()}>
        Save
      </button>
      <span className="col-move">
        <button type="button" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
          ↓
        </button>
        <button
          type="button"
          aria-label={`Delete ${m.label}`}
          onClick={async () => {
            try {
              await deleteRow("site_menus", m.id);
              onChanged();
            } catch (e) {
              toastError(errText(e));
            }
          }}
        >
          ×
        </button>
      </span>
    </div>
  );
}
