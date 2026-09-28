"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import irisThird from "@/assets/baba/iris-third.webp";
import third from "@/assets/baba/third.webp";
import thirdMask from "@/assets/baba/third-mask.png";
import { hasBabaEyes } from "@/lib/themes";
import { useShopTheme } from "@/lib/useShopTheme";

type Pick = { href: string; name: string };

// The third eye, beside the category title. It watches the pointer like the
// two in the header; tap it and it rolls, then "sees" something on the shelf,
// which is lit up and scrolled into view.
export default function ThirdEye({ products }: { products: Pick[] }) {
  const theme = useShopTheme();
  const eye = useRef<HTMLButtonElement>(null);
  const [seeing, setSeeing] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const last = useRef<string | null>(null);
  const on = hasBabaEyes(theme) && products.length > 0;

  useEffect(() => {
    const el = eye.current;
    if (!on || !el) return;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, len / 300);
      tx = (dx / len) * reach * 0.18 * r.width;
      ty = (dy / len) * reach * 0.26 * r.height;
    };
    const tick = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      el.style.setProperty("--ix", `${x.toFixed(1)}px`);
      el.style.setProperty("--iy", `${y.toFixed(1)}px`);
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [on]);

  if (!on) return null;

  function see() {
    if (seeing) return;
    const pool = products.length > 1 ? products.filter((p) => p.href !== last.current) : products;
    const p = pool[Math.floor(Math.random() * pool.length)];
    last.current = p.href;
    setPick(null);
    setSeeing(true);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(
      () => {
        setSeeing(false);
        setPick(p);
        document.querySelectorAll(".pc[data-seen]").forEach((c) => c.removeAttribute("data-seen"));
        const card = document.querySelector<HTMLElement>(`.pc:has(a[href="${p.href}"])`);
        if (card) {
          card.dataset.seen = "true";
          card.scrollIntoView({ behavior: still ? "instant" : "smooth", block: "center" });
        }
      },
      still ? 0 : 1100,
    );
  }

  return (
    <div className="bb-third" data-seeing={seeing}>
      <button
        ref={eye}
        type="button"
        className="bb-third-btn"
        onClick={see}
        aria-label="Ask the third eye to pick something"
        style={{ "--mask": `url(${thirdMask.src})`, "--iris": `url(${irisThird.src})` } as React.CSSProperties}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={third.src} alt="" aria-hidden="true" />
        <span className="bb-third-white">
          <span className="bb-iris" />
        </span>
      </button>
      <div className="bb-third-copy" aria-live="polite">
        {pick ? (
          <>
            <p className="bb-third-kicker">The third eye sees</p>
            <Link href={pick.href} className="bb-third-pick">
              {pick.name} →
            </Link>
          </>
        ) : (
          <>
            <p className="bb-third-kicker">{seeing ? "Looking…" : "Can’t choose?"}</p>
            <p className="bb-third-hint">{seeing ? "Hold still." : "Open the third eye."}</p>
          </>
        )}
      </div>
    </div>
  );
}
