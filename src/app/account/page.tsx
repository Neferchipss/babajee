import Link from "next/link";
import Page from "@/components/Page";

export default function AccountPage() {
  return (
    <Page
      narrow
      title="Your account"
      lede="Log in to place orders and follow them from payment to delivery."
    >
      <div className="flex flex-wrap gap-4">
        <Link href="/account/login" className="btn btn-primary">
          Log in
        </Link>
        <Link href="/account/signup" className="btn btn-ghost">
          Create an account
        </Link>
      </div>
      <p className="mt-10 text-muted">
        Already ordered?{" "}
        <Link href="/orders" className="font-medium text-paper underline underline-offset-4">
          See your orders
        </Link>
      </p>
    </Page>
  );
}
