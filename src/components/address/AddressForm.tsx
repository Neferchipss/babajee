"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { checkAddress, cleanPhone, LABELS, STATES, withPlace, type AddressInput, type Pin, type Place } from "@/lib/addresses";

// The map (and Leaflet with it) loads only when someone opens it.
const MapPin = dynamic(() => import("./MapPin"), { ssr: false });

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
  // Open the map straight away (a new address with no pin yet).
  startWithMap?: boolean;
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
  startWithMap = false,
  children,
}: Props) {
  const [a, setA] = useState(initial);
  const [mapOpen, setMapOpen] = useState(startWithMap && initial.latitude === null);
  const [area, setArea] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = tried ? checkAddress(a) : {};

  const update = (next: AddressInput) => {
    setA(next);
    onChange?.(next);
  };
  const set = (k: Field, v: string | boolean) => update({ ...a, [k]: v });

  const pinned = (pin: Pin, place: Place | null) => {
    setMapOpen(false);
    setArea(place?.area ?? "");
    update(withPlace(a, pin, place));
  };
  const hasPin = a.latitude !== null && a.longitude !== null;

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
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-char/60 p-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${hasPin ? "text-rasta-gold" : "text-muted"}`} aria-hidden="true">
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.3" />
        </svg>
        <span className="min-w-0 flex-1 text-sm">
          {hasPin ? (
            <>
              <span className="block font-medium">Pinned on the map</span>
              <span className="block truncate text-muted">{area || [a.line2, a.city].filter(Boolean).join(", ") || "Location saved"}</span>
            </>
          ) : (
            <>
              <span className="block font-medium">Pin it on the map</span>
              <span className="block text-muted">So the rider finds your door. Fills in city and PIN too.</span>
            </>
          )}
        </span>
        <button type="button" className="btn btn-ghost min-h-11 shrink-0 px-4 py-2 text-sm" onClick={() => setMapOpen(true)}>
          {hasPin ? "Change" : "Open map"}
        </button>
      </div>
      {mapOpen && (
        <MapPin
          start={hasPin ? { lat: a.latitude!, lng: a.longitude! } : null}
          onConfirm={pinned}
          onClose={() => setMapOpen(false)}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("line1", "Flat, house no., floor, building", { autoComplete: "address-line1" }, true)}
        {text("line2", "Area, street, locality (optional)", { autoComplete: "address-line2" }, true)}
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
        {text("recipient_name", "Receiver's name", { autoComplete: "name" })}
        {text("phone", "Receiver's mobile", { type: "tel", inputMode: "tel", autoComplete: "tel" })}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-sm font-medium">Save as</legend>
          <div className="flex flex-wrap gap-2">
            {LABELS.map((l) => (
              <label
                key={l}
                className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-rasta-gold ${
                  a.label === l ? "border-rasta-gold bg-rasta-gold text-ink" : "border-[#3a3a3a] hover:border-paper"
                }`}
              >
                <input type="radio" name="label" value={l} className="sr-only" checked={a.label === l} onChange={() => set("label", l)} />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
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
