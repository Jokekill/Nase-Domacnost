import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone tracing creates symlinks, which fails on Windows dev machines
  // (EPERM). The Docker image build (Linux) sets BUILD_STANDALONE=1.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Lets a production build run without clobbering a running dev server's
  // .next directory (see PROGRESS.md, known issues).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // The service worker is built with the app; in dev it only gets in the way
  // of Turbopack's own reloading.
  disable: process.env.NODE_ENV === "development" && process.env.ENABLE_SW !== "1",
  reloadOnOnline: true,
});

export default withSerwist(nextConfig);
