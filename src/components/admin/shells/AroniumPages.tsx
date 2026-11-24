"use client";

import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { deleteRow, listRows, reorder, saveRow, slugify, type Faq, type PageSeo, type SitePage } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArSwitch, ArToolbar, stdMenu, Tick, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";
import { ArConfirm, ArSubTabs } from "./aronium-d-kit";

// Storefront • Pages, blog and FAQs, as Aronium lists: Pages | Blog | FAQs |
// Search listings as tabs under the toolbar, each its own grid. A page or a
// post opens in the slide-in panel (the words, then its search listing on
// a second tab); a question opens with its topic and answer; a built-in
// page's search listing opens with its title and description. Put on / take
// off the shop, move, delete (asked first) from the toolbar or right-click.
type Tab = "page" | "post" | "faqs" | "seo";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const TABS: [Tab, string][] = [
  ["page", "Pages"],
  ["post", "Blog"],
  ["faqs", "FAQs"],
  ["seo", "Search listings"],
];

export default function AroniumPages() {
  const [tab, setTab] = useState<Tab>("page");
  const [help, setHelp] = useState(false);
  const sub = <ArSubTabs label="Pages, blog and FAQs" on={tab} onPick={setTab} tabs={TABS} />;
  return (
    <ArScreen className="ard4">
      {tab === "page" || tab === "post" ? <Writing key={tab} kind={tab} sub={sub} onHelp={() => setHelp(true)} /> : tab === "faqs" ? <Faqs sub={sub} onHelp={() => setHelp(true)} /> : <Seo sub={sub} onHelp={() => setHelp(true)} />}
      <ArHelp open={help} onClose={() => setHelp(false)} title="Pages, blog and FAQs">
        <p>Write the shop&apos;s own pages (About us, policies) and blog posts, answer common questions, and set how the shop&apos;s built-in pages show up in Google.</p>
        <p>New pages, posts and questions start off the shop. Put on the shop when they&apos;re ready. In the words, a blank line starts a new paragraph; ## at the start of a line makes a heading, - a list, **words** bold, and [words](/shop/) a link.</p>
        <p>FAQs show on {BASE}/faq, grouped by topic, in this order.</p>
      </ArHelp>
    </ArScreen>
  );
}

function Writing({ kind, sub, onHelp }: { kind: "page" | "post"; sub: React.ReactNode; onHelp: () => void }) {
  const [all, setAll] = useState<SitePage[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<SitePage | null>(null);
  const [del, setDel] = useState<SitePage | null>(null);
  const load = () =>
    listRows("site_pages").then(
      (l) => {
        setAll(l.filter((p) => p.kind === kind));
        setErr("");
        return l.filter((p) => p.kind === kind);
      },
      (e) => {
        setErr(errText(e));
        return [] as SitePage[];
      },
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const list = all ?? [];
  const picked = list.find((p) => p.id === sel) ?? null;
  const urlOf = (p: SitePage) => `${BASE}/${p.kind === "post" ? "blog" : "pages"}/view/?slug=${p.slug}`;
  const word = kind === "post" ? "post" : "page";

  async function add() {
    const title = kind === "post" ? "New post" : "New page";
    try {
      let slug = slugify(title);
      for (let n = 2; list.some((p) => p.slug === slug); n++) slug = `${slugify(title)}-${n}`;
      const id = await saveRow("site_pages", { kind, slug, title, body: "", is_visible: false });
      const fresh = await load();
      setSel(id);
      setEdit(fresh.find((p) => p.id === id) ?? null);
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function live(p: SitePage, on: boolean) {
    try {
      const { updated_at: _u, published_at: _p, ...row } = p;
      void _u;
      void _p;
      await saveRow("site_pages", { ...row, is_visible: on });
      toast(on ? "Live on the shop" : "Taken off the shop");
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function remove(p: SitePage) {
    try {
      await deleteRow("site_pages", p.id);
      setSel(null);
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  useArKeys({ add: () => void add(), del: picked ? () => setDel(picked) : undefined, edit: picked ? () => setEdit(picked) : undefined, refresh: () => void load() });

  const cols: ArCol<SitePage>[] = [
    { k: "title", label: "Title", render: (p) => p.title, sort: (p) => p.title.toLowerCase() },
    { k: "slug", label: "Address", render: (p) => `/${kind === "post" ? "blog" : "pages"}/view/?slug=${p.slug}` },
    ...(kind === "post" ? [{ k: "excerpt", label: "Summary", render: (p: SitePage) => <span className="ard4-clip">{p.excerpt}</span> }] : []),
    { k: "pub", label: "Published", render: (p) => (p.published_at ? when(p.published_at) : ""), sort: (p) => p.published_at ?? "" },
    { k: "on", label: "On the shop", center: true, render: (p) => <Tick on={p.is_visible} /> },
  ];
  const menu = (p: SitePage | null) =>
    stdMenu({
      add: () => void add(),
      addLabel: kind === "post" ? "Write a post" : "New page",
      edit: () => p && setEdit(p),
      del: () => p && setDel(p),
      refresh: () => void load(),
      has: !!p,
      extra: [
        { label: p?.is_visible ? "Take off the shop" : "Put on the shop", onClick: () => p && live(p, !p.is_visible), disabled: !p },
        { label: "Open on the shop", onClick: () => p && window.open(urlOf(p), "_blank", "noreferrer"), disabled: !p?.is_visible },
      ],
    });

  return (
    <>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: kind === "post" ? "Write a post" : "New page", onClick: () => void add() },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && setEdit(picked) },
          { icon: "del", label: "Delete", disabled: !picked, onClick: () => picked && setDel(picked) },
          { icon: "paid", label: picked?.is_visible ? "Take off" : "Put on shop", disabled: !picked, onClick: () => picked && live(picked, !picked.is_visible) },
          { icon: "open", label: "Open", disabled: !picked?.is_visible, onClick: () => picked && window.open(urlOf(picked), "_blank", "noreferrer") },
          { icon: "help", label: "Help", onClick: onHelp },
        ]}
      />
      {sub}
      {err && <p className="adm-err">{err}</p>}
      <ArSection title={kind === "post" ? "Blog posts" : "Pages"} n={list.length} />
      {all === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !list.length ? (
        <ArEmpty title={kind === "post" ? "No posts yet" : "No pages yet"} action={kind === "post" ? "Write a post" : "Add a page: start with About us, or your delivery and returns policy"} onAction={() => void add()} />
      ) : (
        <ArGrid cols={cols} rows={list} keyOf={(p) => p.id} sel={sel} onSel={setSel} onOpen={setEdit} menu={menu} className="ars-grid" />
      )}
      {edit && <PagePanel key={edit.id} p={edit} taken={list.filter((x) => x.id !== edit.id).map((x) => x.slug)} url={urlOf(edit)} onClose={() => setEdit(null)} onSaved={load} />}
      <ArConfirm open={!!del} title={`Delete ${del?.title ?? `this ${word}`}?`} onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>It goes for good, and any link to it stops working.</p>
      </ArConfirm>
    </>
  );
}

function PagePanel({ p, taken, url, onClose, onSaved }: { p: SitePage; taken: string[]; url: string; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [d, setD] = useState(p);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(p.kind === "post" ? "Post" : "Page");
  const set = (x: Partial<SitePage>) => setD({ ...d, ...x });
  const dirty = JSON.stringify(d) !== JSON.stringify(p);

  async function save(x: Partial<SitePage> = {}) {
    const next = { ...d, ...x, slug: slugify(d.slug || d.title) };
    if (taken.includes(next.slug)) {
      toastError("Another one already uses that address.");
      return;
    }
    if (next.cover_url && !/^(https:\/\/|\/)/.test(next.cover_url)) {
      toastError("A picture's address starts with / or https://");
      return;
    }
    setBusy(true);
    try {
      const { updated_at: _u, published_at: _p, ...row } = next;
      void _u;
      void _p;
      await saveRow("site_pages", row);
      toast(x.is_visible === true ? "Live on the shop" : x.is_visible === false ? "Taken off the shop" : "Saved");
      await onSaved();
      onClose();
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  const first = p.kind === "post" ? "Post" : "Page";
  return (
    <ArPanel
      open
      title={p.title}
      width="wide"
      tabs={[first, "Search listing"]}
      tab={tab}
      onTab={setTab}
      canSave={dirty && !busy}
      onSave={() => save()}
      onClose={onClose}
      banner={
        <ArInfo>
          {p.is_visible ? (
            <>
              Live on the shop:{" "}
              <a href={url} target="_blank" rel="noreferrer">
                open it ↗
              </a>
            </>
          ) : (
            "Draft: not on the shop."
          )}
        </ArInfo>
      }
    >
      {tab === first ? (
        <>
          <div className="ara-toggles">
            <ArSwitch on={p.is_visible} label="On the shop" disabled={busy} onChange={(on) => save({ is_visible: on })} />
          </div>
          <ArField label="Title">
            <input className="adm-input" maxLength={160} value={d.title} onChange={(e) => set({ title: e.target.value })} />
          </ArField>
          <ArField label="Address" size="mid" hint={`/${p.kind === "post" ? "blog" : "pages"}/view/?slug=${d.slug}`}>
            <input className="adm-input" maxLength={80} value={d.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          </ArField>
          {p.kind === "post" && (
            <>
              <ArField label="Short summary" hint="For the blog list.">
                <input className="adm-input" maxLength={400} value={d.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
              </ArField>
              <ArField label="Cover picture (optional)">
                <input className="adm-input" maxLength={500} value={d.cover_url} placeholder="https://…" onChange={(e) => set({ cover_url: e.target.value })} />
              </ArField>
            </>
          )}
          <ArField label="Words" hint="A blank line starts a new paragraph. ## at the start of a line makes a heading, - a list, **words** bold, and [words](/shop/) a link.">
            <textarea className="adm-input ard4-body" rows={14} maxLength={60000} value={d.body} onChange={(e) => set({ body: e.target.value })} />
          </ArField>
        </>
      ) : (
        <>
          <ArInfo>What Google shows for this {p.kind === "post" ? "post" : "page"}. Empty: its title and the start of its words.</ArInfo>
          <ArField label={`Title in Google (${d.seo_title.length}/70)`}>
            <input className="adm-input" maxLength={70} value={d.seo_title} placeholder={d.title} onChange={(e) => set({ seo_title: e.target.value })} />
          </ArField>
          <ArField label={`Description in Google (${d.seo_description.length}/170)`}>
            <textarea className="adm-input" rows={3} maxLength={170} value={d.seo_description} placeholder={d.excerpt || d.body.slice(0, 150)} onChange={(e) => set({ seo_description: e.target.value })} />
          </ArField>
        </>
      )}
    </ArPanel>
  );
}

function Faqs({ sub, onHelp }: { sub: React.ReactNode; onHelp: () => void }) {
  const [list, setList] = useState<Faq[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Faq | null>(null);
  const [del, setDel] = useState<Faq | null>(null);
  const load = () =>
    listRows("faqs").then(
      (l) => {
        setList(l);
        setErr("");
        return l;
      },
      (e) => {
        setErr(errText(e));
        return [] as Faq[];
      },
    );
  useEffect(() => {
    void load();
  }, []);
  const rows = useMemo(() => list ?? [], [list]);
  const topics = useMemo(() => [...new Set(rows.map((f) => f.topic))], [rows]);
  const i = rows.findIndex((f) => f.id === sel);
  const picked = i >= 0 ? rows[i] : null;

  async function add() {
    try {
      const id = await saveRow("faqs", { topic: topics[0] ?? "General", question: "New question?", answer: "", position: rows.length, is_visible: false });
      const fresh = await load();
      setSel(id);
      setEdit(fresh.find((f) => f.id === id) ?? null);
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function move(k: number, d: number) {
    if (k + d < 0 || k + d >= rows.length) return;
    const next = rows.slice();
    [next[k], next[k + d]] = [next[k + d], next[k]];
    setList(next);
    await reorder("faqs", next.map((f) => f.id)).catch((e) => toastError(errText(e)));
  }
  async function show(f: Faq, on: boolean) {
    try {
      await saveRow("faqs", { ...f, is_visible: on });
      toast(on ? "Question shown" : "Question hidden");
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function remove(f: Faq) {
    try {
      await deleteRow("faqs", f.id);
      setSel(null);
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  useArKeys({ add: () => void add(), del: picked ? () => setDel(picked) : undefined, edit: picked ? () => setEdit(picked) : undefined, refresh: () => void load() });

  const cols: ArCol<Faq>[] = [
    { k: "pos", label: "#", right: true, render: (f) => rows.indexOf(f) + 1 },
    { k: "topic", label: "Topic", render: (f) => f.topic },
    { k: "q", label: "Question", render: (f) => f.question },
    { k: "a", label: "Answer", render: (f) => <span className="ard4-clip">{f.answer}</span> },
    { k: "on", label: "Shown", center: true, render: (f) => <Tick on={f.is_visible} /> },
  ];
  const menu = (f: Faq | null) => {
    const k = f ? rows.indexOf(f) : -1;
    return stdMenu({
      add: () => void add(),
      addLabel: "New question",
      edit: () => f && setEdit(f),
      del: () => f && setDel(f),
      refresh: () => void load(),
      has: !!f,
      extra: [
        { label: f?.is_visible ? "Hide" : "Show", onClick: () => f && show(f, !f.is_visible), disabled: !f },
        { label: "Move up", onClick: () => move(k, -1), disabled: !f || k === 0 },
        { label: "Move down", onClick: () => move(k, 1), disabled: !f || k === rows.length - 1 },
      ],
    });
  };

  return (
    <>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "New question", onClick: () => void add() },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && setEdit(picked) },
          { icon: "del", label: "Delete", disabled: !picked, onClick: () => picked && setDel(picked) },
          { icon: "export", label: "Move up", disabled: !picked || i === 0, onClick: () => move(i, -1) },
          { icon: "import", label: "Move down", disabled: !picked || i === rows.length - 1, onClick: () => move(i, 1) },
          { icon: "preview", label: picked?.is_visible ? "Hide" : "Show", disabled: !picked, onClick: () => picked && show(picked, !picked.is_visible) },
          { icon: "help", label: "Help", onClick: onHelp },
        ]}
      />
      {sub}
      {err && <p className="adm-err">{err}</p>}
      <ArSection title="Questions" n={rows.length} />
      <p className="ard4-note">Shown on the shop&apos;s FAQ page at {BASE}/faq, grouped by topic.</p>
      {list === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !rows.length ? (
        <ArEmpty title="No questions yet" action="Add a question" onAction={() => void add()} />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={(f) => f.id} sel={sel} onSel={setSel} onOpen={setEdit} menu={menu} className="ars-grid" />
      )}
      {edit && <FaqPanel key={edit.id} f={edit} topics={topics} onClose={() => setEdit(null)} onSaved={load} />}
      <ArConfirm open={!!del} title="Delete this question?" onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>{del?.question}</p>
      </ArConfirm>
    </>
  );
}

function FaqPanel({ f, topics, onClose, onSaved }: { f: Faq; topics: string[]; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const [d, setD] = useState(f);
  const dirty = JSON.stringify(d) !== JSON.stringify(f);
  async function save() {
    try {
      await saveRow("faqs", d);
      toast("Saved");
      await onSaved();
      onClose();
    } catch (e) {
      toastError(errText(e));
    }
  }
  return (
    <ArPanel open title={f.question} width="mid" canSave={dirty && !!d.question.trim()} onSave={save} onClose={onClose}>
      <datalist id="ar-faq-topics">
        {topics.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <ArField label="Topic" size="mid">
        <input className="adm-input" list="ar-faq-topics" maxLength={60} value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} />
      </ArField>
      <ArField label="Question" invalid={!d.question.trim()}>
        <input className="adm-input" maxLength={300} value={d.question} onChange={(e) => setD({ ...d, question: e.target.value })} />
      </ArField>
      <ArField label="Answer">
        <textarea className="adm-input" rows={6} maxLength={4000} value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} />
      </ArField>
      <div className="ara-toggles">
        <ArSwitch on={d.is_visible} label="Shown" onChange={(on) => setD({ ...d, is_visible: on })} />
      </div>
    </ArPanel>
  );
}

// the shop's own pages, by path
const BUILT_IN: [string, string][] = [
  ["/", "Homepage"],
  ["/shop/", "Shop (all products)"],
  ["/blog/", "Blog"],
  ["/faq/", "FAQs"],
  ["/contact/", "Contact"],
  ["/about/", "About"],
];
type SeoRow = PageSeo & { name: string };

function Seo({ sub, onHelp }: { sub: React.ReactNode; onHelp: () => void }) {
  const [rows, setRows] = useState<PageSeo[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<SeoRow | null>(null);
  const load = () =>
    listRows("page_seo").then(
      (r) => {
        setRows(r);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);
  const list: SeoRow[] = BUILT_IN.map(([path, name]) => ({ ...(rows?.find((r) => r.path === path) ?? { path, title: "", description: "", image_url: "" }), name }));
  const picked = list.find((r) => r.path === sel) ?? null;
  useArKeys({ edit: picked ? () => setEdit(picked) : undefined, refresh: () => void load() });

  const cols: ArCol<SeoRow>[] = [
    { k: "name", label: "Page", render: (r) => r.name },
    { k: "path", label: "Address", render: (r) => r.path },
    { k: "title", label: "Title in Google", render: (r) => r.title || <span className="adm-muted">the shop&apos;s own</span> },
    { k: "desc", label: "Description in Google", render: (r) => <span className="ard4-clip">{r.description || <span className="adm-muted">the shop&apos;s own</span>}</span> },
  ];
  const menu = (r: SeoRow | null) => stdMenu({ edit: () => r && setEdit(r), refresh: () => void load(), has: !!r });

  return (
    <>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => picked && setEdit(picked) },
          { icon: "help", label: "Help", onClick: onHelp },
        ]}
      />
      {sub}
      {err && <p className="adm-err">{err}</p>}
      <ArSection title="Search listings" n={list.length} />
      <p className="ard4-note">What Google shows for the shop&apos;s own pages. Empty: the shop&apos;s own wording. Products, categories and sub-categories have theirs on their own pages.</p>
      {rows === null && !err ? <p className="ard4-loading">Loading…</p> : <ArGrid cols={cols} rows={list} keyOf={(r) => r.path} sel={sel} onSel={setSel} onOpen={setEdit} menu={menu} className="ars-grid" />}
      {edit && <SeoPanel key={edit.path} r={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </>
  );
}

function SeoPanel({ r, onClose, onSaved }: { r: SeoRow; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { name, ...have } = r;
  const [d, setD] = useState<PageSeo>(have);
  const dirty = JSON.stringify(d) !== JSON.stringify(have);
  return (
    <ArPanel
      open
      title={`${name} · ${r.path}`}
      width="mid"
      canSave={dirty}
      onSave={() =>
        saveRow("page_seo", d).then(
          async () => {
            toast("Saved: it takes effect with the shop's next update");
            await onSaved();
            onClose();
          },
          (e) => toastError(errText(e)),
        )
      }
      onClose={onClose}
    >
      <ArField label={`Title (${d.title.length}/70)`}>
        <input className="adm-input" maxLength={70} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
      </ArField>
      <ArField label={`Description (${d.description.length}/170)`}>
        <textarea className="adm-input" rows={3} maxLength={170} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </ArField>
    </ArPanel>
  );
}
