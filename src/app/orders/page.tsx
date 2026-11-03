import Page from "@/components/Page";
import { MyOrderList } from "@/components/MyOrders";

export default function OrdersPage() {
  return (
    <Page title="Your orders">
      <MyOrderList />
    </Page>
  );
}
