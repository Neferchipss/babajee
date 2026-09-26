import Link from "next/link";
import RequireAdmin from "@/components/admin/RequireAdmin";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <RequireAdmin>
        <nav className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-4 text-sm">
          <Link href="/admin" className="font-medium hover:text-rasta-gold">
            Dashboard
          </Link>
          <Link href="/admin/categories" className="font-medium hover:text-rasta-gold">
            Categories
          </Link>
          <Link href="/admin/products" className="font-medium hover:text-rasta-gold">
            Products
          </Link>
          <Link href="/shop" className="ml-auto text-muted hover:text-paper">
            View site
          </Link>
        </nav>
        {children}
      </RequireAdmin>
    </div>
  );
}
