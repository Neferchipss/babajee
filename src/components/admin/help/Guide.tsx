"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Figure } from "./figures";
import { ALL, articleFor, GUIDE, type Article, type Chapter } from "./guide-data";
import "./guide.css";

// The guide to the Aronium-style admin (the ? in the title bar): a contents
// tree of chapters and articles on the left, the open article on the right
// with its numbered steps and drawings, and a search over everything. Opened
// from a screen (?from=/admin/stock…) it starts at that screen's article;
// ?a=<article> links straight to one.

// **bold** in the guide's text
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

const plain = (a: Article) => [a.title, a.intro, ...(a.steps ?? []).map((s) => s.t), ...(a.tips ?? []), ...(a.careful ?? []), ...(a.table?.rows.flat() ?? [])].join(" ").replace(/\*\*/g, "").toLowerCase();

export default function Guide() {
  const q = useSearchParams();
  const router = useRouter();
  const from = q.get("from") ?? "";
  const asked = q.get("a");
  const id = (asked && ALL.some((a) => a.id === asked) ? asked : null) ?? (from ? articleFor(from) : null) ?? GUIDE[0].articles[0].id;
  const i = ALL.findIndex((a) => a.id === id);
  const art = ALL[i];
  const prev = ALL[i - 1];
  const next = ALL[i + 1];
  const [words, setWords] = useState("");
  const [toc, setToc] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const hrefOf = (a: string) => `/admin/help?a=${a}${from ? `&from=${encodeURIComponent(from)}` : ""}`;

  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [id]);

  const found = useMemo(() => {
    const w = words.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!w.length) return null;
    return ALL.filter((a) => {
      const t = plain(a);
      return w.every((x) => t.includes(x));
    });
  }, [words]);

  const go = (a: string) => {
    setWords("");
    setToc(false);
    router.push(hrefOf(a));
  };

  const contents = (c: Chapter) => (
    <li key={c.id}>
      <span className="hg-toc-ch">{c.title}</span>
      <ul>
        {c.articles.map((a) => (
          <li key={a.id}>
            <Link href={hrefOf(a.id)} className={a.id === id ? "is-on" : ""} aria-current={a.id === id ? "page" : undefined} onClick={() => setToc(false)}>
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );

  return (
    <div className="hg" ref={top}>
      <aside className={`hg-toc ${toc ? "is-open" : ""}`} aria-label="Guide contents">
        <div className="hg-search">
          <input
            className="hg-search-box"
            type="search"
            placeholder="Search the guide"
            aria-label="Search the guide"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && found?.[0]) go(found[0].id);
              if (e.key === "Escape") setWords("");
            }}
          />
        </div>
        <button type="button" className="hg-toc-toggle" aria-expanded={toc} onClick={() => setToc(!toc)}>
          {toc ? "Hide contents" : "Contents"} <span aria-hidden="true">{toc ? "▴" : "▾"}</span>
        </button>
        <ul className="hg-toc-list">{GUIDE.map(contents)}</ul>
        {from && (
          <Link href={from} className="hg-backto">
            ← Back to the screen
          </Link>
        )}
      </aside>

      <article className="hg-art">
        {found ? (
          <>
            <p className="hg-crumb">Guide › Search</p>
            <h2 className="hg-h">
              {found.length} result{found.length === 1 ? "" : "s"} for “{words.trim()}”
            </h2>
            {found.length === 0 && <p className="hg-intro">Nothing in the guide mentions that. Try fewer or other words, like “paid”, “stock” or “GST”.</p>}
            <ul className="hg-results">
              {found.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => go(a.id)}>
                    <span className="hg-results-ch">{a.chapter.title}</span>
                    <strong>{a.title}</strong>
                    <span className="hg-results-intro">{a.intro.replace(/\*\*/g, "").slice(0, 150)}…</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="hg-crumb">
              Guide › {art.chapter.title}
            </p>
            <h2 className="hg-h">{art.title}</h2>
            <p className="hg-intro">
              <Rich text={art.intro} />
            </p>

            {art.steps && (
              <ol className="hg-steps">
                {art.steps.map((s, k) => (
                  <li key={k}>
                    <span className="hg-step-n" aria-hidden="true">
                      {k + 1}
                    </span>
                    <div className="hg-step-body">
                      <p>
                        <Rich text={s.t} />
                      </p>
                      {s.fig && <Figure f={s.fig} />}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {art.table && (
              <table className="hg-table">
                <thead>
                  <tr>
                    {art.table.head.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {art.table.rows.map((r) => (
                    <tr key={r[0]}>
                      {r.map((c, k) => (
                        <td key={k}>{k === 0 ? <kbd>{c}</kbd> : <Rich text={c} />}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {art.tips?.map((t) => (
              <p key={t} className="hg-note is-tip">
                <b>Tip</b>
                <span>
                  <Rich text={t} />
                </span>
              </p>
            ))}
            {art.careful?.map((t) => (
              <p key={t} className="hg-note is-careful">
                <b>Careful</b>
                <span>
                  <Rich text={t} />
                </span>
              </p>
            ))}

            {art.paths?.[0] && art.paths[0] !== "/admin/help" && (
              <p className="hg-open">
                <Link href={art.paths[0]}>Open {art.title.replace(/ \(.*\)$/, "")} →</Link>
              </p>
            )}

            <nav className="hg-pager" aria-label="Previous and next">
              {prev ? (
                <Link href={hrefOf(prev.id)}>
                  <small>Previous</small>
                  {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={hrefOf(next.id)} className="is-next">
                  <small>Next</small>
                  {next.title}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        )}
      </article>
    </div>
  );
}
