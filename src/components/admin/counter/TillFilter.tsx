"use client";

import { useEffect, useState } from "react";
import { cashiers } from "@/lib/counter";
import { CHANNEL_KINDS, setTillFilter, useTillFilter } from "@/lib/counter-report";
import type { TillReportKind } from "@/lib/counter";

// Reporting's Channel and Cashier filter for the till's reports (0086). In
// the Aronium design these are the filter panel's User and a Channel box; in
// Legacy they sit under the dates. `kind` greys Channel for reports that
// aren't about sales (the drawer, voids, credit).
export default function TillFilter({ kind, aronium }: { kind: TillReportKind | null; aronium?: boolean }) {
  const f = useTillFilter();
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    cashiers().then(setPeople, () => setPeople([]));
  }, []);
  const channelOn = !kind || CHANNEL_KINDS.includes(kind);
  const user = (
    <label key="user" className={aronium ? "" : "adm-label"}>
      <span>{aronium ? "User" : "Cashier (who made it)"}</span>
      <select className="adm-input" value={f.cashier ?? ""} onChange={(e) => setTillFilter({ cashier: e.target.value || null })}>
        <option value="">All</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const channel = (
    <label key="channel" className={aronium ? "" : "adm-label"}>
      <span>Channel</span>
      <select className="adm-input" value={f.channel} disabled={!channelOn} onChange={(e) => setTillFilter({ channel: e.target.value as "all" | "online" | "counter" })}>
        <option value="all">All</option>
        <option value="online">Online</option>
        <option value="counter">Counter (till)</option>
      </select>
    </label>
  );
  if (aronium) return [user, channel];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {channel}
      {user}
    </div>
  );
}
