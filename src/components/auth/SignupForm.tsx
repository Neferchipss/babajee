"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ageOf, readDob } from "@/lib/age";
import { MIN_AGE } from "@/lib/config";
import { getSupabase, siteRoot, supabaseConfigured } from "@/lib/supabase";
import NotConnected from "./NotConnected";

const MIN_PASSWORD = 8;

export default function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState("");
  // date of birth as three boxes (day, month, year): quicker than a
  // calendar that opens on today, and each box moves on to the next
  const monthBox = useRef<HTMLInputElement>(null);
  const yearBox = useRef<HTMLInputElement>(null);

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
    const born = readDob(String(form.get("dob_d")), String(form.get("dob_m")), String(form.get("dob_y")));
    if ("error" in born) {
      setError(born.error);
      return;
    }
    if ((ageOf(born.dob) ?? 0) < MIN_AGE) {
      setError(`Babajee is for adults only: you must be ${MIN_AGE} or older to create an account.`);
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
          date_of_birth: born.dob,
        },
      },
    });
    if (error) {
      // the database's own check (18+, a real date) refuses with a general message
      setError(/database error/i.test(error.message) ? "We couldn't create the account with that date of birth. Check it and try again." : error.message);
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
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">Date of birth</legend>
        <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2">
          <input
            className="field text-center"
            name="dob_d"
            inputMode="numeric"
            autoComplete="bday-day"
            placeholder="DD"
            maxLength={2}
            aria-label="Day"
            required
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, "");
              if (e.target.value.length === 2) monthBox.current?.focus();
            }}
          />
          <input
            ref={monthBox}
            className="field text-center"
            name="dob_m"
            inputMode="numeric"
            autoComplete="bday-month"
            placeholder="MM"
            maxLength={2}
            aria-label="Month"
            required
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, "");
              if (e.target.value.length === 2) yearBox.current?.focus();
            }}
          />
          <input
            ref={yearBox}
            className="field text-center"
            name="dob_y"
            inputMode="numeric"
            autoComplete="bday-year"
            placeholder="YYYY"
            maxLength={4}
            aria-label="Year"
            required
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, "");
            }}
          />
        </div>
        <span className="mt-1.5 block text-xs text-muted">You must be {MIN_AGE} or older. It can&apos;t be changed later.</span>
      </fieldset>
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
