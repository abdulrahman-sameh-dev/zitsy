import { generateKeyPairSync } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchClarityAnalytics } from "@/lib/analytics/providers/clarity";
import {
  fetchGa4Analytics,
  resetGa4TokenCacheForTests,
} from "@/lib/analytics/providers/ga4";
import { fetchVercelAnalytics } from "@/lib/analytics/providers/vercel";
import type { VercelProviderConfig } from "@/lib/analytics/providers/config";

const now = new Date("2026-10-28T12:00:00Z");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const vercelConfig: VercelProviderConfig = {
  token: "vercel-test-token",
  projectId: "prj_test",
  teamId: "team_test",
};

function vercelFetch(calls: string[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    if (url.pathname.endsWith("/visits/count")) {
      return json({ version: 1, data: { pageviews: 120, visitors: 80 } });
    }
    if (url.pathname.endsWith("/visits/aggregate")) {
      const by = url.searchParams.get("by");
      if (by === "day") {
        return json({
          version: 1,
          data: [
            {
              timestamp: "2026-10-27T00:00:00.000Z",
              pageviews: 10,
              visitors: 8,
            },
          ],
        });
      }
      if (by === "requestPath") {
        return json({
          version: 1,
          data: [{ requestPath: "/shop", pageviews: 60, visitors: 40 }],
        });
      }
      if (by === "utmSource") {
        return json(
          { error: "UTM dimensions require Web Analytics Plus or Enterprise" },
          402,
        );
      }
      if (by === "referrerHostname") {
        return json({
          version: 1,
          data: [{ referrerHostname: "google.com", pageviews: 30, visitors: 22 }],
        });
      }
      if (by === "country") {
        return json({
          version: 1,
          data: [{ country: "GB", pageviews: 50, visitors: 35 }],
        });
      }
      if (by === "deviceType") {
        return json({
          version: 1,
          data: [{ deviceType: "desktop", pageviews: 44, visitors: 30 }],
        });
      }
    }
    if (url.pathname.endsWith("/events/aggregate")) {
      return json({
        version: 1,
        data: [
          { eventName: "view_item", count: 20, visitors: 18 },
          { eventName: "add_to_cart", count: 8, visitors: 7 },
          { eventName: "begin_checkout", count: 3, visitors: 3 },
          { eventName: "purchase", count: 1, visitors: 1 },
        ],
      });
    }
    return json({ error: "not found" }, 404);
  });
}

beforeEach(() => {
  resetGa4TokenCacheForTests();
});

describe("Vercel Web Analytics provider", () => {
  it("normalizes live aggregate responses into a provider report", async () => {
    const calls: string[] = [];
    const report = await fetchVercelAnalytics(vercelConfig, 7, {
      now,
      fetchImpl: vercelFetch(calls) as unknown as typeof fetch,
    });

    expect(report.status).toBe("ok");
    expect(report.summary).toEqual([
      { label: "Page views", value: 120 },
      { label: "Visitors", value: 80, detail: "Unique visitors in range" },
    ]);
    expect(report.trend).toHaveLength(7);
    expect(report.trend.find((point) => point.label === "2026-10-27")).toEqual({
      label: "2026-10-27",
      primary: 10,
      secondary: 8,
    });
    expect(report.topPages[0]).toEqual({
      label: "/shop",
      primary: 60,
      secondary: 40,
    });
    expect(report.sources).toEqual([]);
    expect(report.referrers[0].label).toBe("google.com");
    expect(report.countries[0].label).toBe("GB");
    expect(report.devices[0].label).toBe("desktop");
    expect(report.events).toHaveLength(4);
    expect(report.funnel).toEqual([
      { label: "View item", count: 20 },
      { label: "Add to cart", count: 8 },
      { label: "Begin checkout", count: 3 },
      { label: "Purchase", count: 1 },
    ]);
    expect(calls).toHaveLength(7);
    expect(calls.some((call) => call.includes("utmSource"))).toBe(false);
    expect(report.limitations.join(" ")).toContain("Web Analytics Plus");
    expect(report.configuration).toBeNull();
  });

  it("does not mark the card partial when optional custom events are plan-gated", async () => {
    const base = vercelFetch([]) as unknown as (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/events/aggregate")) {
          return json(
            {
              error: {
                message:
                  "Accessing Analytics custom events requires an Enterprise or Pro plan.",
              },
            },
            402,
          );
        }
        return base(input, init);
      },
    );

    const report = await fetchVercelAnalytics(vercelConfig, 7, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("ok");
    expect(report.warning).toBeNull();
    expect(report.summary[0]).toEqual({ label: "Page views", value: 120 });
    expect(report.events).toEqual([]);
    expect(report.limitations.join(" ")).toContain("Pro or Enterprise");
  });

  it("keeps successful sections when one provider query fails", async () => {
    const base = vercelFetch([]) as unknown as (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.searchParams.get("by") === "country") {
        return json({ error: "boom" }, 500);
      }
      return base(input, init);
    });

    const report = await fetchVercelAnalytics(vercelConfig, 7, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("partial");
    expect(report.warning).toContain("temporarily unavailable");
    expect(report.summary).toEqual([
      { label: "Page views", value: 120 },
      { label: "Visitors", value: 80, detail: "Unique visitors in range" },
    ]);
    expect(report.topPages).toHaveLength(1);
    expect(report.countries).toEqual([]);
  });

  it("derives totals from daily rows when the count request fails", async () => {
    const base = vercelFetch([]) as unknown as (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/visits/count")) {
          return json({ error: "count unavailable" }, 503);
        }
        return base(input, init);
      },
    );

    const report = await fetchVercelAnalytics(vercelConfig, 7, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("partial");
    expect(report.summary).toEqual([
      { label: "Page views", value: 10 },
      { label: "Visitors", value: 8 },
    ]);
    expect(report.warning).toContain("summed from daily rows");
    expect(report.topPages[0].label).toBe("/shop");
    expect(report.trend).toHaveLength(7);
  });

  it("falls back when count returns zero but daily rows contain traffic", async () => {
    const base = vercelFetch([]) as unknown as (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/visits/count")) {
          return json({ version: 1, data: { pageviews: 0, visitors: 0 } });
        }
        return base(input, init);
      },
    );

    const report = await fetchVercelAnalytics(vercelConfig, 7, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("partial");
    expect(report.summary).toEqual([
      { label: "Page views", value: 10 },
      { label: "Visitors", value: 8 },
    ]);
    expect(report.warning).toContain("returned zero");
    expect(report.topPages).toHaveLength(1);
  });
});

describe("GA4 provider", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  const config = {
    propertyId: "properties/123456",
    clientEmail: "analytics@example.iam.gserviceaccount.com",
    privateKey: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };

  function ga4Response(
    dimensionNames: string[],
    metricNames: string[],
    rows: Array<{ dimensions?: string[]; metrics: string[] }>,
  ) {
    return {
      dimensionHeaders: dimensionNames.map((name) => ({ name })),
      metricHeaders: metricNames.map((name) => ({ name })),
      rows: rows.map((row) => ({
        dimensionValues: (row.dimensions ?? []).map((value) => ({ value })),
        metricValues: row.metrics.map((value) => ({ value })),
      })),
    };
  }

  function ga4Fetch(calls: Array<{ url: string; body: unknown }>) {
    return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname === "oauth2.googleapis.com") {
        return json({ access_token: "ga4-access-token", expires_in: 3600 });
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url: url.toString(), body });
      const dimensions = (body.dimensions ?? []).map(
        (item: { name: string }) => item.name,
      );
      const metrics = (body.metrics ?? []).map(
        (item: { name: string }) => item.name,
      );
      if (dimensions.length === 0) {
        return json(
          ga4Response(dimensions, metrics, [
            { metrics: ["100", "120", "250", "40"] },
          ]),
        );
      }
      if (dimensions[0] === "date") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["20261027"], metrics: ["15", "9"] },
          ]),
        );
      }
      if (dimensions[0] === "pagePath") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["/shop"], metrics: ["60", "40"] },
          ]),
        );
      }
      if (dimensions[0] === "sessionSourceMedium") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["google / organic"], metrics: ["40", "30"] },
          ]),
        );
      }
      if (dimensions[0] === "pageReferrer") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["https://google.com/"], metrics: ["25"] },
          ]),
        );
      }
      if (dimensions[0] === "country") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["United Kingdom"], metrics: ["35", "24"] },
          ]),
        );
      }
      if (dimensions[0] === "deviceCategory") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["mobile"], metrics: ["44", "31"] },
          ]),
        );
      }
      if (dimensions[0] === "eventName") {
        return json(
          ga4Response(dimensions, metrics, [
            { dimensions: ["view_item"], metrics: ["20", "18"] },
            { dimensions: ["add_to_cart"], metrics: ["8", "7"] },
            { dimensions: ["begin_checkout"], metrics: ["3", "3"] },
            { dimensions: ["purchase"], metrics: ["1", "1"] },
          ]),
        );
      }
      return json({ error: { message: "unknown report" } }, 400);
    });
  }

  it("signs a service-account JWT, runs reports, and parses the funnel", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const report = await fetchGa4Analytics(config, 7, {
      now,
      fetchImpl: ga4Fetch(calls) as unknown as typeof fetch,
    });

    expect(report.status).toBe("ok");
    expect(report.summary).toEqual([
      { label: "Users", value: 100 },
      { label: "Sessions", value: 120 },
      { label: "Page views", value: 250 },
      { label: "Events", value: 40 },
    ]);
    expect(report.trend).toHaveLength(7);
    expect(report.trend.find((point) => point.label === "2026-10-27")).toEqual({
      label: "2026-10-27",
      primary: 15,
      secondary: 9,
    });
    expect(report.topPages[0]).toEqual({
      label: "/shop",
      primary: 60,
      secondary: 40,
    });
    expect(report.sources[0].label).toBe("google / organic");
    expect(report.referrers[0].label).toBe("https://google.com/");
    expect(report.countries[0].label).toBe("United Kingdom");
    expect(report.devices[0].label).toBe("mobile");
    expect(report.funnel).toEqual([
      { label: "View item", count: 20 },
      { label: "Add to cart", count: 8 },
      { label: "Begin checkout", count: 3 },
      { label: "Purchase", count: 1 },
    ]);
    expect(calls).toHaveLength(8);
  });

  it("explains a 403 property permission failure without leaking credentials", async () => {
    const fetchImpl = vi.fn(
      async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.hostname === "oauth2.googleapis.com") {
          return json({ access_token: "ga4-access-token", expires_in: 3600 });
        }
        return json(
          {
            error: {
              code: 403,
              message:
                "PERMISSION_DENIED: User does not have sufficient permissions for this property.",
            },
          },
          403,
        );
      },
    );

    const report = await fetchGa4Analytics(config, 7, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("error");
    expect(report.warning).toContain("403");
    expect(report.warning).toContain("123456");
    expect(report.warning).toMatch(/Viewer or Analyst/);
    expect(report.warning).not.toContain(config.clientEmail);
    expect(report.warning).not.toContain("PRIVATE KEY");
    expect(report.summary).toEqual([]);
  });

  it("distinguishes a disabled Data API from missing property access", async () => {
    const fetchImpl = vi.fn(
      async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.hostname === "oauth2.googleapis.com") {
          return json({ access_token: "ga4-access-token", expires_in: 3600 });
        }
        return json(
          {
            error: {
              code: 403,
              message:
                "Google Analytics Data API has not been used in project 123 before or it is disabled.",
            },
          },
          403,
        );
      },
    );

    const report = await fetchGa4Analytics(config, 7, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("error");
    expect(report.warning).toContain("Enable the Google Analytics Data API");
    expect(report.warning).not.toContain("Property access management");
  });
});

describe("Clarity provider", () => {
  const config = { token: "clarity-test-token", projectId: "clarity-project" };

  function clarityFetch() {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get("dimension1")) {
        return json([
          {
            metricName: "Traffic",
            information: [
              {
                totalSessionCount: "50",
                "Country/Region": "United Kingdom",
                Device: "PC",
                Source: "google",
              },
              {
                totalSessionCount: "30",
                "Country/Region": "Germany",
                Device: "Mobile",
                Source: "direct",
              },
            ],
          },
        ]);
      }
      return json([
        {
          metricName: "Traffic",
          information: [
            {
              totalSessionCount: "100",
              totalBotSessionCount: "10",
              distantUserCount: "70",
              PagesPerSessionPercentage: 1.5,
            },
          ],
        },
        {
          metricName: "Popular Pages",
          information: [
            {
              URL: "/shop",
              totalSessionCount: "60",
              distinctUserCount: "40",
            },
          ],
        },
        {
          metricName: "Referrer URL",
          information: [
            { "Referrer URL": "google.com", totalSessionCount: "30" },
          ],
        },
        {
          metricName: "Scroll Depth",
          information: [{ averageScrollDepth: 45 }],
        },
      ]);
    });
  }

  it("parses live insights and aggregates the combined breakdown", async () => {
    const fetchImpl = clarityFetch();
    const report = await fetchClarityAnalytics(config, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("ok");
    expect(report.summary).toEqual([
      {
        label: "Sessions",
        value: 100,
        detail: "Includes bot sessions",
      },
      { label: "Users", value: 70, detail: "Distinct users" },
      { label: "Bot sessions", value: 10 },
      {
        label: "Pages / session",
        value: 1.5,
        detail: "1.50",
      },
      { label: "Scroll depth", value: 45, detail: "Average %" },
    ]);
    expect(report.topPages[0]).toEqual({
      label: "/shop",
      primary: 60,
      secondary: 40,
    });
    expect(report.referrers[0].label).toBe("google.com");
    expect(report.sources).toEqual([
      { label: "google", primary: 50 },
      { label: "direct", primary: 30 },
    ]);
    expect(report.countries[0].label).toBe("United Kingdom");
    expect(report.devices[1].label).toBe("Mobile");
    expect(report.rangeLabel).toBe("Last 3 days (Clarity limit)");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a successful zero-session response without treating it as a parse error", async () => {
    const fetchImpl = vi.fn(async () =>
      json([
        {
          metricName: "Traffic",
          information: [
            {
              totalSessionCount: "0",
              totalBotSessionCount: "0",
              distantUserCount: "0",
              PagesPerSessionPercentage: 0,
            },
          ],
        },
      ]),
    );

    const report = await fetchClarityAnalytics(config, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("ok");
    expect(report.warning).toContain("zero sessions");
    expect(report.warning).toContain("NEXT_PUBLIC_CLARITY_PROJECT_ID");
    expect(report.summary[0]).toEqual({
      label: "Sessions",
      value: 0,
      detail: "Includes bot sessions",
    });
  });

  it("flags responses that do not contain a recognizable Traffic group", async () => {
    const fetchImpl = vi.fn(async () =>
      json([
        {
          metricName: "Popular Pages",
          information: [{ URL: "/shop", totalSessionCount: "10" }],
        },
      ]),
    );

    const report = await fetchClarityAnalytics(config, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("partial");
    expect(report.warning).toContain("Traffic");
    expect(report.summary).toEqual([]);
    expect(report.topPages[0]).toMatchObject({ label: "/shop", primary: 10 });
  });

  it("flags an empty successful response as possible missing project data", async () => {
    const fetchImpl = vi.fn(async () => json([]));

    const report = await fetchClarityAnalytics(config, {
      now,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(report.status).toBe("ok");
    expect(report.warning).toContain("empty response");
    expect(report.summary).toEqual([]);
  });
});
