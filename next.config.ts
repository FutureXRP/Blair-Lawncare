import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // intuit-oauth is a CommonJS Node library. Keep it out of the bundler so its
  // dynamic requires resolve at runtime on the server.
  serverExternalPackages: ["intuit-oauth"],
};

export default nextConfig;
