"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

// Keyboard focus for anything that opens over the page (a product, the
// filters, the menu, reviews, the address picker): focus moves in when it
// opens, Tab and Shift+Tab go round inside it instead of slipping out to the
// page hidden behind, and when it closes focus goes back to what opened it.
// One opened over another (reviews over a product) holds focus until it
// closes, then the one under it does again.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// the open ones, newest last: only the newest keeps focus
const stack: HTMLElement[] = [];

const shown = (el: HTMLElement) => el.getClientRects().length > 0 && !el.closest("[inert], [aria-hidden='true']");
export const focusablesIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);

type Options = {
  // what to focus on opening: an element, the first control ("first", the
  // default), or nothing ("keep": the overlay focuses something itself)
  initial?: RefObject<HTMLElement | null> | "first" | "keep";
  // put focus back where it was on closing (default yes)
  restore?: boolean;
  // keep Tab inside (default yes); off for a view that leaves the page's
  // header usable around it (the desktop product page)
  trap?: boolean;
};

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true, { initial = "first", restore = true, trap = true }: Options = {}) {
  const from = useRef<HTMLElement | null>(null);
  // a return of focus waiting for the next frame (dropped if this opens again)
  const pending = useRef(0);
  const opts = useRef({ initial, restore, trap });
  useEffect(() => {
    opts.current = { initial, restore, trap };
  });

  // where focus was before this opened: read before any effect moves it
  useLayoutEffect(() => {
    const now = document.activeElement as HTMLElement | null;
    // (focus already inside means this ran again while open: keep the first)
    if (active && !ref.current?.contains(now)) from.current = now;
  }, [active, ref]);

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    cancelAnimationFrame(pending.current);
    stack.push(root);

    const { initial: first } = opts.current;
    if (first !== "keep" && !root.contains(document.activeElement)) {
      const target = typeof first === "object" ? first.current : focusablesIn(root)[0];
      (target ?? root).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !opts.current.trap || stack[stack.length - 1] !== root || !shown(root)) return;
      const list = focusablesIn(root);
      if (!list.length) {
        e.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const at = list.indexOf(document.activeElement as HTMLElement);
      const outside = !root.contains(document.activeElement);
      if (e.shiftKey && (at <= 0 || outside)) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && (at === list.length - 1 || outside)) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.lastIndexOf(root);
      if (i >= 0) stack.splice(i, 1);
      const back = from.current;
      if (opts.current.restore && back?.isConnected && back !== document.body) {
        // after this render settles, so a focus the closing caused doesn't win
        pending.current = requestAnimationFrame(() => back.focus({ preventScroll: true }));
      }
    };
  }, [active, ref]);
}
