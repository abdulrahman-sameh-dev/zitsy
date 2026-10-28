import type { AnalyticsProviderId } from "@/lib/analytics/providers/types";

import {
  checkDurableRateLimit,
  type DurableRateLimitResult,
} from "./durable-rate-limit";

export const ANALYTICS_REFRESH_LIMITS = {
  vercel: { limit: 5, windowMs: 10 * 60 * 1000 },
  ga4: { limit: 5, windowMs: 10 * 60 * 1000 },
  clarity: { limit: 2, windowMs: 6 * 60 * 60 * 1000 },
} as const satisfies Record<
  AnalyticsProviderId,
  { limit: number; windowMs: number }
>;

export type AnalyticsRefreshRateLimitResult = DurableRateLimitResult;

/**
 * Protects provider quotas from repeated manual refreshes. Clarity has the
 * tightest limit because its export API allows only 10 requests per project
 * per day. The bucket is keyed to the single shared admin identity.
 */
export async function checkAnalyticsRefreshRateLimit(
  provider: AnalyticsProviderId,
  now = Date.now(),
): Promise<AnalyticsRefreshRateLimitResult> {
  const policy = ANALYTICS_REFRESH_LIMITS[provider];
  return checkDurableRateLimit({
    namespace: `zitsy-analytics-refresh-${provider}-v1`,
    subject: "admin",
    limit: policy.limit,
    windowMs: policy.windowMs,
    now,
  });
}
