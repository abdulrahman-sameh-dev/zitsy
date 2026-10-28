import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPublicEnv(values: { ga4?: string; clarity?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://zitsy.test");
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", values.ga4);
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", values.clarity);
  return import("@/lib/config/public-env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("optional analytics configuration", () => {
  it("is disabled when provider IDs are unset", async () => {
    const { analytics, hasAnalyticsProviders } = await loadPublicEnv();

    expect(analytics).toEqual({
      ga4MeasurementId: "",
      clarityProjectId: "",
    });
    expect(hasAnalyticsProviders()).toBe(false);
  });

  it("is disabled for empty or whitespace provider IDs", async () => {
    const { analytics, hasAnalyticsProviders } = await loadPublicEnv({
      ga4: "   ",
      clarity: "",
    });

    expect(analytics.ga4MeasurementId).toBe("");
    expect(analytics.clarityProjectId).toBe("");
    expect(hasAnalyticsProviders()).toBe(false);
  });

  it("is enabled and trims provider IDs when configured", async () => {
    const { analytics, hasAnalyticsProviders } = await loadPublicEnv({
      ga4: " G-TEST ",
      clarity: " clarity-test ",
    });

    expect(analytics).toEqual({
      ga4MeasurementId: "G-TEST",
      clarityProjectId: "clarity-test",
    });
    expect(hasAnalyticsProviders()).toBe(true);
  });
});
