"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { creditLimitOf, customerBalance, setCreditLimit } from "@/lib/counter";
import { can, useStaff } from "@/lib/staff";

// On the customer's page (both designs): what they owe on sales on account
// at the till, and their own credit limit. Shows nothing before 0086.
const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CustomerCredit({ id, aronium }: { id: string; aronium?: boolean }) {
  const role = useStaff().me?.role ?? null;
  const [got, setGot] = useState<{ id: string; owes: number; limit: string } | null>(null);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([customerBalance(id), creditLimitOf(id)]).then(([b, l]) => {
      if (!live || b == null || l === undefined) return;
      const s = l == null ? "" : String(l);
      setGot({ id, owes: b, limit: s });
      setLimit(s);
    });
    return () => {
      live = false;
    };
  }, [id]);
  if (!got || got.id !== id) return null;
  const mayEdit = can(role, "money");
  async function save() {
    setBusy(true);
    try {
      await setCreditLimit(id, limit.trim() === "" ? null : Math.max(0, Number(limit) || 0));
      setGot((g) => (g ? { ...g, limit } : g));
      toast("Credit limit saved");
    } catch (e) {
      toastError(e);
    }
    setBusy(false);
  }
  const body = (
    <>
      <p className={aronium ? "arc-note" : "adm-small"} style={{ margin: 0 }}>
        Owes on account: <b style={{ color: got.owes > 0 ? "#f0a43a" : undefined }}>{money(got.owes)}</b>
        {got.owes > 0 && (
          <>
            {" "}
            · <Link href="/admin/counter">collect at the till</Link> (≡ › Credit payments)
          </>
        )}
      </p>
      <label className={aronium ? "" : "adm-label"} style={{ display: "grid", gap: 4, marginTop: 8 }}>
        <span>Credit limit (₹)</span>
        <input className="adm-input" inputMode="decimal" value={limit} disabled={!mayEdit} placeholder="The shop's default" onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} />
      </label>
      {mayEdit && limit !== got.limit && (
        <button type="button" className={aronium ? "arc-btn is-pri" : "adm-btn"} style={{ marginTop: 8 }} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save limit"}
        </button>
      )}
    </>
  );
  return aronium ? (
    <div className="arc-credit" style={{ marginTop: 12 }}>
      {body}
    </div>
  ) : (
    <section className="adm-card">
      <h2>Credit at the counter</h2>
      {body}
    </section>
  );
}
