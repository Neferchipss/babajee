"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { deviceOf, loginEvents, type LoginEvent } from "@/lib/logins";

// Every sign-in and failed attempt, newest first (kept 180 days). Failed
// attempts on one email in a short time stand out: someone guessing a
// password, or a customer who forgot theirs.
const TABS = [
  { id: "all", label: "All" },
  { id: "failed", label: "Failed" },
] as const;

export default function SignInsPage() {
  const [rows, setRows] = useState<LoginEvent[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"all" | "failed">("all");

  useEffect(() => {
    loginEvents({ limit: 500 }).then(
      (r) => {
        setRows(r);
        setLoadedAt(Date.now());
      },
      (e) => setErr(errText(e)),
    );
  }, []);

  const failed = useMemo(() => (rows ?? []).filter((r) => !r.ok), [rows]);
  // emails with 5 or more failures in the last day
  const hot = useMemo(() => {
    const day = loadedAt - 864e5;
    const n = new Map<string, number>();
    for (const r of failed) if (new Date(r.at).getTime() > day) n.set(r.email, (n.get(r.email) ?? 0) + 1);
    return [...n].filter(([, c]) => c >= 5).sort((a, b) => b[1] - a[1]);
  }, [failed, loadedAt]);
  const shown = tab === "failed" ? failed : (rows ?? []);

  return (
    <div>
      <Link href="/admin/customers" className="adm-back adm-only-narrow">
        ← Customers
      </Link>
      <header className="adm-pagehead">
        <h1>Sign-ins</h1>
        <p>
        Every sign-in to the shop and every failed attempt, for the last 180 days.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      {hot.length > 0 && (
        <div className="ov-request is-fail">
          <div>
            <b>Many failed attempts in the last day</b>
            <span>{hot.map(([e, c]) => `${e} (${c})`).join(", ")}. A customer who forgot their password, or someone guessing it.</span>
          </div>
        </div>
      )}

      <div className="adm-chips" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`adm-chip ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label} {t.id === "failed" && failed.length > 0 && <b>{failed.length}</b>}
          </button>
        ))}
      </div>

      <section className="adm-card" style={{ padding: 0 }}>
        {rows === null && !err ? (
          <p className="adm-muted" style={{ padding: 16 }}>
            Loading.
          </p>
        ) : !shown.length ? (
          <p className="adm-muted adm-small" style={{ padding: 16, margin: 0 }}>
            {tab === "failed" ? "No failed attempts." : "No sign-ins recorded yet. They show here from now on."}
          </p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Result</th>
                <th>Device</th>
                <th>Network</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{when(r.at)}</td>
                  <td>
                    {r.profile_id ? <Link href={`/admin/customers/view?id=${r.profile_id}`}>{r.name || r.email}</Link> : r.email}
                    {r.profile_id && r.name && <div className="adm-muted adm-small">{r.email}</div>}
                    {!r.profile_id && <div className="adm-muted adm-small">No account with this email</div>}
                  </td>
                  <td>{r.ok ? <span className="adm-pill done">Signed in</span> : <span className="adm-pill warn">{r.reason || "Failed"}</span>}</td>
                  <td className="adm-small">{deviceOf(r.user_agent)}</td>
                  <td className="adm-small adm-muted">{r.ip || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
