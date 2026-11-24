"use client";

import { useState } from "react";
import { STATES } from "@/lib/addresses";
import { stateCode } from "@/lib/invoice";
import { ArGrid, ArScreen, ArSection, ArToolbar, stdMenu, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArInfo, ArPanel } from "./aronium-help";

// Management • Countries, as Aronium has it: a list of countries by name and
// code, with New country / Edit panels. Babajee delivers within India only,
// so the list is India, and its panels open read-only saying so. Under it,
// Babajee's own section: the states and union territories an address can be
// in, with the short code and the GST state code invoices and returns use.
const ONLY = "Babajee delivers within India only";
const COUNTRIES = [{ name: "India", code: "IN" }];
// ISO 3166-2:IN codes, without the "IN-"
const ISO: Record<string, string> = {
  "Andaman and Nicobar Islands": "AN", "Andhra Pradesh": "AP", "Arunachal Pradesh": "AR", Assam: "AS", Bihar: "BR", Chandigarh: "CH", Chhattisgarh: "CT",
  "Dadra and Nagar Haveli and Daman and Diu": "DH", Delhi: "DL", Goa: "GA", Gujarat: "GJ", Haryana: "HR", "Himachal Pradesh": "HP", "Jammu and Kashmir": "JK",
  Jharkhand: "JH", Karnataka: "KA", Kerala: "KL", Ladakh: "LA", Lakshadweep: "LD", "Madhya Pradesh": "MP", Maharashtra: "MH", Manipur: "MN", Meghalaya: "ML",
  Mizoram: "MZ", Nagaland: "NL", Odisha: "OR", Puducherry: "PY", Punjab: "PB", Rajasthan: "RJ", Sikkim: "SK", "Tamil Nadu": "TN", Telangana: "TG", Tripura: "TR",
  "Uttar Pradesh": "UP", Uttarakhand: "UK", "West Bengal": "WB",
};
type Country = (typeof COUNTRIES)[number];
type State = { name: string; code: string; gst: string };
type Open = { kind: "new" } | { kind: "country"; c: Country } | { kind: "state"; s: State };

export default function AroniumCountries() {
  const [sel, setSel] = useState<string | null>(null);
  const [st, setSt] = useState<string | null>(null);
  const [panel, setPanel] = useState<Open | null>(null);
  const [help, setHelp] = useState(false);
  const states: State[] = STATES.map((name) => ({ name, code: ISO[name] ?? "", gst: stateCode(name) }));
  const refresh = () => {
    setSel(null);
    setSt(null);
  };
  const editSel = sel ? () => setPanel({ kind: "country", c: COUNTRIES[0] }) : st ? () => setPanel({ kind: "state", s: states.find((x) => x.name === st)! }) : undefined;
  useArKeys({ add: () => setPanel({ kind: "new" }), edit: editSel, refresh });

  const cCols: ArCol<Country>[] = [
    { k: "name", label: "Name", render: (r) => r.name },
    { k: "code", label: "Code", render: (r) => r.code },
  ];
  const sCols: ArCol<State>[] = [
    { k: "name", label: "Name", render: (r) => r.name, sort: (r) => r.name },
    { k: "code", label: "Code", render: (r) => r.code, sort: (r) => r.code },
    { k: "gst", label: "GST state code", render: (r) => r.gst, sort: (r) => r.gst },
  ];
  // Aronium's: New country | Edit | Delete | Refresh; nothing here can be deleted
  const menu = (open: () => void) => (has: boolean) => [
    ...stdMenu({ add: () => setPanel({ kind: "new" }), addLabel: "New country", edit: open, del: () => {}, refresh, has }).map((x) => (x !== "-" && x.label === "Delete" ? { ...x, disabled: true } : x)),
  ];

  const p = panel;
  const title = !p ? "" : p.kind === "new" ? "New country" : p.kind === "country" ? `Edit Country "${p.c.name}"` : `Edit State "${p.s.name}"`;
  const name = !p || p.kind === "new" ? "" : p.kind === "country" ? p.c.name : p.s.name;
  const code = !p || p.kind === "new" ? "" : p.kind === "country" ? p.c.code : p.s.code;

  return (
    <ArScreen className="ara-countries">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: refresh },
          { icon: "add", label: "New country", onClick: () => setPanel({ kind: "new" }) },
          { icon: "edit", label: "Edit", disabled: !editSel, onClick: editSel },
          { icon: "del", label: "Delete", disabled: true, title: ONLY },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <ArGrid
        cols={cCols}
        rows={COUNTRIES}
        keyOf={(r) => r.code}
        sel={sel}
        onSel={(k) => {
          setSel(k);
          setSt(null);
        }}
        onOpen={(c) => setPanel({ kind: "country", c })}
        menu={(r) => menu(() => setPanel({ kind: "country", c: r ?? COUNTRIES[0] }))(!!r)}
        className="ara-short"
      />
      <ArSection title="States and union territories (India)" n={states.length} />
      <ArGrid
        cols={sCols}
        rows={states}
        keyOf={(r) => r.name}
        sel={st}
        onSel={(k) => {
          setSt(k);
          setSel(null);
        }}
        onOpen={(s) => setPanel({ kind: "state", s })}
        menu={(r) => menu(() => r && setPanel({ kind: "state", s: r }))(!!r)}
      />

      <ArPanel open={!!p} title={title} width="mid" canSave={false} onSave={() => {}} onClose={() => setPanel(null)} banner={<ArInfo tone="warn">{p?.kind === "state" ? "States come with the address form and the GST returns, so they can't be changed here." : `${ONLY}, so countries can't be added or changed.`}</ArInfo>}>
        <ArField label="Name">
          <input className="adm-input" readOnly value={name} />
        </ArField>
        <ArField label="Code" size="short">
          <input className="adm-input" readOnly value={code} />
        </ArField>
        {p?.kind === "state" && (
          <ArField label="GST state code" size="short" hint="The place of supply on invoices and in the GST returns.">
            <input className="adm-input" readOnly value={p.s.gst} />
          </ArField>
        )}
      </ArPanel>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Countries">
        <p>{ONLY}, so India is the one country. Customers pick their state from the list below when they give an address.</p>
        <p>The GST state code is the place of supply printed on invoices and used in the GST returns. Delivery charges and couriers are under My company, Shop settings.</p>
      </ArHelp>
    </ArScreen>
  );
}
