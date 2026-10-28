export const ANALYTICS_RANGES = [7, 14, 30] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export type AnalyticsProviderId = "vercel" | "ga4" | "clarity";

export type ProviderStatus = "ok" | "partial" | "not_configured" | "error";

export interface AnalyticsMetric {
  label: string;
  value: number;
  detail?: string;
}

export interface AnalyticsTrendPoint {
  label: string;
  primary: number;
  secondary: number;
}

export interface AnalyticsBreakdownRow {
  label: string;
  primary: number;
  secondary?: number;
}

export interface AnalyticsEventRow {
  label: string;
  count: number;
  visitors?: number;
}

export interface AnalyticsFunnelStep {
  label: string;
  count: number;
}

export interface AnalyticsProviderReport {
  id: AnalyticsProviderId;
  name: string;
  status: ProviderStatus;
  statusMessage: string;
  warning: string | null;
  fetchedAt: string | null;
  rangeLabel: string;
  limitations: string[];
  configuration: { missing: string[]; notes: string[] } | null;
  primaryLabel: string;
  secondaryLabel: string;
  summary: AnalyticsMetric[];
  trend: AnalyticsTrendPoint[];
  topPages: AnalyticsBreakdownRow[];
  sources: AnalyticsBreakdownRow[];
  referrers: AnalyticsBreakdownRow[];
  countries: AnalyticsBreakdownRow[];
  devices: AnalyticsBreakdownRow[];
  events: AnalyticsEventRow[];
  funnel: AnalyticsFunnelStep[];
}

export interface AnalyticsProvidersResult {
  range: AnalyticsRange;
  rangeLabel: string;
  generatedAt: string;
  providers: AnalyticsProviderReport[];
}

export interface ProviderConfigStatus {
  configured: boolean;
  missing: string[];
  notes: string[];
}
