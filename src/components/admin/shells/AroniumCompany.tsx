"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { REASONS } from "@/components/admin/reports-config";
import { STATES } from "@/lib/addresses";
import { errText, getSettings, saveSettings, type StoreSettings } from "@/lib/orders-db";
import { can, useStaff } from "@/lib/staff";
import { ArEmpty, ArScreen, ArToolbar } from "./aronium-kit";
import { InfoBox, NotKept, SecTitle } from "./aronium-b-kit";
import "./aronium-screens-b.css";

// My company in the Aronium-style design, as Aronium's: its tabs (Company
// data, Void reasons, My logo, Reset database) and then Babajee's own (Shop
// settings: every other setting, the ordinary settings page). The admin's look is Admin theme, in the menu.
// Company data is the form with labels on the left; what Babajee doesn't keep
// is greyed with why. Reset database isn't available in Babajee.
type Keys = "store_name" | "legal_name" | "gstin" | "store_address" | "store_phone" | "store_email" | "store_state" | "bank_account_name" | "bank_account_number" | "bank_ifsc" | "bank_upi_id" | "invoice_prefix" | "invoice_note";
type Form = Pick<StoreSettings, Keys | "return_days" | "unpaid_hours">;
type Tab = "data" | "void" | "logo" | "reset" | "shop";

export default function AroniumCompany({ shopPage }: { shopPage?: React.ReactNode }) {
  const params = useSearchParams();
  const tab: Tab = shopPage ? "shop" : ((["void", "logo", "reset"] as const).find((t) => t === params.get("tab")) ?? "data");
  const strip = (
    <nav className="ars-innertabs" aria-label="My company">
      {(
        [
          ["data", "Company data", "/admin/settings"],
          ["void", "Void reasons", "/admin/settings?tab=void"],
          ["logo", "My logo", "/admin/settings?tab=logo"],
          ["reset", "Reset database", "/admin/settings?tab=reset"],
          ["shop", "Shop settings", "/admin/settings?view=shop"],
        ] as const
      ).map(([id, label, href]) => (
        <Link key={id} href={href} className={`${tab === id ? "is-on" : ""} ${id === "reset" ? "is-off" : ""} ${id === "shop" ? "is-ext" : ""}`} aria-current={tab === id ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
  if (shopPage)
    return (
      <>
        <ArScreen className="ars-company-strip">{strip}</ArScreen>
        <div className="ars-shoppage">{shopPage}</div>
      </>
    );
  return <CompanyForm tab={tab} strip={strip} />;
}

function CompanyForm({ tab, strip }: { tab: Tab; strip: React.ReactNode }) {
  const { me } = useStaff();
  const editable = can(me?.role ?? null, "settings");
  const [was, setWas] = useState<Form | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    getSettings().then(
      (s) => {
        const pick: Form = {
          store_name: s.store_name,
          legal_name: s.legal_name,
          gstin: s.gstin,
          store_address: s.store_address,
          store_phone: s.store_phone,
          store_email: s.store_email,
          store_state: s.store_state,
          bank_account_name: s.bank_account_name,
          bank_account_number: s.bank_account_number,
          bank_ifsc: s.bank_ifsc,
          bank_upi_id: s.bank_upi_id,
          invoice_prefix: s.invoice_prefix,
          invoice_note: s.invoice_note,
          return_days: s.return_days,
          unpaid_hours: s.unpaid_hours,
        };
        setWas(pick);
        setF(pick);
      },
      (e) => setErr(errText(e)),
    );
  }, [tick]);

  const changed = !!f && !!was && JSON.stringify(f) !== JSON.stringify(was);
  async function save() {
    if (!f || !changed) return;
    setBusy(true);
    try {
      await saveSettings({ ...f, gstin: f.gstin.trim().toUpperCase() });
      setWas(f);
      toast("Saved");
    } catch (x) {
      toastError(x);
    }
    setBusy(false);
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => f && setF({ ...f, [k]: v });
  const text = (k: Keys, label: string, size = "", area = false, required = false) => (
    <label className="arf-row">
      <span>{label}</span>
      {area ? (
        <textarea className={`adm-input ${size}`} rows={3} value={(f?.[k] as string) ?? ""} disabled={!editable} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className={`adm-input ${size} ${required && !(f?.[k] as string)?.trim() ? "is-required" : ""}`} value={(f?.[k] as string) ?? ""} disabled={!editable} onChange={(e) => set(k, e.target.value)} />
      )}
    </label>
  );
  const notKept = (label: string, size: string, why?: string) => (
    <label className="arf-row">
      <span>{label}</span>
      <span className="arb-ctl">
        <input className={`adm-input ${size}`} disabled />
        {why && <NotKept why={why} />}
      </span>
    </label>
  );
  const saveTool = { icon: "paid", label: "Save", disabled: !changed || busy || !editable, onClick: () => void save() };
  const helpTool = { icon: "help", label: "Help", href: "/admin/settings?view=shop", title: "All the shop's settings" };

  return (
    <ArScreen>
      {strip}
      {tab === "data" && (
        <>
          <ArToolbar tools={[saveTool, helpTool]} />
          {err && <p className="adm-err">{err}</p>}
          {!editable && <p className="arf-note ars-pad">Your role can see these but not change them.</p>}
          {f && (
            <form
              className="arf ars-pad"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <SecTitle>My company data</SecTitle>
              {text("store_name", "Name", "", false, true)}
              {text("gstin", "Tax number", "is-short")}
              {text("store_address", "Street name", "", true)}
              {notKept("Building number", "is-short", "Part of the street lines in Babajee.")}
              {notKept("Additional street name", "")}
              {notKept("Plot identification", "is-mid")}
              {notKept("District", "is-mid")}
              {notKept("Postal code", "is-short")}
              {notKept("City", "is-mid")}
              <label className="arf-row">
                <span>State / Province</span>
                <select className="adm-input is-mid" value={f.store_state} disabled={!editable} onChange={(e) => set("store_state", e.target.value)}>
                  <option value="">—</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="arf-row">
                <span>Country</span>
                <select className="adm-input is-mid" disabled value="India">
                  <option>India</option>
                </select>
              </label>
              {text("store_phone", "Phone number", "is-mid")}
              {text("store_email", "Email", "is-mid")}
              {text("legal_name", "Legal name (on invoices)", "")}
              <SecTitle>Bank account</SecTitle>
              {text("bank_account_number", "Bank acc. number", "is-mid")}
              {text("bank_account_name", "Bank acc. name", "is-mid")}
              {text("bank_ifsc", "IFSC", "is-short")}
              {text("bank_upi_id", "UPI ID", "is-mid")}
              <SecTitle>Invoice</SecTitle>
              {text("invoice_prefix", "Invoice prefix", "is-short")}
              {text("invoice_note", "Invoice note", "", true)}
              <SecTitle>Logo</SecTitle>
              <div className="arb-inline">
                <button type="button" className="ara-panel-btn" disabled>
                  Browse
                </button>
                <button type="button" className="ara-panel-btn" disabled>
                  Clear
                </button>
                <Link href="/admin/storefront" className="arb-link">
                  The logo is set with the shop&apos;s design
                </Link>
              </div>
              <button hidden aria-hidden="true" />
            </form>
          )}
        </>
      )}
      {tab === "void" && (
        <>
          <ArToolbar tools={[{ icon: "refresh", label: "Refresh", onClick: () => setTick(tick + 1) }, saveTool, { icon: "del", label: "Delete", disabled: true }, helpTool]} />
          <div className="arf ars-pad">
            <div className="arb-inline">
              <input className="adm-input" placeholder="Insert new void reason here..." disabled />
              <button type="button" className="ara-panel-btn" disabled>
                + Add void reason
              </button>
            </div>
            <NotKept why="Babajee's reasons are fixed: they are what customers pick when they ask to return or cancel." />
            <ul className="arb-list">
              {Object.entries(REASONS).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
            {f && (
              <>
                <SecTitle>Returns and unpaid orders</SecTitle>
                <label className="arf-row">
                  <span>Return window (days)</span>
                  <input className="adm-input is-short" type="number" min={0} value={f.return_days} disabled={!editable} onChange={(e) => set("return_days", Math.max(0, Number(e.target.value) || 0))} />
                </label>
                <p className="arf-note">Days after delivery a customer can ask for a return; 0 means no returns.</p>
                <label className="arf-row">
                  <span>Unpaid orders cancel after (hours)</span>
                  <input className="adm-input is-short" type="number" min={0} value={f.unpaid_hours} disabled={!editable} onChange={(e) => set("unpaid_hours", Math.max(0, Number(e.target.value) || 0))} />
                </label>
                <p className="arf-note">0 means never.</p>
              </>
            )}
          </div>
        </>
      )}
      {tab === "logo" && (
        <>
          <div className="arb-inline ars-pad arb-minibar">
            <button type="button" className="ara-panel-btn" disabled>
              + Add logo
            </button>
            <button type="button" className="ara-panel-btn" disabled>
              Remove logo
            </button>
          </div>
          <ArEmpty title={'No logo has been selected. Click "Add logo" button to select your logo.'} action="The shop's logo is set with its design" href="/admin/storefront" />
        </>
      )}
      {tab === "reset" && (
        <div className="arf ars-pad">
          <InfoBox tone="bad">Not available in Babajee. The shop&apos;s data lives online and is backed up there; it can&apos;t be wiped from the admin.</InfoBox>
          <InfoBox tone="warn">This is destructive operation. Please make sure to read instructions before you proceed.</InfoBox>
          <ol className="arb-steps">
            <li>
              <b>Backup database path</b>
              <small>Location where database backup will be saved</small>
              <input className="adm-input" disabled />
            </li>
            <li>
              <b>Select entities to reset</b>
              <label className="adm-check">
                <input type="checkbox" disabled /> Products
              </label>
              <label className="adm-check">
                <input type="checkbox" disabled /> Customers
              </label>
              <label className="adm-check">
                <input type="checkbox" disabled /> Documents
              </label>
            </li>
            <li>
              <b>Confirmation</b>
              <small>Enter administrator password</small>
              <input className="adm-input is-mid" type="password" disabled />
              <button type="button" className="ara-panel-btn" disabled>
                Reset database
              </button>
            </li>
          </ol>
        </div>
      )}
    </ArScreen>
  );
}
