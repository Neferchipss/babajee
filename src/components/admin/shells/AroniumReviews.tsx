"use client";


import { useEffect, useMemo, useState } from "react";
import { toast, toastError } from "@/components/admin/Toaster";
import { when } from "@/components/admin/ui";
import Stars from "@/components/Stars";
import { errText } from "@/lib/orders-db";
import { adminReviews, deleteReview, setReviewStatus, type AdminReview, type ReviewStatus } from "@/lib/reviews";
import { ArEmpty, ArGrid, ArScreen, ArSection, ArToolbar, menuOf, useArKeys, type ArCol } from "./aronium-kit";
import { ArField, ArHelp, ArPanel } from "./aronium-help";
import { ArConfirm, ArSubTabs } from "./aronium-d-kit";

// Products • Reviews, as an Aronium list: Waiting / Published / Hidden as
// tabs under the toolbar, one row a review (stars, product, who, when, the
// words), the selected one read out under the grid. Publish, Hide and
// Delete (asked first, for good) from the toolbar, the right-click menu or
// the panel a double-click opens. Only customers who received the product
// can review it; new and edited reviews wait here.
const TABS: [ReviewStatus, string, string][] = [
  ["pending", "Waiting", "Nothing waiting for approval"],
  ["approved", "Published", "No published reviews yet"],
  ["hidden", "Hidden", "No hidden reviews"],
];

export default function AroniumReviews() {
  const [rows, setRows] = useState<AdminReview[] | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<AdminReview | null>(null);
  const [del, setDel] = useState<AdminReview | null>(null);
  const [busy, setBusy] = useState("");
  const [help, setHelp] = useState(false);

  const load = () =>
    adminReviews().then(
      (r) => {
        setRows(r);
        setErr("");
      },
      (e) => setErr(errText(e)),
    );
  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<ReviewStatus, number> = { pending: 0, approved: 0, hidden: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => r.status === tab);
  const picked = shown.find((r) => r.id === sel) ?? null;

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
      setSel(null);
      toast("Review deleted");
    } catch (e) {
      toastError(errText(e));
    } finally {
      setBusy("");
    }
  }
  useArKeys({ refresh: () => void load(), del: picked ? () => setDel(picked) : undefined, edit: picked ? () => setView(picked) : undefined });

  const menu = (r: AdminReview | null) =>
    menuOf(
      [{ label: "Open", key: "F2", onClick: () => r && setView(r), disabled: !r }],
      [
        { label: "Publish", onClick: () => r && move(r, "approved"), disabled: !r || r.status === "approved" || busy === r.id },
        { label: "Hide", onClick: () => r && move(r, "hidden"), disabled: !r || r.status === "hidden" || busy === r.id },
        { label: "Back to waiting", onClick: () => r && move(r, "pending"), disabled: !r || r.status === "pending" || busy === r.id },
      ],
      [{ label: "Delete", key: "Del", onClick: () => r && setDel(r), disabled: !r }],
      [{ label: "Refresh", key: "F5", onClick: () => void load() }],
    );

  const cols: ArCol<AdminReview>[] = [
    { k: "stars", label: "Rating", render: (r) => <Stars value={r.rating} size={14} />, sort: (r) => r.rating },
    { k: "product", label: "Product", render: (r) => r.product_name, sort: (r) => r.product_name.toLowerCase() },
    { k: "author", label: "Customer", render: (r) => r.author, sort: (r) => r.author.toLowerCase() },
    { k: "date", label: "Date", render: (r) => when(r.updated_at), sort: (r) => r.updated_at },
    { k: "title", label: "Title", render: (r) => r.title },
    { k: "body", label: "Review", render: (r) => <span className="ard4-clip">{r.body || "Stars only, no words."}</span> },
  ];

  return (
    <ArScreen className="ard4">
      <ArToolbar
        tools={[
          { icon: "refresh", label: "Refresh", onClick: () => void load() },
          { icon: "open", label: "Open", disabled: !picked, onClick: () => picked && setView(picked) },
          { icon: "paid", label: "Publish", disabled: !picked || picked.status === "approved" || busy === picked.id, onClick: () => picked && move(picked, "approved") },
          { icon: "clear", label: "Hide", disabled: !picked || picked.status === "hidden" || busy === picked.id, onClick: () => picked && move(picked, "hidden") },
          { icon: "del", label: "Delete", disabled: !picked, onClick: () => picked && setDel(picked) },
          { icon: "help", label: "Help", onClick: () => setHelp(true) },
        ]}
      />
      <ArSubTabs label="Reviews" on={tab} onPick={(t) => (setTab(t), setSel(null))} tabs={TABS.map(([id, l]) => [id, l, counts[id]] as const)} />
      {err && <p className="adm-err">{err}</p>}
      <ArSection title="Reviews" n={shown.length} />
      {rows === null && !err ? (
        <p className="ard4-loading">Loading…</p>
      ) : !shown.length ? (
        <ArEmpty title={TABS.find((t) => t[0] === tab)![2]} />
      ) : (
        <ArGrid cols={cols} rows={shown} keyOf={(r) => r.id} sel={sel} onSel={setSel} onOpen={setView} menu={menu} className="ars-grid" />
      )}
      {picked && (
        <div className="ard4-pane">
          <ArSection title={picked.title || picked.product_name} />
          <p className="ard4-text">{picked.body || "Stars only, no words."}</p>
        </div>
      )}

      <ArPanel open={!!view} title={view ? `Review of ${view.product_name}` : ""} width="mid" onClose={() => setView(null)}>
        {view && (
          <>
            <ArField label="Rating">
              <span className="ard4-stars">
                <Stars value={view.rating} size={18} />
              </span>
            </ArField>
            <ArField label="Customer">
              <input className="adm-input" readOnly value={view.author} />
            </ArField>
            <ArField label="Date">
              <input className="adm-input" readOnly value={when(view.updated_at)} />
            </ArField>
            {view.title && (
              <ArField label="Title">
                <input className="adm-input" readOnly value={view.title} />
              </ArField>
            )}
            <ArField label="Review">
              <textarea className="adm-input" readOnly rows={7} value={view.body || "Stars only, no words."} />
            </ArField>
            <div className="ard4-btnrow">
              {view.status !== "approved" && (
                <button type="button" className="adm-btn pri" disabled={busy === view.id} onClick={() => (void move(view, "approved"), setView(null))}>
                  Publish
                </button>
              )}
              {view.status !== "hidden" && (
                <button type="button" className="adm-btn" disabled={busy === view.id} onClick={() => (void move(view, "hidden"), setView(null))}>
                  Hide
                </button>
              )}
              <button type="button" className="adm-btn bad" onClick={() => (setDel(view), setView(null))}>
                Delete
              </button>
            </div>
          </>
        )}
      </ArPanel>

      <ArConfirm open={!!del} title="Delete this review?" onYes={() => del && remove(del)} onClose={() => setDel(null)}>
        <p>It goes for good: the customer would have to write it again.</p>
      </ArConfirm>

      <ArHelp open={help} onClose={() => setHelp(false)} title="Reviews">
        <p>Only customers who received a product can review it. New and edited reviews wait under Waiting until you publish them; published ones show on the product, hidden ones never do.</p>
        <p>Select a review to read it under the list; double-click to open it. Delete removes it for good.</p>
      </ArHelp>
    </ArScreen>
  );
}
