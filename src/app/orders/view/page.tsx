import { Suspense } from "react";
import { MyOrder } from "@/components/MyOrders";

export default function OrderViewPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <Suspense>
        <MyOrder />
      </Suspense>
    </div>
  );
}
