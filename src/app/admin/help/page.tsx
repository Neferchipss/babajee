"use client";

import { Suspense } from "react";
import Guide from "@/components/admin/help/Guide";
import LegacyGuide from "@/components/admin/help/LegacyGuide";
import { useAdminStyle } from "@/lib/admin-style";

// Documentation: each admin theme has its own guide. Aronium-style's opens
// from the ? in its title bar and Documentation in its menu; Legacy's from
// Documentation at the foot of its section tree. Both take ?a=<section> and
// ?from=<admin address>.
export default function HelpPage() {
  const style = useAdminStyle();
  return <Suspense>{style === "aronium" ? <Guide /> : <LegacyGuide />}</Suspense>;
}
