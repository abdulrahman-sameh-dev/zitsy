import { db } from "@/lib/db/prisma";
import { analytics as publicAnalytics } from "@/lib/config/public-env";
import { storeCurrency } from "@/lib/config/env";

const TREND_DAYS = 14;

export interface RevenuePoint {
  date: string;
  revenueMinor: number;
  orders: number;
}

export interface AdminAnalytics {
  currency: string;
  configuredProviders: {
    ga4: boolean;
    clarity: boolean;
  };
  totals: {
    paidOrders: number;
    revenueMinor: number;
    averageOrderValueMinor: number;
    itemsSold: number;
  };
  statusBreakdown: Array<{ status: string; count: number }>;
  paymentBreakdown: Array<{ status: string; count: number }>;
  revenueTrend: RevenuePoint[];
  topProducts: Array<{
    productId: string;
    title: string;
    quantity: number;
    revenueMinor: number;
  }>;
  recentOrders: Array<{
    orderNumber: string;
    email: string;
    totalMinor: number;
    paidAt: Date | null;
    status: string;
  }>;
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export async function loadAdminAnalytics(
  now = new Date(),
): Promise<AdminAnalytics> {
  const currency = storeCurrency();
  const paidWhere = {
    paidAt: { not: null },
    currency,
    status: { not: "CANCELLED" as const },
  } as const;
  const trendStart = startOfUtcDay(
    new Date(now.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000),
  );

  const [
    paidAggregate,
    statusGroups,
    paymentGroups,
    topProductGroups,
    itemAggregate,
    recentOrders,
    trendOrders,
  ] = await Promise.all([
    db.order.aggregate({
      where: paidWhere,
      _count: { _all: true },
      _sum: { totalMinor: true },
    }),
    db.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.payment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.orderItem.groupBy({
      by: ["productId"],
      where: { order: paidWhere },
      _sum: { quantity: true, totalPriceMinor: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 8,
    }),
    db.orderItem.aggregate({
      where: { order: paidWhere },
      _sum: { quantity: true },
    }),
    db.order.findMany({
      where: paidWhere,
      orderBy: { paidAt: "desc" },
      take: 8,
      select: {
        orderNumber: true,
        email: true,
        totalMinor: true,
        paidAt: true,
        status: true,
      },
    }),
    db.order.findMany({
      where: { ...paidWhere, paidAt: { gte: trendStart } },
      select: { paidAt: true, totalMinor: true },
    }),
  ]);

  const productIds = topProductGroups.map((group) => group.productId);
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, title: true },
      })
    : [];
  const productTitles = new Map(
    products.map((product) => [product.id, product.title]),
  );

  const paidOrders = paidAggregate._count._all;
  const revenueMinor = paidAggregate._sum.totalMinor ?? 0;
  const itemsSold = itemAggregate._sum.quantity ?? 0;

  const trend = new Map<string, RevenuePoint>();
  for (let offset = 0; offset < TREND_DAYS; offset += 1) {
    const day = new Date(trendStart.getTime() + offset * 24 * 60 * 60 * 1000);
    trend.set(utcDayKey(day), {
      date: utcDayKey(day),
      revenueMinor: 0,
      orders: 0,
    });
  }
  for (const order of trendOrders) {
    if (!order.paidAt) continue;
    const point = trend.get(utcDayKey(order.paidAt));
    if (!point) continue;
    point.revenueMinor += order.totalMinor;
    point.orders += 1;
  }

  return {
    currency,
    configuredProviders: {
      ga4: Boolean(publicAnalytics.ga4MeasurementId),
      clarity: Boolean(publicAnalytics.clarityProjectId),
    },
    totals: {
      paidOrders,
      revenueMinor,
      averageOrderValueMinor:
        paidOrders > 0 ? Math.round(revenueMinor / paidOrders) : 0,
      itemsSold,
    },
    statusBreakdown: statusGroups
      .map((group) => ({ status: group.status, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    paymentBreakdown: paymentGroups
      .map((group) => ({ status: group.status, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    revenueTrend: [...trend.values()],
    topProducts: topProductGroups.map((group) => ({
      productId: group.productId,
      title: productTitles.get(group.productId) ?? group.productId,
      quantity: group._sum.quantity ?? 0,
      revenueMinor: group._sum.totalPriceMinor ?? 0,
    })),
    recentOrders,
  };
}
