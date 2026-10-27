import type { NextConfig } from "next";

/**
 * Conservative baseline security headers.
 *
 * Deliberately no Content-Security-Policy: the store must load the PayPal JS
 * SDK and Printify-hosted product imagery, and an over-restrictive CSP would
 * break checkout (§19).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** Order/admin pages carry PII and are rendered per request — never cached or indexed. */
const privateOrderHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/** Search results depend on the visitor's HttpOnly search cookie. */
const privateSearchHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Robots-Tag", value: "noindex, follow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images-api.printify.com",
      },
      {
        protocol: "https",
        hostname: "images.printify.com",
      },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/checkout/success",
        headers: privateOrderHeaders,
      },
      {
        source: "/track-order/:path*",
        headers: privateOrderHeaders,
      },
      {
        source: "/admin",
        headers: privateOrderHeaders,
      },
      {
        source: "/admin/:path*",
        headers: privateOrderHeaders,
      },
      {
        source: "/search",
        headers: privateSearchHeaders,
      },
    ];
  },
};

export default nextConfig;
