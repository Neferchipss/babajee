import Link from "next/link";
import PageShell from "@/components/PageShell";

export default function SignupPage() {
  return (
    <PageShell title="Sign up" sow="Accounts — SOW #2 + Age Verification — SOW #3">
      <form className="flex max-w-sm flex-col gap-4">
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Full name" />
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Email" />
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Password" type="password" />
        <input className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm" placeholder="Date of birth" />
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          <input type="checkbox" />
          I confirm I am 21 years or older
        </label>
        <Link href="/account" className="rounded-full bg-white px-6 py-3 text-center text-sm font-medium text-black">
          Create account
        </Link>
        <p className="text-sm text-neutral-500">
          Already have an account? <Link href="/account/login" className="underline hover:text-neutral-300">Log in</Link>
        </p>
      </form>
    </PageShell>
  );
}
