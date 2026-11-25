"use client";

import { useEffect } from "react";
import { Dialog } from "@/components/admin/ui";
import "./aronium-screens-a.css";

// Aronium's Help button opens its manual; here it opens a short note on what
// the screen does in Babajee, and what it does differently from the till.
export function ArHelp({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <div className="ara-dlg">
        <h2>{title}</h2>
        <div className="ara-help">{children}</div>
        <div className="ara-btns">
          <button type="button" className="adm-btn pri" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// a field in one of Aronium's windows: the label over the control (in a
// slide-in panel), or beside it (in a small confirm window). invalid draws
// Aronium's red border on a required field still empty.
export function ArField({ label, children, hint, invalid, size }: { label: string; children: React.ReactNode; hint?: string; invalid?: boolean; size?: "short" | "mid" | "wide" }) {
  return (
    <label className={`ara-field ${invalid ? "is-invalid" : ""} ${size ? `is-${size}` : ""}`}>
      <span>{label}</span>
      <span className="ara-ctl">
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

// Aronium's blue note box (an ⓘ and a line or two), and its red warning
// banner (the one over the default customer)
export function ArInfo({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={`ara-info is-${tone}`} role={tone === "warn" ? "alert" : "note"}>
      <svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM10 9v5M10 6.2h.01" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

// Aronium's Add / Edit window: a panel that slides in from the right under
// the title bar, a light title with a → that closes it, optional tabs under
// the title (the open one solid blue with a pointer, on a blue rule), the
// fields stacked label over control, and ✓ Save / ✕ Cancel at the bottom
// right. Escape closes it. width follows Aronium's: narrow (Add user, New
// tax rate), mid (payment types, countries), wide (customers, products).
export function ArPanel({
  open,
  title,
  onClose,
  onSave,
  canSave = true,
  saveLabel = "Save",
  cancelDanger,
  width = "mid",
  tabs,
  tab,
  onTab,
  banner,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  canSave?: boolean;
  saveLabel?: string;
  // Promotions draws its Cancel in red
  cancelDanger?: boolean;
  width?: "narrow" | "mid" | "wide";
  tabs?: string[];
  tab?: string;
  onTab?: (t: string) => void;
  // a note across the top of the body (ArInfo), e.g. why it can't be saved
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <form
      className={`ara-panel is-${width}`}
      role="dialog"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && onSave) onSave();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" className="ara-panel-x" aria-label="Close" onClick={onClose}>
          <svg viewBox="0 0 20 20" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10h14M11 4l6 6-6 6" />
          </svg>
        </button>
      </header>
      {tabs && tabs.length > 1 && (
        <div className="ara-ptabs" role="tablist">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={t === tab} className={t === tab ? "is-on" : ""} onClick={() => onTab?.(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="ara-panel-body">
        {banner}
        {children}
      </div>
      <footer>
        {onSave && (
          <button className="ara-panel-btn" disabled={!canSave}>
            <span aria-hidden="true">✓</span> {saveLabel}
          </button>
        )}
        <button type="button" className={`ara-panel-btn ${cancelDanger ? "is-danger" : ""}`} onClick={onClose}>
          <span aria-hidden="true">✕</span> Cancel
        </button>
      </footer>
    </form>
  );
}
