import Link from "next/link";
import { notFound } from "next/navigation";
import PageShell from "@/components/PageShell";
import { PLACEHOLDER_ORDERS } from "@/lib/catalog-data";

export default async function OrderDetailPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const order = PLACEHOLDER_ORDERS.find((o) => o.id === id) ?? {
    id,
    placedOn: "2026-09-15",
    status: "Payment submitted",
    total: 0,
  };
  if (!order) notFound();

  const STEPS = ["Placed", "Payment submitted", "Confirmed", "Shipped"];
  const currentStep = STEPS.indexOf(order.status);

  return (
    <PageShell title={`Order #${order.id}`} sow="Order Management — SOW #5">
      <p className="text-neutral-500">Placed on {order.placedOn}</p>

      <div className="mt-6 flex gap-2">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className={`flex-1 rounded-full px-3 py-2 text-center text-xs ${
              i <= currentStep ? "bg-white text-black" : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {step}
          </div>
        ))}
      </div>

      <p className="mt-6 text-lg font-semibold">
        Total: &#8377;{order.total.toLocaleString("en-IN")}
      </p>

      <p className="mt-2 text-sm text-neutral-500">
        Confirmation email placeholder sent on status change.
      </p>

      <Link href="/orders" className="mt-6 inline-block text-sm text-neutral-500 hover:text-neutral-300">
        &larr; Back to orders
      </Link>
    </PageShell>
  );
}
