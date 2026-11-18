"use client";

import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { deleteRow, listRows, reorder, saveRow, slugify, type Faq, type PageSeo, type SitePage } from "@/lib/content";
import { errText } from "@/lib/orders-db";
import "@/components/admin/storefront.css";

// Storefront > Pages, blog and FAQs (0073): the shop's own pages (About,
// policies...) and blog posts, its questions and answers, and the search
// listing (title and description Google shows) for its built-in pages.
type Tab = "page" | "post" | "faqs" | "seo";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function PagesPage() {
  const [tab, setTab] = useState<Tab>("page");
  return (
    <div className="sfm">
      <header className="adm-pagehead">
        <h1>Pages, blog and FAQs</h1>
        <p>Write the shop&apos;s own pages and blog posts, answer common questions, and set how pages show up in Google.</p>
      </header>
      <div className="adm-chips sfm-tabs" role="tablist">
        {(
          [
            ["page", "Pages"],
            ["post", "Blog"],
            ["faqs", "FAQs"],
            ["seo", "Search listings"],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`adm-chip ${tab === t ? "is-on" : ""}`} onClick={() => setTab(t)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "page" || tab === "post" ? <Writing key={tab} kind={tab} /> : tab === "faqs" ? <Faqs /> : <Seo />}
    </div>
  );
}

function Writing({ kind }: { kind: "page" | "post" }) {
  const [all, setAll] = useState<SitePage[] | null>(null);
  const [open, setOpen] = useState("");
  const [err, setErr] = useState("");
  const load = () =>
    listRows("site_pages").then(
      (l) => setAll(l.filter((p) => p.kind === kind)),
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  const list = all ?? [];
  const cur = list.find((p) => p.id === open) ?? null;

  async function add() {
    const title = kind === "post" ? "New post" : "New page";
    try {
      let slug = slugify(title);
      for (let n = 2; list.some((p) => p.slug === slug); n++) slug = `${slugify(title)}-${n}`;
      const id = await saveRow("site_pages", { kind, slug, title, body: "", is_visible: false });
      await load();
      setOpen(id);
    } catch (e) {
      toastError(errText(e));
    }
  }

  return (
    <div className="sfm-two">
      <aside className="adm-card">
        {err && <p className="adm-err">{err}</p>}
        <ul className="sfm-pages-list">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className={p.id === open ? "is-on" : ""} onClick={() => setOpen(p.id)}>
                <span>{p.title}</span>
                <small className="adm-muted">
                  /{kind === "post" ? "blog" : "pages"}/view/?slug={p.slug} · {p.is_visible ? "live" : "draft"}
                </small>
              </button>
            </li>
          ))}
        </ul>
        {all !== null && !list.length && <p className="adm-muted adm-small">{kind === "post" ? "No posts yet." : "No pages yet. Start with About us, or your delivery and returns policy."}</p>}
        <button type="button" className="adm-btn pri" style={{ marginTop: 10 }} onClick={add}>
          + {kind === "post" ? "Write a post" : "Add a page"}
        </button>
      </aside>
      {cur ? <PageEditor key={cur.id} p={cur} taken={list.filter((x) => x.id !== cur.id).map((x) => x.slug)} onChanged={load} onGone={() => (setOpen(""), void load())} /> : <div />}
    </div>
  );
}

function PageEditor({ p, taken, onChanged, onGone }: { p: SitePage; taken: string[]; onChanged: () => void; onGone: () => void }) {
  const [d, setD] = useState(p);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (x: Partial<SitePage>) => setD({ ...d, ...x });
  const dirty = JSON.stringify(d) !== JSON.stringify(p);
  const url = `${BASE}/${p.kind === "post" ? "blog" : "pages"}/view/?slug=${d.slug}`;

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
      onChanged();
    } catch (e) {
      toastError(errText(e));
    }
    setBusy(false);
  }

  return (
    <section className="adm-card sfm-item">
      <div className="sfm-item-head">
        <span className="adm-small">
          {p.is_visible ? (
            <a href={url} target="_blank" rel="noreferrer">
              Live: open it ↗
            </a>
          ) : (
            "Draft: not on the shop"
          )}
        </span>
        <span className="adm-actions">
          <button type="button" className="adm-btn" disabled={busy} onClick={() => save({ is_visible: !p.is_visible })}>
            {p.is_visible ? "Take off the shop" : "Put on the shop"}
          </button>
          <button type="button" className="adm-btn pri" disabled={busy || !dirty} onClick={() => save()}>
            Save
          </button>
        </span>
      </div>
      <div className="sfm-grid">
        <label className="adm-label">
          Title
          <input className="adm-input" maxLength={160} value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="adm-label">
          Address
          <input className="adm-input" maxLength={80} value={d.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
        </label>
      </div>
      <label className="adm-label">
        Words
        <textarea className="adm-input sfm-body" rows={14} maxLength={60000} value={d.body} onChange={(e) => set({ body: e.target.value })} />
        <span className="adm-muted adm-small">A blank line starts a new paragraph. ## at the start of a line makes a heading, - a list, **words** bold, and [words](/shop/) a link.</span>
      </label>
      {p.kind === "post" && (
        <div className="sfm-grid">
          <label className="adm-label">
            Short summary (for the blog list)
            <input className="adm-input" maxLength={400} value={d.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
          </label>
          <label className="adm-label">
            Cover picture address (optional)
            <input className="adm-input" maxLength={500} value={d.cover_url} placeholder="https://…" onChange={(e) => set({ cover_url: e.target.value })} />
          </label>
        </div>
      )}
      <details>
        <summary className="adm-small">Search listing (optional)</summary>
        <div className="sfm-grid" style={{ marginTop: 8 }}>
          <label className="adm-label">
            Title in Google ({d.seo_title.length}/70)
            <input className="adm-input" maxLength={70} value={d.seo_title} placeholder={d.title} onChange={(e) => set({ seo_title: e.target.value })} />
          </label>
          <label className="adm-label">
            Description in Google ({d.seo_description.length}/170)
            <input className="adm-input" maxLength={170} value={d.seo_description} placeholder={d.excerpt || d.body.slice(0, 150)} onChange={(e) => set({ seo_description: e.target.value })} />
          </label>
        </div>
      </details>
      <div className="adm-actions">
        {confirm ? (
          <>
            <button
              type="button"
              className="adm-btn bad"
              onClick={async () => {
                try {
                  await deleteRow("site_pages", p.id);
                  onGone();
                } catch (e) {
                  toastError(errText(e));
                }
              }}
            >
              Delete for good
            </button>
            <button type="button" className="adm-btn" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="adm-btn" onClick={() => setConfirm(true)}>
            Delete…
          </button>
        )}
      </div>
    </section>
  );
}

function Faqs() {
  const [list, setList] = useState<Faq[] | null>(null);
  const load = () => listRows("faqs").then(setList);
  useEffect(() => {
    void load();
  }, []);
  const topics = useMemo(() => [...new Set((list ?? []).map((f) => f.topic))], [list]);

  async function add() {
    try {
      await saveRow("faqs", { topic: topics[0] ?? "General", question: "New question?", answer: "", position: list?.length ?? 0, is_visible: false });
      await load();
    } catch (e) {
      toastError(errText(e));
    }
  }
  async function move(i: number, d: number) {
    if (!list) return;
    const next = list.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setList(next);
    await reorder("faqs", next.map((f) => f.id)).catch(toastError);
  }

  return (
    <div className="sfm-list">
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        Shown on the shop&apos;s FAQ page at {BASE}/faq, grouped by topic.
      </p>
      <datalist id="faq-topics">
        {topics.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {(list ?? []).map((f, i) => (
        <FaqRow key={f.id} f={f} first={i === 0} last={i === (list?.length ?? 0) - 1} onMove={(d) => move(i, d)} onChanged={load} />
      ))}
      <button type="button" className="adm-btn pri" style={{ justifySelf: "start" }} onClick={add}>
        + Add a question
      </button>
    </div>
  );
}

function FaqRow({ f, first, last, onMove, onChanged }: { f: Faq; first: boolean; last: boolean; onMove: (d: number) => void; onChanged: () => void }) {
  const [d, setD] = useState(f);
  const dirty = JSON.stringify(d) !== JSON.stringify(f);
  async function save(x: Partial<Faq> = {}) {
    try {
      await saveRow("faqs", { ...d, ...x });
      toast("Saved");
      onChanged();
    } catch (e) {
      toastError(errText(e));
    }
  }
  return (
    <article className="adm-card sfm-item">
      <div className="sfm-item-head">
        <label className="adm-small sfm-show">
          <input type="checkbox" checked={d.is_visible} onChange={(e) => save({ is_visible: e.target.checked })} /> Shown
        </label>
        <span className="col-move">
          <button type="button" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
            ↓
          </button>
          <button
            type="button"
            aria-label="Delete question"
            onClick={async () => {
              try {
                await deleteRow("faqs", f.id);
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
      <div className="sfm-grid">
        <label className="adm-label">
          Topic
          <input className="adm-input" list="faq-topics" maxLength={60} value={d.topic} onChange={(e) => setD({ ...d, topic: e.target.value })} />
        </label>
        <label className="adm-label">
          Question
          <input className="adm-input" maxLength={300} value={d.question} onChange={(e) => setD({ ...d, question: e.target.value })} />
        </label>
      </div>
      <label className="adm-label">
        Answer
        <textarea className="adm-input" rows={3} maxLength={4000} value={d.answer} onChange={(e) => setD({ ...d, answer: e.target.value })} />
      </label>
      <button type="button" className="adm-btn pri" style={{ justifySelf: "start" }} disabled={!dirty || !d.question.trim()} onClick={() => save()}>
        Save
      </button>
    </article>
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

function Seo() {
  const [rows, setRows] = useState<PageSeo[] | null>(null);
  useEffect(() => {
    listRows("page_seo").then(setRows);
  }, []);
  return (
    <div className="sfm-list">
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        What Google shows for the shop&apos;s own pages. Empty: the shop&apos;s own wording. Products, categories and sub-categories have theirs on their own pages.
      </p>
      {rows &&
        BUILT_IN.map(([path, name]) => <SeoRow key={path} path={path} name={name} have={rows.find((r) => r.path === path) ?? { path, title: "", description: "", image_url: "" }} />)}
    </div>
  );
}

function SeoRow({ path, name, have }: { path: string; name: string; have: PageSeo }) {
  const [d, setD] = useState(have);
  // what is saved now: after a save, the button settles until the next change
  const [saved, setSaved] = useState(have);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  return (
    <article className="adm-card sfm-item">
      <b>
        {name} <span className="adm-muted adm-small">{path}</span>
      </b>
      <div className="sfm-grid">
        <label className="adm-label">
          Title ({d.title.length}/70)
          <input className="adm-input" maxLength={70} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </label>
        <label className="adm-label">
          Description ({d.description.length}/170)
          <input className="adm-input" maxLength={170} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
        </label>
      </div>
      <button
        type="button"
        className="adm-btn pri"
        style={{ justifySelf: "start" }}
        disabled={!dirty}
        onClick={() =>
          saveRow("page_seo", d).then(
            () => (setSaved(d), toast("Saved: it takes effect with the shop's next update")),
            (e) => toastError(errText(e)),
          )
        }
      >
        Save
      </button>
    </article>
  );
}
