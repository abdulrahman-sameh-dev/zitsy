import { serverEnv } from "@/lib/config/env";
import { analytics as publicAnalytics } from "@/lib/config/public-env";

import type {
  AnalyticsProviderId,
  ProviderConfigStatus,
} from "./types";

export interface VercelProviderConfig {
  token: string;
  projectId: string;
  teamId: string;
}

export interface Ga4ProviderConfig {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
}

export interface ClarityProviderConfig {
  token: string;
  projectId: string;
}

export interface AnalyticsProviderConfigs {
  vercel: VercelProviderConfig | null;
  ga4: Ga4ProviderConfig | null;
  clarity: ClarityProviderConfig | null;
  status: Record<AnalyticsProviderId, ProviderConfigStatus>;
}

function missing(names: Array<[string, string]>): string[] {
  return names.filter(([, value]) => !value).map(([name]) => name);
}

export function getAnalyticsProviderConfigs(): AnalyticsProviderConfigs {
  const vercelMissing = missing([
    ["VERCEL_ANALYTICS_TOKEN", serverEnv.VERCEL_ANALYTICS_TOKEN],
    ["VERCEL_ANALYTICS_PROJECT_ID", serverEnv.VERCEL_ANALYTICS_PROJECT_ID],
  ]);
  const ga4Missing = missing([
    ["GA4_PROPERTY_ID", serverEnv.GA4_PROPERTY_ID],
    ["GA4_CLIENT_EMAIL", serverEnv.GA4_CLIENT_EMAIL],
    ["GA4_PRIVATE_KEY", serverEnv.GA4_PRIVATE_KEY],
  ]);
  const clarityMissing = missing([
    ["CLARITY_API_TOKEN", serverEnv.CLARITY_API_TOKEN],
    ["NEXT_PUBLIC_CLARITY_PROJECT_ID", publicAnalytics.clarityProjectId],
  ]);

  const vercel =
    vercelMissing.length === 0
      ? {
          token: serverEnv.VERCEL_ANALYTICS_TOKEN,
          projectId: serverEnv.VERCEL_ANALYTICS_PROJECT_ID,
          teamId: serverEnv.VERCEL_ANALYTICS_TEAM_ID,
        }
      : null;
  const ga4 =
    ga4Missing.length === 0
      ? {
          propertyId: serverEnv.GA4_PROPERTY_ID,
          clientEmail: serverEnv.GA4_CLIENT_EMAIL,
          privateKey: serverEnv.GA4_PRIVATE_KEY,
        }
      : null;
  const clarity =
    clarityMissing.length === 0
      ? {
          token: serverEnv.CLARITY_API_TOKEN,
          projectId: publicAnalytics.clarityProjectId,
        }
      : null;

  return {
    vercel,
    ga4,
    clarity,
    status: {
      vercel: {
        configured: vercel !== null,
        missing: vercelMissing,
        notes:
          vercel && !serverEnv.VERCEL_ANALYTICS_TEAM_ID
            ? ["Team-owned projects also require VERCEL_ANALYTICS_TEAM_ID."]
            : [],
      },
      ga4: {
        configured: ga4 !== null,
        missing: ga4Missing,
        notes: [],
      },
      clarity: {
        configured: clarity !== null,
        missing: clarityMissing,
        notes: [
          "The Clarity Data Export API only exposes the last 1–3 days and allows 10 requests per day.",
        ],
      },
    },
  };
}
