import CartView from "@/components/CartView";
import Page from "@/components/Page";
import SavedList from "@/components/SavedList";

export default function CartPage() {
  return (
    <Page title="Your cart">
      <CartView />
      <SavedList />
    </Page>
  );
}
