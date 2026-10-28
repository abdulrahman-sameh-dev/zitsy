import { unstable_cache } from "next/cache";

import { log } from "@/lib/log";

import { fetchClarityAnalytics } from "./clarity";
import {
  getAnalyticsProviderConfigs,
  type AnalyticsProviderConfigs,
} from "./config";
import { fetchGa4Analytics } from "./ga4";
import { analyticsRangeLabel } from "./range";
import type {
  AnalyticsProviderId,
  AnalyticsProviderReport,
  AnalyticsProvidersResult,
  AnalyticsRange,
  ProviderConfigStatus,
} from "./types";
import { fetchVercelAnalytics } from "./vercel";

const PROVIDER_NAMES: Record<AnalyticsProviderId, string> = {
  vercel: "Vercel Web Analytics",
  ga4: "Google Analytics 4",
  clarity: "Microsoft Clarity",
};

const NOT_CONFIGURED_LIMITATIONS = [
  "Add the missing server-only variables in the deployment environment and redeploy.",
  "No provider request is made while configuration is incomplete.",
];

function notConfiguredReport(
  id: AnalyticsProviderId,
  range: AnalyticsRange,
  status: ProviderConfigStatus,
): AnalyticsProviderReport {
  return {
    id,
    name: PROVIDER_NAMES[id],
    status: "not_configured",
    statusMessage: "Not configured",
    warning: null,
    fetchedAt: null,
    rangeLabel:
      id === "clarity"
        ? "Last 3 days (Clarity limit)"
        : analyticsRangeLabel(range),
    limitations: NOT_CONFIGURED_LIMITATIONS,
    configuration: { missing: status.missing, notes: status.notes },
    primaryLabel: id === "clarity" ? "Sessions" : "Page views",
    secondaryLabel: id === "clarity" ? "Users" : id === "vercel" ? "Visitors" : "Users",
    summary: [],
    trend: [],
    topPages: [],
    sources: [],
    referrers: [],
    countries: [],
    devices: [],
    events: [],
    funnel: [],
  };
}

function configured(
  configs: AnalyticsProviderConfigs,
  id: AnalyticsProviderId,
): boolean {
  return configs.status[id].configured;
}

const cachedVercel = unstable_cache(
  async (range: AnalyticsRange) => {
    const configs = getAnalyticsProviderConfigs();
    if (!configs.vercel) throw new Error("Vercel analytics is not configured");
    return fetchVercelAnalytics(configs.vercel, range);
  },
  ["analytics:vercel:v2"],
  { revalidate: 300, tags: ["analytics:vercel"] },
);

const cachedGa4 = unstable_cache(
  async (range: AnalyticsRange) => {
    const configs = getAnalyticsProviderConfigs();
    if (!configs.ga4) throw new Error("GA4 is not configured");
    return fetchGa4Analytics(configs.ga4, range);
  },
  ["analytics:ga4:v2"],
  { revalidate: 300, tags: ["analytics:ga4"] },
);

const cachedClarity = unstable_cache(
  async () => {
    const configs = getAnalyticsProviderConfigs();
    if (!configs.clarity) throw new Error("Clarity is not configured");
    return fetchClarityAnalytics(configs.clarity);
  },
  ["analytics:clarity:v2"],
  { revalidate: 86_400, tags: ["analytics:clarity"] },
);

export async function loadAnalyticsProviders(
  range: AnalyticsRange,
  now = new Date(),
): Promise<AnalyticsProvidersResult> {
  const configs = getAnalyticsProviderConfigs();

  const [vercel, ga4, clarity] = await Promise.all([
    configured(configs, "vercel")
      ? cachedVercel(range)
      : Promise.resolve(
          notConfiguredReport("vercel", range, configs.status.vercel),
        ),
    configured(configs, "ga4")
      ? cachedGa4(range)
      : Promise.resolve(notConfiguredReport("ga4", range, configs.status.ga4)),
    configured(configs, "clarity")
      ? cachedClarity()
      : Promise.resolve(
          notConfiguredReport("clarity", range, configs.status.clarity),
        ),
  ]);

  const providers = [vercel, ga4, clarity];
  for (const report of providers) {
    if (report.status === "error" || report.status === "partial") {
      log.warn("analytics provider unavailable", {
        provider: report.id,
        status: report.status,
        message: report.warning,
      });
    }
  }

  return {
    range,
    rangeLabel: analyticsRangeLabel(range),
    generatedAt: now.toISOString(),
    providers,
  };
}
