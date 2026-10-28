/**
 * Browser-safe environment values. Server secrets must never appear here.
 * Server code should import `@/lib/config/env` instead.
 */
const raw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_SITE_TAGLINE: process.env.NEXT_PUBLIC_SITE_TAGLINE,
};

if (!raw.NEXT_PUBLIC_APP_URL) {
  throw new Error("NEXT_PUBLIC_APP_URL is not set");
}

export const site = {
  url: raw.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""),
  name: raw.NEXT_PUBLIC_SITE_NAME || "Zitsy",
  tagline: raw.NEXT_PUBLIC_SITE_TAGLINE || "Easy as Zitsy",
} as const;

export const analytics = {
  ga4MeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "",
  clarityProjectId: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() ?? "",
} as const;

export function hasAnalyticsProviders(): boolean {
  return Boolean(analytics.ga4MeasurementId || analytics.clarityProjectId);
}

