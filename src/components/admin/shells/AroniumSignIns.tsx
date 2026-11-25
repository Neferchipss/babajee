"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { deviceOf, loginEvents, type LoginEvent } from "@/lib/logins";
import { ArEmpty, ArGrid, ArScreen, ArToolbar, menuOf, useArKeys, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArHelp } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Customers & suppliers • Sign-ins: Aronium's grid of every
// sign-in to the shop and every failed attempt, newest first (kept 180
// days), with the All / Failed tabs as Aronium's inner tabs. Five or more
// failures on one email in the last day show as a red banner over the grid:
// someone guessing a password, or a customer who forgot theirs.
type Tab = "all" | "failed";

export default function AroniumSignIns() {
  const router = useRouter();
  const [rows, setRows] = useState<LoginEvent[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const load = () =>
    loginEvents({ limit: 500 }).then(
      (r) => {
        setRows(r);
        setLoadedAt(Date.now());
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);
  useArKeys({ refresh: () => void load() });

  const failed = useMemo(() => (rows ?? []).filter((r) => !r.ok), [rows]);
  // emails with 5 or more failures in the last day
  const hot = useMemo(() => {
    const day = loadedAt - 864e5;
    const n = new Map<string, number>();
    for (const r of failed) if (new Date(r.at).getTime() > day) n.set(r.email, (n.get(r.email) ?? 0) + 1);
    return [...n].filter(([, c]) => c >= 5).sort((a, b) => b[1] - a[1]);
  }, [failed, loadedAt]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tab === "failed" ? failed : (rows ?? [])).filter((r) => !s || `${r.email} ${r.name ?? ""} ${r.ip ?? ""}`.toLowerCase().includes(s));
  }, [tab, failed, rows, q]);
  const picked = shown.find((r) => String(r.id) === sel) ?? null;
  const open = (r: LoginEvent | null) => r?.profile_id && router.push(`/admin/customers/view?id=${r.profile_id}`);

  const menu = (r: LoginEvent | null): ArMenuItem[] => menuOf([{ label: "Open customer", disabled: !r?.profile_id, onClick: () => open(r) }], [{ label: "Refresh", key: "F5", onClick: () => void load() }]);
  const cols: ArCol<LoginEvent>[] = [
    { k: "at", label: "Date", render: (r) => when(r.at), sort: (r) => r.at },
    {
      k: "who",
      label: "Name",
      render: (r) => (r.profile_id ? <Link href={`/admin/customers/view?id=${r.profile_id}`}>{r.name || r.email}</Link> : <span className="arc-grey">No account</span>),
      sort: (r) => r.name || r.email,
    },
    { k: "email", label: "Email", render: (r) => r.email, sort: (r) => r.email },
    { k: "res", label: "Result", render: (r) => (r.ok ? <span className="arc-pos">Signed in</span> : <span className="arc-neg">{r.reason || "Failed"}</span>), sort: (r) => (r.ok ? 1 : 0) },
    { k: "dev", label: "Device", render: (r) => deviceOf(r.user_agent) },
    { k: "ip", label: "Network", render: (r) => r.ip || "–" },
  ];

  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "open", label: "Open customer", disabled: !picked?.profile_id, onClick: () => open(picked) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <div className="ars-innertabs" role="tablist" aria-label="Which sign-ins">
        {(
          [
            ["all", `All (${rows?.length ?? 0})`],
            ["failed", `Failed (${failed.length})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {hot.length > 0 && (
        <div className="arc-alert" role="alert">
          <div>
            <b>Many failed attempts in the last day: </b>
            {hot.map(([e, c]) => `${e} (${c})`).join(", ")}. A customer who forgot their password, or someone guessing it.
          </div>
        </div>
      )}
      <div className="arp-search ars-cs-search">
        <input type="search" placeholder="Search name, email or network" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sign-ins" />
        <span className="arp-count">
          Count: <b>{rows ? shown.length : "…"}</b>
        </span>
      </div>
      {rows === null && !err ? (
        <p className="arc-note arc-pane">Loading.</p>
      ) : !shown.length ? (
        <ArEmpty title={tab === "failed" ? "No failed attempts" : q ? "Nothing matches" : "No sign-ins recorded yet. They show here from now on."} />
      ) : (
        <ArGrid cols={cols} rows={shown} keyOf={(r) => String(r.id)} sel={sel} onSel={setSel} onOpen={open} menu={menu} className="arc-grid" />
      )}
      <ArHelp open={help} onClose={() => setHelp(false)} title="Sign-ins">
        <p>Every sign-in to the shop and every failed attempt, for the last 180 days, newest first.</p>
        <p>Five or more failed attempts on one email in a day show in red at the top: a customer who forgot their password, or someone guessing it.</p>
        <p>Double-click a row to open that customer. &ldquo;No account&rdquo; means nobody has an account with that email.</p>
      </ArHelp>
    </ArScreen>
  );
}
