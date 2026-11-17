"use client";

import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { errText } from "@/lib/orders-db";
import { checkTwoStep, removeTwoStep, startTwoStep, twoStepFactors } from "@/lib/staff";

// Two-step sign-in with an authenticator app (Google Authenticator, Authy,
// 1Password...): set it up with a QR code, then a 6-digit code at each
// sign-in. "gate": the check before the admin opens; "manage": on the Team
// page, to set it up or take it off.
export default function TwoStep({ mode, onDone }: { mode: "gate" | "manage"; onDone?: () => void }) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[] | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => twoStepFactors().then(setFactors, (e) => setErr(errText(e)));
  useEffect(() => {
    void load();
  }, []);

  async function begin() {
    setBusy(true);
    setErr("");
    try {
      setSetup(await startTwoStep());
    } catch (e) {
      setErr(errText(e));
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const id = setup?.factorId ?? factors?.[0]?.id;
    if (!id || code.replace(/\D/g, "").length !== 6) return;
    setBusy(true);
    setErr("");
    try {
      await checkTwoStep(id, code);
      setCode("");
      setSetup(null);
      await load();
      toast(setup ? "Two-step sign-in is on" : "Checked");
      onDone?.();
    } catch {
      setErr("That code didn't match. Codes change every 30 seconds: try the one showing now.");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await removeTwoStep(id);
      await load();
      toast("Two-step sign-in is off for your account");
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }

  const has = (factors?.length ?? 0) > 0;
  const codeForm = (label: string) => (
    <form onSubmit={verify} className="tws-code">
      <label className="adm-label">
        {label}
        <input
          className="adm-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
          placeholder="123 456"
          autoFocus
        />
      </label>
      <button className="adm-btn pri" disabled={busy || code.replace(/\D/g, "").length !== 6}>
        {busy ? "Checking" : "Check code"}
      </button>
    </form>
  );

  return (
    <section className="adm-card tws">
      <h2>Two-step sign-in</h2>
      {err && <p className="adm-err">{err}</p>}
      {factors === null ? (
        <p className="adm-muted adm-small">Loading.</p>
      ) : setup ? (
        <>
          <p className="adm-small">
            Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or 1Password), then type the 6-digit code it shows.
          </p>
          {/* the QR code is an SVG made by Supabase Auth */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tws-qr" src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} />
          <p className="adm-muted adm-small">
            Can&apos;t scan? Type this key into the app instead: <code className="tws-secret">{setup.secret}</code>
          </p>
          {codeForm("Code from the app")}
        </>
      ) : mode === "gate" && has ? (
        <>
          <p className="adm-small">Open your authenticator app and type the 6-digit code for Babajee.</p>
          {codeForm("Code")}
        </>
      ) : has ? (
        <>
          <p className="adm-small">On for your account. Each sign-in to the admin asks for a code from your app.</p>
          {factors.map((f) => (
            <button key={f.id} type="button" className="adm-btn" disabled={busy} onClick={() => remove(f.id)}>
              Turn off ({f.friendly_name || "authenticator"})
            </button>
          ))}
        </>
      ) : (
        <>
          <p className="adm-small">
            {mode === "gate"
              ? "The shop asks every staff account for a second step at sign-in. Set it up once with an authenticator app on your phone: it takes a minute."
              : "Off for your account. With it on, signing in to the admin also needs a 6-digit code from an app on your phone, so a stolen password alone isn't enough."}
          </p>
          <button type="button" className="adm-btn pri" disabled={busy} onClick={begin}>
            Set up two-step sign-in
          </button>
        </>
      )}
    </section>
  );
}
