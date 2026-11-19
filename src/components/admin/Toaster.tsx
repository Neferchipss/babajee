"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Small notices confirming what an admin action did ("Product added",
// "BJ-1005 marked as shipped"). Call toast() from anywhere in the admin;
// the one <Toaster /> in the admin layout shows them, newest at the bottom,
// and lets each fade after a few seconds (errors stay a little longer).
// They live in the layout, so a notice survives moving to another page.
type Tone = "ok" | "bad" | "info";
// undo: a switch that saved at once can be put back for 5 seconds
type Note = { id: number; text: string; tone: Tone; link?: { label: string; href: string }; undo?: () => void };

const EVENT = "adm-toast";
let next = 1;

export function toast(text: string, opts: { tone?: Tone; link?: { label: string; href: string }; undo?: () => void } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Note>(EVENT, { detail: { id: next++, text, tone: opts.tone ?? "ok", link: opts.link, undo: opts.undo } }));
}

// a failure as a notice, with the database's own sentence when it has one
export function toastError(e: unknown) {
  // a message as it stands, or an error's own message
  const msg = typeof e === "string" && e ? e : e && typeof e === "object" && "message" in e && typeof e.message === "string" ? e.message : "That didn't go through. Try again.";
  toast(msg, { tone: "bad" });
}

export function Toaster() {
  const [notes, setNotes] = useState<Note[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const drop = (id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setNotes((ns) => ns.filter((n) => n.id !== id));
  };
  const arm = (n: Note) => timers.current.set(n.id, setTimeout(() => drop(n.id), n.tone === "bad" ? 6000 : n.undo ? 5000 : 3500));

  useEffect(() => {
    const t = timers.current;
    const on = (e: Event) => {
      const n = (e as CustomEvent<Note>).detail;
      setNotes((ns) => [...ns.slice(-2), n]);
      arm(n);
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      t.forEach(clearTimeout);
    };
    // arm and drop only touch refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="adm-toasts" role="status" aria-live="polite">
      {notes.map((n) => (
        <div
          key={n.id}
          className={`adm-toast is-${n.tone}`}
          // hovering keeps it up; leaving starts its clock again
          onMouseEnter={() => clearTimeout(timers.current.get(n.id))}
          onMouseLeave={() => arm(n)}
        >
          <span className="adm-toast-icon" aria-hidden="true">
            {n.tone === "bad" ? "!" : n.tone === "info" ? "i" : "✓"}
          </span>
          <span className="adm-toast-text">{n.text}</span>
          {n.link && (
            <Link href={n.link.href} className="adm-toast-link" onClick={() => drop(n.id)}>
              {n.link.label}
            </Link>
          )}
          {n.undo && (
            <button
              type="button"
              className="adm-toast-link"
              onClick={() => {
                n.undo!();
                drop(n.id);
              }}
            >
              Undo
            </button>
          )}
          <button type="button" className="adm-toast-x" aria-label="Dismiss" onClick={() => drop(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
