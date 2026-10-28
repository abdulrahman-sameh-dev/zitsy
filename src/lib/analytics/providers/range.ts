import { ANALYTICS_RANGES, type AnalyticsRange } from "./types";

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  7: "Last 7 days",
  14: "Last 14 days",
  30: "Last 30 days",
};

export function parseAnalyticsRange(
  value: string | string[] | undefined,
): AnalyticsRange {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return ANALYTICS_RANGES.includes(parsed as AnalyticsRange)
    ? (parsed as AnalyticsRange)
    : 7;
}

export function analyticsRangeLabel(range: AnalyticsRange): string {
  return RANGE_LABELS[range];
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function analyticsRangeWindow(
  range: AnalyticsRange,
  now = new Date(),
): { since: Date; until: Date; label: string } {
  const until = now;
  const since = startOfUtcDay(
    new Date(now.getTime() - (range - 1) * 24 * 60 * 60 * 1000),
  );
  return { since, until, label: RANGE_LABELS[range] };
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function utcDayLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
