import { Suspense } from "react";
import { MyOrder } from "@/components/MyOrders";

export default function OrderViewPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Suspense>
        <MyOrder />
      </Suspense>
    </div>
  );
}
