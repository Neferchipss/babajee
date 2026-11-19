"use client";

import Link from "next/link";
import { useState } from "react";
import { type Profile, useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import AddressBook from "../address/AddressBook";
import NotConnected from "./NotConnected";
import { dobLabel } from "@/lib/age";

// Buying for yourself or a business: a business gives its name and GSTIN,
// which then go on its GST invoices (0066)
function BuyingAs({ profile }: { profile: Profile | null }) {
  const [business, setBusiness] = useState(profile?.customer_type === "business");
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1.5 text-sm font-medium">Buying as</legend>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name="type" value="individual" checked={!business} onChange={() => setBusiness(false)} /> An individual
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="type" value="business" checked={business} onChange={() => setBusiness(true)} /> A business
        </label>
      </div>
      {business && (
        <>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Business name</span>
            <input className="field" name="business" defaultValue={profile?.business_name ?? ""} autoComplete="organization" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">GSTIN</span>
            <input className="field uppercase" name="gstin" defaultValue={profile?.gstin ?? ""} maxLength={15} placeholder="27ABCDE1234F1Z5" />
            <span className="mt-1 block text-xs text-muted">Goes on your GST invoices, so you can claim the GST.</span>
          </label>
        </>
      )}
    </fieldset>
  );
}

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
          <Link href="/orders" className="link link-strong">
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
    const business = form.get("type") === "business";
    const gstin = String(form.get("gstin") ?? "").trim().toUpperCase();
    if (business && gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      setSaving(false);
      setNote("That GSTIN doesn't look right: 15 characters, like 27ABCDE1234F1Z5.");
      return;
    }
    // first and last name make the full name (0066)
    const { error } = await getSupabase()!
      .from("profiles")
      .update({
        first_name: String(form.get("first")).trim(),
        last_name: String(form.get("last")).trim(),
        phone: String(form.get("phone")).trim(),
        gender: String(form.get("gender") ?? ""),
        customer_type: business ? "business" : "individual",
        business_name: business ? String(form.get("business") ?? "").trim() : "",
        gstin: business ? gstin : "",
      })
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
    <div className="grid max-w-xl gap-8">
      <dl className="grid gap-1 text-sm">
        <dt className="text-muted">Email</dt>
        <dd className="text-base">{user.email}</dd>
        {profile?.date_of_birth ? (
          <>
            <dt className="mt-3 text-muted">Date of birth</dt>
            <dd className="text-base">{dobLabel(profile.date_of_birth)}</dd>
          </>
        ) : profile?.age_verified_at && (
          <>
            <dt className="mt-3 text-muted">Age</dt>
            <dd className="text-base">Confirmed 18 or older</dd>
          </>
        )}
      </dl>

      {profile?.status === "blocked" && (
        <p role="alert" className="rounded-lg border border-line p-3 text-sm">
          This account can&apos;t place orders right now. Please contact us.
        </p>
      )}
      <form onSubmit={save} className="grid max-w-sm gap-4" key={`${profile?.full_name}|${profile?.phone}|${profile?.customer_type}|${profile?.gstin}`}>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1.5 block text-sm font-medium">First name</span>
            <input className="field" name="first" defaultValue={profile?.first_name ?? ""} autoComplete="given-name" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Last name</span>
            <input className="field" name="last" defaultValue={profile?.last_name ?? ""} autoComplete="family-name" />
          </label>
        </div>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Gender <span className="font-normal text-muted">(optional)</span></span>
          <select className="field" name="gender" defaultValue={profile?.gender ?? ""}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>
        <BuyingAs profile={profile} />
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

      <AddressBook />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6 text-sm">
        <Link href="/orders" className="link link-strong">
          Your orders
        </Link>
        {profile?.role === "admin" && (
          <Link href="/admin" className="link link-strong">
            Admin
          </Link>
        )}
        <button type="button" onClick={signOut} className="link link-muted">
          Log out
        </button>
      </div>
    </div>
  );
}
