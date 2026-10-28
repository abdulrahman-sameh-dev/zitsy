"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { checkAnalyticsRefreshRateLimit } from "@/lib/admin/analytics-refresh-rate-limit";
import { readAdminSession } from "@/lib/admin/session";
import { log } from "@/lib/log";

import { parseAnalyticsRange } from "./range";
import type { AnalyticsProviderId } from "./types";

const PROVIDERS: AnalyticsProviderId[] = ["vercel", "ga4", "clarity"];

function isProvider(value: string): value is AnalyticsProviderId {
  return (PROVIDERS as string[]).includes(value);
}

function analyticsPath(
  range: number,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({ range: String(range), ...extra });
  return `/admin/analytics?${params.toString()}`;
}

export async function refreshAnalyticsProviderAction(
  formData: FormData,
): Promise<void> {
  if (!(await readAdminSession())) redirect("/admin/login");

  const providerValue = String(formData.get("provider") ?? "");
  const range = parseAnalyticsRange(String(formData.get("range") ?? ""));
  if (!isProvider(providerValue)) redirect(analyticsPath(range));

  let limit: { allowed: boolean; retryAfterSeconds: number };
  try {
    limit = await checkAnalyticsRefreshRateLimit(providerValue);
  } catch (error) {
    log.error("analytics refresh rate limit failed", { error });
    redirect(analyticsPath(range, { refresh_error: providerValue }));
  }

  if (!limit.allowed) {
    redirect(
      analyticsPath(range, {
        refresh_limited: providerValue,
        retry: String(limit.retryAfterSeconds),
      }),
    );
  }

  revalidateTag(`analytics:${providerValue}`, { expire: 0 });
  log.info("analytics provider cache refreshed", { provider: providerValue });
  redirect(analyticsPath(range, { refreshed: providerValue }));
}
