import { isIP } from "node:net";

function validIp(value: string | null): string | null {
  const ip = value?.trim();
  if (!ip || ip.length > 64 || isIP(ip) === 0) return null;
  return ip;
}

/**
 * Prefer `x-real-ip`, then the first `x-forwarded-for` address. Both headers are
 * trusted only when the deployment proxy sets or overwrites them; verify that
 * behavior before relying on these values for per-IP limits.
 */
export function getClientIp(headers: Headers): string {
  const real = validIp(headers.get("x-real-ip"));
  if (real) return real;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = validIp(forwarded.split(",")[0] ?? null);
    if (first) return first;
  }

  return "unknown";
}
