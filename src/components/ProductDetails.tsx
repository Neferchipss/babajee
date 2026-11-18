"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/use-focus-trap";
import "./product-desk.css";
import "./product-reviews.css";

// A product's details, the same on a wide screen (ProductDesk, under the
// buy box) and on a phone (ProductSheet, in a panel over the card): what it
// is, what's in a set, its specifications with the chosen option's weight
// and size, and its videos. Read once per product; the shelf doesn't carry them.
type About = Awaited<ReturnType<typeof import("@/lib/catalog-db").getProductDescription>>;
const NONE: About = { description: "", brand: "", specs: [], videos: [], sizes: [], includes: [] };

export function useProductAbout(slug: string): About | null {
  const [about, setAbout] = useState<({ slug: string } & About) | null>(null);
  useEffect(() => {
    let live = true;
    import("@/lib/catalog-db")
      .then((m) => m.getProductDescription(slug))
      .then((d) => live && setAbout({ slug, ...d }))
      .catch(() => live && setAbout({ slug, ...NONE }));
    return () => {
      live = false;
    };
  }, [slug]);
  return about?.slug === slug ? about : null;
}

// whether there is anything to show (the phone's Details link hides without it)
export function hasDetails(info: About | null, option: string) {
  if (!info) return false;
  return !!(info.description || info.specs.length || info.videos.length || info.includes.length || info.sizes.some((x) => x.label === option || info.sizes.length === 1));
}

export default function ProductDetails({ info, option, name }: { info: About | null; option: string; name: string }) {
  // the chosen option's weight and size (0062), read as specifications
  const size = info?.sizes.find((x) => x.label === option) ?? (info?.sizes.length === 1 ? info.sizes[0] : undefined);
  const dims = size && size.length_cm && size.width_cm && size.height_cm ? `${size.length_cm} × ${size.width_cm} × ${size.height_cm} cm` : "";
  const specs = [
    ...(info?.specs ?? []),
    ...(size?.weight_g ? [{ label: "Weight", value: size.weight_g >= 1000 ? `${Math.round(size.weight_g / 100) / 10} kg` : `${size.weight_g} g` }] : []),
    ...(dims ? [{ label: "Size", value: dims }] : []),
  ];
  const inc = info?.includes.find((x) => x.label === option) ?? (info?.includes.length === 1 ? info.includes[0] : undefined);
  return (
    <>
      {info?.description ? (
        <section className="pdk-about">
          <h2>About this product</h2>
          <p>{info.description}</p>
        </section>
      ) : null}
      {inc ? (
        <section className="pdk-about pdk-includes">
          <h2>What&apos;s in the set</h2>
          <ul>
            {inc.items.map((it, i) => (
              <li key={i}>
                <b>{it.qty} ×</b> {it.name}
                {it.option ? <span> · {it.option}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {specs.length ? (
        <section className="pdk-about pdk-specs">
          <h2>Specifications</h2>
          <dl>
            {specs.map((s) => (
              <div key={s.label}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {info?.videos.length ? (
        <section className="pdk-about pdk-videos">
          <h2>{info.videos.length === 1 ? "Video" : "Videos"}</h2>
          {info.videos.map((u) => (
            <ProductVideo key={u} url={u} title={name} />
          ))}
        </section>
      ) : null}
    </>
  );
}

// On a phone: the details in a panel over the page (like the reviews), since
// the card is a fixed size and moves with swipes.
export function DetailsPanel({ slug, name, option, onClose }: { slug: string; name: string; option: string; onClose: () => void }) {
  const info = useProductAbout(slug);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useFocusTrap(panel, true, { initial: close });
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div ref={panel} className="rv-panel" role="dialog" aria-modal="true" aria-label={`Details of ${name}`}>
      <button type="button" className="rv-scrim" aria-label="Close details" tabIndex={-1} onClick={onClose} />
      <div className="rv-sheet pd-sheet">
        <div className="rv-sheet-bar">
          <p>{name}</p>
          <button ref={close} type="button" className="rv-close" onClick={onClose} aria-label="Close details">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {info === null ? <p className="rv-muted">Loading.</p> : hasDetails(info, option) ? <ProductDetails info={info} option={option} name={name} /> : <p className="rv-muted">No more details for this one yet.</p>}
      </div>
    </div>,
    document.getElementById("site") ?? document.body,
  );
}

// A video link (0062): YouTube plays in its no-cookie player; anything else
// (a direct .mp4) in the browser's own. Loaded only when it is played.
function youTubeId(url: string) {
  const m = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  return m ? m[1] : null;
}
export function ProductVideo({ url, title }: { url: string; title: string }) {
  const yt = youTubeId(url);
  return (
    <div className="pdk-video">
      {yt ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${yt}`}
          title={`${title}: video`}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <video src={url} controls preload="none" playsInline aria-label={`${title}: video`} />
      )}
    </div>
  );
}
