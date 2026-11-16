import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/demo.mp4": ["./demo.mp4"],
  },
  async redirects() {
    return [
      { source: "/blink/academy", destination: "/academy", permanent: true },
      { source: "/blink", destination: "/at", permanent: true },
    ];
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
