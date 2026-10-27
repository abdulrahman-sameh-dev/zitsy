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

function readPublicEnv(name: string, fallback: string) {
  const value = process.env[name];
  if (value === undefined || value === null) return fallback;
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return trimmed;
}

export const analytics = {
  gtmId: readPublicEnv("NEXT_PUBLIC_GTM_ID", "GTM-MD75KVQ9"),
  ga4MeasurementId: readPublicEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-93D82JN0SY"),
  clarityProjectId: readPublicEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "z49buvgeub"),
} as const;

export function hasAnalyticsProviders(): boolean {
  return Boolean(
    analytics.gtmId || analytics.ga4MeasurementId || analytics.clarityProjectId,
  );
}

