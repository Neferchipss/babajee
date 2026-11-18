"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import { errText } from "@/lib/orders-db";
import { getSupabase } from "@/lib/supabase";

// Customers > Messages (0074): what people send from the Contact page. The
// site sends nothing; reply by email or WhatsApp from here, then mark it.
type Msg = { id: string; name: string; email: string; phone: string; topic: string; order_number: string; message: string; status: "open" | "replied" | "closed"; note: string; created_at: string; profile_id: string | null };
const TOPIC: Record<string, string> = { order: "Order", product: "Product", delivery: "Delivery", return: "Return", wholesale: "Wholesale", other: "Other" };
type Tab = "open" | "replied" | "closed";

export default function SupportPage() {
  const [rows, setRows] = useState<Msg[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("open");
  const load = async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from("support_messages").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) setErr(errText(error));
    else setRows((data ?? []) as Msg[]);
  };
  useEffect(() => {
    // the rows arrive after the read; nothing is set before it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function mark(m: Msg, status: Msg["status"], note = m.note, said?: string) {
    try {
      const { error } = await getSupabase()!.from("support_messages").update({ status, note }).eq("id", m.id);
      if (error) throw error;
      setRows((r) => (r ?? []).map((x) => (x.id === m.id ? { ...x, status, note } : x)));
      toast(said ?? (status === "open" ? "Back to open" : status === "replied" ? "Marked replied" : "Closed"));
    } catch (e) {
      toastError(errText(e));
    }
  }

  const shown = (rows ?? []).filter((m) => m.status === tab);
  const count = (t: Tab) => (rows ?? []).filter((m) => m.status === t).length;
  const wa = (m: Msg) => {
    let d = m.phone.replace(/\D/g, "");
    if (d.length === 10) d = `91${d}`;
    return d.length >= 11 ? `https://wa.me/${d}?text=${encodeURIComponent(`Hi ${m.name.split(" ")[0]}, this is Babajee about your message: `)}` : null;
  };

  return (
    <div>
      <header className="adm-pagehead">
        <h1>Messages</h1>
        <p>From the Contact page. Reply by email or WhatsApp, then mark it replied or closed. The site never sends anything itself.</p>
      </header>
      {err && <p className="adm-err">{err}</p>}
      <div className="adm-chips" role="tablist" style={{ marginBottom: 12 }}>
        {(["open", "replied", "closed"] as Tab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`adm-chip ${tab === t ? "is-on" : ""}`} onClick={() => setTab(t)}>
            {t === "open" ? "Open" : t === "replied" ? "Replied" : "Closed"} {count(t) > 0 && <b>{count(t)}</b>}
          </button>
        ))}
      </div>
      {rows === null && !err ? (
        <p className="adm-muted">Loading.</p>
      ) : !shown.length ? (
        <p className="adm-empty adm-card">{tab === "open" ? "No open messages." : "None here."}</p>
      ) : (
        <div className="sup-list">
          {shown.map((m) => (
            <article key={m.id} className="adm-card sup-msg">
              <div className="sup-head">
                <span>
                  <b>{m.name}</b> <span className="adm-pill">{TOPIC[m.topic] ?? m.topic}</span>
                  {m.order_number && <span className="adm-muted adm-small"> · order <Link href={`/admin/orders?q=${encodeURIComponent(m.order_number)}`}>{m.order_number}</Link></span>}
                </span>
                <span className="adm-muted adm-small">{when(m.created_at)}</span>
              </div>
              <p className="sup-text">{m.message}</p>
              <div className="adm-small adm-muted">
                <a href={`mailto:${m.email}?subject=${encodeURIComponent("Your message to Babajee")}`}>{m.email}</a>
                {m.phone && ` · ${m.phone}`}
                {m.profile_id && (
                  <>
                    {" · "}
                    <Link href={`/admin/customers/view?id=${m.profile_id}`}>their account</Link>
                  </>
                )}
              </div>
              {/* staff only: what was said back, what's pending */}
              <input
                key={`${m.id}-${m.note}`}
                className="adm-input sup-note"
                defaultValue={m.note}
                maxLength={500}
                placeholder="Staff note (only staff see it): what you replied, what's pending"
                aria-label="Staff note"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== m.note) void mark(m, m.status, v, "Note saved");
                }}
              />
              <div className="adm-actions">
                <a className="adm-btn" href={`mailto:${m.email}?subject=${encodeURIComponent("Your message to Babajee")}`}>
                  Reply by email
                </a>
                {wa(m) && (
                  <a className="adm-btn" href={wa(m)!} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
                {m.status !== "replied" && (
                  <button type="button" className="adm-btn pri" onClick={() => mark(m, "replied")}>
                    Mark replied
                  </button>
                )}
                {m.status !== "closed" && (
                  <button type="button" className="adm-btn" onClick={() => mark(m, "closed")}>
                    Close
                  </button>
                )}
                {m.status !== "open" && (
                  <button type="button" className="adm-btn" onClick={() => mark(m, "open")}>
                    Reopen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
