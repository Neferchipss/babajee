"use client";

import { Suspense, useEffect } from "react";
import { useAdminStyle } from "@/lib/admin-style";
import AdminNav from "./AdminNav";
import RequireAdmin, { RoleGate } from "./RequireAdmin";
import { Toaster } from "./Toaster";
import EaseShell from "./shells/EaseShell";
import ShopifyShell from "./shells/ShopifyShell";
import StudioShell from "./shells/StudioShell";
import "./shells/shells.css";

// The admin in the design this person picked (Settings > Admin design,
// lib/admin-style.ts). Current keeps the shop's own header and the section
// tree; the others bring their own frame, so the shop's header and footer
// step aside while they're open.
export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const style = useAdminStyle();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.admShell = style;
    return () => {
      delete root.dataset.admShell;
    };
  }, [style]);

  const page = (
    <RoleGate>
      {children}
    </RoleGate>
  );

  if (style === "current")
    return (
      <div className="adm-frame" data-adm-style="current">
        <RequireAdmin>
          <div className="adm">
            <div className="adm-side">
              <Suspense>
                <AdminNav />
              </Suspense>
            </div>
            <div className="adm-main">{page}</div>
            <Toaster />
          </div>
        </RequireAdmin>
      </div>
    );

  const Shell = style === "shopify" ? ShopifyShell : style === "ease" ? EaseShell : StudioShell;
  return (
    <div className="adm-frame adm-frame--shell" data-adm-style={style}>
      <RequireAdmin>
        <Suspense>
          <Shell>{page}</Shell>
        </Suspense>
        <Toaster />
      </RequireAdmin>
    </div>
  );
}
