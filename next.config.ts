import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Barn Wi-Fi is unreliable: when the connection drops, check-offs and
    // notes stay pending and are retried automatically once it comes back.
    useOffline: true,
    // Keep screens on the phone (by default a screen's data is fetched again
    // on every visit, and its outline after five minutes), so with no signal
    // at the barn the tabs still open: their outline for a day (it only
    // changes with a new version), the data for two hours. Every save
    // refreshes, which clears the data, so nothing older than the last change
    // made here is shown; it's only another device's changes that could wait.
    // (Today doesn't depend on this: it keeps its own copy, see day-copy.ts.)
    staleTimes: { dynamic: 7200, static: 86400 },
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
