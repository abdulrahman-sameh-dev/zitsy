import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyticsRangeLabel,
  analyticsRangeWindow,
  parseAnalyticsRange,
} from "@/lib/analytics/providers/range";

async function loadProviderConfig(values: {
  vercelToken?: string;
  vercelProject?: string;
  vercelTeam?: string;
  ga4Property?: string;
  ga4Email?: string;
  ga4Key?: string;
  clarityToken?: string;
  clarityProject?: string;
}) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgresql://postgres@localhost:5432/zitsy_store");
  vi.stubEnv("AUTH_SECRET", "x".repeat(32));
  vi.stubEnv("STORE_CURRENCY", "GBP");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://zitsy.test");
  vi.stubEnv("VERCEL_ANALYTICS_TOKEN", values.vercelToken);
  vi.stubEnv("VERCEL_ANALYTICS_PROJECT_ID", values.vercelProject);
  vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", values.vercelTeam);
  vi.stubEnv("GA4_PROPERTY_ID", values.ga4Property);
  vi.stubEnv("GA4_CLIENT_EMAIL", values.ga4Email);
  vi.stubEnv("GA4_PRIVATE_KEY", values.ga4Key);
  vi.stubEnv("CLARITY_API_TOKEN", values.clarityToken);
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", values.clarityProject);
  return import("@/lib/analytics/providers/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics provider configuration", () => {
  it("reports all missing server-only variables without throwing", async () => {
    const { getAnalyticsProviderConfigs } = await loadProviderConfig({});
    const configs = getAnalyticsProviderConfigs();

    expect(configs.vercel).toBeNull();
    expect(configs.ga4).toBeNull();
    expect(configs.clarity).toBeNull();
    expect(configs.status.vercel.missing).toEqual([
      "VERCEL_ANALYTICS_TOKEN",
      "VERCEL_ANALYTICS_PROJECT_ID",
    ]);
    expect(configs.status.ga4.missing).toEqual([
      "GA4_PROPERTY_ID",
      "GA4_CLIENT_EMAIL",
      "GA4_PRIVATE_KEY",
    ]);
    expect(configs.status.clarity.missing).toEqual([
      "CLARITY_API_TOKEN",
      "NEXT_PUBLIC_CLARITY_PROJECT_ID",
    ]);
  });

  it("marks providers configured only when every required value exists", async () => {
    const { getAnalyticsProviderConfigs } = await loadProviderConfig({
      vercelToken: "vercel-token",
      vercelProject: "prj_test",
      vercelTeam: "team_test",
      ga4Property: "123456",
      ga4Email: "analytics@example.com",
      ga4Key: "private-key",
      clarityToken: "clarity-token",
      clarityProject: "clarity-project",
    });
    const configs = getAnalyticsProviderConfigs();

    expect(configs.status.vercel).toEqual({
      configured: true,
      missing: [],
      notes: [],
    });
    expect(configs.status.ga4).toEqual({
      configured: true,
      missing: [],
      notes: [],
    });
    expect(configs.status.clarity.configured).toBe(true);
    expect(configs.vercel?.projectId).toBe("prj_test");
    expect(configs.ga4?.propertyId).toBe("123456");
    expect(configs.clarity?.projectId).toBe("clarity-project");
  });

  it("notes a missing team id without treating it as a hard requirement", async () => {
    const { getAnalyticsProviderConfigs } = await loadProviderConfig({
      vercelToken: "vercel-token",
      vercelProject: "prj_test",
    });
    const configs = getAnalyticsProviderConfigs();

    expect(configs.vercel).not.toBeNull();
    expect(configs.status.vercel.configured).toBe(true);
    expect(configs.status.vercel.notes[0]).toContain(
      "VERCEL_ANALYTICS_TEAM_ID",
    );
  });
});

describe("analytics range", () => {
  it("accepts only supported ranges and defaults to 7 days", () => {
    expect(parseAnalyticsRange("7")).toBe(7);
    expect(parseAnalyticsRange("14")).toBe(14);
    expect(parseAnalyticsRange(["30", "7"])).toBe(30);
    expect(parseAnalyticsRange("90")).toBe(7);
    expect(parseAnalyticsRange(undefined)).toBe(7);
    expect(analyticsRangeLabel(14)).toBe("Last 14 days");
  });

  it("builds a UTC window that includes today", () => {
    const now = new Date("2026-10-28T12:34:00Z");
    const window = analyticsRangeWindow(7, now);

    expect(window.since.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(window.until).toBe(now);
    expect(window.label).toBe("Last 7 days");
  });
});
