"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MIN_AGE } from "@/lib/config";
import { getSupabase, siteRoot, supabaseConfigured } from "@/lib/supabase";
import NotConnected from "./NotConnected";

const MIN_PASSWORD = 8;

export default function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");

  if (!supabaseConfigured) return <NotConnected />;

  if (sentTo) {
    return (
      <div className="max-w-sm">
        <p className="text-lg">Check your email.</p>
        <p className="mt-2 text-muted">We sent a confirmation link to {sentTo}. Open it, then log in.</p>
        <Link href="/account/login" className="btn btn-primary mt-6">
          Go to log in
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    setBusy(true);
    setError("");
    const { data, error } = await getSupabase()!.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteRoot()}/account/login/`,
        data: {
          full_name: String(form.get("name")).trim(),
          phone: String(form.get("phone")).trim(),
          age_confirmed: form.get("age") === "on",
        },
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // With email confirmation on, an existing address comes back with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setError("An account with this email already exists. Log in instead.");
      setBusy(false);
      return;
    }
    if (data.session) router.push("/account");
    else setSentTo(email);
  }

  return (
    <form onSubmit={submit} className="grid max-w-sm gap-4">
      <label>
        <span className="mb-1.5 block text-sm font-medium">Full name</span>
        <input className="field" name="name" autoComplete="name" required />
      </label>
      <label>
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <input className="field" name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <span className="mb-1.5 block text-sm font-medium">Phone</span>
        <input className="field" name="phone" type="tel" autoComplete="tel" />
      </label>
      <label>
        <span className="mb-1.5 block text-sm font-medium">Password</span>
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
      <label className="flex items-start gap-3 text-sm">
        <input name="age" type="checkbox" className="mt-1 size-4 accent-[var(--color-rasta-gold)]" required />
        <span>I confirm I am {MIN_AGE} or older.</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-rasta-red">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-2 disabled:opacity-60" disabled={busy}>
        {busy ? "Creating account" : "Create account"}
      </button>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/account/login" className="font-medium text-paper underline underline-offset-4">
          Log in
        </Link>
      </p>
    </form>
  );
}
