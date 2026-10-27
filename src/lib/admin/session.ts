import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { adminCredentials, serverEnv } from "@/lib/config/env";

export const ADMIN_COOKIE = "zitsy_admin";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

interface AdminCredentials {
  username: string;
  password: string;
}

const ADMIN_SESSION_KEY_CONTEXT = "zitsy-admin-session-v1";

/**
 * The signing key is derived from the current admin credentials as well as
 * AUTH_SECRET. Rotating either credential therefore invalidates every existing
 * session instead of leaving a signed cookie valid for the rest of its 12-hour
 * lifetime.
 */
function sessionKey(credentials: AdminCredentials | null): Buffer | null {
  if (!credentials) return null;
  return createHmac("sha256", serverEnv.AUTH_SECRET)
    .update(ADMIN_SESSION_KEY_CONTEXT)
    .update("\0")
    .update(JSON.stringify([credentials.username, credentials.password]))
    .digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAdminCredentials(
  username: string,
  password: string,
  credentials:
    | { username: string; password: string }
    | null = adminCredentials(),
): boolean {
  if (!credentials) return false;
  const usernameOk = safeEqual(username, credentials.username);
  const passwordOk = safeEqual(password, credentials.password);
  return usernameOk && passwordOk;
}

export function createAdminSession(
  now = Date.now(),
  credentials: AdminCredentials | null = adminCredentials(),
): string {
  const key = sessionKey(credentials);
  if (!key) throw new Error("Admin credentials are not configured");

  const expiry = now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `admin.${expiry}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifyAdminSession(
  value: string,
  now = Date.now(),
  credentials: AdminCredentials | null = adminCredentials(),
): boolean {
  const key = sessionKey(credentials);
  if (!key) return false;

  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [scope, expiryRaw, signature] = parts;
  if (scope !== "admin" || !expiryRaw || !signature) return false;

  const expected = sign(`${scope}.${expiryRaw}`, key);
  if (!safeEqual(signature, expected)) return false;

  const expiry = Number(expiryRaw);
  return Number.isFinite(expiry) && expiry > now;
}

export async function setAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function readAdminSession(): Promise<boolean> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  return value ? verifyAdminSession(value) : false;
}
