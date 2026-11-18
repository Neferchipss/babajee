"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { findPage, listPosts, listRows, type Faq, type SitePage } from "@/lib/content";
import { RichText } from "./ShopHome";
import "./content-page.css";

// The shop's own pages and blog (Admin > Storefront > Pages, 0073), read in
// the browser so a new page or post shows at once, without rebuilding the
// site: /pages/view/?slug=…, /blog/ and /blog/view/?slug=…, and /faq/.
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export function PageView({ kind }: { kind: "page" | "post" }) {
  const slug = useSearchParams().get("slug") ?? "";
  const [res, setRes] = useState<{ slug: string; page: SitePage | null } | null>(null);
  useEffect(() => {
    let live = true;
    findPage(kind, slug).then((page) => {
      if (!live) return;
      setRes({ slug, page });
      if (page) document.title = `${page.seo_title || page.title} | Babajee`;
      const d = document.querySelector('meta[name="description"]');
      if (page && d) d.setAttribute("content", page.seo_description || page.excerpt || page.body.slice(0, 160));
    });
    return () => {
      live = false;
    };
  }, [kind, slug]);
  const page = res?.slug === slug ? res.page : undefined;

  if (page === undefined) return <p className="cpg-wrap cpg-muted">Loading.</p>;
  if (!page || !page.is_visible)
    return (
      <div className="cpg-wrap">
        <h1>Not found</h1>
        <p className="cpg-muted">That {kind === "post" ? "post" : "page"} isn&apos;t here any more.</p>
        <Link href={kind === "post" ? "/blog/" : "/"}>{kind === "post" ? "All posts" : "Back to the shop"}</Link>
      </div>
    );
  return (
    <article className="cpg-wrap cpg-article">
      {kind === "post" && (
        <Link href="/blog/" className="cpg-back">
          ← All posts
        </Link>
      )}
      <h1>{page.title}</h1>
      {kind === "post" && page.published_at && <p className="cpg-muted">{DAY.format(new Date(page.published_at))}</p>}
      {page.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cpg-cover" src={page.cover_url} alt="" />
      )}
      <div className="cpg-body">
        <RichText body={page.body} />
      </div>
    </article>
  );
}

export function BlogList() {
  const [posts, setPosts] = useState<SitePage[] | null>(null);
  useEffect(() => {
    listPosts().then(setPosts);
  }, []);
  return (
    <div className="cpg-wrap">
      <h1>From the shop</h1>
      <p className="cpg-muted">Guides, new arrivals and notes from behind the counter.</p>
      {posts === null ? (
        <p className="cpg-muted">Loading.</p>
      ) : !posts.length ? (
        <p className="cpg-muted">Nothing here yet. Check back soon.</p>
      ) : (
        <ul className="cpg-posts">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/blog/view/?slug=${p.slug}`}>
                {p.cover_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover_url} alt="" loading="lazy" />
                )}
                <b>{p.title}</b>
                {p.published_at && <small className="cpg-muted">{DAY.format(new Date(p.published_at))}</small>}
                {p.excerpt && <span>{p.excerpt}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FaqList() {
  const [list, setList] = useState<Faq[] | null>(null);
  useEffect(() => {
    listRows("faqs").then((l) => setList(l.filter((f) => f.is_visible).sort((a, b) => a.position - b.position)));
  }, []);
  const topics = [...new Set((list ?? []).map((f) => f.topic))];
  return (
    <div className="cpg-wrap">
      <h1>Questions and answers</h1>
      <p className="cpg-muted">
        Can&apos;t find it here? <Link href="/contact/">Send us a message</Link>.
      </p>
      {list === null ? (
        <p className="cpg-muted">Loading.</p>
      ) : !list.length ? (
        <p className="cpg-muted">No questions here yet.</p>
      ) : (
        topics.map((t) => (
          <section key={t} className="cpg-faq">
            <h2>{t}</h2>
            {list
              .filter((f) => f.topic === t)
              .map((f) => (
                <details key={f.id}>
                  <summary>{f.question}</summary>
                  <div className="cpg-body">
                    <RichText body={f.answer} />
                  </div>
                </details>
              ))}
          </section>
        ))
      )}
    </div>
  );
}
