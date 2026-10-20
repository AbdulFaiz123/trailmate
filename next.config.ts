import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a dev server run next to a production one without overwriting its build
  // (NEXT_DIST_DIR=.next-dev npm run dev).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
