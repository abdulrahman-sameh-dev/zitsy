import { createHmac } from "node:crypto";

import { serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";

export const ADMIN_LOGIN_LIMIT = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

export interface AdminLoginRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

function bucketKey(ip: string): string {
  return createHmac("sha256", serverEnv.AUTH_SECRET)
    .update("zitsy-admin-login-v1\0")
    .update(ip)
    .digest("base64url");
}

/**
 * Durable fixed-window limiter for admin login attempts. Unlike the in-memory
 * limiter used by public forms, this survives cold starts and is shared across
 * all serverless instances.
 */
export async function checkAdminLoginRateLimit(
  ip: string,
  now = Date.now(),
): Promise<AdminLoginRateLimitResult> {
  const key = bucketKey(ip);
  const nowMs = BigInt(now);
  const resetAt = BigInt(now + ADMIN_LOGIN_WINDOW_MS);

  await db.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: BigInt(now - ADMIN_LOGIN_WINDOW_MS) } },
  });

  const rows = await db.$queryRaw<Array<{ count: number; resetAt: bigint }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${nowMs} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= ${nowMs} THEN ${resetAt}
        ELSE "RateLimitBucket"."resetAt"
      END
    RETURNING "count", "resetAt"
  `;

  const bucket = rows[0];
  if (!bucket) return { allowed: true, retryAfterSeconds: 0 };

  const allowed = bucket.count <= ADMIN_LOGIN_LIMIT;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(
        1,
        Math.ceil((Number(bucket.resetAt) - now) / 1000),
      );

  return { allowed, retryAfterSeconds };
}

export async function clearAdminLoginRateLimit(ip: string): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { key: bucketKey(ip) } });
}
