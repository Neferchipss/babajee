"use client";

import { useState, type ReactNode } from "react";
import { checkAddress, cleanPhone, STATES, type AddressInput } from "@/lib/addresses";

type Field = keyof AddressInput;

type Props = {
  initial: AddressInput;
  // Called with a valid address. Throw to show a message under the form.
  onSave?: (a: AddressInput) => Promise<void>;
  onCancel?: () => void;
  onChange?: (a: AddressInput) => void;
  saveLabel?: string;
  // Hides the "default" tick (for example on someone's first address).
  showDefault?: boolean;
  // Checkout already sits in a <form>, and forms cannot nest.
  nested?: boolean;
  children?: ReactNode;
};

export default function AddressForm({
  initial,
  onSave,
  onCancel,
  onChange,
  saveLabel = "Save address",
  showDefault = true,
  nested = false,
  children,
}: Props) {
  const [a, setA] = useState(initial);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = tried ? checkAddress(a) : {};

  const set = (k: Field, v: string | boolean) => {
    const next = { ...a, [k]: v };
    setA(next);
    onChange?.(next);
  };

  async function save() {
    setTried(true);
    if (Object.keys(checkAddress(a)).length) {
      // land on the first field that needs fixing
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    if (!onSave) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ ...a, phone: cleanPhone(a.phone) });
    } catch {
      setError("We could not save that address. Check your connection and try again.");
    }
    setBusy(false);
  }

  const text = (k: Field, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => (
    <label className={wide ? "sm:col-span-2" : undefined}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input
        className="field"
        name={k}
        value={String(a[k])}
        onChange={(e) => set(k, e.target.value)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `${k}-error` : undefined}
        {...props}
      />
      {errors[k] && (
        <span id={`${k}-error`} className="mt-1.5 block text-sm text-red-soft">
          {errors[k]}
        </span>
      )}
    </label>
  );

  const body = (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {text("recipient_name", "Full name", { autoComplete: "name" }, true)}
        {text("phone", "Mobile number", { type: "tel", inputMode: "tel", autoComplete: "tel" }, true)}
        {text("line1", "House, building and street", { autoComplete: "address-line1" }, true)}
        {text("line2", "Area or locality (optional)", { autoComplete: "address-line2" }, true)}
        {text("landmark", "Landmark (optional)", { placeholder: "Near…" }, true)}
        {text("pincode", "PIN code", { inputMode: "numeric", autoComplete: "postal-code", maxLength: 6 })}
        {text("city", "City", { autoComplete: "address-level2" })}
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium">State</span>
          <select
            className="field"
            name="state"
            value={a.state}
            onChange={(e) => set("state", e.target.value)}
            autoComplete="address-level1"
            aria-invalid={errors.state ? true : undefined}
            aria-describedby={errors.state ? "state-error" : undefined}
          >
            <option value="" disabled>
              Choose a state
            </option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {errors.state && (
            <span id="state-error" className="mt-1.5 block text-sm text-red-soft">
              {errors.state}
            </span>
          )}
        </label>
        {showDefault && (
          <label className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-rasta-gold)]"
              checked={a.is_default}
              onChange={(e) => set("is_default", e.target.checked)}
            />
            <span>Use this as my default address</span>
          </label>
        )}
      </div>
      {children}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-soft">
          {error}
        </p>
      )}
      {(onSave || onCancel) && (
        <div className="mt-6 flex flex-wrap gap-3">
          {onSave && (
            <button
              type={nested ? "button" : "submit"}
              onClick={nested ? save : undefined}
              className="btn btn-primary disabled:opacity-60"
              disabled={busy}
            >
              {busy ? "Saving" : saveLabel}
            </button>
          )}
          {onCancel && (
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      )}
    </>
  );

  if (nested) return <div>{body}</div>;
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {body}
    </form>
  );
}
