"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState } from "react";

// the sign-in screens load when the window first opens, not with every page
const Onboard = dynamic(() => import("./Onboard"));

// Desktop: "Log in" opens a floating window over the page you're on (like the
// delivery apps) instead of leaving it. Any link to /account/login or
// /account/signup is caught on wide screens; phones still get the full-screen
// page. Signing in closes the window and you carry on where you were.
const WIDE = "(min-width: 821px)";

export default function LoginModal() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const catchLink = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || !window.matchMedia(WIDE).matches) return;
      const path = new URL(a.href, window.location.href).pathname.replace(/\/$/, "");
      if (!/\/account\/(login|signup)$/.test(path)) return;
      // already on the login page itself: let it be
      if (/\/account\/(login|signup)\/?$/.test(window.location.pathname)) return;
      e.preventDefault();
      e.stopPropagation();
      // menus that opened the link close themselves
      window.dispatchEvent(new Event("babajee:login"));
      setOpen(true);
    };
    document.addEventListener("click", catchLink, true);
    return () => document.removeEventListener("click", catchLink, true);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="onb-dialog"
      aria-label="Log in or sign up"
      onClose={() => setOpen(false)}
      // a click on the dimmed page around the window closes it
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      {open && (
        <Suspense>
          <Onboard embedded onDone={() => setOpen(false)} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </dialog>
  );
}
