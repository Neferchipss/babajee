import type { Metadata } from "next";
import RequireAdmin, { RoleGate } from "@/components/admin/RequireAdmin";
import { Toaster } from "@/components/admin/Toaster";
import { Suspense } from "react";
import AdminNav from "@/components/admin/AdminNav";
import "@/components/admin/admin.css";

// the admin is never in search results
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-frame">
      <RequireAdmin>
        <div className="adm">
          <div className="adm-side">
            <Suspense>
              <AdminNav />
            </Suspense>
          </div>
          <div className="adm-main">
            <RoleGate>{children}</RoleGate>
          </div>
          <Toaster />
        </div>
      </RequireAdmin>
    </div>
  );
}
