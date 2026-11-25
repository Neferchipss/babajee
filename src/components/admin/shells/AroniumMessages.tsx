"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { getSupabase } from "@/lib/supabase";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArToolbar, menuOf, useArKeys, type ArCol, type ArMenuItem } from "./aronium-kit";
import { ArField, ArHelp, ArPanel } from "./aronium-help";
import { ArSubTabs } from "./aronium-d-kit";

// Online shop • Messages, as one of Aronium's document screens: what people
// send from the Contact page, one row each, Open / Replied / Closed as tabs
// under the toolbar. The toolbar answers the selected one (email, WhatsApp),
// marks it, or opens the customer; the message itself reads in the pane
// under the grid, with the staff note. Double-click opens it in a panel.
// The site sends nothing itself.
type Msg = { id: string; name: string; email: string; phone: string; topic: string; order_number: string; message: string; status: "open" | "replied" | "closed"; note: string; created_at: string; profile_id: string | null };
type Tab = Msg["status"];
const TOPIC: Record<string, string> = { order: "Order", product: "Product", delivery: "Delivery", return: "Return", wholesale: "Wholesale", other: "Other" };
const STATUS: Record<Tab, string> = { open: "Open", replied: "Replied", closed: "Closed" };
const mailto = (m: Msg) => `mailto:${m.email}?subject=${encodeURIComponent("Your message to Babajee")}`;
const wa = (m: Msg) => {
  let d = m.phone.replace(/\D/g, "");
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 ? `https://wa.me/${d}?text=${encodeURIComponent(`Hi ${m.name.split(" ")[0]}, this is Babajee about your message: `)}` : null;
};

export default function AroniumMessages() {
  const router = useRouter();
  const [rows, setRows] = useState<Msg[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("open");
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<Msg | null>(null);
  const [note, setNote] = useState("");
  const [help, setHelp] = useState(false);

  const load = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from("support_messages").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) setErr(errText(error));
    else {
      setErr("");
      setRows((data ?? []) as Msg[]);
    }
  };
  useEffect(() => {
    // the rows arrive after the read; nothing is set before it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function mark(m: Msg, status: Tab, n = m.note, said?: string) {
    try {
      const { error } = await getSupabase()!.from("support_messages").update({ status, note: n }).eq("id", m.id);
      if (error) throw error;
      setRows((r) => (r ?? []).map((x) => (x.id === m.id ? { ...x, status, note: n } : x)));
      toast(said ?? (status === "open" ? "Back to open" : status === "replied" ? "Marked replied" : "Closed"));
    } catch (e) {
      toastError(errText(e));
    }
  }

  const shown = (rows ?? []).filter((m) => m.status === tab);
  const count = (t: Tab) => (rows ?? []).filter((m) => m.status === t).length;
  const picked = shown.find((m) => m.id === sel) ?? null;
  const open = (m: Msg) => {
    setNote(m.note);
    setView(m);
  };
  useArKeys({ refresh: () => void load(), edit: picked ? () => open(picked) : undefined });

  const actions = (m: Msg | null): ArMenuItem[][] => [
    [{ label: "Open", key: "F2", onClick: () => m && open(m), disabled: !m }],
    [
      { label: "Reply by email", onClick: () => m && window.location.assign(mailto(m)), disabled: !m },
      { label: "Reply on WhatsApp", onClick: () => m && window.open(wa(m)!, "_blank", "noreferrer"), disabled: !m || !wa(m) },
    ],
    [
      { label: "Mark replied", onClick: () => m && mark(m, "replied"), disabled: !m || m.status === "replied" },
      { label: "Close", onClick: () => m && mark(m, "closed"), disabled: !m || m.status === "closed" },
      { label: "Reopen", onClick: () => m && mark(m, "open"), disabled: !m || m.status === "open" },
    ],
    [
      { label: "Find the order", onClick: () => m && router.push(`/admin/orders?q=${encodeURIComponent(m.order_number)}`), disabled: !m?.order_number },
      { label: "Customer's account", onClick: () => m?.profile_id && router.push(`/admin/customers/view?id=${m.profile_id}`), disabled: !m?.profile_id },
    ],
    [{ label: "Refresh", key: "F5", onClick: () => void load() }],
  ];

  const cols: ArCol<Msg>[] = [
    { k: "date", label: "Date", render: (m) => when(m.created_at), sort: (m) => m.created_at },
    { k: "name", label: "Name", render: (m) => m.name, sort: (m) => m.name.toLowerCase() },
    { k: "topic", label: "Topic", render: (m) => TOPIC[m.topic] ?? m.topic, sort: (m) => m.topic },
    { k: "order", label: "Order", render: (m) => m.order_number },
    { k: "email", label: "Email", render: (m) => m.email },
    { k: "phone", label: "Phone number", render: (m) => m.phone },
    { k: "msg", label: "Message", render: (m) => <span className="ard4-clip">{m.message}</span> },
    { k: "note", label: "Note", render: (m) => <span className="ard4-clip">{m.note}</span> },
  ];

  return (
    <ArScreen className="ard4">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "open", label: "Open", disabled: !picked, onClick: () => picked && open(picked) },
          { icon: "export", label: "Email", disabled: !picked, onClick: () => picked && window.location.assign(mailto(picked)) },
          { icon: "swap", label: "WhatsApp", disabled: !picked || !wa(picked), onClick: () => picked && window.open(wa(picked)!, "_blank", "noreferrer") },
          { icon: "paid", label: "Mark replied", disabled: !picked || picked.status === "replied", onClick: () => picked && mark(picked, "replied") },
          { icon: "box", label: "Close", disabled: !picked || picked.status === "closed", onClick: () => picked && mark(picked, "closed") },
          { icon: "history", label: "Reopen", disabled: !picked || picked.status === "open", onClick: () => picked && mark(picked, "open") },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <ArSubTabs
        label="Messages"
        on={tab}
        onPick={(t) => (setTab(t), setSel(null))}
        tabs={(["open", "replied", "closed"] as Tab[]).map((t) => [t, STATUS[t], count(t)] as const)}
      />
      {err && <p className="adm-err">{err}</p>}
      <ArSection title="Messages" n={shown.length} />
      {rows === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !shown.length ? (
        <ArEmpty title={tab === "open" ? "No open messages" : "No messages"} />
      ) : (
        <ArGrid cols={cols} rows={shown} keyOf={(m) => m.id} sel={sel} onSel={setSel} onOpen={open} menu={(m) => menuOf(...actions(m))} className="ars-grid" />
      )}
      {picked && (
        <div className="ard4-pane">
          <ArSection title={`${picked.name} · ${TOPIC[picked.topic] ?? picked.topic}`} />
          <p className="ard4-text">{picked.message}</p>
        </div>
      )}

      <ArPanel
        open={!!view}
        title={view ? `Message from ${view.name}` : ""}
        width="mid"
        saveLabel="Save note"
        canSave={!!view && note.trim() !== view.note}
        onSave={() => {
          if (view) void mark(view, view.status, note.trim(), "Note saved");
          setView(null);
        }}
        onClose={() => setView(null)}
      >
        {view && (
          <>
            <ArField label="Received">
              <input className="adm-input" readOnly value={when(view.created_at)} />
            </ArField>
            <ArField label="Topic">
              <input className="adm-input" readOnly value={TOPIC[view.topic] ?? view.topic} />
            </ArField>
            {view.order_number && (
              <ArField label="Order">
                <input className="adm-input" readOnly value={view.order_number} />
              </ArField>
            )}
            <ArField label="Email">
              <input className="adm-input" readOnly value={view.email} />
            </ArField>
            {view.phone && (
              <ArField label="Phone number">
                <input className="adm-input" readOnly value={view.phone} />
              </ArField>
            )}
            <ArField label="Message">
              <textarea className="adm-input" readOnly rows={6} value={view.message} />
            </ArField>
            <ArField label="Staff note" hint="Only staff see it: what you replied, what's pending.">
              <input className="adm-input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </ArField>
            <div className="ard4-btnrow">
              <a className="adm-btn" href={mailto(view)}>
                Reply by email
              </a>
              {wa(view) && (
                <a className="adm-btn" href={wa(view)!} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              )}
              {(["open", "replied", "closed"] as Tab[])
                .filter((s) => s !== view.status)
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="adm-btn"
                    onClick={() => {
                      void mark(view, s, note.trim());
                      setView(null);
                    }}
                  >
                    {s === "open" ? "Reopen" : s === "replied" ? "Mark replied" : "Close"}
                  </button>
                ))}
            </div>
          </>
        )}
      </ArPanel>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Messages">
        <p>What people send from the shop&apos;s Contact page. The site never answers by itself: reply by email or WhatsApp, then mark the message replied, or close it.</p>
        <p>Click a row to read it underneath; double-click (or F2) opens it with a staff note only staff see. Right-click a row for everything you can do with it.</p>
      </ArHelp>
    </ArScreen>
  );
}
