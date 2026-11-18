// Orders, customers, stock and stats, read and written with the signed-in
// browser session. The database decides what each person may do: customers
// see only their own orders, and every admin call below is refused for
// anyone but role = 'admin' (supabase/migrations/0013_orders_admin.sql).
//
// Split by topic under lib/orders/; everything is still imported from here.
export { errText, type Order, type OrderEvent, type OrderItem, type OrderRequest, type Refund, type RefundItem, type Shipment } from "./orders/core";
export * from "./orders/customer";
export * from "./orders/admin";
export * from "./orders/insights";
export * from "./orders/customers";
export * from "./orders/stock";
