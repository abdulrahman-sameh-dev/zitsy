import Link from "next/link";
import { connection } from "next/server";

import { AnalyticsProviderCard } from "@/components/admin/analytics-provider-card";
import { adminLogoutAction } from "@/lib/admin/actions";
import { loadAdminAnalytics } from "@/lib/admin/analytics";
import { loadAnalyticsProviders } from "@/lib/analytics/providers/server";
import { parseAnalyticsRange } from "@/lib/analytics/providers/range";
import { ANALYTICS_RANGES } from "@/lib/analytics/providers/types";
import { requireAdminPage } from "@/lib/admin/guard";
import { formatMoney } from "@/lib/money";

export const metadata = {
  title: "Analytics",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const PROVIDER_NAMES: Record<string, string> = {
  vercel: "Vercel",
  ga4: "GA4",
  clarity: "Clarity",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function refreshNotice(params: {
  refreshed?: string | string[];
  refresh_limited?: string | string[];
  refresh_error?: string | string[];
  retry?: string | string[];
}): { tone: "ok" | "warn" | "error"; text: string } | null {
  const refreshed = firstValue(params.refreshed);
  if (refreshed) {
    return {
      tone: "ok",
      text: `Refreshed ${PROVIDER_NAMES[refreshed] ?? refreshed} data. The next view reflects the latest provider response.`,
    };
  }

  const limited = firstValue(params.refresh_limited);
  if (limited) {
    const retry = Number(firstValue(params.retry) ?? 0);
    const wait =
      retry >= 3_600
        ? `${Math.ceil(retry / 3_600)} hour(s)`
        : retry >= 60
          ? `${Math.ceil(retry / 60)} minute(s)`
          : retry > 0
            ? `${retry} second(s)`
            : "a moment";
    return {
      tone: "warn",
      text: `Refresh limit reached for ${PROVIDER_NAMES[limited] ?? limited}. Try again in ${wait}.`,
    };
  }

  const failed = firstValue(params.refresh_error);
  if (failed) {
    return {
      tone: "error",
      text: `Could not refresh ${PROVIDER_NAMES[failed] ?? failed} data because the rate limiter is unavailable. Try again shortly.`,
    };
  }

  return null;
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        {value}
      </p>
      {detail ? <p className="mt-1 text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    refreshed?: string | string[];
    refresh_limited?: string | string[];
    refresh_error?: string | string[];
    retry?: string | string[];
  }>;
}) {
  await connection();
  await requireAdminPage();

  const params = await searchParams;
  const range = parseAnalyticsRange(params.range);
  const notice = refreshNotice(params);
  const [data, providerData] = await Promise.all([
    loadAdminAnalytics(),
    loadAnalyticsProviders(range),
  ]);
  const maxRevenue = Math.max(
    1,
    ...data.revenueTrend.map((point) => point.revenueMinor),
  );

  return (
    <main className="container-page py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            Zitsy admin
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
            Analytics
          </h1>
          <p className="mt-2 text-sm text-muted">
            Database figures are the sales source of truth. Provider analytics
            are behavioural tools and may differ because of consent, blockers,
            and attribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="btn-secondary">
            View store
          </Link>
          <form action={adminLogoutAction}>
            <button type="submit" className="text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Paid orders"
          value={String(data.totals.paidOrders)}
          detail={`All-time, ${data.currency}`}
        />
        <StatCard
          label="Revenue"
          value={formatMoney(data.totals.revenueMinor, data.currency)}
          detail="Sum of paid order totals"
        />
        <StatCard
          label="Average order value"
          value={formatMoney(data.totals.averageOrderValueMinor, data.currency)}
          detail="Paid orders only"
        />
        <StatCard
          label="Items sold"
          value={String(data.totals.itemsSold)}
          detail="Units across paid orders"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <span className="chip">
          GA4 collection:{" "}
          {data.configuredProviders.ga4 ? "configured" : "not configured"}
        </span>
        <span className="chip">
          Clarity collection:{" "}
          {data.configuredProviders.clarity ? "configured" : "not configured"}
        </span>
      </div>

      {!data.configuredProviders.ga4 && !data.configuredProviders.clarity ? (
        <p className="mt-2 text-xs text-muted">
          Browser behavioural analytics is optional and currently disabled.
          Database figures are unaffected. To enable collection, set{" "}
          <code>NEXT_PUBLIC_GA_MEASUREMENT_ID</code> and/or{" "}
          <code>NEXT_PUBLIC_CLARITY_PROJECT_ID</code>, then rebuild. Reporting
          credentials are listed per provider below.
        </p>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Behavioural analytics
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-muted">
              Provider data only. These figures are not sales totals and are
              never added together across providers. Each provider uses its own
              identity model, consent coverage, and attribution window.
            </p>
          </div>
          <nav aria-label="Analytics date range" className="flex flex-wrap gap-2">
            {ANALYTICS_RANGES.map((value) => (
              <Link
                key={value}
                href={`/admin/analytics?range=${value}`}
                className={range === value ? "chip-active" : "chip"}
                aria-current={range === value ? "page" : undefined}
              >
                {value} days
              </Link>
            ))}
          </nav>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Clarity is always limited to its own 3-day API window, regardless of
          the selected range.
        </p>
        {notice ? (
          <p
            role="status"
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              notice.tone === "ok"
                ? "border-brand-200 bg-brand-50 text-brand-900"
                : notice.tone === "warn"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {notice.text}
          </p>
        ) : null}
        <div className="mt-4 grid gap-6 xl:grid-cols-2 2xl:grid-cols-3">
          {providerData.providers.map((provider) => (
            <AnalyticsProviderCard
              key={provider.id}
              report={provider}
              range={range}
            />
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold text-ink">Revenue, last 14 days</h2>
          <span className="text-xs text-muted">Paid orders, UTC</span>
        </div>
        <div className="mt-6 flex gap-1.5">
          {data.revenueTrend.map((point) => (
            <div
              key={point.date}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <div className="flex h-36 w-full items-end">
                <div
                  className="w-full rounded-sm bg-brand-600"
                  style={{
                    height: `${Math.max(
                      point.revenueMinor > 0 ? 3 : 0,
                      (point.revenueMinor / maxRevenue) * 100,
                    )}%`,
                  }}
                  title={`${dayFormatter.format(new Date(`${point.date}T00:00:00Z`))}: ${formatMoney(point.revenueMinor, data.currency)} (${point.orders} orders)`}
                />
              </div>
              <span className="hidden text-[10px] text-muted sm:block">
                {dayFormatter.format(new Date(`${point.date}T00:00:00Z`))}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold text-ink">Order statuses</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {data.statusBreakdown.map((row) => (
              <li key={row.status} className="flex justify-between gap-4">
                <span className="text-muted">{row.status.replace(/_/g, " ").toLowerCase()}</span>
                <span className="font-semibold tabular-nums text-ink">{row.count}</span>
              </li>
            ))}
            {data.statusBreakdown.length === 0 ? (
              <li className="text-muted">No orders yet.</li>
            ) : null}
          </ul>
          <h2 className="mt-6 font-semibold text-ink">Payment statuses</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {data.paymentBreakdown.map((row) => (
              <li key={row.status} className="flex justify-between gap-4">
                <span className="text-muted">{row.status.replace(/_/g, " ").toLowerCase()}</span>
                <span className="font-semibold tabular-nums text-ink">{row.count}</span>
              </li>
            ))}
            {data.paymentBreakdown.length === 0 ? (
              <li className="text-muted">No payments yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-semibold text-ink">Top products</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {data.topProducts.map((product) => (
              <li key={product.productId} className="flex justify-between gap-4">
                <span className="min-w-0 truncate text-muted">{product.title}</span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold text-ink">
                    {formatMoney(product.revenueMinor, data.currency)}
                  </span>
                  <span className="block text-xs text-muted">
                    {product.quantity} sold
                  </span>
                </span>
              </li>
            ))}
            {data.topProducts.length === 0 ? (
              <li className="text-muted">Top products appear after the first paid order.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Recent paid orders</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.1em] text-muted">
              <tr className="border-b border-line">
                <th className="pb-2 font-semibold">Order</th>
                <th className="pb-2 font-semibold">Email</th>
                <th className="pb-2 font-semibold">Paid</th>
                <th className="pb-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((order) => (
                <tr key={order.orderNumber} className="border-b border-line last:border-b-0">
                  <td className="py-3 font-medium text-ink">{order.orderNumber}</td>
                  <td className="max-w-[16rem] truncate py-3 text-muted">{order.email}</td>
                  <td className="py-3 text-muted">
                    {order.paidAt ? dateTimeFormatter.format(order.paidAt) : "—"}
                  </td>
                  <td className="py-3 text-right font-semibold text-ink">
                    {formatMoney(order.totalMinor, data.currency)}
                  </td>
                </tr>
              ))}
              {data.recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted">
                    No paid orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
