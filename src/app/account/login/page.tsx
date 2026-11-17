import { Suspense } from "react";
import Onboard from "@/components/auth/Onboard";

// Log in or sign up: one flow, an emailed code (0058)
export default function LoginPage() {
  return (
    <Suspense>
      <Onboard />
    </Suspense>
  );
}
