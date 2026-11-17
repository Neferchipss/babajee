import type { Metadata } from "next";
import AdminFrame from "@/components/admin/AdminFrame";
import "@/components/admin/admin.css";

// the admin is never in search results
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

// The admin, in the design each person picked (Settings > Admin design):
// AdminFrame draws the frame, the menu and the gate for staff only.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
