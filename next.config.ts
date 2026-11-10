import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Barn Wi-Fi is unreliable: when the connection drops, check-offs and
    // notes stay pending and are retried automatically once it comes back.
    useOffline: true,
    // Keep screens on the phone for two hours (by default a screen's data is
    // fetched again on every visit, and its outline after five minutes), so
    // with no signal at the barn the tabs still open, with their lists. Every
    // save refreshes, which clears this, so nothing older than the last change
    // made here is shown; it's only another phone's changes that could wait.
    staleTimes: { dynamic: 7200, static: 7200 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
