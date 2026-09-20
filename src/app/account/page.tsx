import Link from "next/link";
import PageShell from "@/components/PageShell";

export default function AccountPage() {
  return (
    <PageShell title="Account" sow="Accounts — SOW #2">
      <div className="flex flex-col gap-2">
        <p className="text-neutral-500">Name: Placeholder User</p>
        <p className="text-neutral-500">Email: placeholder@example.com</p>
        <Link href="/orders" className="mt-4 text-sm underline hover:text-neutral-300">
          View my orders
        </Link>
        <div className="mt-6 flex gap-4 text-sm">
          <Link href="/account/login" className="underline hover:text-neutral-300">Log in</Link>
          <Link href="/account/signup" className="underline hover:text-neutral-300">Sign up</Link>
        </div>
      </div>
    </PageShell>
  );
}
