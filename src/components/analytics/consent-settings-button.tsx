"use client";

import { OPEN_CONSENT_EVENT } from "@/lib/analytics/client";

export function ConsentSettingsButton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className={className}
    >
      Cookie preferences
    </button>
  );
}
