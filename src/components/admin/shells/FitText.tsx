"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// A number (or a short line) that keeps the size its CSS gives it when it
// fits its box, and shrinks just enough to fit when it doesn't: big totals
// like 4,19,550 or 400.75K never run off the card's edge. Re-fits whenever
// the box changes width (window resize, zoom, the menu opening).
export default function FitText({ children, className }: { children: ReactNode; className?: string }) {
  const box = useRef<HTMLElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const fit = () => {
      // back to the CSS size, then measure
      b.style.fontSize = "";
      const css = parseFloat(getComputedStyle(b).fontSize);
      const pad = parseFloat(getComputedStyle(b).paddingLeft) + parseFloat(getComputedStyle(b).paddingRight);
      const room = b.clientWidth - pad;
      const need = t.scrollWidth;
      if (room > 0 && need > room) b.style.fontSize = `${Math.max(10, Math.floor(css * (room / need) * 0.97))}px`;
    };
    fit();
    // only a change of width re-fits (the fit itself changes the height)
    let width = b.clientWidth;
    const ro = new ResizeObserver(() => {
      if (b.clientWidth === width) return;
      width = b.clientWidth;
      fit();
    });
    ro.observe(b);
    // a web font arriving changes the text's width
    document.fonts?.ready.then(fit, () => {});
    return () => ro.disconnect();
  }, [children]);

  return (
    <b ref={box} className={className}>
      <span ref={text} style={{ whiteSpace: "nowrap" }}>
        {children}
      </span>
    </b>
  );
}
