"use client";

import { useEffect, useRef, useState } from "react";
import "./slide.css";

// A slide-to-confirm control (checkout on phones): drag the knob across to
// confirm, so a stray tap can't place an order. Let go early and it springs
// back. Keyboard and screen readers get a plain button press (Enter/Space).
export default function SlideToConfirm({ label, onConfirm, disabled = false, busy = false }: { label: string; onConfirm: () => void; disabled?: boolean; busy?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; max: number } | null>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const done = busy;
  const off = disabled || busy;
  // placing finished without leaving the page (an error): back to the start
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (!busy) setX(0);
  }
  const busyNow = useRef(busy);
  useEffect(() => {
    busyNow.current = busy;
  }, [busy]);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (off || !track.current) return;
    const knob = e.currentTarget.getBoundingClientRect().width;
    start.current = { x: e.clientX - x, max: track.current.clientWidth - knob - 8 };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setX(Math.max(0, Math.min(start.current.max, e.clientX - start.current.x)));
  }
  function up() {
    if (!start.current) return;
    const { max } = start.current;
    start.current = null;
    setDragging(false);
    if (x >= max * 0.85) {
      setX(max);
      if ("vibrate" in navigator) navigator.vibrate?.(12);
      onConfirm();
      // nothing started (say, no address chosen yet): spring back
      setTimeout(() => !busyNow.current && setX(0), 600);
    } else {
      setX(0);
    }
  }

  return (
    <div
      ref={track}
      className={`slide ${off ? "is-off" : ""} ${done ? "is-done" : ""}`}
      role="button"
      tabIndex={off ? -1 : 0}
      aria-disabled={off}
      aria-label={`${label}. Press to confirm.`}
      onKeyDown={(e) => {
        if (!off && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onConfirm();
        }
      }}
    >
      <span className="slide-fill" style={{ width: x ? `calc(${x}px + 52px)` : undefined }} aria-hidden="true" />
      <span className="slide-text" aria-hidden="true" style={{ opacity: Math.max(0, 1 - x / 160) }}>
        {busy ? "Placing your order" : label}
      </span>
      <div
        className="slide-knob"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-hidden="true"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l6 6-6 6" opacity="0.45" />
          <path d="M12 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}
