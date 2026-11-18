"use client";

// The admin's shared building blocks (UI redesign, stage 1). Every page uses
// these, so a pattern looks and behaves the same everywhere and in every
// admin design (the shells restyle them through the --adm-* tokens):
//   SaveBar      Save / Discard when a form has unsaved changes
//   useDraft     a form's working copy, with dirty tracking
//   Toggle       one on/off switch with a fixed label; saves at once
//   Confirm      the one confirmation dialog (deleting, voiding…)
//   Tabs         views of a page
//   Chips        filters
//   GstPicker    Default / 0 / 5 / 12 / 18 / 28 / 40
//   Loading, Empty, Failed  the three page states
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog } from "./ui";
import "./kit.css";

// ---------------------------------------------------------------- drafts and the save bar
export function useDraft<T>(saved: T) {
  const [draft, setDraft] = useState<T>(saved);
  const [base, setBase] = useState<T>(saved);
  // a new saved value from outside (after a save, or another record) resets the draft
  const savedKey = JSON.stringify(saved);
  const [seen, setSeen] = useState(savedKey);
  if (seen !== savedKey) {
    setSeen(savedKey);
    setBase(saved);
    setDraft(saved);
  }
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(base), [draft, base]);
  const set = useCallback((patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => setDraft(base), [base]);
  return { draft, set, setDraft, dirty, reset };
}

export function SaveBar({ dirty, busy, onSave, onDiscard, label = "Unsaved changes", saveLabel = "Save" }: { dirty: boolean; busy?: boolean; onSave: () => void; onDiscard: () => void; label?: string; saveLabel?: string }) {
  // leaving the page with unsaved changes asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!dirty) return null;
  return (
    <div className="kit-savebar" role="region" aria-label="Unsaved changes">
      <span>{label}</span>
      <div className="kit-savebar-actions">
        <button type="button" className="adm-btn" disabled={busy} onClick={onDiscard}>
          Discard
        </button>
        <button type="button" className="adm-btn pri" disabled={busy} onClick={onSave}>
          {busy ? "Saving" : saveLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- on/off
export function Toggle({ on, label, onChange, disabled, hint }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={`kit-toggle ${disabled ? "is-disabled" : ""}`}>
      <button type="button" role="switch" aria-checked={on} className={`kit-switch ${on ? "is-on" : ""}`} disabled={disabled} onClick={() => onChange(!on)}>
        <i aria-hidden="true" />
      </button>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- confirm
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger = true,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <div className="kit-confirm">
        <h2>{title}</h2>
        {body && <div className="kit-confirm-body">{body}</div>}
        <div className="adm-actions">
          <button type="button" className="adm-btn" disabled={busy} onClick={onCancel}>
            Keep it
          </button>
          <button type="button" className={`adm-btn ${danger ? "bad kit-danger" : "pri"}`} disabled={busy} onClick={onConfirm}>
            {busy ? "Working" : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- tabs and filters
export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="kit-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "is-on" : ""} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count ? <b>{o.count}</b> : null}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="adm-chips kit-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} className={`adm-chip ${value === o.id ? "is-on" : ""}`} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count !== undefined && <b>{o.count}</b>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- GST
export const GST_RATES = [0, 5, 12, 18, 28, 40];
// null = the shop's default rate
export function GstPicker({ value, shopRate, onChange, label = "GST rate", allowDefault = true }: { value: number | null; shopRate: number; onChange: (v: number | null) => void; label?: string; allowDefault?: boolean }) {
  return (
    <label className="adm-label kit-gst">
      {label}
      <select className="adm-input" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        {allowDefault && <option value="">Shop default ({shopRate}%)</option>}
        {GST_RATES.map((r) => (
          <option key={r} value={r}>
            {r}%
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------- page states
export function Loading({ what = "" }: { what?: string }) {
  return (
    <p className="kit-state" role="status">
      Loading{what ? ` ${what}` : ""}…
    </p>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="kit-state kit-empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Failed({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="kit-state kit-failed" role="alert">
      <b>That didn&apos;t load.</b>
      <p>{error}</p>
      {onRetry && (
        <button type="button" className="adm-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page header
export function PageHead({ title, help, actions, count }: { title: string; help?: ReactNode; actions?: ReactNode; count?: number }) {
  return (
    <header className="adm-pagehead kit-head">
      <div>
        <h1>
          {title}
          {count !== undefined && <span className="kit-count">{count}</span>}
        </h1>
        {help && <p>{help}</p>}
      </div>
      {actions && <div className="kit-head-actions">{actions}</div>}
    </header>
  );
}
