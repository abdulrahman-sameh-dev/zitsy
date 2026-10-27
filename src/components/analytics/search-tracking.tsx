"use client";

import { useEffect, useRef } from "react";

import {
  CONSENT_CHANGED_EVENT,
  hasAnalyticsConsent,
  trackEvent,
} from "@/lib/analytics/client";
import { searchEventParams } from "@/lib/analytics/events";

export function SearchTracking({
  hasQuery,
  results,
}: {
  hasQuery: boolean;
  results: number;
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!hasQuery) return;
    const send = () => {
      if (tracked.current || !hasAnalyticsConsent()) return;
      tracked.current = true;
      trackEvent("search", searchEventParams(results));
    };
    send();
    window.addEventListener(CONSENT_CHANGED_EVENT, send);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, send);
  }, [hasQuery, results]);

  return null;
}
