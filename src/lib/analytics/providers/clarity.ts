import { fetchProviderJson, providerErrorMessage } from "./http";
import type {
  AnalyticsBreakdownRow,
  AnalyticsMetric,
  AnalyticsProviderReport,
} from "./types";
import type { ClarityProviderConfig } from "./config";

const CLARITY_API_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const CLARITY_DAYS = 3;
const REVALIDATE_SECONDS = 86_400;

interface ClarityMetricGroup {
  metricName?: string;
  information?: Array<Record<string, unknown>>;
}

type ClarityResponse = ClarityMetricGroup[];

interface FetchOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
}

function pick(
  row: Record<string, unknown>,
  names: string[],
): unknown {
  for (const name of names) {
    if (row[name] !== undefined) return row[name];
  }
  const lower = new Map(
    Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const name of names) {
    const value = lower.get(name.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(
    String(value ?? "")
      .replace(/,/g, "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return numberValue(value);
}

function stringValue(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function metricGroup(
  response: ClarityResponse,
  name: string,
): ClarityMetricGroup | null {
  return (
    response.find(
      (group) => group.metricName?.toLowerCase() === name.toLowerCase(),
    ) ?? null
  );
}

function groupRows(group: ClarityMetricGroup | null): Array<Record<string, unknown>> {
  return group?.information ?? [];
}

function aggregateBy(
  response: ClarityResponse,
  dimension: string[],
  fallback: string,
): AnalyticsBreakdownRow[] {
  const traffic = metricGroup(response, "Traffic");
  const grouped = new Map<string, number>();
  for (const row of groupRows(traffic)) {
    const name = stringValue(pick(row, dimension), fallback);
    grouped.set(
      name,
      (grouped.get(name) ?? 0) +
        numberValue(pick(row, ["totalSessionCount", "sessions", "sessionCount"])),
    );
  }
  return [...grouped.entries()]
    .map(([name, sessions]) => ({
      label: name,
      primary: sessions,
    }))
    .sort((a, b) => b.primary - a.primary)
    .slice(0, 8);
}

function popularPages(response: ClarityResponse): AnalyticsBreakdownRow[] {
  return groupRows(metricGroup(response, "Popular Pages"))
    .map((row) => ({
      label: stringValue(
        pick(row, ["URL", "url", "PageUrl", "pageUrl", "Page URL"]),
        "Unknown page",
      ),
      primary: numberValue(
        pick(row, [
          "totalSessionCount",
          "sessions",
          "pageViews",
          "PageViews",
          "totalPageViews",
          "visitCount",
        ]),
      ),
      secondary: optionalNumber(
        pick(row, [
          "distinctUserCount",
          "distantUserCount",
          "uniqueUserCount",
          "users",
        ]),
      ),
    }))
    .sort((a, b) => b.primary - a.primary)
    .slice(0, 8);
}

function referrers(response: ClarityResponse): AnalyticsBreakdownRow[] {
  return groupRows(metricGroup(response, "Referrer URL"))
    .map((row) => ({
      label: stringValue(
        pick(row, ["Referrer URL", "referrerUrl", "referrer", "Referrer"]),
        "Direct / none",
      ),
      primary: numberValue(
        pick(row, ["totalSessionCount", "sessions", "sessionCount"]),
      ),
    }))
    .sort((a, b) => b.primary - a.primary)
    .slice(0, 8);
}

function summaryMetrics(response: ClarityResponse): AnalyticsMetric[] {
  const traffic = groupRows(metricGroup(response, "Traffic"))[0];
  if (!traffic) return [];
  const sessions = numberValue(
    pick(traffic, ["totalSessionCount", "sessions", "sessionCount"]),
  );
  const botSessions = numberValue(
    pick(traffic, ["totalBotSessionCount", "botSessionCount"]),
  );
  const users = numberValue(
    pick(traffic, [
      "distantUserCount",
      "distinctUserCount",
      "uniqueUserCount",
      "users",
    ]),
  );
  const pagesPerSession = numberValue(
    pick(traffic, [
      "PagesPerSessionPercentage",
      "pagesPerSession",
      "pagesPerSessionPercentage",
    ]),
  );
  const scrollDepth = numberValue(
    pick(
      groupRows(metricGroup(response, "Scroll Depth"))[0] ?? {},
      ["averageScrollDepth", "scrollDepth", "ScrollDepth", "averageScrollDepthPercentage"],
    ),
  );

  return [
    { label: "Sessions", value: sessions, detail: "Includes bot sessions" },
    { label: "Users", value: users, detail: "Distinct users" },
    { label: "Bot sessions", value: botSessions },
    {
      label: "Pages / session",
      value: pagesPerSession,
      detail: pagesPerSession ? pagesPerSession.toFixed(2) : undefined,
    },
    ...(scrollDepth
      ? [
          {
            label: "Scroll depth",
            value: scrollDepth,
            detail: "Average %",
          },
        ]
      : []),
  ];
}

async function requestClarity(
  config: ClarityProviderConfig,
  fetchImpl: typeof fetch,
  dimensions: string[],
): Promise<ClarityResponse> {
  const url = new URL(CLARITY_API_URL);
  url.searchParams.set("numOfDays", String(CLARITY_DAYS));
  dimensions.forEach((dimension, index) => {
    url.searchParams.set(`dimension${index + 1}`, dimension);
  });

  const response = await fetchProviderJson<ClarityResponse>(
    "Microsoft Clarity",
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS, tags: ["analytics:clarity"] },
    },
    fetchImpl,
  );
  return Array.isArray(response) ? response : [];
}

export async function fetchClarityAnalytics(
  config: ClarityProviderConfig,
  options: FetchOptions = {},
): Promise<AnalyticsProviderReport> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();

  const settled = await Promise.allSettled([
    requestClarity(config, fetchImpl, []),
    requestClarity(config, fetchImpl, ["Country/Region", "Device", "Source"]),
  ]);
  const failures = settled
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => providerErrorMessage(item.reason));
  const base =
    settled[0]?.status === "fulfilled"
      ? (settled[0].value as ClarityResponse)
      : null;
  const breakdown =
    settled[1]?.status === "fulfilled"
      ? (settled[1].value as ClarityResponse)
      : null;

  const groupNames = new Set(
    (base ?? [])
      .map((group) => group.metricName?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)),
  );
  const hasRecognizableGroups = [
    "traffic",
    "popular pages",
    "referrer url",
    "scroll depth",
  ].some((name) => groupNames.has(name));
  const trafficGroup = base ? metricGroup(base, "Traffic") : null;
  const hasTrafficRows = groupRows(trafficGroup).length > 0;
  const responseEmpty = base !== null && base.length === 0;
  const summary = base ? summaryMetrics(base) : [];
  const zeroTraffic =
    summary.length > 0 && summary.every((metric) => metric.value === 0);
  const parseIncomplete =
    base !== null &&
    !responseEmpty &&
    (!hasRecognizableGroups || !trafficGroup || !hasTrafficRows);

  let dataWarning: string | null = null;
  if (responseEmpty) {
    dataWarning =
      "Clarity returned an empty response for the last 3 days. This can mean no consenting sessions, a token scoped to a different project, or data that has not been processed yet.";
  } else if (base && !hasRecognizableGroups) {
    dataWarning =
      "Clarity returned a response without any recognized metric groups. The Data Export API shape may have changed; verify the token and project before relying on these values.";
  } else if (base && (!trafficGroup || !hasTrafficRows)) {
    dataWarning =
      "Clarity did not return a populated Traffic metric group. Verify the token belongs to this project and check the response schema.";
  } else if (zeroTraffic) {
    dataWarning =
      "Clarity accepted the request but returned zero sessions for the last 3 days. Check consent-gated collection, that the API token belongs to NEXT_PUBLIC_CLARITY_PROJECT_ID, and that the project has processed data.";
  }

  const status =
    failures.length === 0
      ? parseIncomplete
        ? "partial"
        : "ok"
      : settled.every((item) => item.status === "rejected")
        ? "error"
        : "partial";
  const warnings = failures.length ? [failures[0]] : [];
  if (dataWarning) warnings.push(dataWarning);

  return {
    id: "clarity",
    name: "Microsoft Clarity",
    status,
    statusMessage:
      status === "ok"
        ? "Connected"
        : status === "partial"
          ? "Partial data"
          : "Unavailable",
    warning: warnings.length ? warnings.join(" ") : null,
    fetchedAt: now.toISOString(),
    rangeLabel: "Last 3 days (Clarity limit)",
    configuration: null,
    limitations: [
      "The Clarity Data Export API only exposes the last 1–3 days.",
      "Clarity allows 10 requests per project per day; this dashboard uses 2 and caches for 24 hours.",
      "Clarity API tokens are project-scoped. The token must belong to NEXT_PUBLIC_CLARITY_PROJECT_ID.",
      "Zero values can mean no consenting visits, a token for another project, or data that Clarity has not processed yet.",
      "Clarity does not provide a daily trend or custom-event funnel through this API.",
      "Clarity is consent-gated, and session replay depends on your masking settings.",
    ],
    primaryLabel: "Sessions",
    secondaryLabel: "Users",
    summary,
    trend: [],
    topPages: base ? popularPages(base) : [],
    sources: breakdown
      ? aggregateBy(breakdown, ["Source", "source"], "Unknown")
      : [],
    referrers: base ? referrers(base) : [],
    countries: breakdown
      ? aggregateBy(
          breakdown,
          ["Country/Region", "Country", "country"],
          "Unknown",
        )
      : [],
    devices: breakdown
      ? aggregateBy(breakdown, ["Device", "device"], "Unknown")
      : [],
    events: [],
    funnel: [],
  };
}
