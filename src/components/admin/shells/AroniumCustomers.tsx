"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { Dialog, money } from "@/components/admin/ui";
import { STATES } from "@/lib/addresses";
import { customersCsv, download } from "@/lib/orders-csv";
import { addCustomer, customerAccount, deleteSegment, errText, listCustomers, listSegments, saveSegment, updateCustomer, type Customer, type CustomerAccount, type Segment } from "@/lib/orders-db";
import { GroupBuilder, SEGMENTS } from "@/components/admin/customer/groups";
import { useAuth } from "@/lib/auth";
import { blankRule, describe, meetsAll, type Rule } from "@/lib/customer-groups";
import { listSuppliers, saveSupplier, type Supplier } from "@/lib/stock-in/db";
import { ArGrid, ArIcon, ArScreen, ArSwitch, ArToolbar, Tick, useArKeys, useArMenu, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArField, ArPanel } from "./aronium-help";
import { InfoBox, NotKept, PanelTabs, SecTitle, Stepper } from "./aronium-b-kit";
import "./aronium-screens-b.css";

// Customers & suppliers in the Aronium-style design, as Aronium's: one grid
// of everyone the shop sells to or buys from, a search box with its field
// picker, and a toolbar. Add and Edit slide Aronium's "customer / supplier"
// panel in from the right with its four tabs (General, Discounts, Loyalty
// cards, Payment terms); what Babajee keeps is editable, the rest is shown
// greyed with why. Babajee's extras: the customer groups down the left (the
// ready-made ones and the shop's own, built from rules, like Products' group
// tree), a Tags column with tag search, and Orders and Spent.
type Row = { key: string; kind: "customer" | "supplier"; c?: Customer; s?: Supplier };
type Field = "name" | "phone" | "email" | "place" | "tag";
type Tab = "general" | "discounts" | "loyalty" | "terms";
const TABS = [
  ["general", "General"],
  ["discounts", "Discounts"],
  ["loyalty", "Loyalty cards"],
  ["terms", "Payment terms"],
] as const;

export default function AroniumCustomers() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [field, setField] = useState<Field>("name");
  const [sel, setSel] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ row: Row | null } | null>(null);
  const [removing, setRemoving] = useState<Supplier | null>(null);
  const { user } = useAuth();
  const [groups, setGroups] = useState<Segment[]>([]);
  const [seg, setSeg] = useState("all");
  const [building, setBuilding] = useState<{ id?: string; name: string; rules: Rule[] } | null>(null);
  const [dropping, setDropping] = useState<Segment | null>(null);
  const tree = useArMenu();

  const load = () =>
    Promise.all([listCustomers(), listSuppliers().catch(() => [] as Supplier[]), listSegments().catch(() => [] as Segment[])]).then(
      ([c, s, g]) => {
        setCustomers(c);
        setSuppliers(s);
        setGroups(g);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);

  const rows: Row[] = useMemo(
    () => [...(customers ?? []).map((c) => ({ key: `c${c.id}`, kind: "customer" as const, c })), ...suppliers.map((s) => ({ key: `s${s.id}`, kind: "supplier" as const, s }))],
    [customers, suppliers],
  );
  // the group picked on the left: everyone, suppliers, a ready-made group or one of the shop's own
  const own = groups.find((g) => g.id === seg);
  const inGroup = (r: Row) => {
    if (seg === "all") return true;
    if (seg === "suppliers") return r.kind === "supplier";
    if (!r.c) return false;
    if (own) return meetsAll(r.c, own.rules);
    return (SEGMENTS.find((x) => x.id === seg) ?? SEGMENTS[0]).match(r.c);
  };
  const countOf = (m: (c: Customer) => boolean) => (customers ?? []).filter(m).length;
  const words = q.trim().toLowerCase();
  const hay = (r: Row) => {
    if (field === "name") return r.c ? r.c.full_name : r.s!.name;
    if (field === "phone") return r.c ? r.c.phone : r.s!.phone;
    if (field === "email") return r.c?.email ?? "";
    if (field === "tag") return r.c ? r.c.tags.join(" ") : "";
    return r.c ? `${r.c.city} ${r.c.state}` : "";
  };
  const shown = rows.filter((r) => inGroup(r) && (!words || hay(r).toLowerCase().includes(words)));
  const picked = shown.find((r) => r.key === sel) ?? null;

  const nameOf = (r: Row) => (r.c ? r.c.full_name || r.c.email : r.s!.name);
  const cols: ArCol<Row>[] = [
    { k: "code", label: "Code", render: (r) => (r.c ? r.c.id.slice(0, 6).toUpperCase() : "") },
    { k: "name", label: "Name", render: (r) => nameOf(r) + (r.c?.is_test ? " (test)" : ""), sort: nameOf },
    { k: "tax", label: "Tax number", render: (r) => r.s?.gstin || "(none)" },
    { k: "addr", label: "Address", render: (r) => (r.c ? [r.c.city, r.c.state].filter(Boolean).join(", ") || "(none)" : "(none)") },
    { k: "country", label: "Country", render: () => "India" },
    { k: "phone", label: "Phone number", render: (r) => (r.c ? r.c.phone : r.s!.phone) || "(none)" },
    { k: "email", label: "Email", render: (r) => r.c?.email || "(none)" },
    { k: "active", label: "Active", center: true, render: (r) => <Tick on={r.c ? true : r.s!.active} /> },
    { k: "customer", label: "Customer", center: true, render: (r) => <Tick on={r.kind === "customer" && r.c?.role !== "admin"} /> },
    { k: "taxex", label: "Tax exempt", center: true, render: () => <Tick on={false} /> },
    { k: "supplier", label: "Supplier", center: true, render: (r) => <Tick on={r.kind === "supplier"} /> },
    { k: "tags", label: "Tags", render: (r) => (r.c?.tags.length ? <span className="arb-tags">{r.c.tags.map((t) => <i key={t}>{t}</i>)}</span> : "") },
    { k: "orders", label: "Orders", right: true, render: (r) => (r.c ? r.c.orders : ""), sort: (r) => r.c?.orders ?? -1 },
    { k: "spent", label: "Spent", right: true, render: (r) => (r.c ? money(r.c.spent) : ""), sort: (r) => r.c?.spent ?? -1 },
  ];

  const add = () => setPanel({ row: null });
  const edit = (r: Row | null) => r && setPanel({ row: r });
  const del = (r: Row | null) => r?.s && r.s.active && setRemoving(r.s);
  useArKeys({ add, refresh: () => void load(), edit: () => edit(picked), del: () => del(picked) });
  // Aronium: Add | Edit | Delete | Refresh, each its own group
  const menu = (r: Row | null): ArMenuItem[] => [
    { label: "Add", key: "Ctrl+N", onClick: add },
    "-",
    { label: "Edit", disabled: !r, onClick: () => edit(r) },
    "-",
    { label: "Delete", key: "Del", disabled: !r?.s?.active, onClick: () => del(r) },
    "-",
    { label: "Refresh", key: "F5", onClick: () => void load() },
  ];

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
      setDropping(null);
      toast(`Group "${g.name}" deleted`);
    } catch (e) {
      toastError(e);
    }
  }
  const newGroup = () => setBuilding({ name: "", rules: [blankRule()] });
  const editGroup = () => own && setBuilding({ id: own.id, name: own.name, rules: own.rules });
  // like Products' group tree: New group, Edit group | Delete group | Refresh
  const groupMenu = (): ArMenuItem[] => [
    { label: "New group", onClick: newGroup },
    { label: "Edit group", disabled: !own, onClick: editGroup },
    "-",
    { label: "Delete group", disabled: !own, onClick: () => own && setDropping(own) },
    "-",
    { label: "Refresh", key: "F5", onClick: () => void load() },
  ];
  const allTags = [...new Set((customers ?? []).flatMap((c) => c.tags))].sort();

  return (
    <ArScreen>
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "add", label: "Add", onClick: add },
          { icon: "edit", label: "Edit", disabled: !picked, onClick: () => edit(picked) },
          { icon: "del", label: "Delete", disabled: !picked?.s?.active, onClick: () => del(picked), title: "Suppliers only: set inactive" },
          { icon: "import", label: "Import", disabled: true },
          { icon: "export", label: "Export", disabled: !customers?.length, onClick: () => customers && download("babajee-customers.csv", customersCsv(customers)) },
          { icon: "help", label: "Help", href: "/admin/customers/sign-ins", title: "Customers' sign-ins" },
          { icon: "folderAdd", label: "New group", onClick: newGroup, title: "A customer group made from rules" },
          { icon: "folderEdit", label: "Edit group", disabled: !own, onClick: editGroup },
          { icon: "del", label: "Delete group", disabled: !own, onClick: () => own && setDropping(own) },
        ]}
      />
      {err && <p className="adm-err">{err}</p>}
      <div className="ars-body">
      <nav className="arp-tree" aria-label="Customer groups" onContextMenu={(e) => tree.open(e, groupMenu())}>
        {tree.node}
        <button type="button" className={`arp-root ${seg === "all" ? "is-on" : ""}`} onClick={() => setSeg("all")}>
          <ArIcon name="folder" size={16} />
          Everyone
        </button>
        <ul>
          {SEGMENTS.filter((x) => x.id !== "all").map((x) => (
            <li key={x.id}>
              <button type="button" className={seg === x.id ? "is-on" : ""} onClick={() => setSeg(x.id)}>
                <ArIcon name="folder" size={16} />
                <span>{x.label}</span>
                <small>{countOf(x.match)}</small>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className={seg === "suppliers" ? "is-on" : ""} onClick={() => setSeg("suppliers")}>
              <ArIcon name="folder" size={16} />
              <span>Suppliers</span>
              <small>{suppliers.length}</small>
            </button>
          </li>
        </ul>
        <p className="arb-treehead">Your groups</p>
        <ul>
          {groups.map((g) => (
            <li key={g.id}>
              <button type="button" className={seg === g.id ? "is-on" : ""} title={g.rules.map(describe).join(" · ")} onClick={() => setSeg(g.id)} onDoubleClick={() => setBuilding({ id: g.id, name: g.name, rules: g.rules })}>
                <ArIcon name="folder" size={16} />
                <span>{g.name}</span>
                <small>{countOf((c) => meetsAll(c, g.rules))}</small>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="arb-treeadd" onClick={newGroup}>
              + New group
            </button>
          </li>
        </ul>
      </nav>
      <section className="arp-list">
      <div className="arp-search ars-cs-search">
        <select className="ars-field-pick" value={field} onChange={(e) => setField(e.target.value as Field)} aria-label="Search in">
          <option value="name">Name</option>
          <option value="phone">Phone number</option>
          <option value="email">Email</option>
          <option value="place">City / state</option>
          <option value="tag">Tag</option>
        </select>
        <input type="search" placeholder="Search customers & suppliers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers and suppliers" />
        <ArIcon name="search" size={20} />
        <span className="arp-count">
          Count: <b>{customers ? shown.length : "…"}</b>
        </span>
      </div>
      <ArGrid cols={cols} rows={shown} keyOf={(r) => r.key} sel={sel} onSel={setSel} onOpen={edit} menu={menu} />
      </section>
      </div>

      {building && (
        <div className="arb-slide" role="dialog" aria-label={building.id ? "Edit group" : "New group"}>
          <header>
            <h2>{building.id ? `Edit group "${building.name}"` : "New group"}</h2>
            <button type="button" aria-label="Close" onClick={() => setBuilding(null)}>
              <ArIcon name="open" size={22} />
            </button>
          </header>
          <div className="arb-slide-body">
            <GroupBuilder
              start={building}
              rows={customers ?? []}
              tags={allTags}
              cities={[...new Set((customers ?? []).map((c) => c.city).filter(Boolean))].sort()}
              states={[...new Set((customers ?? []).map((c) => c.state).filter(Boolean))].sort()}
              onCancel={() => setBuilding(null)}
              onSave={saveGroup}
              onDelete={building.id ? () => removeGroup(groups.find((g) => g.id === building.id)!) : undefined}
            />
          </div>
        </div>
      )}
      <Dialog open={dropping !== null} onClose={() => setDropping(null)}>
        {dropping && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void removeGroup(dropping);
            }}
          >
            <h2>Delete group &quot;{dropping.name}&quot;?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              Only the group goes; its customers stay.
            </p>
            <div className="adm-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="adm-btn" onClick={() => setDropping(null)}>
                Cancel
              </button>
              <button className="adm-btn bad">Delete</button>
            </div>
          </form>
        )}
      </Dialog>

      {panel && (
        <PartyPanel
          key={panel.row?.key ?? "new"}
          row={panel.row}
          onOpenPage={(id) => router.push(`/admin/customers/view?id=${id}`)}
          onClose={() => setPanel(null)}
          onSaved={(msg) => {
            setPanel(null);
            toast(msg);
            void load();
          }}
        />
      )}
      <Dialog open={removing !== null} onClose={() => setRemoving(null)}>
        {removing && (
          <form
            method="dialog"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveSupplier({ id: removing.id, active: false });
                toast(`${removing.name} set inactive`);
                setRemoving(null);
                void load();
              } catch (x) {
                toastError(x);
              }
            }}
          >
            <h2>Delete {removing.name}?</h2>
            <p className="adm-muted" style={{ margin: 0 }}>
              The supplier is set inactive and kept with its bills. Switch Active back on in Edit to bring it back.
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

// Aronium's "New customer / supplier" panel; Edit opens the same with the
// row's details. A customer's account (name, GSTIN, active) is saved here;
// their addresses, phone and email are on the customer's own page.
function PartyPanel({ row, onClose, onSaved, onOpenPage }: { row: Row | null; onClose: () => void; onSaved: (msg: string) => void; onOpenPage: (id: string) => void }) {
  const isNew = !row;
  const [tab, setTab] = useState<Tab>("general");
  const [isCustomer, setIsCustomer] = useState(row ? row.kind === "customer" : true);
  const [acct, setAcct] = useState<CustomerAccount | null>(null);
  const c = row?.c;
  const s = row?.s;
  const [d, setD] = useState({
    name: c?.full_name ?? s?.name ?? "",
    gstin: s?.gstin ?? "",
    phone: c?.phone ?? s?.phone ?? "",
    email: c?.email ?? "",
    street: "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    pincode: "",
    notes: s?.notes ?? "",
    active: s ? s.active : true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // a customer's account details (first and last name, GSTIN, status)
  useEffect(() => {
    if (!c) return;
    customerAccount(c.id).then((a) => {
      setAcct(a);
      if (a) setD((x) => ({ ...x, name: [a.first_name, a.last_name].filter(Boolean).join(" ") || x.name, gstin: a.gstin || "", active: a.status === "active" }));
    });
  }, [c]);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD({ ...d, [k]: v });
  const editingCustomer = !!c;
  const lockKind = !isNew;

  async function save() {
    if (!d.name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      if (isNew && isCustomer) {
        await addCustomer({ name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(), address: d.city || d.state || d.street ? { line1: d.street.trim(), line2: "", city: d.city.trim(), state: d.state, pincode: d.pincode.trim() } : null, tags: [] });
        onSaved(`${d.name.trim()} added`);
      } else if (isNew || s) {
        await saveSupplier({ ...(s ? { id: s.id } : {}), name: d.name.trim(), phone: d.phone.trim(), gstin: d.gstin.trim().toUpperCase(), notes: d.notes, active: d.active });
        onSaved(`${d.name.trim()} saved`);
      } else if (c) {
        const [first, ...rest] = d.name.trim().split(/\s+/);
        await updateCustomer(c.id, { first_name: first ?? "", last_name: rest.join(" "), gstin: d.gstin.trim().toUpperCase(), status: d.active ? "active" : acct?.status === "blocked" ? "blocked" : "inactive" });
        onSaved(`${d.name.trim()} saved`);
      }
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  }

  const title = isNew ? "New customer / supplier" : `Edit "${c?.full_name || c?.email || s?.name}"`;
  return (
    <ArPanel open title={title} onClose={onClose} onSave={() => void save()} canSave={!busy && !!d.name.trim()}>
      <PanelTabs tabs={TABS} on={tab} onPick={setTab} />
      {c?.is_test && <InfoBox tone="bad">This is a test account used to try the shop. We strongly suggest you do not modify it.</InfoBox>}
      {tab === "general" && (
        <div className="arb-fields">
          <SecTitle>General info</SecTitle>
          <ArField label="Name">
            <input className={`adm-input ${d.name.trim() ? "" : "is-required"}`} autoFocus={isNew} value={d.name} onChange={(e) => set("name", e.target.value)} />
          </ArField>
          <ArField label="Code">
            <input className="adm-input is-short" value={c ? c.id.slice(0, 6).toUpperCase() : ""} readOnly disabled />
          </ArField>
          <ArField label="Tax number">
            <input className="adm-input is-mid" value={d.gstin} onChange={(e) => set("gstin", e.target.value)} disabled={isNew && isCustomer} />
          </ArField>
          <ArField label="Street name">
            <input className="adm-input" value={d.street} onChange={(e) => set("street", e.target.value)} disabled={!isNew || !isCustomer} />
          </ArField>
          <ArField label="Building number">
            <input className="adm-input is-short" disabled />
            <NotKept why="Part of the street line in Babajee." />
          </ArField>
          <ArField label="Additional street name">
            <input className="adm-input" disabled />
          </ArField>
          <ArField label="Plot identification">
            <input className="adm-input is-mid" disabled />
          </ArField>
          <ArField label="District">
            <input className="adm-input is-mid" disabled />
          </ArField>
          <ArField label="Postal code">
            <input className="adm-input is-short" value={d.pincode} inputMode="numeric" onChange={(e) => set("pincode", e.target.value)} disabled={!isNew || !isCustomer} />
          </ArField>
          <ArField label="City">
            <input className="adm-input is-mid" value={d.city} onChange={(e) => set("city", e.target.value)} disabled={!isNew || !isCustomer} />
          </ArField>
          <ArField label="State / Province">
            <select className="adm-input is-mid" value={d.state} onChange={(e) => set("state", e.target.value)} disabled={!isNew || !isCustomer}>
              <option value="">—</option>
              {STATES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </ArField>
          <ArField label="Country">
            <select className="adm-input is-mid" disabled value="India">
              <option>India</option>
            </select>
          </ArField>
          <ArField label="Phone number">
            <input className="adm-input is-mid" type="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} disabled={editingCustomer} />
          </ArField>
          <ArField label="Email">
            <input className="adm-input is-mid" type="email" value={d.email} onChange={(e) => set("email", e.target.value)} disabled={editingCustomer || !isCustomer} />
          </ArField>
          {!isCustomer && (
            <ArField label="Notes">
              <textarea className="adm-input" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
            </ArField>
          )}
          <div className="arb-toggles">
            <ArSwitch on={d.active} onChange={(v) => set("active", v)} label="Active" />
            <ArSwitch on={isCustomer} onChange={(v) => !lockKind && setIsCustomer(v)} label="Customer" />
            <ArSwitch on={!isCustomer} onChange={(v) => !lockKind && setIsCustomer(!v)} label="Supplier" />
          </div>
          {editingCustomer && (
            <p className="arf-note">
              Addresses, phone and email are kept on the customer&apos;s page.{" "}
              <button type="button" className="arb-link" onClick={() => onOpenPage(c!.id)}>
                Open the customer&apos;s page
              </button>
            </p>
          )}
        </div>
      )}
      {tab === "discounts" && (
        <div className="arb-fields">
          <SecTitle>Set customer discounts for products or product groups</SecTitle>
          <InfoBox>Babajee has no per-customer discounts. Offers on products are under Promotions.</InfoBox>
          <p>
            <Link href="/admin/promotions" className="arb-link">
              Open Promotions
            </Link>
          </p>
        </div>
      )}
      {tab === "loyalty" && (
        <div className="arb-fields">
          <SecTitle>Enter customer loyalty cards</SecTitle>
          <div className="arb-inline">
            <input className="adm-input is-mid" placeholder="Card number" disabled />
            <button type="button" className="ara-panel-btn" disabled>
              + Add card
            </button>
            <button type="button" className="ara-panel-btn" disabled>
              Delete
            </button>
          </div>
          <NotKept why="Babajee has no loyalty cards." />
        </div>
      )}
      {tab === "terms" && (
        <div className="arb-fields">
          <InfoBox>Use due date period to set number of days before transaction must be paid for each unpaid sale assigned to this customer.</InfoBox>
          <ArField label="Due date period">
            <Stepper value={0} disabled label="days" after="days" />
            <NotKept why="Unpaid orders follow the shop's hold time (My company › Void reasons)." />
          </ArField>
          <div className="arb-toggles">
            <ArSwitch on={false} onChange={() => {}} label="Tax exempt" />
          </div>
          <NotKept why="Tax exemption isn't kept; a GSTIN on the customer makes their invoices B2B." />
          <ArField label="Price list">
            <select className="adm-input is-mid" disabled>
              <option>(none)</option>
            </select>
          </ArField>
        </div>
      )}
      {err && <p className="adm-err">{err}</p>}
    </ArPanel>
  );
}
