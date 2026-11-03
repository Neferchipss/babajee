import { AdminSearch } from "@/components/admin/AdminSearch";
import RequireAdmin from "@/components/admin/RequireAdmin";
import { AdminNav } from "@/components/admin/ui";
import "@/components/admin/admin.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <RequireAdmin>
        <div className="adm">
          <div className="adm-side">
            <AdminSearch />
            <AdminNav />
          </div>
          <div className="adm-main">{children}</div>
        </div>
      </RequireAdmin>
    </div>
  );
}
