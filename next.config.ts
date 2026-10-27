import type { NextConfig } from "next";

const IMMUTABLE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Baseline for every route. The Content-Security-Policy is per-request (nonce) and lives in src/proxy.ts.
        source: "/:path*",
        headers: [
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
        ],
      },
      // Asana and brand files are content-named and never change in place.
      { source: "/asanas/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
      {
        // Public share pages (spec 02 section 8): never cached, never indexed, never leak the token via Referer.
        source: "/p/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
