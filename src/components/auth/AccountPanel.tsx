"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import NotConnected from "./NotConnected";

export default function AccountPanel() {
  const { status, user, profile, refreshProfile, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  if (status === "off") return <NotConnected />;
  if (status === "loading") return <p className="text-muted">Loading your account.</p>;

  if (status === "out" || !user) {
    return (
      <>
        <div className="flex flex-wrap gap-4">
          <Link href="/account/login" className="btn btn-primary">
            Log in
          </Link>
          <Link href="/account/signup" className="btn btn-ghost">
            Create an account
          </Link>
        </div>
        <p className="mt-10 text-muted">
          Already ordered?{" "}
          <Link href="/orders" className="font-medium text-paper underline underline-offset-4">
            See your orders
          </Link>
        </p>
      </>
    );
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    setNote("");
    const { error } = await getSupabase()!
      .from("profiles")
      .update({ full_name: String(form.get("name")).trim(), phone: String(form.get("phone")).trim() })
      .eq("id", user!.id);
    setSaving(false);
    if (error) {
      setNote("We could not save that. Try again.");
      return;
    }
    await refreshProfile();
    setNote("Saved.");
  }

  return (
    <div className="grid max-w-sm gap-8">
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted">Email</dt>
        <dd className="text-base">{user.email}</dd>
        {profile?.age_verified_at && (
          <>
            <dt className="mt-3 text-muted">Age</dt>
            <dd className="text-base">Confirmed 18 or older</dd>
          </>
        )}
      </dl>

      <form onSubmit={save} className="grid gap-4" key={`${profile?.full_name}|${profile?.phone}`}>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Full name</span>
          <input className="field" name="name" defaultValue={profile?.full_name ?? ""} autoComplete="name" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Phone</span>
          <input className="field" name="phone" type="tel" defaultValue={profile?.phone ?? ""} autoComplete="tel" />
        </label>
        <div className="flex items-center gap-4">
          <button type="submit" className="btn btn-primary disabled:opacity-60" disabled={saving}>
            {saving ? "Saving" : "Save changes"}
          </button>
          {note && (
            <p role="status" className="text-sm text-muted">
              {note}
            </p>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6 text-sm">
        <Link href="/orders" className="font-medium text-paper underline underline-offset-4">
          Your orders
        </Link>
        {profile?.role === "admin" && (
          <Link href="/admin" className="font-medium text-paper underline underline-offset-4">
            Admin
          </Link>
        )}
        <button type="button" onClick={signOut} className="text-muted underline underline-offset-4 hover:text-paper">
          Log out
        </button>
      </div>
    </div>
  );
}
