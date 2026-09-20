"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";

// Wraps header, page and footer. The shop pages get a theme (chosen with the
// toggle); everything else keeps the base look.
export default function SiteFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const scope = path === "/shop" || path.startsWith("/shop/") ? "shop" : "base";
  return (
    <div id="site" data-scope={scope} className="flex min-h-dvh flex-col">
      {children}
      {scope === "shop" && <ThemeToggle />}
    </div>
  );
}
