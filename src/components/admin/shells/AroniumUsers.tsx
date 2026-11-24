"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog } from "@/components/admin/ui";
import { isAdminDemo } from "@/lib/admin-api";
import { errText } from "@/lib/orders-db";
import { can, ROLES, roleLabel, setStaff, useStaff, type Area, type StaffMember, type StaffRole } from "@/lib/staff";
import { getSupabase } from "@/lib/supabase";
import { ArGrid, ArScreen, ArSwitch, ArToolbar, Tick, useArKeys, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArField, ArPanel } from "./aronium-help";
import { InfoBox, NotKept, Stepper } from "./aronium-b-kit";
import "./aronium-screens-b.css";

// Users & security in the Aronium-style design, as Aronium's two tabs.
// Users: the staff who can open the admin, with Aronium's access level as a
// number (each Babajee role has one: front-end UI 1 … owner 9). Add user and
// Edit slide Aronium's user panel in; access is given to a shop account by
// email, so the password fields stay greyed. Security (?tab=security): which
// access level each screen and operation needs, read from the staff roles
// (lib/staff) and shown in Aronium's blue sections, read only. Babajee's
// extra: "Keep out of visits and analytics" per member (0046/0079), a
// column and a switch in the panel.
export const LEVEL: Record<StaffRole, number> = { frontend: 1, storefront: 3, accounts: 5, admin: 8, owner: 9 };
const BY_LEVEL = (Object.entries(LEVEL) as [StaffRole, number][]).sort((a, b) => a[1] - b[1]);
const roleAt = (n: number) => [...BY_LEVEL].reverse().find(([, l]) => l <= n)?.[0] ?? "frontend";

export default function AroniumUsers() {
  const security = useSearchParams().get("tab") === "security";
  return security ? <Security /> : <Users />;
}

function Users() {
  const { me } = useStaff();
  const [team, setTeam] = useState<StaffMember[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [inactive, setInactive] = useState(false);
  const [panel, setPanel] = useState<{ m: StaffMember | null } | null>(null);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  // accounts kept out of visits and analytics (0046), switched here (0079)
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const manage = can(me?.role ?? null, "team");
  const owner = me?.role === "owner";
  const mayGive = (r: StaffRole) => owner || !["owner", "admin"].includes(r);
  const mayChange = (m: StaffMember) => manage && !m.me && mayGive(m.role);

  const load = (): Promise<void> => {
    if (isAdminDemo())
      return Promise.resolve([
        { id: "1", name: "Shop owner", email: "owner@example.com", role: "owner", last_sign_in: new Date().toISOString(), joined: "", me: true },
        { id: "2", name: "Accounts", email: "accounts@example.com", role: "accounts", last_sign_in: null, joined: "", me: false },
      ] as StaffMember[]).then(setTeam);
    const sb = getSupabase();
    if (!sb) return Promise.resolve();
    return Promise.resolve(sb.rpc("admin_team")).then(async ({ data, error }) => {
      if (error) return setErr(errText(error));
      const list = ((data ?? []) as StaffMember[]).map((m) => ({ ...m, role: m.role ?? "owner" }));
      setTeam(list);
      const h = await sb.from("profiles").select("id, hidden").in("id", list.map((m) => m.id));
      if (!h.error) setHidden(new Set(((h.data ?? []) as { id: string; hidden: boolean }[]).filter((x) => x.hidden).map((x) => x.id)));
    });
  };
  useEffect(() => {
    void load();
  }, []);
  async function keepOut(m: StaffMember, off: boolean) {
    try {
      const { error } = await getSupabase()!.rpc("admin_set_hidden", { p_profile: m.id, p_hidden: off });
      if (error) throw error;
      setHidden((h) => {
        const n = new Set(h);
        if (off) n.add(m.id);
        else n.delete(m.id);
        return n;
      });
      toast(off ? `${m.name || m.email}'s visits are no longer recorded` : `${m.name || m.email}'s visits are recorded again`);
    } catch (x) {
      toastError(errText(x));
    }
  }

  const picked = team?.find((m) => m.id === sel) ?? null;
  const split = (m: StaffMember) => {
    const parts = (m.name || m.email.split("@")[0]).trim().split(/\s+/);
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
  };
  const cols: ArCol<StaffMember>[] = [
    { k: "first", label: "First name", render: (m) => split(m).first, sort: (m) => split(m).first },
    { k: "last", label: "Last name", render: (m) => split(m).last, sort: (m) => split(m).last },
    { k: "email", label: "Email", render: (m) => m.email, sort: (m) => m.email },
    { k: "level", label: "Access level", right: true, render: (m) => LEVEL[m.role], sort: (m) => LEVEL[m.role] },
    { k: "active", label: "Active", center: true, render: () => <Tick on /> },
    { k: "role", label: "Role", render: (m) => roleLabel(m.role) + (m.me ? " (you)" : "") },
    { k: "hidden", label: "Kept out of analytics", center: true, render: (m) => <Tick on={hidden.has(m.id)} /> },
  ];

  const add = () => manage && setPanel({ m: null });
  const edit = (m: StaffMember | null) => m && setPanel({ m });
  const del = (m: StaffMember | null) => m && mayChange(m) && setRemoving(m);
  useArKeys({ add, refresh: () => void load(), edit: () => edit(picked), del: () => del(picked) });
  const menu = (m: StaffMember | null): ArMenuItem[] => [
    { label: "Add user", key: "Ctrl+N", disabled: !manage, onClick: add },
    "-",
    { label: "Edit", disabled: !m, onClick: () => edit(m) },
    { label: "Reset password", disabled: true },
    "-",
    { label: "Delete", key: "Del", disabled: !m || !mayChange(m), onClick: () => del(m) },
    "-",
    { label: "Refresh", key: "F5", onClick: () => void load() },
  ];

  async function save(email: string, role: StaffRole | null, done: string) {
    try {
      await setStaff(email, role);
      toast(done);
      setPanel(null);
      setRemoving(null);
      await load();
    } catch (x) {
      toastError(errText(x));
    }
  }

  return (
    <ArScreen>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "Add user", disabled: !manage, onClick: add },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => edit(picked) },
          { icon: "del", label: "Delete", disabled: !picked || !mayChange(picked), onClick: () => del(picked) },
          { icon: "list", label: "Reset password", disabled: true, title: "Staff reset their own password from the sign-in page" },
        ]}
      >
        <span className="ars-tool-switch">
          <ArSwitch on={inactive} onChange={setInactive} label="Show inactive users" />
        </span>
      </ArToolbar>
      {err && <p className="adm-err">{err}</p>}
      {!manage && <p className="arf-note ars-pad">Your role can see the team but not change it.</p>}
      <ArGrid cols={cols} rows={team ?? []} keyOf={(m) => m.id} sel={sel} onSel={setSel} onOpen={edit} menu={menu} />

      {panel && (
        <UserPanel
          key={panel.m?.id ?? "new"}
          m={panel.m}
          split={split}
          mayGive={mayGive}
          editable={panel.m ? mayChange(panel.m) : manage}
          hidden={panel.m ? hidden.has(panel.m.id) : false}
          onHidden={manage && panel.m ? (off) => void keepOut(panel.m!, off) : undefined}
          onClose={() => setPanel(null)}
          onSave={save}
        />
      )}
      <Dialog open={removing !== null} onClose={() => setRemoving(null)}>
        {removing && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void save(removing.email, null, `${removing.email} can no longer open the admin`);
            }}
          >
            <h2>Delete {removing.name || removing.email}?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              They keep their shop account but can no longer open the admin.
            </p>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button className="adm-btn bad">Delete</button>
            </div>
          </form>
        )}
      </Dialog>
    </ArScreen>
  );
}

function UserPanel({
  m,
  split,
  mayGive,
  editable,
  hidden,
  onHidden,
  onClose,
  onSave,
}: {
  m: StaffMember | null;
  split: (m: StaffMember) => { first: string; last: string };
  mayGive: (r: StaffRole) => boolean;
  editable: boolean;
  hidden: boolean;
  // switched at once, like the team page's tick (not with Save)
  onHidden?: (off: boolean) => void;
  onClose: () => void;
  onSave: (email: string, role: StaffRole | null, done: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(m?.email ?? "");
  const [level, setLevel] = useState(m ? LEVEL[m.role] : LEVEL.accounts);
  const [active, setActive] = useState(true);
  const role = roleAt(level);
  const ok = editable && !!email.trim() && mayGive(role);
  const names = m ? split(m) : { first: "", last: "" };
  return (
    <ArPanel
      open
      title={m ? names.first || m.email : "Add user"}
      onClose={onClose}
      canSave={ok}
      onSave={() => void (active ? onSave(email.trim(), role, `${email.trim()} is now ${roleLabel(role)}`) : onSave(email.trim(), null, `${email.trim()} can no longer open the admin`))}
    >
      <div className="arb-fields">
        <ArField label="First name">
          <input className="adm-input" value={names.first} disabled />
        </ArField>
        <ArField label="Last name">
          <input className="adm-input" value={names.last} disabled />
        </ArField>
        <ArField label="Email">
          <input className={`adm-input ${email.trim() ? "" : "is-required"}`} type="email" autoFocus={!m} readOnly={!!m} value={email} onChange={(e) => setEmail(e.target.value)} />
        </ArField>
        {!m && (
          <>
            <ArField label="Password">
              <input className="adm-input" type="password" disabled />
            </ArField>
            <ArField label="Confirm password">
              <input className="adm-input" type="password" disabled />
            </ArField>
            <NotKept why="Staff sign in with their own shop account: they make it on the shop first, then you add its email here. Their name comes from that account." />
          </>
        )}
        <ArField label="Access level">
          <Stepper value={level} min={1} max={9} disabled={!editable} onChange={setLevel} label="access level" after={roleLabel(role)} />
          <small className="arb-notkept">{ROLES.find((r) => r.id === role)?.about}</small>
          {!mayGive(role) && <small className="arb-bad">Only an owner can give this level.</small>}
        </ArField>
        <div className="arb-toggles">
          <ArSwitch on={active} onChange={(v) => editable && !m?.me && setActive(v)} label="Active" />
          {m && <ArSwitch on={hidden} onChange={(v) => onHidden?.(v)} label="Keep out of visits and analytics" />}
        </div>
        {m && <small className="arb-notkept">{onHidden ? "Their visits on this device and account aren't counted in Web analytics. Changes at once." : "Only owners and admins can change this."}</small>}
        {!editable && <InfoBox>{m?.me ? "You can't change your own access." : "Your role can't change this user."}</InfoBox>}
      </div>
    </ArPanel>
  );
}

// Aronium's Security tab, from Babajee's roles: each screen and operation
// with the lowest access level that can use it. Read only here; roles are
// given per user on the Users tab.
const SECTIONS: { name: string; rows: [string, Area, string?][] }[] = [
  {
    name: "General",
    rows: [
      ["Management", "staff", "Opening the admin at all"],
      ["Settings", "settings"],
      ["User profile", "staff"],
      ["Data downloads", "export"],
      ["Delete products", "delete"],
    ],
  },
  {
    name: "Sales",
    rows: [
      ["View all open orders", "money"],
      ["Mark paid / packed / shipped", "money"],
      ["Refund", "money", "Refunds and credit notes"],
      ["Change price", "catalog"],
      ["View sales history", "money"],
      ["Reprint invoice", "money"],
    ],
  },
  {
    name: "Management",
    rows: [
      ["Dashboard", "money"],
      ["Documents", "money"],
      ["Products", "catalog"],
      ["Stock", "catalog"],
      ["Reporting", "money"],
      ["Customers & suppliers", "money"],
      ["Promotions", "catalog"],
      ["Users & security", "team"],
      ["Payment types", "settings_view"],
      ["Countries", "settings_view"],
      ["Tax rates", "catalog"],
      ["Price lists", "catalog"],
      ["My company", "settings_view"],
    ],
  },
  {
    name: "Stock",
    rows: [
      ["Quick inventory", "catalog"],
      ["View cost prices", "catalog"],
    ],
  },
  {
    name: "Online shop",
    rows: [
      ["Storefront look", "look"],
      ["Pages, blog and FAQs", "content"],
      ["Web analytics", "money"],
    ],
  },
];
const needs = (a: Area) => BY_LEVEL.find(([r]) => can(r, a))?.[1] ?? 9;

function Security() {
  const [tick, setTick] = useState(0);
  return (
    <ArScreen>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => setTick(tick + 1) },
          { icon: "paid", label: "Save", disabled: true, title: "Access is set by role on the Users tab" },
        ]}
      />
      <div className="arb-sec ars-pad" key={tick}>
        <h2 className="arb-h">Set access level for predefined operations</h2>
        <p className="arf-note">Select access level for each action in order to set required user permissions. In Babajee these follow the staff roles, so they are shown here and changed by giving people a role on the Users tab.</p>
        <p className="arf-note">
          Levels: {BY_LEVEL.map(([r, l]) => `${l} ${roleLabel(r)}`).join(" · ")}
        </p>
        {SECTIONS.map((s) => (
          <section key={s.name} className="arb-secbox">
            <h3>{s.name}</h3>
            <div className="arb-secrows">
              {s.rows.map(([label, area, help]) => (
                <div key={label} className="arb-secrow">
                  <span>
                    {label}
                    {help && (
                      <i className="arb-q" title={help} aria-label={help}>
                        ?
                      </i>
                    )}
                  </span>
                  <Stepper value={needs(area)} disabled label={label} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ArScreen>
  );
}
