"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import Editorial from "./Editorial";
import { fontVars } from "./fonts";
import Poster from "./Poster";
import Refined from "./Refined";
import s from "./pitch.module.css";

const STYLES = [
  { id: "editorial", label: "Editorial" },
  { id: "refined", label: "Refined" },
  { id: "poster", label: "Poster" },
] as const;

type StyleId = (typeof STYLES)[number]["id"];

// The chosen style lives in the URL hash, so a link opens on the right one.
function read(): StyleId {
  const h = window.location.hash.slice(1);
  return STYLES.some((x) => x.id === h) ? (h as StyleId) : "editorial";
}
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export default function PitchApp() {
  const style = useSyncExternalStore(subscribe, read, () => "editorial" as StyleId);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    root.current?.scrollTo({ top: 0 });
  }, [style]);

  return (
    <div ref={root} className={`${s.root} ${fontVars}`} data-style={style}>
      {style === "editorial" && <Editorial />}
      {style === "refined" && <Refined />}
      {style === "poster" && <Poster />}

      <div className={s.switcher} role="radiogroup" aria-label="Page style">
        {STYLES.map((x, i) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={style === x.id}
            onClick={() => {
              window.location.hash = x.id;
            }}
          >
            {i + 1}. {x.label}
          </button>
        ))}
        <Link href="/">Exit</Link>
      </div>
    </div>
  );
}
