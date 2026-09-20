import type { NextConfig } from "next";

// GitHub Pages is a static preview deploy only. Static export is switched on
// by the Pages workflow (GITHUB_PAGES=true) so the real app stays free to use
// server features (auth, age-verification middleware, API routes) later.
const isPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = isPages
  ? {
      output: "export",
      basePath: "/babajee",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
