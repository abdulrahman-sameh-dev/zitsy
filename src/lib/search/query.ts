export const SEARCH_QUERY_COOKIE = "zitsy_search_query";
export const SEARCH_QUERY_MAX_LENGTH = 80;

export interface SearchCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/search";
}

export function normalizeSearchQuery(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, SEARCH_QUERY_MAX_LENGTH)
    : "";
}

export function searchCookieOptions(secure: boolean): SearchCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/search",
  };
}

/**
 * Returns the normalized query when a legacy `?q=` search URL is present.
 * The original query is never placed back into a URL.
 */
export function legacySearchQuery(url: URL): string | null {
  if (url.pathname !== "/search") return null;
  const raw = url.searchParams.get("q");
  return raw === null ? null : normalizeSearchQuery(raw);
}
