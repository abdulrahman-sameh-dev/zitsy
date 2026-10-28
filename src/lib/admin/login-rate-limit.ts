import {
  checkDurableRateLimit,
  clearDurableRateLimit,
  type DurableRateLimitResult,
} from "./durable-rate-limit";

export const ADMIN_LOGIN_LIMIT = 5;
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const ADMIN_LOGIN_NAMESPACE = "zitsy-admin-login-v1";

export type AdminLoginRateLimitResult = DurableRateLimitResult;

/**
 * Durable fixed-window limiter for admin login attempts. Unlike the in-memory
 * limiter used by public forms, this survives cold starts and is shared across
 * all serverless instances.
 */
export async function checkAdminLoginRateLimit(
  ip: string,
  now = Date.now(),
): Promise<AdminLoginRateLimitResult> {
  return checkDurableRateLimit({
    namespace: ADMIN_LOGIN_NAMESPACE,
    subject: ip,
    limit: ADMIN_LOGIN_LIMIT,
    windowMs: ADMIN_LOGIN_WINDOW_MS,
    now,
  });
}

export async function clearAdminLoginRateLimit(ip: string): Promise<void> {
  await clearDurableRateLimit(ADMIN_LOGIN_NAMESPACE, ip);
}
