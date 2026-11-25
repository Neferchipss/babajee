"use client";

// Small pieces of Aronium's windows used by the Stock, Reporting, Customers &
// suppliers, Users & security and My company screens: the tab row inside a
// slide-in panel, the − n + stepper, the blue info box, a section title with
// its rule, and a note for what Babajee doesn't keep.

export function PanelTabs<T extends string>({ tabs, on, onPick }: { tabs: readonly (readonly [T, string])[]; on: T; onPick: (t: T) => void }) {
  return (
    <div className="arb-ptabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={on === id} className={on === id ? "is-on" : ""} onClick={() => onPick(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 9999, disabled, after, label }: { value: number; onChange?: (n: number) => void; min?: number; max?: number; disabled?: boolean; after?: React.ReactNode; label: string }) {
  return (
    <span className="arb-step">
      <button type="button" aria-label={`Less ${label}`} disabled={disabled || value <= min} onClick={() => onChange?.(Math.max(min, value - 1))}>
        −
      </button>
      <input type="number" aria-label={label} value={value} min={min} max={max} disabled={disabled} onChange={(e) => onChange?.(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
      <button type="button" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange?.(Math.min(max, value + 1))}>
        +
      </button>
      {after && <span className="arb-step-after">{after}</span>}
    </span>
  );
}

export function InfoBox({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "bad" }) {
  return (
    <div className={`arb-info is-${tone}`} role="note">
      <span className="arb-info-i" aria-hidden="true">
        {tone === "warn" ? "⚠" : "ⓘ"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="art-sec">
      <h2>{children}</h2>
      <i aria-hidden="true" />
    </div>
  );
}

// a field Aronium has and Babajee doesn't keep: shown, greyed, with why
export const NotKept = ({ why = "Babajee doesn't keep this." }: { why?: string }) => <small className="arb-notkept">{why}</small>;
