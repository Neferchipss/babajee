"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import BabaBand from "./baba/BabaBand";
import CartJar from "./CartJar";
import ThemeToggle from "./ThemeToggle";

// Wraps header, page and footer. The shop pages get a theme (chosen with the
// toggle), and so do the cart and checkout; everything else keeps the base look.
export default function SiteFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // the cart and checkout are part of the shop, so they wear its theme too
  const inShop = path === "/shop" || path.startsWith("/shop/") || /^\/(cart|checkout)\/?$/.test(path);
  const scope = inShop ? "shop" : "base";
  return (
    <div id="site" data-scope={scope} className="flex min-h-dvh flex-col">
      {scope === "shop" && <BabaBand />}
      {children}
      {scope === "shop" && <ThemeToggle />}
      <CartJar variant="float" />
    </div>
  );
}
