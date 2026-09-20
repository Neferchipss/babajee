import Link from "next/link";
import Page from "@/components/Page";

export default function LoginPage() {
  return (
    <Page narrow title="Log in">
      <form className="grid max-w-sm gap-4">
        <label>
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <input className="field" type="email" autoComplete="email" />
        </label>
        <label>
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input className="field" type="password" autoComplete="current-password" />
        </label>
        <Link href="/account" className="btn btn-primary mt-2">
          Log in
        </Link>
        <p className="text-sm text-muted">
          New here?{" "}
          <Link href="/account/signup" className="font-medium text-paper underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </form>
    </Page>
  );
}
