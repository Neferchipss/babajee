"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money, SortTh, useSort, when } from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import { blankRule, describe, meetsAll, type Rule } from "@/lib/customer-groups";
import { customersCsv, download } from "@/lib/orders-csv";
import { addCustomer, deleteSegment, errText, listCustomers, listSegments, saveSegment, type Customer, type Segment } from "@/lib/orders-db";
import { ageOf } from "@/lib/age";
import AroniumCustomers from "@/components/admin/shells/AroniumCustomers";
import { GroupBuilder, SEGMENTS } from "@/components/admin/customer/groups";
import { useAdminStyle } from "@/lib/admin-style";

// Everyone with an account, with what they have bought. The tabs are groups:
// ready-made ones (repeat buyers, never ordered, quiet for 90 days) and any
// the shop builds itself from rules ("spent over ₹5,000 in Pune").
function CustomersPageOriginal() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [groups, setGroups] = useState<Segment[]>([]);
  const [err, setErr] = useState("");
  const [seg, setSeg] = useState("all");
  const [q, setQ] = useState("");
  // the group being built or edited, and the add-a-customer form
  const [building, setBuilding] = useState<{ id?: string; name: string; rules: Rule[] } | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([listCustomers(), listSegments()])
      .then(([c, g]) => {
        setRows(c);
        setGroups(g);
      })
      .catch((e) => setErr(errText(e)));
  }, []);

  const own = groups.find((g) => g.id === seg);
  const matcher = (id: string): ((c: Customer) => boolean) => {
    const g = groups.find((x) => x.id === id);
    if (g) return (c) => meetsAll(c, g.rules);
    return (SEGMENTS.find((x) => x.id === id) ?? SEGMENTS[0]).match;
  };
  const shown = useMemo(() => {
    const m = matcher(seg);
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, "");
    return (rows ?? []).filter(
      (c) =>
        m(c) &&
        (!t ||
          c.full_name.toLowerCase().includes(t) ||
          c.email.toLowerCase().includes(t) ||
          c.city.toLowerCase().includes(t) ||
          c.tags.some((x) => x.toLowerCase().includes(t)) ||
          (digits.length > 2 && c.phone.replace(/\D/g, "").includes(digits))),
    );
    // matcher depends on groups, which is listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, seg, q, groups]);
  const { sorted, sort, toggle } = useSort(shown, {
    customer: { get: (c) => c.full_name || c.email, text: true },
    place: { get: (c) => c.city, text: true },
    joined: { get: (c) => c.joined },
    last: { get: (c) => c.last_order },
    orders: { get: (c) => c.orders },
    spent: { get: (c) => c.spent },
  });
  const viewName = own?.name ?? SEGMENTS.find((s) => s.id === seg)?.label ?? "Everyone";

  async function saveGroup(g: { id?: string; name: string; rules: Rule[] }) {
    try {
      const saved = await saveSegment(g, user?.id ?? null);
      setGroups((gs) => (g.id ? gs.map((x) => (x.id === saved.id ? saved : x)) : [...gs, saved]));
      setSeg(saved.id);
      setBuilding(null);
      toast(g.id ? `Group "${saved.name}" saved` : `Group "${saved.name}" created`);
    } catch (e) {
      toastError(e);
    }
  }
  async function removeGroup(g: Segment) {
    try {
      await deleteSegment(g.id);
      setGroups((gs) => gs.filter((x) => x.id !== g.id));
      setSeg("all");
      setBuilding(null);
      toast(`Group "${g.name}" deleted`);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div>
      <header className="adm-pagehead">
        <h1>
          {own ? own.name : seg === "all" ? "All customers" : (SEGMENTS.find((s) => s.id === seg)?.label ?? "Customers")}
          {rows && <span className="adm-pagehead-n">{shown.length}</span>}
        </h1>
        <p>Tap a customer for their orders, activity and support history. The chips filter the list; make your own group from rules, like spent over ₹5,000 in Pune.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-chips cus-groups" style={{ marginBottom: 8 }}>
        {SEGMENTS.map((s) => (
          <button key={s.id} type="button" className={`adm-chip ${seg === s.id ? "is-on" : ""}`} onClick={() => setSeg(s.id)}>
            {s.label}
            {s.id !== "all" && <b>{rows?.filter(s.match).length ?? 0}</b>}
          </button>
        ))}
        <Link href="/admin/customers/sign-ins" className="adm-chip adm-only-narrow">
          Sign-ins →
        </Link>
      </div>

      {/* the shop's own groups: a row of their own, so they never scroll out of sight */}
      <div className="cus-mine" role="group" aria-label="Your groups">
        <span className="cus-mine-label">Your groups</span>
        <button type="button" className="adm-chip cus-new" onClick={() => setBuilding({ name: "", rules: [blankRule()] })}>
          + New group
        </button>
        {groups.map((g) => (
          <button key={g.id} type="button" className={`adm-chip cus-own ${seg === g.id ? "is-on" : ""}`} onClick={() => setSeg(g.id)} title={g.rules.map(describe).join(" · ")}>
            {g.name}
            <b>{rows?.filter((c) => meetsAll(c, g.rules)).length ?? 0}</b>
          </button>
        ))}
        {!groups.length && <span className="adm-muted adm-small">Build one from rules, like &ldquo;spent over ₹5,000 in Pune&rdquo;.</span>}
      </div>

      {own && (
        <div className="cus-rules">
          <span>
            <span className="adm-muted">Matches all of:</span> {own.rules.map(describe).join(" · ")}
          </span>
          <button type="button" className="adm-link" onClick={() => setBuilding({ id: own.id, name: own.name, rules: own.rules.length ? own.rules : [blankRule()] })}>
            Edit group
          </button>
        </div>
      )}

      <div className="adm-toolbar cus-tools">
        <input className="adm-input" type="search" placeholder="Search by name, email, phone, city or tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        <button
          type="button"
          className="adm-btn"
          disabled={!sorted.length}
          onClick={() => {
            download(`babajee-customers-${viewName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, customersCsv(sorted));
            toast(`Exported ${sorted.length} customer${sorted.length === 1 ? "" : "s"}`);
          }}
        >
          Export
        </button>
        <button type="button" className="adm-btn pri" onClick={() => setAdding(true)}>
          Add customer
        </button>
      </div>

      <div className="adm-card adm-tablecard">
        {rows && shown.length === 0 ? (
          <p className="adm-empty">No customers match.</p>
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <SortTh k="customer" label="Customer" sort={sort} onSort={toggle} />
                <SortTh k="place" label="City" sort={sort} onSort={toggle} />
                <SortTh k="joined" label="Joined" sort={sort} onSort={toggle} />
                <SortTh k="last" label="Last order" sort={sort} onSort={toggle} />
                <SortTh k="orders" label="Orders" sort={sort} onSort={toggle} right />
                <SortTh k="spent" label="Spent" sort={sort} onSort={toggle} right />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const href = `/admin/customers/view?id=${c.id}`;
                return (
                  <tr key={c.id} data-href className={c.role === "admin" ? "is-admin" : ""} onClick={(e) => !(e.target as HTMLElement).closest("a") && router.push(href)}>
                    <td>
                      <Link href={href} className="row-link">
                        {c.full_name || c.email}
                      </Link>
                      {c.role === "admin" && <span className="adm-role">Admin</span>}
                      {c.is_test && <span className="adm-role is-test" title="A seeded test account: it can't sign in">Test</span>}
                      <div className="adm-muted adm-small">
                        {c.phone || c.email}
                        {ageOf(c.date_of_birth) !== null && ` · ${ageOf(c.date_of_birth)} yrs`}
                      </div>
                      {c.tags.length > 0 && (
                        <div className="cus-tags">
                          {c.tags.map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="adm-muted" data-hide-sm>
                      {c.city || "–"}
                      {c.state && <div className="adm-small">{c.state}</div>}
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

      <Dialog wide open={building !== null} onClose={() => setBuilding(null)}>
        {building && (
          <GroupBuilder
            start={building}
            rows={rows ?? []}
            tags={[...new Set((rows ?? []).flatMap((c) => c.tags))].sort()}
            cities={[...new Set((rows ?? []).map((c) => c.city).filter(Boolean))].sort()}
            states={[...new Set((rows ?? []).map((c) => c.state).filter(Boolean))].sort()}
            onCancel={() => setBuilding(null)}
            onSave={saveGroup}
            onDelete={building.id ? () => removeGroup(groups.find((g) => g.id === building.id)!) : undefined}
          />
        )}
      </Dialog>

      <Dialog wide open={adding} onClose={() => setAdding(false)}>
        {adding && (
          <AddCustomer
            onCancel={() => setAdding(false)}
            onAdded={(id, name) => {
              setAdding(false);
              toast(`${name} added`);
              router.push(`/admin/customers/view?id=${id}`);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// A customer typed in by the shop: someone who ordered by phone or WhatsApp.
function AddCustomer({ onCancel, onAdded }: { onCancel: () => void; onAdded: (id: string, name: string) => void }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", line1: "", line2: "", city: "", state: "", pincode: "", tags: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const field = (k: keyof typeof f, label: string, extra: { placeholder?: string; type?: string; inputMode?: "tel" | "email" | "numeric"; wide?: boolean } = {}) => (
    <label className={`adm-label ${extra.wide ? "cus-wide" : ""}`}>
      {label}
      <input className="adm-input" type={extra.type ?? "text"} inputMode={extra.inputMode} value={f[k]} placeholder={extra.placeholder} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <form
      method="dialog"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          const id = await addCustomer({
            name: f.name,
            phone: f.phone,
            email: f.email,
            address: f.line1.trim() ? { line1: f.line1, line2: f.line2, city: f.city, state: f.state, pincode: f.pincode } : null,
            tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
          });
          onAdded(id, f.name.trim());
        } catch (x) {
          setErr(errText(x));
        }
        setBusy(false);
      }}
    >
      <h2>Add a customer</h2>
      <p className="adm-muted adm-small" style={{ margin: 0 }}>
        For someone who buys by phone, WhatsApp or at the counter. They can&apos;t sign in with this; if they sign up later with the same email, the account becomes theirs.
      </p>
      <div className="cus-form">
        {field("name", "Name", { placeholder: "Riya Sharma", wide: true })}
        {field("phone", "Phone", { placeholder: "+91 98765 43210", type: "tel", inputMode: "tel" })}
        {field("email", "Email (optional)", { placeholder: "riya@example.com", type: "email", inputMode: "email" })}
        {field("line1", "Address (optional)", { placeholder: "Flat, building, street", wide: true })}
        {field("line2", "Area", { placeholder: "Area or locality" })}
        {field("city", "City", { placeholder: "Pune" })}
        {field("state", "State", { placeholder: "Maharashtra" })}
        {field("pincode", "Pincode", { placeholder: "411001", inputMode: "numeric" })}
        {field("tags", "Tags (optional)", { placeholder: "wholesale, regular", wide: true })}
      </div>
      {err && <p className="adm-err" style={{ margin: 0 }}>{err}</p>}
      <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="adm-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="adm-btn pri" disabled={busy || !f.name.trim() || (!f.phone.trim() && !f.email.trim())}>
          {busy ? "Adding" : "Add customer"}
        </button>
      </div>
    </form>
  );
}

// The Aronium-style design shows Aronium's Customers & suppliers screen instead.
export default function CustomersPage() {
  const style = useAdminStyle();
  return style === "aronium" ? <AroniumCustomers /> : <CustomersPageOriginal />;
}
