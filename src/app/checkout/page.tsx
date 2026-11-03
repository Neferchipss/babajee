import Page from "@/components/Page";
import { CheckoutItems } from "@/components/CartView";
import CheckoutForm from "@/components/CheckoutForm";

export default function CheckoutPage() {
  return (
    <Page title="Checkout">
      <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:items-start">
        <CheckoutForm />
        <CheckoutItems />
      </div>
    </Page>
  );
}
