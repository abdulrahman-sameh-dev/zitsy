import type {
  AnalyticsBreakdownRow,
  AnalyticsProviderReport,
  AnalyticsRange,
  ProviderStatus,
} from "@/lib/analytics/providers/types";
import { refreshAnalyticsProviderAction } from "@/lib/analytics/providers/actions";

const numberFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});

const fetchedFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function trendDay(label: string): string {
  return dayFormatter.format(new Date(`${label}T00:00:00Z`));
}

const STATUS_STYLES: Record<ProviderStatus, string> = {
  ok: "border-brand-200 bg-brand-100 text-brand-900",
  partial: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  not_configured: "border-line bg-canvas-deep text-muted",
};

const STATUS_LABELS: Record<ProviderStatus, string> = {
  ok: "Connected",
  partial: "Partial",
  error: "Error",
  not_configured: "Not configured",
};

function BreakdownList({
  title,
  rows,
  primaryLabel,
  secondaryLabel,
  empty,
}: {
  title: string;
  rows: AnalyticsBreakdownRow[];
  primaryLabel: string;
  secondaryLabel: string;
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.primary));
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={`${row.label}-${index}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink-soft" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 tabular-nums text-ink">
                  {formatNumber(row.primary)}
                  <span className="ml-1 text-[10px] font-medium text-muted">
                    {primaryLabel}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas-deep">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${(row.primary / max) * 100}%` }}
                />
              </div>
              {row.secondary !== undefined ? (
                <p className="mt-1 text-[10px] text-muted">
                  {formatNumber(row.secondary)} {secondaryLabel}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Trend({ report }: { report: AnalyticsProviderReport }) {
  if (report.trend.length === 0) return null;
  const max = Math.max(
    1,
    ...report.trend.map((point) => Math.max(point.primary, point.secondary)),
  );
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Daily trend
        </h3>
        <span className="text-[10px] text-muted">
          {report.primaryLabel} / {report.secondaryLabel}
        </span>
      </div>
      <div className="mt-3 flex h-24 items-end gap-0.5">
        {report.trend.map((point) => (
          <div
            key={point.label}
            className="flex min-w-0 flex-1 items-end justify-center gap-px"
            title={`${trendDay(point.label)}: ${formatNumber(point.primary)} ${report.primaryLabel}, ${formatNumber(point.secondary)} ${report.secondaryLabel}`}
          >
            <div
              className="w-full max-w-2 rounded-t-sm bg-brand-600"
              style={{
                height: `${Math.max(
                  point.primary > 0 ? 3 : 0,
                  (point.primary / max) * 100,
                )}%`,
              }}
            />
            <div
              className="w-full max-w-2 rounded-t-sm bg-brand-300"
              style={{
                height: `${Math.max(
                  point.secondary > 0 ? 3 : 0,
                  (point.secondary / max) * 100,
                )}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{trendDay(report.trend[0].label)}</span>
        <span>{trendDay(report.trend[report.trend.length - 1].label)}</span>
      </div>
    </div>
  );
}

export function AnalyticsProviderCard({
  report,
  range,
}: {
  report: AnalyticsProviderReport;
  range: AnalyticsRange;
}) {
  const hasData =
    report.summary.length > 0 ||
    report.trend.length > 0 ||
    report.topPages.length > 0 ||
    report.sources.length > 0 ||
    report.referrers.length > 0 ||
    report.countries.length > 0 ||
    report.devices.length > 0 ||
    report.events.length > 0 ||
    report.funnel.length > 0;

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{report.name}</h2>
          <p className="mt-1 text-xs text-muted">{report.rangeLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[report.status]}`}
          >
            {STATUS_LABELS[report.status]}
          </span>
          {report.status !== "not_configured" ? (
            <form action={refreshAnalyticsProviderAction}>
              <input type="hidden" name="provider" value={report.id} />
              <input type="hidden" name="range" value={range} />
              <button
                type="submit"
                className="text-[11px] font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Refresh
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {report.warning ? (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-xs ${
            report.status === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {report.warning}
        </p>
      ) : null}

      {report.configuration && report.status === "not_configured" ? (
        <div className="mt-4 rounded-md border border-line bg-canvas p-3">
          <p className="text-xs font-semibold text-ink">Setup required</p>
          <p className="mt-1 text-xs text-muted">
            Set these variables, then redeploy:
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.configuration.missing.map((name) => (
              <li
                key={name}
                className="rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] text-ink-soft"
              >
                {name}
              </li>
            ))}
          </ul>
          {report.configuration.notes.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-muted">
              {report.configuration.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {hasData ? (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {report.summary.map((metric) => (
              <div
                key={metric.label}
                className="rounded-md border border-line bg-canvas px-3 py-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {metric.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-ink">
                  {formatNumber(metric.value)}
                </p>
                {metric.detail ? (
                  <p className="mt-0.5 text-[10px] text-muted">{metric.detail}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Trend report={report} />
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            <BreakdownList
              title="Top pages"
              rows={report.topPages}
              primaryLabel={report.primaryLabel}
              secondaryLabel={report.secondaryLabel}
              empty="No page data in this range."
            />
            <BreakdownList
              title="Traffic sources"
              rows={report.sources}
              primaryLabel={report.primaryLabel}
              secondaryLabel={report.secondaryLabel}
              empty="No source data in this range."
            />
            <BreakdownList
              title="Referrers"
              rows={report.referrers}
              primaryLabel={report.primaryLabel}
              secondaryLabel={report.secondaryLabel}
              empty="No referrer data in this range."
            />
            <BreakdownList
              title="Countries"
              rows={report.countries}
              primaryLabel={report.primaryLabel}
              secondaryLabel={report.secondaryLabel}
              empty="No country data in this range."
            />
            <BreakdownList
              title="Devices"
              rows={report.devices}
              primaryLabel={report.primaryLabel}
              secondaryLabel={report.secondaryLabel}
              empty="No device data in this range."
            />
          </div>

          {report.events.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Events
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {report.events.map((event) => (
                  <li
                    key={event.label}
                    className="rounded border border-line bg-canvas px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-ink">{event.label}</span>
                    <span className="ml-2 tabular-nums text-muted">
                      {formatNumber(event.count)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.funnel.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Purchase funnel events
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {report.funnel.map((step) => (
                  <div
                    key={step.label}
                    className="rounded-md border border-line bg-canvas px-3 py-2"
                  >
                    <p className="text-[10px] uppercase tracking-[0.1em] text-muted">
                      {step.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
                      {formatNumber(step.count)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : report.status !== "not_configured" ? (
        <p className="mt-4 text-xs text-muted">
          No provider data is available for this range.
        </p>
      ) : null}

      <div className="mt-5 border-t border-line pt-3">
        <ul className="list-disc space-y-1 pl-4 text-[11px] text-muted">
          {report.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
        {report.fetchedAt ? (
          <p className="mt-2 text-[10px] text-muted">
            Fetched {fetchedFormatter.format(new Date(report.fetchedAt))} UTC
          </p>
        ) : null}
      </div>
    </section>
  );
}
