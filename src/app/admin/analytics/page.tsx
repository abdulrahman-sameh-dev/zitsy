import Link from "next/link";
import { connection } from "next/server";

import { adminLogoutAction } from "@/lib/admin/actions";
import { loadAdminAnalytics } from "@/lib/admin/analytics";
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

export default async function AdminAnalyticsPage() {
  await connection();
  await requireAdminPage();

  const data = await loadAdminAnalytics();
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
            Database figures are the sales source of truth. GA4 and Clarity are
            behavioural tools and may differ because of consent, blockers, and
            attribution.
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
          GA4: {data.configuredProviders.ga4 ? "configured" : "not configured"}
        </span>
        <span className="chip">
          Clarity:{" "}
          {data.configuredProviders.clarity ? "configured" : "not configured"}
        </span>
      </div>

      {!data.configuredProviders.ga4 && !data.configuredProviders.clarity ? (
        <p className="mt-2 text-xs text-muted">
          Behavioural analytics is optional and currently disabled. Database
          figures are unaffected. To enable it, set{" "}
          <code>NEXT_PUBLIC_GA_MEASUREMENT_ID</code> and/or{" "}
          <code>NEXT_PUBLIC_CLARITY_PROJECT_ID</code>, then rebuild.
        </p>
      ) : null}

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
