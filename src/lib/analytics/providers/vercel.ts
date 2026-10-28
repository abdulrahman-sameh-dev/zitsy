import {
  ProviderError,
  fetchProviderJson,
  providerErrorMessage,
} from "./http";
import {
  analyticsRangeWindow,
  startOfUtcDay,
  utcDayKey,
} from "./range";
import type {
  AnalyticsBreakdownRow,
  AnalyticsEventRow,
  AnalyticsFunnelStep,
  AnalyticsMetric,
  AnalyticsProviderReport,
  AnalyticsRange,
  AnalyticsTrendPoint,
} from "./types";
import type { VercelProviderConfig } from "./config";

const VERCEL_API_BASE = "https://api.vercel.com";
const REVALIDATE_SECONDS = 300;

interface VercelQueryResponse<T> {
  version: number;
  data: T | T[];
  query?: Record<string, unknown>;
}

interface VercelCount {
  pageviews?: number;
  visitors?: number;
}

interface VercelVisitRow {
  timestamp?: string;
  country?: string;
  deviceType?: string;
  requestPath?: string;
  referrerHostname?: string;
  pageviews?: number;
  visitors?: number;
}

interface VercelEventRow {
  eventName?: string;
  count?: number;
  visitors?: number;
}

interface FetchOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function rows<T>(data: T | T[]): T[] {
  return Array.isArray(data) ? data : [data];
}

function buildUrl(
  config: VercelProviderConfig,
  path: string,
  params: Record<string, string | string[] | undefined>,
): URL {
  const url = new URL(`${VERCEL_API_BASE}${path}`);
  url.searchParams.set("projectId", config.projectId);
  if (config.teamId) url.searchParams.set("teamId", config.teamId);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, item);
    }
  }
  return url;
}

async function request<T>(
  config: VercelProviderConfig,
  path: string,
  params: Record<string, string | string[] | undefined>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const url = buildUrl(config, path, params);
  return fetchProviderJson<T>(
    "Vercel Web Analytics",
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS, tags: ["analytics:vercel"] },
    },
    fetchImpl,
  );
}

function breakdown(
  items: VercelVisitRow[],
  labelFor: (row: VercelVisitRow) => string,
): AnalyticsBreakdownRow[] {
  return items
    .map((row) => ({
      label: labelFor(row),
      primary: numberValue(row.pageviews),
      secondary: numberValue(row.visitors),
    }))
    .sort((a, b) => b.primary - a.primary);
}

export async function fetchVercelAnalytics(
  config: VercelProviderConfig,
  range: AnalyticsRange,
  options: FetchOptions = {},
): Promise<AnalyticsProviderReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const window = analyticsRangeWindow(range, now);
  const baseParams = {
    since: window.since.toISOString(),
    until: window.until.toISOString(),
  };

  const requests = [
    request<VercelQueryResponse<VercelCount>>(
      config,
      "/v1/query/web-analytics/visits/count",
      baseParams,
      fetchImpl,
    ),
    request<VercelQueryResponse<VercelVisitRow>>(
      config,
      "/v1/query/web-analytics/visits/aggregate",
      { ...baseParams, by: "day" },
      fetchImpl,
    ),
    request<VercelQueryResponse<VercelVisitRow>>(
      config,
      "/v1/query/web-analytics/visits/aggregate",
      { ...baseParams, by: "requestPath", limit: "8" },
      fetchImpl,
    ),
    request<VercelQueryResponse<VercelVisitRow>>(
      config,
      "/v1/query/web-analytics/visits/aggregate",
      { ...baseParams, by: "referrerHostname", limit: "8" },
      fetchImpl,
    ),
    request<VercelQueryResponse<VercelVisitRow>>(
      config,
      "/v1/query/web-analytics/visits/aggregate",
      { ...baseParams, by: "country", limit: "8" },
      fetchImpl,
    ),
    request<VercelQueryResponse<VercelVisitRow>>(
      config,
      "/v1/query/web-analytics/visits/aggregate",
      { ...baseParams, by: "deviceType", limit: "8" },
      fetchImpl,
    ),
    request<VercelQueryResponse<VercelEventRow>>(
      config,
      "/v1/query/web-analytics/events/aggregate",
      { ...baseParams, by: "eventName", limit: "30" },
      fetchImpl,
    ),
  ];

  const settled = await Promise.allSettled(requests);
  const requiredSettled = settled.slice(0, 6);
  const requiredFailures = requiredSettled
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => providerErrorMessage(item.reason));
  const eventFailure =
    settled[6]?.status === "rejected" ? settled[6].reason : null;
  const eventPlanLimited =
    eventFailure instanceof ProviderError && eventFailure.status === 402;
  const eventWarning =
    eventFailure && !eventPlanLimited
      ? "Custom events could not be loaded; the other reports are unaffected."
      : null;
  const value = <T>(index: number): T | null =>
    settled[index]?.status === "fulfilled"
      ? (settled[index].value as T)
      : null;

  const count = value<VercelQueryResponse<VercelCount>>(0);
  const daily = value<VercelQueryResponse<VercelVisitRow>>(1);
  const pages = value<VercelQueryResponse<VercelVisitRow>>(2);
  const referrers = value<VercelQueryResponse<VercelVisitRow>>(3);
  const countries = value<VercelQueryResponse<VercelVisitRow>>(4);
  const devices = value<VercelQueryResponse<VercelVisitRow>>(5);
  const eventResponse = value<VercelQueryResponse<VercelEventRow>>(6);

  const dailyRows = daily ? rows(daily.data) : [];
  const byDay = new Map<string, VercelVisitRow>();
  for (const row of dailyRows) {
    const timestamp = textValue(row.timestamp, "");
    if (timestamp) byDay.set(timestamp.slice(0, 10), row);
  }
  const trend: AnalyticsTrendPoint[] = [];
  if (daily) {
    for (let offset = 0; offset < range; offset += 1) {
      const day = startOfUtcDay(
        new Date(window.since.getTime() + offset * 24 * 60 * 60 * 1000),
      );
      const key = utcDayKey(day);
      const row = byDay.get(key);
      trend.push({
        label: key,
        primary: numberValue(row?.pageviews),
        secondary: numberValue(row?.visitors),
      });
    }
  }
  const dailyTotals = dailyRows.reduce<{
    pageviews: number;
    visitors: number;
  }>(
    (total, row) => ({
      pageviews: total.pageviews + numberValue(row.pageviews),
      visitors: total.visitors + numberValue(row.visitors),
    }),
    { pageviews: 0, visitors: 0 },
  );
  const dailyHasTraffic = dailyTotals.pageviews > 0 || dailyTotals.visitors > 0;

  const eventRows: AnalyticsEventRow[] = eventResponse
    ? rows(eventResponse.data)
        .map((row) => ({
          label: textValue(row.eventName, "Unknown event"),
          count: numberValue(row.count),
          visitors: numberValue(row.visitors),
        }))
        .sort((a, b) => b.count - a.count)
    : [];
  const eventMap = new Map(
    eventRows.map((event) => [event.label.toLowerCase(), event.count]),
  );
  const funnelDefinitions: Array<[string, string]> = [
    ["view_item", "View item"],
    ["add_to_cart", "Add to cart"],
    ["begin_checkout", "Begin checkout"],
    ["purchase", "Purchase"],
  ];
  const hasFunnel = funnelDefinitions.some(([name]) => eventMap.has(name));
  const funnel: AnalyticsFunnelStep[] = hasFunnel
    ? funnelDefinitions.map(([name, label]) => ({
        label,
        count: eventMap.get(name) ?? 0,
      }))
    : [];

  const countRow =
    count && !Array.isArray(count.data) ? count.data : null;
  const countPageviews = countRow ? numberValue(countRow.pageviews) : null;
  const countVisitors = countRow ? numberValue(countRow.visitors) : null;
  let summary: AnalyticsMetric[] = [];
  let totalsFallback: string | null = null;

  if (countRow) {
    if (
      countPageviews === 0 &&
      countVisitors === 0 &&
      dailyHasTraffic
    ) {
      summary = [
        { label: "Page views", value: dailyTotals.pageviews },
        { label: "Visitors", value: dailyTotals.visitors },
      ];
      totalsFallback =
        "The total count endpoint returned zero while daily rows contained traffic. Totals are summed from daily rows, so visitors may be double-counted.";
    } else {
      summary = [
        { label: "Page views", value: countPageviews ?? 0 },
        {
          label: "Visitors",
          value: countVisitors ?? 0,
          detail: "Unique visitors in range",
        },
      ];
    }
  } else if (dailyHasTraffic) {
    summary = [
      { label: "Page views", value: dailyTotals.pageviews },
      { label: "Visitors", value: dailyTotals.visitors },
    ];
    totalsFallback =
      "The total count request was unavailable. Totals are summed from daily rows, so visitors may be double-counted.";
  }

  const warnings = requiredFailures.length ? [requiredFailures[0]] : [];
  if (eventWarning) warnings.push(eventWarning);
  if (totalsFallback) warnings.push(totalsFallback);
  const status = requiredSettled.every((item) => item.status === "rejected")
    ? "error"
    : requiredFailures.length || totalsFallback
      ? "partial"
      : "ok";
  const limitations = [
    "Only visitors who accepted analytics and were not blocked are included.",
    "Custom events appear only when they are sent with track() on the client.",
    "Breakdown visitor counts are not deduplicated across rows.",
    "UTM and traffic-source breakdowns require Web Analytics Plus or Enterprise, so they are not requested.",
  ];
  if (eventPlanLimited) {
    limitations.push(
      "Custom events require Web Analytics Pro or Enterprise and are not included on this plan.",
    );
  }

  return {
    id: "vercel",
    name: "Vercel Web Analytics",
    status,
    statusMessage:
      status === "ok"
        ? "Connected"
        : status === "partial"
          ? "Partial data"
          : "Unavailable",
    warning: warnings.length ? warnings.join(" ") : null,
    fetchedAt: now.toISOString(),
    rangeLabel: window.label,
    configuration: null,
    limitations,
    primaryLabel: "Page views",
    secondaryLabel: "Visitors",
    summary,
    trend,
    topPages: pages
      ? breakdown(rows(pages.data), (row) =>
          textValue(row.requestPath, "Unknown page"),
        )
      : [],
    sources: [],
    referrers: referrers
      ? breakdown(rows(referrers.data), (row) =>
          textValue(row.referrerHostname, "Direct / none"),
        )
      : [],
    countries: countries
      ? breakdown(rows(countries.data), (row) =>
          textValue(row.country, "Unknown"),
        )
      : [],
    devices: devices
      ? breakdown(rows(devices.data), (row) =>
          textValue(row.deviceType, "Unknown"),
        )
      : [],
    events: eventRows,
    funnel,
  };
}
