"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getClientIp } from "@/lib/http";
import { log } from "@/lib/log";

import {
  checkAdminLoginRateLimit,
  clearAdminLoginRateLimit,
} from "./login-rate-limit";
import {
  clearAdminSessionCookie,
  setAdminSessionCookie,
  verifyAdminCredentials,
} from "./session";

export interface AdminLoginState {
  error: string | null;
}

const LOGIN_UNAVAILABLE =
  "Sign-in is temporarily unavailable. Please try again shortly.";

export async function adminLoginAction(
  _previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = getClientIp(await headers());

  let limit: { allowed: boolean };
  try {
    limit = await checkAdminLoginRateLimit(ip);
  } catch (err) {
    log.error("admin login rate limit failed", { error: err });
    return { error: LOGIN_UNAVAILABLE };
  }

  if (!limit.allowed) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  if (!username || !password || !verifyAdminCredentials(username, password)) {
    return { error: "Incorrect username or password." };
  }

  try {
    await clearAdminLoginRateLimit(ip);
  } catch (err) {
    log.warn("admin login rate limit reset failed", { error: err });
  }

  await setAdminSessionCookie();
  redirect("/admin/analytics");
}

export async function adminLogoutAction(): Promise<void> {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}
