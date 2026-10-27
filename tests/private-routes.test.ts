import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";
import { metadata as adminMetadata } from "@/app/admin/layout";
import robots from "@/app/robots";

describe("private route indexing protections", () => {
  it("keeps admin, checkout and tracking routes out of robots.txt", () => {
    const paths = robots().rules[0]?.disallow ?? [];

    for (const path of [
      "/admin",
      "/checkout",
      "/track-order",
      "/cart",
      "/search",
    ]) {
      expect(paths).toContain(path);
    }
  });

  it("marks the admin layout as non-indexable", () => {
    expect(adminMetadata.robots).toMatchObject({
      index: false,
      follow: false,
      nocache: true,
    });
  });

  it("sends no-store and noindex headers for every private route family", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];

    for (const source of [
      "/checkout/success",
      "/track-order/:path*",
      "/admin",
      "/admin/:path*",
    ]) {
      const rule = rules.find((entry) => entry.source === source);
      expect(rule).toBeDefined();
      expect(rule?.headers).toEqual(
        expect.arrayContaining([
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ]),
      );
    }

    const search = rules.find((entry) => entry.source === "/search");
    expect(search?.headers).toEqual(
      expect.arrayContaining([
        { key: "Cache-Control", value: "private, no-store" },
        { key: "X-Robots-Tag", value: "noindex, follow" },
      ]),
    );
  });
});
