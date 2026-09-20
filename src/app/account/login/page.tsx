import Link from "next/link";
import PageShell from "@/components/PageShell";

export default function LoginPage() {
  return (
    <PageShell title="Log in" sow="Accounts — SOW #2">
      <form className="flex max-w-sm flex-col gap-4">
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Email" />
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Password" type="password" />
        <Link href="/account" className="rounded-full bg-white px-6 py-3 text-center text-sm font-medium text-black">
          Log in
        </Link>
        <p className="text-sm text-neutral-500">
          No account? <Link href="/account/signup" className="underline hover:text-neutral-300">Sign up</Link>
        </p>
      </form>
    </PageShell>
  );
}
