"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { watchSystemMode } from "@/lib/mode";
import BabaBand from "./baba/BabaBand";
import CartBar from "./CartBar";
import StoreButton from "./StoreButton";
import ThemeToggle from "./ThemeToggle";

// Wraps header, page and footer. Every page wears the shop's theme (its light and
// dark, its type and colours): the shelves, the cart and checkout, and the pages
// around them (account, orders, about, support, contact, the legal pages, admin).
// Only the landing (its own 3D scene) and the design tools (/pitch, /styles) keep
// the base look.
export default function SiteFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const inShop = path !== "/" && !/^\/(pitch|styles)(\/|$)/.test(path);
  const scope = inShop ? "shop" : "base";
  // light or dark follows the system while that is the choice
  useEffect(() => watchSystemMode(), []);
  return (
    <div id="site" data-scope={scope} className="flex min-h-dvh flex-col">
      {scope === "shop" && <BabaBand />}
      {children}
      {scope === "shop" && <ThemeToggle />}
      <StoreButton />
      <CartBar />
    </div>
  );
}
