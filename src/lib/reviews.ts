import { getSupabase } from "./supabase";

// Product reviews (migration 0037). Anyone reads approved ones; a customer
// writes one per product they had delivered (submit_review checks), and it
// waits for the shop to approve it; admins moderate them all.
export type ReviewStatus = "pending" | "approved" | "hidden";
export type Review = {
  id: string;
  product_slug: string;
  rating: number;
  title: string;
  body: string;
  author: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
};
const COLUMNS = "id, product_slug, rating, title, body, author, status, created_at, updated_at";

export type ReviewSummary = { average: number; count: number; reviews: Review[] };

// a product's approved reviews, newest first, with their average
export async function productReviews(slug: string): Promise<ReviewSummary> {
  const sb = getSupabase();
  if (!sb) return { average: 0, count: 0, reviews: [] };
  const { data, error } = await sb.from("product_reviews").select(COLUMNS).eq("product_slug", slug).eq("status", "approved").order("created_at", { ascending: false });
  if (error) throw error;
  const reviews = (data ?? []) as Review[];
  const average = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0;
  return { average, count: reviews.length, reviews };
}

// the signed-in customer's own reviews, by product
export async function myReviews(): Promise<Map<string, Review>> {
  const sb = getSupabase();
  if (!sb) return new Map();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return new Map();
  const { data, error } = await sb.from("product_reviews").select(COLUMNS).eq("profile_id", auth.user.id);
  if (error) throw error;
  return new Map(((data ?? []) as Review[]).map((r) => [r.product_slug, r]));
}

export async function submitReview(slug: string, rating: number, title: string, body: string): Promise<Review> {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const { data, error } = await sb.rpc("submit_review", { p_slug: slug, p_rating: rating, p_title: title, p_body: body });
  if (error) throw error;
  return data as Review;
}

// ---------------------------------------------------------------- admin

export type AdminReview = Review & { product_name: string };

export async function adminReviews(): Promise<AdminReview[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const [reviews, products] = await Promise.all([
    sb.from("product_reviews").select(COLUMNS).order("created_at", { ascending: false }),
    sb.from("products").select("slug, name"),
  ]);
  if (reviews.error) throw reviews.error;
  const names = new Map(((products.data ?? []) as { slug: string; name: string }[]).map((p) => [p.slug, p.name]));
  return ((reviews.data ?? []) as Review[]).map((r) => ({ ...r, product_name: names.get(r.product_slug) ?? r.product_slug }));
}

export async function setReviewStatus(id: string, status: ReviewStatus) {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const { error } = await sb.from("product_reviews").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteReview(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("not connected");
  const { error } = await sb.from("product_reviews").delete().eq("id", id);
  if (error) throw error;
}
