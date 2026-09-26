"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase, siteRoot, supabaseConfigured } from "@/lib/supabase";
import NotConnected from "./NotConnected";

const MIN_PASSWORD = 8;

// One page, two steps: ask for the email, then (from the link in that email)
// choose a new password.
export default function ResetForm() {
  const { recovery } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "sent" | "changed">("");

  if (!supabaseConfigured) return <NotConnected />;

  if (done === "sent") {
    return (
      <p className="max-w-sm text-muted">
        If there is an account for that email, we have sent a link to choose a new password.
      </p>
    );
  }
  if (done === "changed") {
    return (
      <div className="max-w-sm">
        <p className="text-lg">Password changed.</p>
        <Link href="/account" className="btn btn-primary mt-6">
          Go to your account
        </Link>
      </div>
    );
  }

  async function requestLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setBusy(true);
    setError("");
    const { error } = await getSupabase()!.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteRoot()}/account/reset/`,
    });
    setBusy(false);
    if (error) setError("We could not send that just now. Try again in a minute.");
    else setDone("sent");
  }

  async function choosePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await getSupabase()!.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else setDone("changed");
  }

  if (recovery) {
    return (
      <form onSubmit={choosePassword} className="grid max-w-sm gap-4">
        <label>
          <span className="mb-1.5 block text-sm font-medium">New password</span>
          <input
            className="field"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
          <span className="mt-1.5 block text-xs text-muted">At least {MIN_PASSWORD} characters.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm text-rasta-red">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary mt-2 disabled:opacity-60" disabled={busy}>
          {busy ? "Saving" : "Save new password"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={requestLink} className="grid max-w-sm gap-4">
      <label>
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <input className="field" name="email" type="email" autoComplete="email" required />
      </label>
      {error && (
        <p role="alert" className="text-sm text-rasta-red">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-2 disabled:opacity-60" disabled={busy}>
        {busy ? "Sending" : "Send reset link"}
      </button>
      <p className="text-sm text-muted">
        <Link href="/account/login" className="font-medium text-paper underline underline-offset-4">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
