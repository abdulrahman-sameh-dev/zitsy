import { createSign } from "node:crypto";

import { log } from "@/lib/log";

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
  AnalyticsProviderReport,
  AnalyticsRange,
  AnalyticsTrendPoint,
} from "./types";
import type { Ga4ProviderConfig } from "./config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ANALYTICS_SCOPE =
  "https://www.googleapis.com/auth/analytics.readonly";
const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

interface Ga4Row {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

interface Ga4Response {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Ga4Row[];
}

interface ParsedGa4Row {
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

interface FetchOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
}

interface TokenCacheEntry {
  key: string;
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCacheEntry | null = null;

export function resetGa4TokenCacheForTests(): void {
  tokenCache = null;
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function serviceAccountAssertion(
  config: Ga4ProviderConfig,
  nowSeconds: number,
): string {
  const header = base64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: ANALYTICS_SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3_600,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(config.privateKey));
  return `${unsigned}.${base64Url(signature)}`;
}

async function accessToken(
  config: Ga4ProviderConfig,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<string> {
  const cacheKey = config.clientEmail;
  if (
    tokenCache &&
    tokenCache.key === cacheKey &&
    tokenCache.expiresAt > now.getTime() + 60_000
  ) {
    return tokenCache.token;
  }

  const assertion = serviceAccountAssertion(
    config,
    Math.floor(now.getTime() / 1000),
  );
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetchProviderJson<{
    access_token?: string;
    expires_in?: number;
  }>(
    "Google Analytics 4",
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
    fetchImpl,
  );

  if (!response.access_token) {
    throw new Error("Google Analytics 4 token response was missing an access token.");
  }
  const expiresIn = Number(response.expires_in ?? 3_600);
  tokenCache = {
    key: cacheKey,
    token: response.access_token,
    expiresAt:
      now.getTime() + Math.max(expiresIn - 60, 30) * 1_000,
  };
  return response.access_token;
}

function propertyPath(propertyId: string): string {
  const normalized = propertyId.replace(/^properties\//, "").trim();
  return `properties/${encodeURIComponent(normalized)}`;
}

function numericPropertyId(propertyId: string): string {
  const normalized = propertyId.replace(/^properties\//, "").trim();
  return normalized || "unknown";
}

function ga4Diagnostic(
  error: unknown,
  propertyId: string,
  phase: "token" | "report",
): string {
  const fallback =
    error instanceof Error ? error.message : providerErrorMessage(error);
  if (!(error instanceof ProviderError)) return fallback;

  const property = numericPropertyId(propertyId);
  const detail = error.message.toLowerCase();

  if (phase === "token") {
    if (error.status === 400 || error.status === 401) {
      return `Google Analytics 4 could not authenticate the service account (${error.status}). Verify GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY use a current service-account JSON key and that the key has not been revoked.`;
    }
    if (error.status === 403) {
      return "Google Analytics 4 denied the token request (403). Confirm the Google Analytics Data API is enabled for the service-account project.";
    }
    return fallback;
  }

  if (error.status === 401) {
    return `Google Analytics 4 rejected the access token (401). Verify GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY use a current service-account JSON key.`;
  }
  if (error.status === 403) {
    if (
      /has not been used|is disabled|not been enabled|enable (the|it)/.test(
        detail,
      )
    ) {
      return "Google Analytics 4 is not enabled for the service-account project (403). Enable the Google Analytics Data API in Google Cloud, wait a few minutes, then retry.";
    }
    return `Google Analytics 4 denied access to property ${property} (403). In GA4 Admin > Property access management, add the reporting service account as a Viewer or Analyst for this property, then retry.`;
  }
  if (error.status === 404) {
    return `Google Analytics 4 property ${property} was not found (404). Use the numeric GA4 property ID and confirm the Data API is enabled.`;
  }
  if (error.status === 400) {
    return `Google Analytics 4 rejected the report request for property ${property} (400). Verify GA4_PROPERTY_ID is the numeric property ID without a properties/ prefix.`;
  }
  return fallback;
}

function reportBody(
  range: AnalyticsRange,
  dimensions: string[],
  metrics: string[],
  options: {
    limit?: number;
    orderByMetric?: string;
    orderByDimension?: string;
  } = {},
) {
  return {
    dateRanges: [
      { startDate: `${range - 1}daysAgo`, endDate: "today" },
    ],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    ...(options.limit ? { limit: String(options.limit) } : {}),
    ...(options.orderByMetric
      ? {
          orderBys: [
            {
              metric: { metricName: options.orderByMetric },
              desc: true,
            },
          ],
        }
      : {}),
    ...(options.orderByDimension
      ? {
          orderBys: [
            {
              dimension: { dimensionName: options.orderByDimension },
            },
          ],
        }
      : {}),
  };
}

async function runReport(
  config: Ga4ProviderConfig,
  token: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<Ga4Response> {
  return fetchProviderJson<Ga4Response>(
    "Google Analytics 4",
    `${GA4_API_BASE}/${propertyPath(config.propertyId)}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
    fetchImpl,
  );
}

function parseRows(response: Ga4Response): ParsedGa4Row[] {
  const dimensions =
    response.dimensionHeaders?.map((header) => header.name ?? "") ?? [];
  const metrics = response.metricHeaders?.map((header) => header.name ?? "") ?? [];
  return (response.rows ?? []).map((row) => {
    const dimensionValues: Record<string, string> = {};
    const metricValues: Record<string, number> = {};
    dimensions.forEach((name, index) => {
      if (name) dimensionValues[name] = row.dimensionValues?.[index]?.value ?? "";
    });
    metrics.forEach((name, index) => {
      if (!name) return;
      const parsed = Number(row.metricValues?.[index]?.value ?? 0);
      metricValues[name] = Number.isFinite(parsed) ? parsed : 0;
    });
    return { dimensions: dimensionValues, metrics: metricValues };
  });
}

function label(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "(not set)") return "Unknown";
  return trimmed;
}

function breakdown(
  rows: ParsedGa4Row[],
  dimension: string,
  primaryMetric: string,
  secondaryMetric?: string,
): AnalyticsBreakdownRow[] {
  return rows
    .map((row) => ({
      label: label(row.dimensions[dimension]),
      primary: row.metrics[primaryMetric] ?? 0,
      ...(secondaryMetric
        ? { secondary: row.metrics[secondaryMetric] ?? 0 }
        : {}),
    }))
    .sort((a, b) => b.primary - a.primary);
}

function dateLabel(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export async function fetchGa4Analytics(
  config: Ga4ProviderConfig,
  range: AnalyticsRange,
  options: FetchOptions = {},
): Promise<AnalyticsProviderReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const window = analyticsRangeWindow(range, now);

  let token = "";
  try {
    token = await accessToken(config, fetchImpl, now);
  } catch (error) {
    log.warn("ga4 token exchange failed", {
      propertyId: numericPropertyId(config.propertyId),
      httpStatus: error instanceof ProviderError ? error.status : 0,
    });
    return {
      id: "ga4",
      name: "Google Analytics 4",
      status: "error",
      statusMessage: "Unavailable",
      warning: ga4Diagnostic(error, config.propertyId, "token"),
      fetchedAt: now.toISOString(),
      rangeLabel: window.label,
      limitations: [
        "GA4 is consent-gated, so totals can differ from database orders.",
      ],
      configuration: null,
      primaryLabel: "Page views",
      secondaryLabel: "Users",
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

  const requests = [
    runReport(
      config,
      token,
      reportBody(
        range,
        [],
        [
          "activeUsers",
          "sessions",
          "screenPageViews",
          "eventCount",
        ],
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["date"],
        ["screenPageViews", "activeUsers"],
        { orderByDimension: "date" },
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["pagePath"],
        ["screenPageViews", "activeUsers"],
        { limit: 8, orderByMetric: "screenPageViews" },
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["sessionSourceMedium"],
        ["screenPageViews", "activeUsers"],
        { limit: 8, orderByMetric: "screenPageViews" },
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["pageReferrer"],
        ["screenPageViews"],
        { limit: 8, orderByMetric: "screenPageViews" },
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["country"],
        ["screenPageViews", "activeUsers"],
        { limit: 8, orderByMetric: "screenPageViews" },
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["deviceCategory"],
        ["screenPageViews", "activeUsers"],
        { limit: 8, orderByMetric: "screenPageViews" },
      ),
      fetchImpl,
    ),
    runReport(
      config,
      token,
      reportBody(
        range,
        ["eventName"],
        ["eventCount", "activeUsers"],
        { limit: 30, orderByMetric: "eventCount" },
      ),
      fetchImpl,
    ),
  ];

  const settled = await Promise.allSettled(requests);
  const rejected = settled.filter(
    (item): item is PromiseRejectedResult => item.status === "rejected",
  );
  const failures = rejected.map((item) =>
    ga4Diagnostic(item.reason, config.propertyId, "report"),
  );
  if (rejected.length > 0) {
    const first = rejected[0]?.reason;
    log.warn("ga4 data api request failed", {
      propertyId: numericPropertyId(config.propertyId),
      httpStatus: first instanceof ProviderError ? first.status : 0,
      failedReports: rejected.length,
      totalReports: settled.length,
    });
  }
  const response = (index: number): Ga4Response | null =>
    settled[index]?.status === "fulfilled"
      ? (settled[index].value as Ga4Response)
      : null;

  const summaryRows = response(0) ? parseRows(response(0)!) : [];
  const summaryRow = summaryRows[0];
  const summary = summaryRow
    ? [
        {
          label: "Users",
          value: summaryRow.metrics.activeUsers ?? 0,
        },
        {
          label: "Sessions",
          value: summaryRow.metrics.sessions ?? 0,
        },
        {
          label: "Page views",
          value: summaryRow.metrics.screenPageViews ?? 0,
        },
        {
          label: "Events",
          value: summaryRow.metrics.eventCount ?? 0,
        },
      ]
    : [];

  const trendRows = response(1) ? parseRows(response(1)!) : [];
  const byDay = new Map<string, ParsedGa4Row>();
  for (const row of trendRows) {
    const raw = row.dimensions.date ?? "";
    if (raw) byDay.set(dateLabel(raw), row);
  }
  const trend: AnalyticsTrendPoint[] = [];
  for (let offset = 0; offset < range; offset += 1) {
    const day = startOfUtcDay(
      new Date(window.since.getTime() + offset * 24 * 60 * 60 * 1000),
    );
    const key = utcDayKey(day);
    const row = byDay.get(key);
    trend.push({
      label: key,
      primary: row?.metrics.screenPageViews ?? 0,
      secondary: row?.metrics.activeUsers ?? 0,
    });
  }

  const eventRows: AnalyticsEventRow[] = response(7)
    ? parseRows(response(7)!).map((row) => ({
        label: label(row.dimensions.eventName),
        count: row.metrics.eventCount ?? 0,
        visitors: row.metrics.activeUsers ?? 0,
      }))
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

  const status =
    failures.length === 0
      ? "ok"
      : settled.every((item) => item.status === "rejected")
        ? "error"
        : "partial";

  return {
    id: "ga4",
    name: "Google Analytics 4",
    status,
    statusMessage:
      status === "ok"
        ? "Connected"
        : status === "partial"
          ? "Partial data"
          : "Unavailable",
    warning: failures.length ? failures[0] : null,
    fetchedAt: now.toISOString(),
    rangeLabel: window.label,
    limitations: [
      "GA4 is consent-gated, so totals can differ from database orders because of blockers and attribution.",
      "The funnel shows GA4 event counts only, not sequential conversion or deduplicated users.",
      "GA4 reporting timezone can differ from UTC.",
    ],
    configuration: null,
    primaryLabel: "Page views",
    secondaryLabel: "Users",
    summary,
    trend,
    topPages: response(2)
      ? breakdown(
          parseRows(response(2)!),
          "pagePath",
          "screenPageViews",
          "activeUsers",
        )
      : [],
    sources: response(3)
      ? breakdown(
          parseRows(response(3)!),
          "sessionSourceMedium",
          "screenPageViews",
          "activeUsers",
        )
      : [],
    referrers: response(4)
      ? breakdown(
          parseRows(response(4)!),
          "pageReferrer",
          "screenPageViews",
        )
      : [],
    countries: response(5)
      ? breakdown(
          parseRows(response(5)!),
          "country",
          "screenPageViews",
          "activeUsers",
        )
      : [],
    devices: response(6)
      ? breakdown(
          parseRows(response(6)!),
          "deviceCategory",
          "screenPageViews",
          "activeUsers",
        )
      : [],
    events: eventRows,
    funnel,
  };
}
