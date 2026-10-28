import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/admin/session", () => ({
  readAdminSession: vi.fn(),
}));

vi.mock("@/lib/admin/analytics-refresh-rate-limit", () => ({
  checkAnalyticsRefreshRateLimit: vi.fn(),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { revalidateTag } from "next/cache";

import { checkAnalyticsRefreshRateLimit } from "@/lib/admin/analytics-refresh-rate-limit";
import { readAdminSession } from "@/lib/admin/session";
import { log } from "@/lib/log";

import { refreshAnalyticsProviderAction } from "@/lib/analytics/providers/actions";

function form(provider: string, range = "14"): FormData {
  const data = new FormData();
  data.set("provider", provider);
  data.set("range", range);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readAdminSession).mockResolvedValue(true);
  vi.mocked(checkAnalyticsRefreshRateLimit).mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
  });
});

describe("refreshAnalyticsProviderAction", () => {
  it("redirects unauthenticated callers without touching provider caches", async () => {
    vi.mocked(readAdminSession).mockResolvedValue(false);

    await expect(refreshAnalyticsProviderAction(form("clarity"))).rejects.toThrow(
      "redirect:/admin/login",
    );
    expect(checkAnalyticsRefreshRateLimit).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("invalidates only the selected provider tag after a successful refresh", async () => {
    await expect(refreshAnalyticsProviderAction(form("clarity"))).rejects.toThrow(
      "redirect:/admin/analytics?range=14&refreshed=clarity",
    );

    expect(revalidateTag).toHaveBeenCalledWith("analytics:clarity", {
      expire: 0,
    });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the durable limiter blocks the request", async () => {
    vi.mocked(checkAnalyticsRefreshRateLimit).mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 120,
    });

    await expect(refreshAnalyticsProviderAction(form("ga4"))).rejects.toThrow(
      "redirect:/admin/analytics?range=14&refresh_limited=ga4&retry=120",
    );
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter itself is unavailable", async () => {
    vi.mocked(checkAnalyticsRefreshRateLimit).mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(refreshAnalyticsProviderAction(form("vercel"))).rejects.toThrow(
      "redirect:/admin/analytics?range=14&refresh_error=vercel",
    );
    expect(log.error).toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("ignores unknown providers", async () => {
    await expect(refreshAnalyticsProviderAction(form("other"))).rejects.toThrow(
      "redirect:/admin/analytics?range=14",
    );
    expect(checkAnalyticsRefreshRateLimit).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
