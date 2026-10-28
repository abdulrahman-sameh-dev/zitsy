"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  OPEN_CONSENT_EVENT,
  chooseAnalyticsConsent,
  currentConsent,
  initClarity,
  initGa4,
  isPrivateAnalyticsPath,
  subscribeConsent,
  syncClarityRoute,
  trackPageView,
} from "@/lib/analytics/client";
import type { AnalyticsConsent } from "@/lib/analytics/consent";
import { hasAnalyticsProviders } from "@/lib/config/public-env";
import {
  Analytics as VercelAnalytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";

function subscribeNoop(): () => void {
  return () => {};
}

function getReady(): boolean {
  return true;
}

function getServerReady(): boolean {
  return false;
}

function getConsentSnapshot() {
  return currentConsent();
}

function getServerConsent() {
  return null;
}

function beforeSend(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const path = new URL(event.url, window.location.origin).pathname;
    return isPrivateAnalyticsPath(path) ? null : event;
  } catch {
    return event;
  }
}

function ConsentBanner({
  current,
  onChoice,
}: {
  current: AnalyticsConsent | null;
  onChoice: (choice: AnalyticsConsent) => void;
}) {
  return (
    <section
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface shadow-[0_-12px_40px_-20px_rgba(3,46,21,0.35)]"
    >
      <div className="container-page flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl text-sm leading-relaxed text-ink-soft">
          <p className="font-semibold text-ink">Your privacy choices</p>
          <p className="mt-1">
            We use analytics cookies only if you accept. They help us understand
            how the store is used. We do not use advertising or cross-site
            trackers.{" "}
            {current ? (
              <span className="text-muted">
                You currently {current === "granted" ? "accept" : "reject"}{" "}
                analytics.
              </span>
            ) : null}{" "}
            <Link
              href="/privacy"
              className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-800"
            >
              Privacy policy
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChoice("denied")}
            className="btn-secondary px-4 py-2"
          >
            Reject analytics
          </button>
          <button
            type="button"
            onClick={() => onChoice("granted")}
            className="btn-primary px-4 py-2"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </section>
  );
}

export function Analytics() {
  const pathname = usePathname();
  const ready = useSyncExternalStore(
    subscribeNoop,
    getReady,
    getServerReady,
  );
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerConsent,
  );
  const [forceOpen, setForceOpen] = useState(false);
  const lastTrackedPath = useRef<string | null>(null);
  const configured = hasAnalyticsProviders();

  useEffect(() => {
    const open = () => setForceOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, []);

  useEffect(() => {
    if (consent !== "granted") return;
    initGa4();
  }, [consent]);

  useEffect(() => {
    if (consent !== "granted") return;
    syncClarityRoute(pathname);
    if (isPrivateAnalyticsPath(pathname)) return;

    initClarity();
    const key = `${pathname}${window.location.search}`;
    if (lastTrackedPath.current === key) return;
    lastTrackedPath.current = key;
    trackPageView(pathname);
  }, [consent, pathname]);

  const bannerOpen = consent === null || forceOpen;
  if (!ready) return null;

  return (
    <>
      {consent === "granted" ? (
        <VercelAnalytics beforeSend={beforeSend} />
      ) : null}
      {configured && bannerOpen ? (
        <ConsentBanner
          current={consent}
          onChoice={(choice) => {
            chooseAnalyticsConsent(choice);
            setForceOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
