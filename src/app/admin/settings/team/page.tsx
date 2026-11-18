"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { isAdminDemo } from "@/lib/admin-api";
import { errText } from "@/lib/orders-db";
import { can, ROLES, roleLabel, setStaff, useStaff, type StaffMember, type StaffRole } from "@/lib/staff";
import { getSupabase } from "@/lib/supabase";

// The team: who can open this admin and what each one's role lets them do
// (0072), from owner down to front-end UI. Owners change anyone; admins add
// and change the three roles under them.
export default function TeamPage() {
  const { me } = useStaff();
  const [team, setTeam] = useState<StaffMember[] | null>(null);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("accounts");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState("");
  const manage = can(me?.role ?? null, "team");
  const owner = me?.role === "owner";
  // the roles this person may hand out
  const giveable = ROLES.filter((r) => owner || !["owner", "admin"].includes(r.id));

  const load = async () => {
    if (isAdminDemo()) {
      setTeam([
        { id: "1", name: "Shop owner", email: "owner@example.com", role: "owner", last_sign_in: new Date().toISOString(), joined: "", me: true },
        { id: "2", name: "Accounts", email: "accounts@example.com", role: "accounts", last_sign_in: null, joined: "", me: false },
        { id: "3", name: "Shop floor", email: "storefront@example.com", role: "storefront", last_sign_in: null, joined: "", me: false },
      ]);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc("admin_team");
    if (error) setErr(errText(error));
    else setTeam(((data ?? []) as StaffMember[]).map((m) => ({ ...m, role: m.role ?? "owner" })));
  };
  useEffect(() => {
    // the demo's sample team is set at once; the real one arrives later
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function change(who: string, r: StaffRole | null, done: string) {
    setBusy(true);
    try {
      await setStaff(who, r);
      toast(done);
      setRemoving("");
      await load();
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    await change(email.trim(), role, `${email.trim()} is now ${roleLabel(role)}`);
    setEmail("");
  }

  const mayChange = (m: StaffMember) => manage && !m.me && (owner || !["owner", "admin"].includes(m.role));

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/admin/settings" className="adm-back adm-only-narrow">
        ← Settings
      </Link>
      <header className="adm-pagehead">
        <h1>Team and roles</h1>
        <p>
          Who can open this admin and what each can do. Every change anyone makes is in the <Link href="/admin/settings/activity">activity log</Link>.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card team-roles">
        {ROLES.map((r) => (
          <div key={r.id}>
            <b>{r.label}</b>
            <span className="adm-muted adm-small">{r.about}</span>
          </div>
        ))}
      </section>

      <section className="adm-card" style={{ display: "grid", gap: 4, marginTop: 16 }}>
        {team === null ? (
          <p className="adm-muted adm-small">Loading.</p>
        ) : (
          team.map((m) => (
            <div key={m.id} className="team-row">
              <span>
                <strong>{m.name || m.email}</strong>
                {m.me && (
                  <span className="adm-pill off" style={{ marginLeft: 8 }}>
                    You
                  </span>
                )}
                <span className="adm-muted adm-small" style={{ display: "block" }}>
                  {m.email} · {m.last_sign_in ? `last signed in ${when(m.last_sign_in).toLowerCase()}` : "never signed in"}
                </span>
              </span>
              {mayChange(m) ? (
                <span className="adm-actions">
                  <select
                    className="adm-input"
                    style={{ width: "auto" }}
                    value={m.role}
                    disabled={busy}
                    aria-label={`Role for ${m.name || m.email}`}
                    onChange={(e) => change(m.email, e.target.value as StaffRole, `${m.name || m.email} is now ${roleLabel(e.target.value)}`)}
                  >
                    {giveable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {removing === m.id ? (
                    <>
                      <button type="button" className="adm-btn bad" disabled={busy} onClick={() => change(m.email, null, `${m.name || m.email} is off the team`)}>
                        Remove
                      </button>
                      <button type="button" className="adm-btn" onClick={() => setRemoving("")}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="adm-btn" onClick={() => setRemoving(m.id)}>
                      Remove…
                    </button>
                  )}
                </span>
              ) : (
                <span className="adm-pill">{roleLabel(m.role)}</span>
              )}
            </div>
          ))
        )}
      </section>

      {manage && (
        <form className="adm-card" onSubmit={add} style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Add someone</h2>
          <p className="adm-muted adm-small" style={{ margin: 0 }}>
            They sign up on the shop first, like a customer. Then enter that email here and pick their role.
          </p>
          <div className="team-add">
            <input className="adm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            <select className="adm-input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} aria-label="Role">
              {giveable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button className="adm-btn pri" disabled={busy || !email.trim()}>
              Add
            </button>
          </div>
        </form>
      )}

    </div>
  );
}
