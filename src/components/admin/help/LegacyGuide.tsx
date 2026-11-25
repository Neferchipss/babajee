"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { LegacyFigure } from "./legacy-figures";
import { LALL, LEGACY, legacyFor, type Block, type LSection } from "./legacy-data";
import "./legacy.css";

// The Legacy theme's guide, laid out like HDRI Knight's documentation: an
// index of chapters down the left (each folding open to its sections), a
// pinned bar with the breadcrumb and a search, then the open chapter as a
// run of ruled, numbered sections, each with its drawing in a rail on the
// right and the callouts listed under it. ?a=<section> opens one section;
// ?from=<admin address> opens the section for that page.

// **bold** and [[section|words]] in the guide's words
function Rich({ text, go }: { text: string; go: (id: string) => void }) {
  const parts = text.split(/(\*\*.+?\*\*|\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("[[")) {
          const [id, words] = p.slice(2, -2).split("|");
          return (
            <button key={i} type="button" className="lg-see" onClick={() => go(id)}>
              {words ?? id} →
            </button>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const plain = (s: LSection) =>
  [s.title, s.lead, ...(s.blocks ?? []).flatMap((b) => ("p" in b ? [b.p] : "steps" in b ? b.steps : "controls" in b ? b.controls.flat() : "tip" in b ? [b.tip] : "careful" in b ? [b.careful] : "group" in b ? [b.group] : [])), ...(s.fig?.callouts.map((c) => c[1]) ?? [])]
    .join(" ")
    .replace(/\*\*|\[\[|\]\]/g, "")
    .toLowerCase();

function Blocks({ blocks, go }: { blocks: Block[]; go: (id: string) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        if ("p" in b)
          return (
            <p key={i} className="lg-p">
              <Rich text={b.p} go={go} />
            </p>
          );
        if ("group" in b)
          return (
            <div key={i} className="lg-group">
              <span>{b.group}</span>
              <i />
            </div>
          );
        if ("controls" in b)
          return (
            <div key={i} className={b.controls.length > 3 ? "lg-cols" : ""}>
              {b.controls.map(([name, text]) => (
                <div key={name} className="lg-control">
                  <span className="lg-control-name">{name}</span>
                  <div className="lg-control-text">
                    <Rich text={text} go={go} />
                  </div>
                </div>
              ))}
            </div>
          );
        if ("steps" in b)
          return (
            <ol key={i} className="lg-steps">
              {b.steps.map((t, k) => (
                <li key={k}>
                  <span className="lg-num is-big">{k + 1}</span>
                  <span>
                    <Rich text={t} go={go} />
                  </span>
                </li>
              ))}
            </ol>
          );
        const careful = "careful" in b;
        return (
          <div key={i} className={`lg-note ${careful ? "is-careful" : ""}`}>
            <span className="lg-eyebrow">{careful ? "Careful" : "Tip"}</span>
            <span>
              <Rich text={careful ? b.careful : b.tip} go={go} />
            </span>
          </div>
        );
      })}
    </>
  );
}

export default function LegacyGuide() {
  const q = useSearchParams();
  const router = useRouter();
  const from = q.get("from") ?? "";
  const asked = q.get("a");
  const start = (asked && LALL.some((s) => s.id === asked) ? asked : null) ?? (from ? legacyFor(from) : null) ?? LEGACY[0].sections[0].id;
  const [active, setActive] = useState(start);
  const chapter = LALL.find((s) => s.id === active)?.chapter ?? LEGACY[0];
  const ci = LEGACY.indexOf(chapter);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [words, setWords] = useState("");
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // follow the address when it changes (a link from elsewhere in the admin)
  const [seen, setSeen] = useState(start);
  if (seen !== start) {
    setSeen(start);
    setActive(start);
  }

  // scroll to the open section once its chapter is drawn
  useEffect(() => {
    requestAnimationFrame(() => document.getElementById(start)?.scrollIntoView({ block: "start" }));
  }, [start]);

  // the section in view lights up in the index
  useEffect(() => {
    const els = chapter.sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [chapter]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const go = (id: string) => {
    setWords("");
    setOpen(false);
    setMenu(false);
    setActive(id);
    router.replace(`/admin/help?a=${id}${from ? `&from=${encodeURIComponent(from)}` : ""}`, { scroll: false });
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const hits = useMemo(() => {
    const w = words.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!w.length) return [];
    return LALL.filter((s) => {
      const t = plain(s);
      return w.every((x) => t.includes(x));
    }).slice(0, 12);
  }, [words]);

  const section = chapter.sections.find((s) => s.id === active);
  const back = from && from !== "/admin/help" ? from : null;

  return (
    <div className="lg-wrap">
      <div className="lg">
        <aside className={`lg-index ${menu ? "is-open" : ""}`}>
          <button type="button" className="lg-index-toggle" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            Contents
          </button>
          <nav aria-label="Documentation index" className="lg-index-inner">
            <span className="lg-eyebrow">On this page</span>
            {LEGACY.map((c) => {
              const on = c === chapter;
              const isOpen = on || !folded.has(c.id);
              return (
                <div key={c.id}>
                  <div className="lg-index-ch">
                    <button
                      type="button"
                      className={`lg-chev ${isOpen ? "is-open" : ""}`}
                      aria-expanded={isOpen}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                      onClick={() =>
                        setFolded((f) => {
                          const n = new Set(f);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    >
                      <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M4 2.5 8 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button type="button" className={`lg-ch ${on ? "is-on" : ""}`} onClick={() => go(c.sections[0].id)}>
                      {c.label}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="lg-index-secs">
                      {c.sections.map((s) => (
                        <button key={s.id} type="button" className={on && s.id === active ? "is-on" : ""} aria-current={on && s.id === active ? "true" : undefined} onClick={() => go(s.id)}>
                          {s.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="lg-main">
          <div className="lg-crumbbar">
            <nav aria-label="Breadcrumb" className="lg-crumbs">
              <Link href="/admin">Babajee</Link>
              <i>/</i>
              <button type="button" onClick={() => go(LEGACY[0].sections[0].id)}>
                Docs
              </button>
              <i>/</i>
              <button type="button" onClick={() => go(chapter.sections[0].id)}>
                {chapter.label}
              </button>
              {section && (
                <>
                  <i>/</i>
                  <b>{section.title}</b>
                </>
              )}
            </nav>
            <div className="lg-search" ref={box}>
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M11 11 14.5 14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={words}
                placeholder="Search the guide…"
                aria-label="Search the guide"
                spellCheck={false}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setWords(e.target.value);
                  setOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && hits[0]) go(hits[0].id);
                  else if (e.key === "Escape") {
                    setWords("");
                    setOpen(false);
                  }
                }}
              />
              {open && words.trim() && (
                <div className="lg-hits">
                  {hits.length === 0 ? (
                    <p>Nothing matches “{words}”.</p>
                  ) : (
                    hits.map((s) => (
                      <button key={s.id} type="button" onClick={() => go(s.id)}>
                        <b>{s.title}</b>
                        <span className="lg-eyebrow">{s.chapter.label}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <header className="lg-header">
            {back && (
              <Link href={back} className="lg-backto">
                ← Back to the page
              </Link>
            )}
            <h1>Run the shop from the admin</h1>
            <p>
              The guide to the Legacy admin: how it&apos;s laid out, what every page and button does, and how to get the everyday jobs done, from a phone order to the month&apos;s GST return. The drawings are small copies of the real screens with made-up orders and
              customers; the numbers on them match the notes under each one.
            </p>
          </header>

          <div className="lg-chapter">
            <span className="lg-eyebrow is-accent">
              Chapter {ci + 1} · {chapter.label}
            </span>
            {chapter.sections.map((s, i) => (
              <section key={s.id} id={s.id} className="lg-section">
                <div className="lg-section-h">
                  <span className="lg-index-n">{String(i + 1).padStart(2, "0")}</span>
                  <h2>{s.title}</h2>
                </div>
                <div className="lg-rule" />
                <div className={s.fig ? "lg-split" : ""}>
                  <div>
                    <p className="lg-lead">
                      <Rich text={s.lead} go={go} />
                    </p>
                    {s.blocks && <Blocks blocks={s.blocks} go={go} />}
                    {s.paths?.[0] && !/\/admin\/help|\/view|\/edit/.test(s.paths[0]) && (
                      <Link href={s.paths[0]} className="lg-open">
                        Open {s.title} →
                      </Link>
                    )}
                  </div>
                  {s.fig && (
                    <div className="lg-split-fig">
                      <LegacyFigure fig={`${ci + 1}.${i + 1}`} data={s.fig} />
                    </div>
                  )}
                </div>
              </section>
            ))}
            <div className="lg-pager">
              {LEGACY[ci - 1] ? (
                <button type="button" onClick={() => go(LEGACY[ci - 1].sections[0].id)}>
                  <span className="lg-eyebrow">Previous</span>
                  {LEGACY[ci - 1].label}
                </button>
              ) : (
                <span />
              )}
              {LEGACY[ci + 1] && (
                <button type="button" className="is-next" onClick={() => go(LEGACY[ci + 1].sections[0].id)}>
                  <span className="lg-eyebrow">Next</span>
                  {LEGACY[ci + 1].label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
