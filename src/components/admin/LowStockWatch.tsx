"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/components/admin/Toaster";
import { lowStock, type LowItem } from "@/lib/orders-db";

// Low-stock alerts while the admin is open (0043): every 2 minutes and on
// coming back to the tab, the low and out-of-stock options are read; any
// that weren't low before raise a toast, and a browser notification when
// they're allowed (Settings › Low stock). onCount feeds the Products badge.
const SEEN = "bj-low-seen";
const EVERY = 120_000;

function seen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function remember(ids: string[]) {
  try {
    localStorage.setItem(SEEN, JSON.stringify(ids));
  } catch {}
}

const line = (i: LowItem) => `${i.product}${i.option && !/^(default|standard)$/i.test(i.option) ? ` · ${i.option}` : ""}: ${i.out ? "out of stock" : `${i.stock} left`}`;

export default function LowStockWatch({ onCount }: { onCount: (n: number) => void }) {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    async function check() {
      let list: LowItem[];
      try {
        list = await lowStock();
      } catch {
        return;
      }
      if (!live) return;
      onCount(list.length);
      const before = seen();
      const key = (i: LowItem) => `${i.variant_id}:${i.out ? "out" : "low"}`;
      remember(list.map(key));
      if (!before) return; // first time in this browser: nothing is "new"
      const fresh = list.filter((i) => !before.has(key(i)));
      if (!fresh.length) return;
      const title = fresh.length === 1 ? (fresh[0].out ? "Out of stock" : "Running low") : `${fresh.length} options running low`;
      const body = fresh.slice(0, 4).map(line).join("\n") + (fresh.length > 4 ? `\n+${fresh.length - 4} more` : "");
      toast(`${title}: ${fresh.slice(0, 2).map(line).join("; ")}${fresh.length > 2 ? "…" : ""}`);
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(`Babajee: ${title}`, { body, tag: "bj-low-stock" });
          n.onclick = () => {
            window.focus();
            router.push("/admin/products?need=low");
          };
        }
      } catch {}
    }
    void check();
    const t = window.setInterval(check, EVERY);
    const back = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", back);
    return () => {
      live = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [onCount, router]);
  return null;
}
