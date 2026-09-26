"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import NotConnected from "./NotConnected";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!supabaseConfigured) return <NotConnected />;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const { error } = await getSupabase()!.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) {
      setError(
        error.message === "Email not confirmed"
          ? "Confirm your email first. We sent you a link when you signed up."
          : "That email and password do not match.",
      );
      setBusy(false);
      return;
    }
    router.push("/account");
  }

  return (
    <form onSubmit={submit} className="grid max-w-sm gap-4">
      <label>
        <span className="mb-1.5 block text-sm font-medium">Email</span>
        <input className="field" name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <span className="mb-1.5 block text-sm font-medium">Password</span>
        <input className="field" name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && (
        <p role="alert" className="text-sm text-rasta-red">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary mt-2 disabled:opacity-60" disabled={busy}>
        {busy ? "Logging in" : "Log in"}
      </button>
      <p className="text-sm text-muted">
        <Link href="/account/reset" className="font-medium text-paper underline underline-offset-4">
          Forgot your password?
        </Link>
      </p>
      <p className="text-sm text-muted">
        New here?{" "}
        <Link href="/account/signup" className="font-medium text-paper underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </form>
  );
}
