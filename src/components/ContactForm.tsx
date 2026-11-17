"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// The Contact page's form (0074): the message reaches Admin > Customers >
// Messages. The site sends no email; the shop replies itself. The shop's own
// details come from its settings.
const TOPICS: [string, string][] = [
  ["order", "An order"],
  ["product", "A product"],
  ["delivery", "Delivery"],
  ["return", "A return"],
  ["wholesale", "Wholesale"],
  ["other", "Something else"],
];

export default function ContactForm() {
  const { profile, user } = useAuth();
  const [f, setF] = useState({ name: "", email: "", phone: "", topic: "order", order: "", message: "" });
  const [state, setState] = useState<"" | "sending" | "sent">("");
  const [err, setErr] = useState("");
  const [shop, setShop] = useState<{ store_address: string; store_phone: string; store_email: string } | null>(null);

  useEffect(() => {
    void getSupabase()
      ?.from("store_settings")
      .select("store_address, store_phone, store_email")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => data && setShop(data as typeof shop));
  }, []);
  const name = f.name || profile?.full_name || "";
  const email = f.email || user?.email || "";
  const phone = f.phone || profile?.phone || "";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const sb = getSupabase();
    if (!sb) {
      setErr("Messages can't be sent right now. Please call or email us instead.");
      return;
    }
    setState("sending");
    const { error } = await sb.rpc("submit_contact", { p_name: name, p_email: email, p_phone: phone, p_topic: f.topic, p_order: f.order, p_message: f.message });
    if (error) {
      setState("");
      setErr(error.code === "PGRST202" ? "Messages can't be sent right now. Please call or email us instead." : error.message);
      return;
    }
    setState("sent");
  }

  const details: [string, string][] = [
    ["Address", shop?.store_address ?? ""],
    ["Phone", shop?.store_phone ?? ""],
    ["Email", shop?.store_email ?? ""],
  ];

  return (
    <div className="grid gap-12 md:grid-cols-2">
      {state === "sent" ? (
        <div className="grid content-start gap-3">
          <h2 className="text-2xl">Thanks, we&apos;ve got it</h2>
          <p className="text-muted">We&apos;ll reply to {email} as soon as we can, usually within a day.</p>
          <button type="button" className="btn btn-ghost justify-self-start" onClick={() => (setState(""), setF({ ...f, message: "", order: "" }))}>
            Send another
          </button>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={send}>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <input className="field" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input className="field" type="email" autoComplete="email" required maxLength={200} value={email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Phone (optional)</span>
            <input className="field" type="tel" autoComplete="tel" maxLength={20} value={phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">About</span>
            <select className="field" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
              {TOPICS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {(f.topic === "order" || f.topic === "return" || f.topic === "delivery") && (
            <label>
              <span className="mb-1.5 block text-sm font-medium">Order number (optional)</span>
              <input className="field" maxLength={40} placeholder="BJ-1234" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
            </label>
          )}
          <label>
            <span className="mb-1.5 block text-sm font-medium">Message</span>
            <textarea className="field" rows={5} required maxLength={4000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          </label>
          {err && (
            <p role="alert" className="text-sm" style={{ color: "var(--color-rasta-red)" }}>
              {err}
            </p>
          )}
          <button className="btn btn-primary justify-self-start" disabled={state === "sending"}>
            {state === "sending" ? "Sending" : "Send message"}
          </button>
        </form>
      )}

      <dl className="space-y-5">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className={value ? "font-medium whitespace-pre-line" : "font-medium text-muted"}>{value || "To be added by the store"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
