import Link from "next/link";
import Page from "@/components/Page";
import { MIN_AGE } from "@/lib/config";

export default function SignupPage() {
  return (
    <Page narrow title="Create an account">
      <form className="grid max-w-sm gap-4">
        <label>
          <span className="mb-1.5 block text-sm font-medium">Full name</span>
          <input className="field" autoComplete="name" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input className="field" type="email" autoComplete="email" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Phone</span>
          <input className="field" type="tel" autoComplete="tel" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input className="field" type="password" autoComplete="new-password" />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--color-rasta-gold)]" />
          <span>I confirm I am {MIN_AGE} or older.</span>
        </label>
        <Link href="/account" className="btn btn-primary mt-2">
          Create account
        </Link>
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link href="/account/login" className="font-medium text-paper underline underline-offset-4">
            Log in
          </Link>
        </p>
      </form>
    </Page>
  );
}
