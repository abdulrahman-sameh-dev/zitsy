"use client";

import { useEffect, useRef } from "react";

import {
  CONSENT_CHANGED_EVENT,
  claimPurchaseInBrowser,
  hasAnalyticsConsent,
  trackEvent,
} from "@/lib/analytics/client";
import { purchaseParams } from "@/lib/analytics/events";
import type { AnalyticsLineInput } from "@/lib/analytics/events";
import { analytics } from "@/lib/config/public-env";

export interface PurchaseTrackingProps {
  paid: boolean;
  orderNumber: string;
  totalMinor: number;
  shippingMinor: number;
  currency: string;
  lines: AnalyticsLineInput[];
}

export function PurchaseTracking({
  paid,
  orderNumber,
  totalMinor,
  shippingMinor,
  currency,
  lines,
}: PurchaseTrackingProps) {
  const claimedOrder = useRef<string | null>(null);

  useEffect(() => {
    if (!paid || !analytics.ga4MeasurementId) return;

    const send = () => {
      if (claimedOrder.current === orderNumber || !hasAnalyticsConsent()) return;
      if (!claimPurchaseInBrowser(orderNumber)) {
        claimedOrder.current = orderNumber;
        return;
      }
      claimedOrder.current = orderNumber;
      trackEvent(
        "purchase",
        purchaseParams(lines, {
          orderNumber,
          totalMinor,
          shippingMinor,
          currency,
        }),
      );
    };

    send();
    window.addEventListener(CONSENT_CHANGED_EVENT, send);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, send);
  }, [
    paid,
    orderNumber,
    totalMinor,
    shippingMinor,
    currency,
    lines,
  ]);

  return null;
}
