"use client";

import { useState } from "react";
import { ArScreen, ArToolbar, useArKeys } from "./aronium-kit";
import { ArHelp } from "./aronium-help";
import "./aronium-d-kit";

// Online shop • Web analytics (Overview, Traffic, Live view), in Aronium's
// clothes: the screen's toolbar across the top (Refresh, Print, Reporting,
// Help), then the page's own cards drawn as Aronium's dashboard draws its
// own (flat dark panels on a darker ground, light headings, blue rules under
// table heads), with the dashboard's "Periodic Reports ( dates ) 📅" line in
// place of the date chips. Every number, chart and table is the page's own.
type Kind = "overview" | "traffic" | "live";
const HELP: Record<Kind, [string, string[]]> = {
  overview: [
    "Overview",
    [
      "How the shop is doing for the dates in the Periodic Reports line: sales, orders and profit, each compared with the same number of days just before.",
      "The calendar button picks the dates, or a quick period (Today, Last 7 days, This month, All time…). The choice is remembered while this tab is open, here and on Reporting.",
    ],
  ],
  traffic: ["Traffic", ["Who visits, where they come from, what they look at and how far they get towards an order, for the dates in the Periodic Reports line, against the days just before."]],
  live: ["Live view", ["Who is on the shop right now: the page each visitor is on, whether they've added to a cart, and today so far. It refreshes by itself every 15 seconds while the tab is open."]],
};

export default function ArAnalyticsScreen({ kind, children }: { kind: Kind; children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  const [help, setHelp] = useState(false);
  const refresh = () => setTick((t) => t + 1);
  useArKeys({ refresh });
  return (
    <ArScreen className="ard4 ard4-anx">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: refresh },
          { icon: "print", label: "Print", onClick: () => window.print() },
          { icon: "list", label: "Reporting", href: "/admin/analytics/reports" },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <div className="ard4-anx-body" key={tick}>
        {children}
      </div>
      <ArHelp open={help} onClose={() => setHelp(false)} title={HELP[kind][0]}>
        {HELP[kind][1].map((p) => (
          <p key={p}>{p}</p>
        ))}
      </ArHelp>
    </ArScreen>
  );
}
