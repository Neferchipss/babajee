"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

// The real gate is row-level security (only role = 'admin' can read a hidden
// row or write anything). This just gives a customer or a signed-out visitor
// a plain message instead of a confusing empty admin screen.
export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth();

  if (status === "off") {
    return <p className="text-muted">Accounts are not connected yet.</p>;
  }
  if (status === "loading" || (status === "in" && profile === null)) {
    return <p className="text-muted">Loading.</p>;
  }
  if (status === "out" || profile?.role !== "admin") {
    return (
      <div>
        <h1 className="text-3xl">Admin</h1>
        <p className="mt-4 text-muted">You need an admin account to see this page.</p>
        <Link href="/account" className="btn btn-primary mt-6">
          Go to your account
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
