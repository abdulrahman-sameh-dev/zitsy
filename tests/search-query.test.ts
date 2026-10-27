import { describe, expect, it } from "vitest";

import {
  legacySearchQuery,
  normalizeSearchQuery,
  SEARCH_QUERY_MAX_LENGTH,
  searchCookieOptions,
} from "@/lib/search/query";

describe("search query handling", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeSearchQuery("  canvas tote  ")).toBe("canvas tote");
  });

  it("caps the query at the cookie limit", () => {
    expect(normalizeSearchQuery("x".repeat(200))).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    );
  });

  it("ignores non-string form values", () => {
    expect(normalizeSearchQuery(null)).toBe("");
    expect(normalizeSearchQuery(undefined)).toBe("");
    expect(normalizeSearchQuery(new File([], "search.txt"))).toBe("");
  });

  it("keeps the cookie HttpOnly and scoped to /search", () => {
    expect(searchCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/search",
    });
  });

  it("extracts a legacy query only from /search", () => {
    expect(
      legacySearchQuery(new URL("https://zitsy.test/search?q=+canvas+tote+")),
    ).toBe("canvas tote");
    expect(legacySearchQuery(new URL("https://zitsy.test/shop?q=tote"))).toBeNull();
  });

  it("distinguishes a missing query from a blank query", () => {
    expect(legacySearchQuery(new URL("https://zitsy.test/search"))).toBeNull();
    expect(legacySearchQuery(new URL("https://zitsy.test/search?q="))).toBe("");
  });
});
