import Link from "next/link";
import PageShell from "@/components/PageShell";
import { PLACEHOLDER_ORDERS } from "@/lib/catalog-data";

export default function OrdersPage() {
  return (
    <PageShell title="Orders" sow="Order Management — SOW #5">
      <div className="flex flex-col gap-3">
        {PLACEHOLDER_ORDERS.map((order) => (
          <Link
            key={order.id}
            href={`/orders/${order.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
          >
            <div>
              <p className="font-medium">Order #{order.id}</p>
              <p className="text-sm text-neutral-500">{order.placedOn} &middot; {order.status}</p>
            </div>
            <p className="text-sm">&#8377;{order.total.toLocaleString("en-IN")}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
