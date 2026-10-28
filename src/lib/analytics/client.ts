"use client";

import { analytics } from "@/lib/config/public-env";

import {
  readConsentCookie,
  serializeConsentCookie,
  type AnalyticsConsent,
} from "./consent";
import { claimPurchaseReport } from "./purchase";
import { sanitizeAnalyticsParams } from "./url";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

const GA_SCRIPT_ID = "zitsy-ga4";
const CLARITY_SCRIPT_ID = "zitsy-clarity";
const PRIVATE_PATHS = ["/admin", "/checkout", "/track-order"];

export const OPEN_CONSENT_EVENT = "zitsy:open-consent";
export const CONSENT_CHANGED_EVENT = "zitsy:consent-changed";

let gaInitialized = false;
let clarityInitialized = false;
let clarityPaused = false;

export function isPrivateAnalyticsPath(pathname: string): boolean {
  return PRIVATE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function clarityCommandForPath(pathname: string): "start" | "stop" {
  return isPrivateAnalyticsPath(pathname) ? "stop" : "start";
}

export function currentConsent(): AnalyticsConsent | null {
  return readConsentCookie(document.cookie);
}

export function hasAnalyticsConsent(): boolean {
  return currentConsent() === "granted";
}

export function subscribeConsent(callback: () => void): () => void {
  window.addEventListener(CONSENT_CHANGED_EVENT, callback);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, callback);
}

function ensureGtag(): void {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    ((...args: unknown[]) => {
      window.dataLayer?.push(args);
    });
}

function injectScript(id: string, src: string, onLoad?: () => void): void {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  if (onLoad) script.addEventListener("load", onLoad, { once: true });
  document.head.appendChild(script);
}

export function initGa4(): void {
  if (!hasAnalyticsConsent()) return;
  const measurementId = analytics.ga4MeasurementId;
  if (!measurementId || gaInitialized) return;

  ensureGtag();
  window.gtag?.("js", new Date());
  window.gtag?.("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  window.gtag?.("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  window.gtag?.("config", measurementId, {
    send_page_view: false,
    anonymize_ip: true,
  });
  injectScript(
    GA_SCRIPT_ID,
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
  );
  gaInitialized = true;
}

export function syncClarityRoute(pathname: string): void {
  clarityPaused = clarityCommandForPath(pathname) === "stop";
  if (!clarityInitialized) return;
  window.clarity?.(clarityPaused ? "stop" : "start");
}

export function initClarity(): void {
  if (!hasAnalyticsConsent()) return;
  const projectId = analytics.clarityProjectId;
  if (!projectId || clarityInitialized || clarityPaused) return;
  injectScript(
    CLARITY_SCRIPT_ID,
    `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`,
    () => {
      if (clarityPaused) window.clarity?.("stop");
    },
  );
  clarityInitialized = true;
}

export function trackEvent(name: string, params: object = {}): void {
  if (currentConsent() !== "granted") return;
  if (!analytics.ga4MeasurementId) return;
  initGa4();
  window.gtag?.("event", name, sanitizeAnalyticsParams(params));
}

export function trackPageView(pathname: string): void {
  const path = pathname.split(/[?#]/)[0];
  if (!path || isPrivateAnalyticsPath(path)) return;
  const payload = {
    page_path: path,
    page_title: document.title,
    page_location: typeof window !== "undefined" ? window.location.origin + path : undefined,
  };
  trackEvent("page_view", payload);
}

export function chooseAnalyticsConsent(consent: AnalyticsConsent): void {
  const previous = currentConsent();
  const secure = window.location.protocol === "https:";
  document.cookie = serializeConsentCookie(consent, secure);

  if (consent === "denied") {
    clearAnalyticsCookies();
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
    if (previous === "granted") window.location.reload();
    return;
  }

  initGa4();
  syncClarityRoute(window.location.pathname);
  if (!isPrivateAnalyticsPath(window.location.pathname)) initClarity();
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

function clearAnalyticsCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name) continue;
    if (
      name === "_ga" ||
      name.startsWith("_ga_") ||
      name === "_gid" ||
      name === "_clck" ||
      name === "_clsk" ||
      name === "CLID"
    ) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
}

export function claimPurchaseInBrowser(orderNumber: string): boolean {
  try {
    return claimPurchaseReport(window.localStorage, orderNumber);
  } catch {
    try {
      return claimPurchaseReport(window.sessionStorage, orderNumber);
    } catch {
      return false;
    }
  }
}
