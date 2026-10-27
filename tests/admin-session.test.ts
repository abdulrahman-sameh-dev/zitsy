import { describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSession,
  verifyAdminCredentials,
  verifyAdminSession,
} from "@/lib/admin/session";

const credentials = {
  username: "admin@example.com",
  password: "correct horse battery staple",
};

describe("admin credentials", () => {
  it("accepts the configured pair", () => {
    expect(
      verifyAdminCredentials(
        "admin@example.com",
        "correct horse battery staple",
        credentials,
      ),
    ).toBe(true);
  });

  it("rejects a wrong username or password", () => {
    expect(
      verifyAdminCredentials("other@example.com", credentials.password, credentials),
    ).toBe(false);
    expect(
      verifyAdminCredentials(credentials.username, "wrong", credentials),
    ).toBe(false);
  });

  it("fails closed when admin credentials are not configured", () => {
    expect(verifyAdminCredentials("admin", "password", null)).toBe(false);
  });
});

describe("admin session token", () => {
  const now = new Date("2026-10-26T12:00:00Z").getTime();

  it("round-trips a valid session", () => {
    const token = createAdminSession(now, credentials);
    expect(verifyAdminSession(token, now, credentials)).toBe(true);
  });

  it("expires after the configured lifetime", () => {
    const token = createAdminSession(now, credentials);
    const expiredAt = now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000 + 1;
    expect(verifyAdminSession(token, now + 1000, credentials)).toBe(true);
    expect(verifyAdminSession(token, expiredAt, credentials)).toBe(false);
  });

  it("rejects tampered signatures and payloads", () => {
    const token = createAdminSession(now, credentials);
    const parts = token.split(".");
    expect(
      verifyAdminSession(`${parts[0]}.${parts[1]}.bad`, now, credentials),
    ).toBe(false);
    expect(
      verifyAdminSession(`customer.${parts[1]}.${parts[2]}`, now, credentials),
    ).toBe(false);
    expect(verifyAdminSession("admin.9999999999999", now, credentials)).toBe(false);
    expect(verifyAdminSession("", now, credentials)).toBe(false);
  });

  it("invalidates sessions when the username or password rotates", () => {
    const token = createAdminSession(now, credentials);

    expect(
      verifyAdminSession(token, now, {
        ...credentials,
        username: "new-admin@example.com",
      }),
    ).toBe(false);
    expect(
      verifyAdminSession(token, now, {
        ...credentials,
        password: "a different long password",
      }),
    ).toBe(false);
  });

  it("invalidates sessions when admin credentials are removed", () => {
    const token = createAdminSession(now, credentials);
    expect(verifyAdminSession(token, now, null)).toBe(false);
  });

  it("refuses to create a session without configured credentials", () => {
    expect(() => createAdminSession(now, null)).toThrow(
      "Admin credentials are not configured",
    );
  });
});
