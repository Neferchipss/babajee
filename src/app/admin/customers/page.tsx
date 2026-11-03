"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { money, when } from "@/components/admin/ui";
import { errText, listCustomers, type Customer } from "@/lib/orders-db";

// Everyone with an account, with what they have bought. The tabs are saved
// groups ("segments"): repeat buyers, never ordered, quiet for 90 days.
const SEGMENTS: { id: string; label: string; match: (c: Customer) => boolean }[] = [
  { id: "all", label: "Everyone", match: () => true },
  { id: "customers", label: "Customers", match: (c) => c.role !== "admin" },
  { id: "admins", label: "Admins", match: (c) => c.role === "admin" },
  { id: "buyers", label: "Have ordered", match: (c) => c.orders > 0 },
  { id: "repeat", label: "Repeat buyers", match: (c) => c.orders > 1 },
  { id: "never", label: "Never ordered", match: (c) => c.orders === 0 },
  { id: "quiet", label: "No order in 90 days", match: (c) => c.orders > 0 && !!c.last_order && Date.now() - new Date(c.last_order).getTime() > 90 * 864e5 },
];

export default function CustomersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [err, setErr] = useState("");
  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    listCustomers()
      .then(setRows)
      .catch((e) => setErr(errText(e)));
  }, []);

  const shown = useMemo(() => {
    const s = SEGMENTS.find((x) => x.id === seg) ?? SEGMENTS[0];
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((c) => s.match(c) && (!t || c.full_name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t) || c.phone.replace(/\D/g, "").includes(t.replace(/\D/g, "") || "§")));
  }, [rows, seg, q]);


  return (
    <div>
      <h1 className="sr-only">Customers</h1>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-chips" style={{ marginBottom: 12 }}>
        {SEGMENTS.map((s) => {
          const n = rows?.filter(s.match).length ?? 0;
          return (
            <button key={s.id} type="button" className={`adm-chip ${seg === s.id ? "is-on" : ""}`} onClick={() => setSeg(s.id)}>
              {s.label}
              {s.id !== "all" && <b>{n}</b>}
            </button>
          );
        })}
      </div>
      <div className="adm-toolbar">
        <input className="adm-input" type="search" placeholder="Search by name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </div>

      <div className="adm-card adm-tablecard">
        {rows && shown.length === 0 ? (
          <p className="adm-empty">No customers match.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Joined</th>
                <th>Last order</th>
                <th className="r">Orders</th>
                <th className="r">Spent</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const href = `/admin/customers/view?id=${c.id}`;
                return (
                  <tr key={c.id} data-href className={c.role === "admin" ? "is-admin" : ""} onClick={(e) => !(e.target as HTMLElement).closest("a") && router.push(href)}>
                    <td>
                      <Link href={href} className="row-link">
                        {c.full_name || c.email}
                      </Link>
                      {c.role === "admin" && <span className="adm-role">Admin</span>}
                      <div className="adm-muted adm-small">{c.phone || c.email}</div>
                    </td>
                    <td className="adm-muted" data-hide-sm>
                      {when(c.joined)}
                    </td>
                    <td className="adm-muted" data-hide-sm>
                      {c.last_order ? when(c.last_order) : "–"}
                    </td>
                    <td className="r" data-hide-sm>
                      {c.orders}
                    </td>
                    <td className="r">
                      <strong>{money(c.spent)}</strong>
                      <div className="adm-muted adm-small">
                        {c.orders} order{c.orders === 1 ? "" : "s"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
