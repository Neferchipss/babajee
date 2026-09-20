import Link from "next/link";
import Page from "@/components/Page";
import Price from "@/components/Price";
import { PLACEHOLDER_ORDERS } from "@/lib/catalog-data";

export default function OrdersPage() {
  return (
    <Page title="Your orders">
      <ul className="divide-y divide-line border-y border-line">
        {PLACEHOLDER_ORDERS.map((order) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-4 py-5 hover:text-rasta-gold"
            >
              <span>
                <span className="block text-lg font-medium">Order {order.id}</span>
                <span className="text-sm text-muted">
                  Placed {order.placedOn}. {order.status}.
                </span>
              </span>
              <Price className="font-medium" />
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
