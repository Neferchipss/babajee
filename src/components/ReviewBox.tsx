"use client";

import { useEffect, useState } from "react";
import type { Review } from "@/lib/reviews";
import Stars from "./Stars";
import "./review-box.css";

// Under an item of a delivered order: "Rate this", or the customer's review
// of it with where it stands (waiting for the shop, published, not shown),
// and a small form to write or edit it. Their reviews are fetched once.
let mine: Promise<Map<string, Review>> | null = null;
const loadMine = () => (mine ??= import("@/lib/reviews").then((m) => m.myReviews()).catch(() => new Map<string, Review>()));

const STATUS: Record<Review["status"], string> = {
  pending: "Waiting for the shop to approve it",
  approved: "Published",
  hidden: "Not shown on the shop",
};

export default function ReviewBox({ slug, name }: { slug: string; name: string }) {
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    loadMine().then((m) => live && setReview(m.get(slug) ?? null));
    return () => {
      live = false;
    };
  }, [slug]);

  function start() {
    setRating(review?.rating ?? 0);
    setTitle(review?.title ?? "");
    setBody(review?.body ?? "");
    setErr("");
    setOpen(true);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setErr("Pick from 1 to 5 stars.");
    setBusy(true);
    setErr("");
    try {
      const { submitReview } = await import("@/lib/reviews");
      const saved = await submitReview(slug, rating, title, body);
      setReview(saved);
      (await loadMine()).set(slug, saved);
      setOpen(false);
    } catch (x) {
      setErr((x as { message?: string })?.message || "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (review === undefined) return null;

  if (open)
    return (
      <form className="rvb-form" onSubmit={send}>
        <Stars value={rating} size={26} onPick={setRating} label={`Your rating for ${name}`} />
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up (optional)" maxLength={120} aria-label="Review title" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you like or not? (optional)" maxLength={2000} rows={3} aria-label="Review" />
        {err && <p className="rvb-err">{err}</p>}
        <div className="rvb-actions">
          <button type="submit" className="rvb-send" disabled={busy}>
            {busy ? "Sending" : review ? "Save review" : "Post review"}
          </button>
          <button type="button" className="rvb-cancel" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
        <p className="rvb-note">Shown with your first name and initial once the shop approves it.</p>
      </form>
    );

  if (review)
    return (
      <p className="rvb-mine">
        <Stars value={review.rating} size={13} label={`You rated it ${review.rating} out of 5`} />
        <span>{STATUS[review.status]}</span>
        <button type="button" onClick={start}>
          Edit
        </button>
      </p>
    );

  return (
    <button type="button" className="rvb-rate" onClick={start}>
      <Stars value={0} size={13} label="Not rated yet" />
      Rate this
    </button>
  );
}
