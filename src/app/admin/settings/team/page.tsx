"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { listAdmins, setAdmin, type Admin } from "@/lib/team";

// Who can open this admin. Everyone here can do everything; staff logins
// with limited access are separate (not built yet). An admin is added by the
// email of an account already made on the shop.
export default function TeamPage() {
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState("");

  const load = () => listAdmins().then(setAdmins, (e) => setErr(errText(e)));
  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await setAdmin(email.trim(), true);
      toast(`${email.trim()} is now an admin`);
      setEmail("");
      await load();
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  async function remove(a: Admin) {
    setBusy(true);
    try {
      await setAdmin(a.email, false);
      toast(`${a.name || a.email} is no longer an admin`);
      setRemoving("");
      await load();
    } catch (x) {
      toastError(errText(x));
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/admin/settings" className="adm-back adm-only-narrow">
        ← Settings
      </Link>
      <header className="adm-pagehead">
        <h1>Admins</h1>
        <p>
        People who can open this admin. Each one can do everything here, and every change they make is in the <Link href="/admin/settings/activity">activity log</Link>.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card" style={{ display: "grid", gap: 4 }}>
        {admins === null ? (
          <p className="adm-muted adm-small">Loading.</p>
        ) : (
          admins.map((a) => (
            <div key={a.id} className="team-row">
              <span>
                <strong>{a.name || a.email}</strong>
                {a.me && <span className="adm-pill off" style={{ marginLeft: 8 }}>You</span>}
                <span className="adm-muted adm-small" style={{ display: "block" }}>
                  {a.email} · {a.last_sign_in ? `last signed in ${when(a.last_sign_in).toLowerCase()}` : "never signed in"}
                </span>
              </span>
              {!a.me &&
                (removing === a.id ? (
                  <span className="adm-actions">
                    <button type="button" className="adm-btn bad" disabled={busy} onClick={() => remove(a)}>
                      Remove
                    </button>
                    <button type="button" className="adm-btn" onClick={() => setRemoving("")}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" className="adm-btn" onClick={() => setRemoving(a.id)}>
                    Remove…
                  </button>
                ))}
            </div>
          ))
        )}
      </section>

      <form className="adm-card" onSubmit={add} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>Add an admin</h2>
        <p className="adm-muted adm-small" style={{ margin: 0 }}>
          They sign up on the shop first, like a customer. Then enter that email here.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="adm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" style={{ flex: 1, minWidth: 0 }} />
          <button className="adm-btn pri" disabled={busy || !email.trim()}>
            Make admin
          </button>
        </div>
      </form>
    </div>
  );
}
