"use client";

import { useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";

// Only visible in Daydream. Motion stays on the artwork, never on shop controls.
export default function DaydreamGarden({ categories }: { categories: { slug: string; name: string }[] }) {
  const router = useRouter();
  const garden = useRef<HTMLDivElement>(null);
  const lastPick = useRef(-1);
  const [awake, setAwake] = useState(false);

  function follow(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--dd-x", `${((event.clientX - box.left) / box.width - 0.5) * 8}px`);
    event.currentTarget.style.setProperty("--dd-y", `${((event.clientY - box.top) / box.height - 0.5) * 6}px`);
  }

  function detour() {
    if (!categories.length) return;
    const choices = categories.map((_, i) => i).filter((i) => i !== lastPick.current);
    const next = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    lastPick.current = next;
    router.push(`/shop/${categories[next].slug}`);
  }

  return (
    <div className="dd-garden-wrap">
      {categories.length > 0 && (
        <button className="dd-detour" type="button" onClick={detour}>
          Surprise me <span aria-hidden="true">↗</span>
        </button>
      )}
      <div className="dd-garden" ref={garden} data-awake={awake} onPointerMove={follow}
        onPointerLeave={() => { garden.current?.style.setProperty("--dd-x", "0px"); garden.current?.style.setProperty("--dd-y", "0px"); }}>
        <div className="dd-garden-art" aria-hidden="true" />
        <button className="dd-spark" type="button" aria-label="Make the daydream sparkle" aria-pressed={awake}
          onClick={() => setAwake((value) => !value)}>
          <svg viewBox="0 0 80 80" aria-hidden="true"><path d="M40 4Q44 35 76 40Q44 45 40 76Q35 45 4 40Q35 35 40 4Z" fill="currentColor" stroke="#181916" strokeWidth="2.5" /></svg>
        </button>
        <span className="dd-spark-hint">a little more magic ↗</span>
        <span className="dd-art-caption">TAKE YOUR TIME. FIND YOUR THING.</span>
      </div>
    </div>
  );
}
