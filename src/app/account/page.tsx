import Page from "@/components/Page";
import AccountPanel from "@/components/auth/AccountPanel";

export default function AccountPage() {
  return (
    <Page narrow title="Your account" lede="Log in to place orders and follow them from payment to delivery.">
      <AccountPanel />
    </Page>
  );
}
