import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { loadAdminAnalytics } from "@/lib/admin/analytics";
import { db } from "@/lib/db/prisma";

const now = new Date("2026-10-26T12:00:00Z");

async function wipeOrders(): Promise<void> {
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
}

function orderData(
  orderNumber: string,
  status: "PAID" | "CANCELLED",
  paidAt: Date,
  totalMinor: number,
) {
  return {
    orderNumber,
    email: "buyer@example.com",
    status,
    currency: "GBP",
    subtotalMinor: totalMinor,
    shippingMinor: 0,
    totalMinor,
    recipientName: "Test Buyer",
    address1: "1 Test Street",
    city: "London",
    postalCode: "SW1A 1AA",
    country: "GB",
    paidAt,
  } as const;
}

beforeEach(wipeOrders);
afterAll(wipeOrders);

describe("admin analytics", () => {
  it("excludes paid orders that were later cancelled", async () => {
    await db.order.create({
      data: orderData(
        "ZIT-ANALYTICS-PAID",
        "PAID",
        new Date("2026-10-26T09:00:00Z"),
        4200,
      ),
    });
    await db.order.create({
      data: orderData(
        "ZIT-ANALYTICS-CANCELLED",
        "CANCELLED",
        new Date("2026-10-26T10:00:00Z"),
        9900,
      ),
    });

    const result = await loadAdminAnalytics(now);

    expect(result.totals.paidOrders).toBe(1);
    expect(result.totals.revenueMinor).toBe(4200);
    expect(result.totals.averageOrderValueMinor).toBe(4200);
    expect(result.recentOrders.map((order) => order.orderNumber)).toEqual([
      "ZIT-ANALYTICS-PAID",
    ]);
    expect(
      result.revenueTrend.reduce((sum, point) => sum + point.revenueMinor, 0),
    ).toBe(4200);
  });
});
