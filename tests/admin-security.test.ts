import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  ADMIN_LOGIN_LIMIT,
  ADMIN_LOGIN_WINDOW_MS,
  checkAdminLoginRateLimit,
  clearAdminLoginRateLimit,
} from "@/lib/admin/login-rate-limit";
import { getClientIp } from "@/lib/http";
import { db } from "@/lib/db/prisma";

const now = new Date("2026-10-26T12:00:00Z").getTime();

async function wipeBuckets(): Promise<void> {
  await db.rateLimitBucket.deleteMany();
}

beforeEach(wipeBuckets);
afterAll(wipeBuckets);

describe("admin login rate limiting", () => {
  it("allows the configured number of attempts and blocks the next one", async () => {
    for (let attempt = 0; attempt < ADMIN_LOGIN_LIMIT; attempt += 1) {
      await expect(checkAdminLoginRateLimit("198.51.100.10", now)).resolves.toMatchObject({
        allowed: true,
      });
    }

    const blocked = await checkAdminLoginRateLimit("198.51.100.10", now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps different client addresses independent", async () => {
    for (let attempt = 0; attempt < ADMIN_LOGIN_LIMIT; attempt += 1) {
      await checkAdminLoginRateLimit("198.51.100.11", now);
    }

    await expect(checkAdminLoginRateLimit("198.51.100.12", now)).resolves.toMatchObject({
      allowed: true,
    });
    await expect(checkAdminLoginRateLimit("198.51.100.11", now)).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("opens a fresh window after expiry", async () => {
    for (let attempt = 0; attempt < ADMIN_LOGIN_LIMIT; attempt += 1) {
      await checkAdminLoginRateLimit("198.51.100.13", now);
    }
    await expect(checkAdminLoginRateLimit("198.51.100.13", now)).resolves.toMatchObject({
      allowed: false,
    });

    await expect(
      checkAdminLoginRateLimit(
        "198.51.100.13",
        now + ADMIN_LOGIN_WINDOW_MS + 1,
      ),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("clears the bucket after a successful sign-in", async () => {
    for (let attempt = 0; attempt < ADMIN_LOGIN_LIMIT; attempt += 1) {
      await checkAdminLoginRateLimit("198.51.100.14", now);
    }
    await clearAdminLoginRateLimit("198.51.100.14");

    await expect(checkAdminLoginRateLimit("198.51.100.14", now)).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("stores a hashed key rather than the raw client address", async () => {
    const ip = "198.51.100.15";
    await checkAdminLoginRateLimit(ip, now);

    const rows = await db.rateLimitBucket.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).not.toBe(ip);
    expect(rows[0]?.key).not.toContain(ip);
  });
});

describe("getClientIp", () => {
  it("prefers the proxy-overwritten real IP over forwarded values", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.20",
      "x-forwarded-for": "198.51.100.20, 10.0.0.1",
    });
    expect(getClientIp(headers)).toBe("203.0.113.20");
  });

  it("falls back to the first forwarded address", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.21, 10.0.0.1",
    });
    expect(getClientIp(headers)).toBe("198.51.100.21");
  });

  it("falls back safely for missing or malformed values", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(
      getClientIp(
        new Headers({
          "x-real-ip": "not-an-ip",
          "x-forwarded-for": "  ",
        }),
      ),
    ).toBe("unknown");
    expect(getClientIp(new Headers({ "x-real-ip": "<script>" }))).toBe(
      "unknown",
    );
  });
});

describe("admin analytics indexes", () => {
  it("creates the indexes required by the dashboard queries", async () => {
    const rows = await db.$queryRaw<Array<{ tablename: string; indexname: string }>>`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('Order', 'OrderItem', 'Payment', 'RateLimitBucket')
    `;
    const names = new Set(rows.map((row) => row.indexname));

    for (const index of [
      "Order_currency_paidAt_idx",
      "Order_status_idx",
      "OrderItem_productId_idx",
      "Payment_status_idx",
      "RateLimitBucket_resetAt_idx",
    ]) {
      expect(names.has(index)).toBe(true);
    }
  });
});
