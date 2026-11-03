// One status per order (supabase/migrations/0013_orders_admin.sql):
// pending > paid > packed > shipped > delivered, or cancelled / refunded.
// Shared by the admin and the customer's own order pages.
export const STATUSES = ["pending", "paid", "packed", "shipped", "delivered", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof STATUSES)[number];

export const STEPS: OrderStatus[] = ["pending", "paid", "packed", "shipped", "delivered"];

// what the admin reads on a pill, and its colour: warm = waiting on the shop
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Unpaid",
  paid: "To pack",
  packed: "To ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
export const STATUS_TONE: Record<OrderStatus, "warn" | "todo" | "info" | "done" | "off"> = {
  pending: "warn",
  paid: "todo",
  packed: "todo",
  shipped: "info",
  delivered: "done",
  cancelled: "off",
  refunded: "off",
};

// what the customer reads
export const CUSTOMER_LABEL: Record<OrderStatus, string> = {
  pending: "Placed",
  paid: "Payment received",
  packed: "Packed",
  shipped: "On its way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

// timeline wording for an event row; "comment" rows are staff notes
export function eventText(status: string, note: string) {
  if (status === "comment") return note;
  const said: Record<string, string> = {
    pending: "Order placed",
    paid: "Marked as paid",
    packed: "Marked as packed",
    shipped: "Marked as shipped",
    delivered: "Marked as delivered",
    cancelled: "Order cancelled",
    refunded: "Order refunded",
    refund: "Refunded",
    return: "Items returned and refunded",
    edited: "Order edited",
    balance: "Balance settled",
    refund_undone: "Refund undone",
  };
  const head = said[status] ?? status;
  return note && note !== head ? `${head} · ${note}` : head;
}

// The status buttons an order shows, most likely first. "ship" asks for
// courier and tracking first. Refund, return and edit are separate buttons on
// the order page (they open their own forms).
export type OrderAction = { to: OrderStatus; label: string; primary?: boolean; danger?: boolean };
export function actionsFor(s: OrderStatus): OrderAction[] {
  switch (s) {
    case "pending":
      return [{ to: "paid", label: "Mark as paid", primary: true }, { to: "cancelled", label: "Cancel order", danger: true }];
    case "paid":
      return [
        { to: "packed", label: "Mark as packed", primary: true },
        { to: "shipped", label: "Mark as shipped" },
        { to: "cancelled", label: "Cancel order", danger: true },
      ];
    case "packed":
      return [
        { to: "shipped", label: "Mark as shipped", primary: true },
        { to: "cancelled", label: "Cancel order", danger: true },
      ];
    case "shipped":
      return [{ to: "delivered", label: "Mark as delivered", primary: true }];
    default:
      return [];
  }
}
