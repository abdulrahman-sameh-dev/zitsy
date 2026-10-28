import { createHmac } from "node:crypto";

import { serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db/prisma";

export interface DurableRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface DurableRateLimitOptions {
  namespace: string;
  subject: string;
  limit: number;
  windowMs: number;
  now?: number;
}

function bucketKey(namespace: string, subject: string): string {
  return createHmac("sha256", serverEnv.AUTH_SECRET)
    .update(namespace)
    .update("\0")
    .update(subject)
    .digest("base64url");
}

/**
 * Durable fixed-window limiter shared across serverless instances. Callers
 * should use a unique namespace per limit so unrelated buckets never collide.
 */
export async function checkDurableRateLimit({
  namespace,
  subject,
  limit,
  windowMs,
  now = Date.now(),
}: DurableRateLimitOptions): Promise<DurableRateLimitResult> {
  const key = bucketKey(namespace, subject);
  const nowMs = BigInt(now);
  const resetAt = BigInt(now + windowMs);

  await db.rateLimitBucket.deleteMany({
    where: { resetAt: { lt: BigInt(now - windowMs) } },
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

  const allowed = bucket.count <= limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((Number(bucket.resetAt) - now) / 1000));

  return { allowed, retryAfterSeconds };
}

export async function clearDurableRateLimit(
  namespace: string,
  subject: string,
): Promise<void> {
  await db.rateLimitBucket.deleteMany({
    where: { key: bucketKey(namespace, subject) },
  });
}
