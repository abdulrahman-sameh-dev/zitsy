import { afterEach, describe, expect, it, vi } from "vitest";

import { sanitizeAnalyticsParams, sanitizeAnalyticsUrl } from "@/lib/analytics/url";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("analytics URL sanitising", () => {
  it("keeps only the origin and pathname", () => {
    expect(
      sanitizeAnalyticsUrl("https://zitsy.test/search?q=canvas+tote#results"),
    ).toBe("https://zitsy.test/search");
    expect(
      sanitizeAnalyticsUrl("https://zitsy.test/referrer?utm_source=email"),
    ).toBe("https://zitsy.test/referrer");
  });

  it("returns undefined for invalid or non-web URLs", () => {
    expect(sanitizeAnalyticsUrl("")).toBeUndefined();
    expect(sanitizeAnalyticsUrl(null)).toBeUndefined();
    expect(sanitizeAnalyticsUrl("not a url")).toBeUndefined();
    expect(sanitizeAnalyticsUrl("about:client")).toBeUndefined();
    expect(sanitizeAnalyticsUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("strips caller-supplied page URLs and adds clean context", () => {
    vi.stubGlobal("window", {
      location: { href: "https://zitsy.test/search?q=canvas+tote#results" },
    });
    vi.stubGlobal("document", {
      referrer: "https://zitsy.test/referrer?utm_source=email",
    });

    expect(
      sanitizeAnalyticsParams({
        results: 2,
        page_location: "https://zitsy.test/search?q=canvas+tote",
        page_referrer: "https://zitsy.test/search?q=canvas+tote",
      }),
    ).toEqual({
      results: 2,
      page_location: "https://zitsy.test/search",
      page_referrer: "https://zitsy.test/referrer",
    });
  });

  it("omits an empty referrer", () => {
    vi.stubGlobal("window", {
      location: { href: "https://zitsy.test/search" },
    });
    vi.stubGlobal("document", { referrer: "" });

    const params = sanitizeAnalyticsParams({
      page_referrer: "https://zitsy.test/search?q=tote",
    });

    expect(params).toEqual({ page_location: "https://zitsy.test/search" });
  });
});

interface FakeScript {
  id: string;
  async: boolean;
  src: string;
  addEventListener(): void;
}

function installGaHarness() {
  const gtag = vi.fn();
  const fakeWindow = {
    dataLayer: [] as unknown[],
    gtag,
    location: {
      href: "https://zitsy.test/search?q=canvas+tote#results",
      origin: "https://zitsy.test",
      pathname: "/search",
      protocol: "https:",
    },
  };
  const fakeDocument = {
    cookie: "zitsy_consent=granted",
    referrer: "https://zitsy.test/referrer?utm_source=email",
    title: "Search",
    getElementById() {
      return null;
    },
    createElement(): FakeScript {
      return {
        id: "",
        async: false,
        src: "",
        addEventListener() {},
      };
    },
    head: {
      appendChild() {},
    },
  };

  vi.stubGlobal("window", fakeWindow);
  vi.stubGlobal("document", fakeDocument);

  return { gtag };
}

async function loadClient() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://zitsy.test");
  vi.stubEnv("NEXT_PUBLIC_GTM_ID", "");
  vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST");
  vi.stubEnv("NEXT_PUBLIC_CLARITY_PROJECT_ID", "");
  return import("@/lib/analytics/client");
}

describe("GA4 event context", () => {
  it("sends sanitised page URLs and drops raw caller values", async () => {
    const { gtag } = installGaHarness();
    const { trackEvent } = await loadClient();

    trackEvent("search", {
      results: 2,
      page_location: "https://zitsy.test/search?q=canvas+tote",
      page_referrer: "https://zitsy.test/referrer?utm_source=email",
    });

    const event = gtag.mock.calls.find(
      (call) => call[0] === "event" && call[1] === "search",
    );

    expect(event?.[2]).toEqual({
      results: 2,
      page_location: "https://zitsy.test/search",
      page_referrer: "https://zitsy.test/referrer",
    });
    expect(JSON.stringify(event?.[2])).not.toContain("tote");
  });

  it("sends a clean page view when tracked with a query-bearing path", async () => {
    const { gtag } = installGaHarness();
    const { trackPageView } = await loadClient();

    trackPageView("/search?q=canvas+tote");

    const event = gtag.mock.calls.find(
      (call) => call[0] === "event" && call[1] === "page_view",
    );

    expect(event?.[2]).toEqual({
      page_path: "/search",
      page_title: "Search",
      page_location: "https://zitsy.test/search",
      page_referrer: "https://zitsy.test/referrer",
    });
    expect(JSON.stringify(event?.[2])).not.toContain("tote");
  });
});
