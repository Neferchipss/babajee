import { notFound } from "next/navigation";
import Page from "@/components/Page";
import Price from "@/components/Price";
import { PLACEHOLDER_ORDERS } from "@/lib/catalog-data";

export const dynamicParams = false;

export function generateStaticParams() {
  return PLACEHOLDER_ORDERS.map((o) => ({ id: o.id }));
}

const STAGES = ["Placed", "Payment submitted", "Confirmed", "Shipped"];

const MESSAGES: Record<string, string> = {
  "Payment submitted": "We've received your transfer details and will check the payment shortly.",
  Confirmed: "Your payment is verified. We're getting your order ready.",
};

export default async function OrderDetailPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const order = PLACEHOLDER_ORDERS.find((o) => o.id === id);
  if (!order) notFound();

  const current = Math.max(0, STAGES.indexOf(order.status));

  return (
    <Page
      title={`Order ${order.id}`}
      lede={`Placed ${order.placedOn}`}
      back={{ href: "/orders", label: "All orders" }}
    >
      <ol className="grid gap-4 sm:grid-cols-4" aria-label="Order progress">
        {STAGES.map((stage, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={stage} aria-current={now ? "step" : undefined}>
              <span
                className={`block h-[3px] rounded-full ${
                  done ? "bg-rasta-green" : now ? "bg-rasta-gold" : "bg-line"
                }`}
                aria-hidden="true"
              />
              <span className={`mt-2 block font-medium ${now ? "text-rasta-gold" : ""}`}>
                {stage}
              </span>
              <span className="text-sm text-muted">
                {done ? "Done" : now ? "Current step" : "Not yet"}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 max-w-[60ch] text-lg">
        {MESSAGES[order.status] ?? "Your order is on its way."}
      </p>

      <div className="mt-8 flex max-w-sm justify-between border-t border-line pt-4 text-lg font-semibold">
        <span>Total</span>
        <Price />
      </div>
    </Page>
  );
}
