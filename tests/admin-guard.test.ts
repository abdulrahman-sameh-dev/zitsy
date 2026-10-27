import { beforeEach, describe, expect, it, vi } from "vitest";

import { redirect } from "next/navigation";

import { requireAdminPage } from "@/lib/admin/guard";
import { readAdminSession } from "@/lib/admin/session";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({
  readAdminSession: vi.fn(),
}));

describe("admin page guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redirect).mockImplementation((url) => {
      throw new Error(`redirect:${String(url)}`);
    });
  });

  it("redirects unauthenticated visitors to the sign-in page", async () => {
    vi.mocked(readAdminSession).mockResolvedValue(false);

    await expect(requireAdminPage()).rejects.toThrow("redirect:/admin/login");
    expect(redirect).toHaveBeenCalledWith("/admin/login");
  });

  it("allows an authenticated admin through", async () => {
    vi.mocked(readAdminSession).mockResolvedValue(true);

    await expect(requireAdminPage()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
