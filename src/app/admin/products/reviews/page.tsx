"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import Stars from "@/components/Stars";
import { errText } from "@/lib/orders-db";
import { adminReviews, deleteReview, setReviewStatus, type AdminReview, type ReviewStatus } from "@/lib/reviews";

// Reviews from customers who bought the product. A new or edited review
// waits here until the shop approves it; approved ones show on the product,
// hidden ones never do. Deleting removes it for good.
const TABS: { id: ReviewStatus; label: string; empty: string }[] = [
  { id: "pending", label: "Waiting", empty: "Nothing waiting for approval." },
  { id: "approved", label: "Published", empty: "No published reviews yet." },
  { id: "hidden", label: "Hidden", empty: "No hidden reviews." },
];

export default function ReviewsPage() {
  const [rows, setRows] = useState<AdminReview[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    adminReviews().then(setRows, (e) => setErr(errText(e)));
  }, []);

  const counts = useMemo(() => {
    const c: Record<ReviewStatus, number> = { pending: 0, approved: 0, hidden: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => r.status === tab);

  async function move(r: AdminReview, status: ReviewStatus) {
    setBusy(r.id);
    try {
      await setReviewStatus(r.id, status);
      setRows((all) => (all ?? []).map((x) => (x.id === r.id ? { ...x, status } : x)));
      toast(status === "approved" ? "Review published" : status === "hidden" ? "Review hidden" : "Review moved back to waiting");
    } catch (e) {
      toastError(errText(e));
    } finally {
      setBusy("");
    }
  }

  async function remove(r: AdminReview) {
    setBusy(r.id);
    try {
      await deleteReview(r.id);
      setRows((all) => (all ?? []).filter((x) => x.id !== r.id));
      toast("Review deleted");
    } catch (e) {
      toastError(errText(e));
    } finally {
      setBusy("");
      setConfirm("");
    }
  }

  return (
    <div>
      <Link href="/admin/products" className="adm-back adm-only-narrow">
        ← Products
      </Link>
      <header className="adm-pagehead">
        <h1>Reviews</h1>
        <p>
        Only customers who received the product can review it. New and edited reviews wait here until you publish them.
        </p>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-chips" role="tablist" style={{ marginBottom: 12 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`adm-chip ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label} {counts[t.id] > 0 && <b>{counts[t.id]}</b>}
          </button>
        ))}
      </div>

      <div className="adm-stack">
        {rows === null && !err ? (
          <p className="adm-muted">Loading.</p>
        ) : shown.length === 0 ? (
          <div className="adm-card">
            <p className="adm-muted adm-small" style={{ margin: 0 }}>
              {TABS.find((t) => t.id === tab)!.empty}
            </p>
          </div>
        ) : (
          shown.map((r) => (
            <article key={r.id} className="adm-card" style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
                <Stars value={r.rating} size={15} />
                <strong>{r.product_name}</strong>
                <span className="adm-muted adm-small">
                  {r.author} · {when(r.updated_at)}
                </span>
              </div>
              {r.title && <strong className="adm-small">{r.title}</strong>}
              {r.body ? (
                <p className="adm-small" style={{ margin: 0, whiteSpace: "pre-line" }}>
                  {r.body}
                </p>
              ) : (
                <p className="adm-muted adm-small" style={{ margin: 0 }}>
                  Stars only, no words.
                </p>
              )}
              <div className="adm-actions">
                {r.status !== "approved" && (
                  <button type="button" className="adm-btn pri" disabled={busy === r.id} onClick={() => move(r, "approved")}>
                    Publish
                  </button>
                )}
                {r.status !== "hidden" && (
                  <button type="button" className="adm-btn" disabled={busy === r.id} onClick={() => move(r, "hidden")}>
                    Hide
                  </button>
                )}
                {confirm === r.id ? (
                  <>
                    <button type="button" className="adm-btn bad" disabled={busy === r.id} onClick={() => remove(r)}>
                      Delete for good
                    </button>
                    <button type="button" className="adm-btn" onClick={() => setConfirm("")}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" className="adm-btn" onClick={() => setConfirm(r.id)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
