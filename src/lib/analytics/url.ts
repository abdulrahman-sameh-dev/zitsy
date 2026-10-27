type AnalyticsParams = Record<string, unknown>;

function analyticsBase(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

export function sanitizeAnalyticsUrl(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;

  try {
    const base = analyticsBase();
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export function sanitizeAnalyticsParams(params: object): AnalyticsParams {
  const safe: AnalyticsParams = { ...params };
  delete safe.page_location;
  delete safe.page_referrer;

  if (typeof window === "undefined") return safe;

  const location = sanitizeAnalyticsUrl(window.location.href);
  if (location) safe.page_location = location;

  const referrer =
    typeof document === "undefined" ? undefined : document.referrer;
  const safeReferrer = sanitizeAnalyticsUrl(referrer);
  if (safeReferrer) safe.page_referrer = safeReferrer;

  return safe;
}
