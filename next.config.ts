import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone tracing creates symlinks, which fails on Windows dev machines
  // (EPERM). The Docker image build (Linux) sets BUILD_STANDALONE=1.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
};

export default nextConfig;
