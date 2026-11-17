"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdminDemo } from "@/lib/admin-api";
import { useAuth } from "@/lib/auth";
import { canOpen, roleLabel, useStaff } from "@/lib/staff";
import { useSyncExternalStore } from "react";
import TwoStep from "./TwoStep";

// The real gate is row-level security and each admin function's own check
// (0072: the staff role, and two-step sign-in where it's needed). This gives
// a customer, a signed-out visitor, someone who still has to pass two-step
// sign-in, or a role that doesn't include this page, a plain message instead
// of a confusing empty screen.
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth();
  const { me, reload } = useStaff();
  // a developer trying the screens with sample data (?demo=1, never in production)
  const demo = useSyncExternalStore(() => () => {}, isAdminDemo, () => false);

  if (status === "off" && !demo) {
    return <p className="text-muted">Accounts are not connected yet.</p>;
  }
  if (!demo && (status === "loading" || (status === "in" && (profile === null || me === null)))) {
    return <p className="text-muted">Loading.</p>;
  }
  if (!demo && (status === "out" || profile?.role !== "admin" || !me?.role)) {
    return (
      <div>
        <h1 className="text-3xl">Admin</h1>
        <p className="mt-4 text-muted">You need a staff account to see this page.</p>
        <Link href="/account" className="btn btn-primary mt-6">
          Go to your account
        </Link>
      </div>
    );
  }
  // two-step sign-in set up (or required by the shop) but not passed yet
  if (me && !me.active) {
    return (
      <div className="adm-role-note">
        <h1 className="text-3xl">One more step</h1>
        <p className="mt-4 text-muted">{me.enrolled ? "Your account uses two-step sign-in." : "The shop asks all staff to use two-step sign-in."}</p>
        <div className="mt-6">
          <TwoStep mode="gate" onDone={reload} />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

// inside the admin frame: a page the role doesn't include says so, with the
// menu still there
export function RoleGate({ children }: { children: React.ReactNode }) {
  const { me } = useStaff();
  const path = usePathname() ?? "/admin";
  if (me && !canOpen(me.role, path)) {
    return (
      <div className="adm-role-note">
        <h1 className="text-3xl">Not part of your role</h1>
        <p className="mt-4 text-muted">
          You&apos;re signed in as {roleLabel(me.role)}, which doesn&apos;t include this page. An owner or admin can change your role on the Team page.
        </p>
        <Link href="/admin" className="btn btn-primary mt-6">
          Back to the admin home
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
