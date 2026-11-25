"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { deleteRow, listRows, reorder, saveRow, type MenuLink } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import { ArConfirm, ArSubTabs } from "./aronium-d-kit";

// Storefront • Menus as an Aronium list: the extra links in the shop's
// header and footer (beside the shop's own: Shop, categories, account),
// Header and Footer as tabs, a row a link in order. New link / Edit /
// Delete / Move up / Move down / Show from the toolbar and right-click;
// Edit slides in the words and where it goes. Showing saves at once (with
// Undo); words and links wait for Save.
type Loc = MenuLink["location"];
const PLACES: [Loc, string, string][] = [
  ["header", "Header", "Along the top, after the shop's own links. Keep it to two or three."],
  ["footer", "Footer", "At the bottom of every page: policies, the blog, about us."],
];

export default function AroniumMenus() {
  const [list, setList] = useState<MenuLink[] | null>(null);
  const [err, setErr] = useState("");
  const [loc, setLoc] = useState<Loc>("header");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<MenuLink | null>(null);
  const [del, setDel] = useState<MenuLink | null>(null);
  const [help, setHelp] = useState(false);
  const load = () =>
    listRows("site_menus").then(
      (l) => {
        setList(l);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);

  const mine = (list ?? []).filter((m) => m.location === loc);
  const i = mine.findIndex((m) => m.id === sel);
  const picked = i >= 0 ? mine[i] : null;

  async function add() {
    try {
      const id = await saveRow("site_menus", { location: loc, label: "New link", href: "/", position: mine.length, is_visible: false });
      const fresh = await listRows("site_menus");
      setList(fresh);
      setSel(id);
      setEdit(fresh.find((m) => m.id === id) ?? null);
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function move(k: number, d: number) {
    if (k + d < 0 || k + d >= mine.length) return;
    const next = mine.slice();
    [next[k], next[k + d]] = [next[k + d], next[k]];
    setList([...(list ?? []).filter((m) => m.location !== loc), ...next]);
    await reorder("site_menus", next.map((m) => m.id)).catch((e) => toastError(errText(e)));
  }
  async function show(m: MenuLink, on: boolean) {
    setList((l) => (l ?? []).map((x) => (x.id === m.id ? { ...x, is_visible: on } : x)));
    try {
      await saveRow("site_menus", { id: m.id, is_visible: on });
      toast(on ? `${m.label} shown` : `${m.label} hidden`, { undo: () => void show({ ...m, is_visible: on }, !on) });
    } catch (e) {
      setList((l) => (l ?? []).map((x) => (x.id === m.id ? { ...x, is_visible: !on } : x)));
      toastError(errText(e));
    }
  }
  async function remove(m: MenuLink) {
    try {
      await deleteRow("site_menus", m.id);
      setSel(null);
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  useArKeys({ add: () => void add(), del: picked ? () => setDel(picked) : undefined, edit: picked ? () => setEdit(picked) : undefined, refresh: () => void load() });

  const cols: ArCol<MenuLink>[] = [
    { k: "pos", label: "#", right: true, render: (m) => mine.indexOf(m) + 1 },
    { k: "label", label: "Words", render: (m) => m.label },
    { k: "href", label: "Goes to", render: (m) => m.href },
    { k: "on", label: "Shown", center: true, render: (m) => <Tick on={m.is_visible} /> },
  ];
  const menu = (m: MenuLink | null) => {
    const k = m ? mine.indexOf(m) : -1;
    return stdMenu({
      add: () => void add(),
      addLabel: "New link",
      edit: () => m && setEdit(m),
      del: () => m && setDel(m),
      refresh: () => void load(),
      has: !!m,
      extra: [
        { label: m?.is_visible ? "Hide" : "Show", onClick: () => m && show(m, !m.is_visible), disabled: !m },
        { label: "Move up", onClick: () => move(k, -1), disabled: !m || k === 0 },
        { label: "Move down", onClick: () => move(k, 1), disabled: !m || k === mine.length - 1 },
      ],
    });
  };
  const place = PLACES.find((p) => p[0] === loc)!;

  return (
    <ArScreen className="ard4">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "New link", onClick: () => void add() },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && setEdit(picked) },
          { icon: "del", label: "Delete", disabled: !picked, onClick: () => picked && setDel(picked) },
          { icon: "export", label: "Move up", disabled: !picked || i === 0, onClick: () => move(i, -1) },
          { icon: "import", label: "Move down", disabled: !picked || i === mine.length - 1, onClick: () => move(i, 1) },
          { icon: "preview", label: picked?.is_visible ? "Hide" : "Show", disabled: !picked, onClick: () => picked && show(picked, !picked.is_visible) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <ArSubTabs label="Menus" on={loc} onPick={(l) => (setLoc(l), setSel(null))} tabs={PLACES.map(([id, name]) => [id, name, (list ?? []).filter((m) => m.location === id).length] as const)} />
      {err && <p className="adm-err">{err}</p>}
      <ArSection title={`${place[1]} links`} n={mine.length} />
      <p className="ard4-note">{place[2]}</p>
      {list === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !mine.length ? (
        <ArEmpty title="No links here yet" action="Add a link" onAction={() => void add()} />
      ) : (
        <ArGrid cols={cols} rows={mine} keyOf={(m) => m.id} sel={sel} onSel={setSel} onOpen={setEdit} menu={menu} className="ars-grid" />
      )}

      {edit && <LinkPanel key={edit.id} m={edit} onClose={() => setEdit(null)} onShow={(on) => show(edit, on)} onSaved={load} />}

      <ArConfirm open={!!del} title={`Delete ${del?.label ?? "this link"}?`} onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>It comes out of the shop&apos;s {loc}. The page it points to stays.</p>
      </ArConfirm>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Menus">
        <p>Links to your pages, blog posts, collections or anywhere else, in the shop&apos;s header and footer, after the shop&apos;s own links.</p>
        <p>A new link starts hidden. Show and Hide save at once, with Undo; the words and the address wait for Save. A link starts with / (a page on the shop) or https://.</p>
      </ArHelp>
    </ArScreen>
  );
}

function LinkPanel({ m, onClose, onShow, onSaved }: { m: MenuLink; onClose: () => void; onShow: (on: boolean) => Promise<void>; onSaved: () => Promise<void> | void }) {
  const [d, setD] = useState(m);
  const dirty = d.label !== m.label || d.href !== m.href;
  const bad = !/^(https:\/\/|\/)/.test(d.href);
  async function save() {
    if (bad) {
      toastError("A link starts with / (a page on the shop) or https://");
      return;
    }
    try {
      await saveRow("site_menus", { ...d, is_visible: m.is_visible });
      toast("Saved");
      await onSaved();
      onClose();
    } catch (e) {
      toastError(errText(e));
    }
  }
  return (
    <ArPanel open title={m.label} width="narrow" canSave={dirty && !!d.label.trim()} onSave={save} onClose={onClose}>
      <ArField label="Words" invalid={!d.label.trim()}>
        <input className="adm-input" maxLength={40} value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
      </ArField>
      <ArField label="Goes to" invalid={bad}>
        <input className="adm-input" maxLength={300} value={d.href} placeholder="/pages/view/?slug=about-us" onChange={(e) => setD({ ...d, href: e.target.value })} />
      </ArField>
      {bad && <ArInfo tone="warn">A link starts with / (a page on the shop) or https://</ArInfo>}
      <div className="ara-toggles">
        <ArSwitch
          on={d.is_visible}
          label="Shown"
          onChange={(on) => {
            setD((x) => ({ ...x, is_visible: on }));
            void onShow(on);
          }}
        />
      </div>
    </ArPanel>
  );
}
