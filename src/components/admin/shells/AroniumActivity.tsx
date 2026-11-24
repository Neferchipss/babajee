"use client";

import { useCallback, useEffect, useState } from "react";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { AREA_NAME, AREAS, auditLog, fieldName, listAdmins, showValue, type Admin, type AuditEntry } from "@/lib/team";
import { ArEmpty, ArGrid, ArIcon, ArScreen, ArSection, ArToolbar, menuOf, useArKeys, type ArCol } from "./aronium-kit";
import { ArHelp } from "./aronium-help";
import "./aronium-screens-b.css";
import "./aronium-screens-c.css";

// Management • Users & security • Activity log, set out as Aronium's
// Documents screen: a filter band (Area, User), the log as a grid, and under
// the splitter the selected change's fields from old to new (Aronium's
// "Document items"). Every change made in the admin, newest first, kept a
// year, recorded by the database. Customers' own actions aren't here; each
// order keeps its own timeline.
const PAGE = 100;
type Field = { k: string; from: unknown; to: unknown };

export default function AroniumActivity() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [area, setArea] = useState("");
  const [actor, setActor] = useState("");
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  const tables = AREAS.find((a) => a.id === area)?.tables;
  const load = useCallback(
    (before?: number) =>
      auditLog({ areas: tables, actor: actor || undefined, before, limit: PAGE }).then(
        (r) => {
          setRows((cur) => (before ? [...(cur ?? []), ...r] : r));
          setMore(r.length === PAGE);
          setErr("");
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
  useArKeys({ refresh: () => void load() });

  const picked = rows?.find((r) => String(r.id) === sel) ?? null;
  const fields: Field[] = picked?.changes ? Object.keys(picked.changes).map((k) => ({ k, from: picked.changes![k][0], to: picked.changes![k][1] })) : [];
  const menu = () => menuOf([{ label: "Refresh", key: "F5", onClick: () => void load() }]);

  const cols: ArCol<AuditEntry>[] = [
    { k: "at", label: "Date", render: (r) => when(r.at), sort: (r) => r.at },
    { k: "who", label: "User", render: (r) => r.actor_name || "An admin", sort: (r) => r.actor_name || "" },
    { k: "act", label: "Action", render: (r) => r.action, sort: (r) => r.action },
    { k: "area", label: "Area", render: (r) => AREA_NAME[r.area] ?? r.area, sort: (r) => AREA_NAME[r.area] ?? r.area },
    { k: "what", label: "Item", render: (r) => r.label ?? "" },
    {
      k: "f",
      label: "Fields changed",
      render: (r) => {
        const f = r.changes ? Object.keys(r.changes) : [];
        return f.length ? `${f.slice(0, 3).map(fieldName).join(", ")}${f.length > 3 ? ` +${f.length - 3}` : ""}` : "";
      },
    },
  ];
  const fieldCols: ArCol<Field>[] = [
    { k: "k", label: "Field", render: (f) => fieldName(f.k) },
    { k: "from", label: "Old value", render: (f) => <s className="arc-grey">{showValue(f.from)}</s> },
    { k: "to", label: "New value", render: (f) => showValue(f.to) },
  ];

  const reset = (fn: () => void) => {
    setRows(null);
    setSel(null);
    fn();
  };

  return (
    <ArScreen className="arc">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <form className="aro-filter" onSubmit={(e) => e.preventDefault()}>
        <label>
          <span>Area</span>
          <select className="adm-input" value={area} onChange={(e) => reset(() => setArea(e.target.value))}>
            <option value="">Everything</option>
            {AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>User</span>
          <select className="adm-input" value={actor} disabled={admins.length < 2} onChange={(e) => reset(() => setActor(e.target.value))}>
            <option value="">All users</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
        </label>
        <span />
        <div className="aro-go">
          <button
            type="button"
            className="art-btn"
            disabled={!area && !actor}
            onClick={() =>
              reset(() => {
                setArea("");
                setActor("");
              })
            }
          >
            <ArIcon name="clear" />
            <span>Clear</span>
          </button>
        </div>
      </form>
      <ArSection title="Changes" n={rows?.length ?? 0} />
      {rows === null ? (
        <p className="arc-note arc-pane">Loading.</p>
      ) : !rows.length ? (
        <ArEmpty title="Nothing yet. Changes show here from now on." />
      ) : (
        <ArGrid cols={cols} rows={rows} keyOf={(r) => String(r.id)} sel={sel} onSel={setSel} menu={menu} />
      )}
      {more && rows && (
        <div className="arc-more">
          <button type="button" className="arc-btn" onClick={() => load(rows[rows.length - 1].id)}>
            Show older
          </button>
        </div>
      )}
      <ArSection title="Changed fields" n={fields.length} />
      {picked && fields.length ? (
        <ArGrid cols={fieldCols} rows={fields} keyOf={(f) => f.k} className="aro-items" />
      ) : (
        <p className="arc-note arc-pane">{picked ? "No fields recorded for this change." : "Select a change to see each field from old to new."}</p>
      )}
      <ArHelp open={help} onClose={() => setHelp(false)} title="Activity log">
        <p>Every change made in the admin, with who made it, newest first, kept for a year. The database records it, so nothing done in the admin is missing.</p>
        <p>Pick an area or a user to narrow it. Select a change to see each field it changed, from the old value to the new.</p>
        <p>Customers&apos; own actions aren&apos;t here; each order keeps its own timeline.</p>
      </ArHelp>
    </ArScreen>
  );
}
