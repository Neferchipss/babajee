import type { MetadataRoute } from "next";
import { absUrl, BASE_PATH } from "@/lib/site";

// Search engines may read the shop; the admin, accounts, the cart, checkout
// and orders are private or personal and stay out of results.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const keepOut = ["/admin/", "/account/", "/cart/", "/checkout/", "/orders/", "/pitch/", "/styles/", "/_phone.html"].map((p) => `${BASE_PATH}${p}`);
  return {
    rules: { userAgent: "*", allow: "/", disallow: keepOut },
    sitemap: absUrl("/sitemap.xml"),
  };
}
