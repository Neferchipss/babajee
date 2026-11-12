"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { AREA_NAME, AREAS, auditLog, fieldName, listAdmins, showValue, type Admin, type AuditEntry } from "@/lib/team";

// Every change an admin made, newest first, kept a year: who, when, what,
// and for an edit each field from old to new. Recorded by the database, so
// nothing done in the admin is missing from it.
const PAGE = 100;

export default function ActivityPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [area, setArea] = useState("");
  const [actor, setActor] = useState("");
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const tables = AREAS.find((a) => a.id === area)?.tables;
  const load = useCallback(
    (before?: number) =>
      auditLog({ areas: tables, actor: actor || undefined, before, limit: PAGE }).then(
        (r) => {
          setRows((cur) => (before ? [...(cur ?? []), ...r] : r));
          setMore(r.length === PAGE);
        },
        (e) => setErr(errText(e)),
      ),
    [tables, actor],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    listAdmins().then(setAdmins, () => {});
  }, []);

  return (
    <div>
      <Link href="/admin/settings" className="adm-back adm-only-narrow">
        ← Settings
      </Link>
      <header className="adm-pagehead">
        <h1>Activity log</h1>
        <p>
        Every change made in the admin, with who made it. Customers&apos; own actions aren&apos;t here; each order keeps its own timeline.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div className="adm-chips" role="group" aria-label="Part of the shop">
          {[{ id: "", label: "Everything" }, ...AREAS].map((a) => (
            <button key={a.id || "all"} type="button" className={`adm-chip ${area === a.id ? "is-on" : ""}`} aria-pressed={area === a.id} onClick={() => (setRows(null), setArea(a.id))}>
              {a.label}
            </button>
          ))}
        </div>
        {admins.length > 1 && (
          <select className="adm-input" style={{ width: "auto" }} value={actor} onChange={(e) => (setRows(null), setActor(e.target.value))} aria-label="Who">
            <option value="">Everyone</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
        )}
      </div>

      <section className="adm-card" style={{ padding: 0 }}>
        {rows === null ? (
          <p className="adm-muted" style={{ padding: 16 }}>
            Loading.
          </p>
        ) : !rows.length ? (
          <p className="adm-muted adm-small" style={{ padding: 16, margin: 0 }}>
            Nothing yet. Changes show here from now on.
          </p>
        ) : (
          <ol className="aud">
            {rows.map((r) => {
              const fields = r.changes ? Object.keys(r.changes) : [];
              return (
                <li key={r.id}>
                  <button type="button" className="aud-row" aria-expanded={open === r.id} disabled={!fields.length} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <span className="aud-what">
                      <b>{r.actor_name || "An admin"}</b> {r.action} {r.action === "changed" ? "" : "the "}
                      {AREA_NAME[r.area] ?? r.area}
                      {r.label ? <> &ldquo;{r.label}&rdquo;</> : null}
                      {fields.length > 0 && <span className="adm-muted">: {fields.slice(0, 3).map(fieldName).join(", ")}{fields.length > 3 ? ` +${fields.length - 3}` : ""}</span>}
                    </span>
                    <time className="adm-muted adm-small" dateTime={r.at}>
                      {when(r.at)}
                    </time>
                  </button>
                  {open === r.id && r.changes && (
                    <dl className="aud-diff">
                      {fields.map((k) => (
                        <div key={k}>
                          <dt>{fieldName(k)}</dt>
                          <dd>
                            <s>{showValue(r.changes![k][0])}</s> → {showValue(r.changes![k][1])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      {more && rows && (
        <button type="button" className="adm-btn" style={{ marginTop: 12 }} onClick={() => load(rows[rows.length - 1].id)}>
          Show older
        </button>
      )}
    </div>
  );
}
