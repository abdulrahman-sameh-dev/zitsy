export const CONSENT_COOKIE = "zitsy_consent";
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type AnalyticsConsent = "granted" | "denied";

export function parseConsent(value: string | null | undefined): AnalyticsConsent | null {
  return value === "granted" || value === "denied" ? value : null;
}

export function readConsentCookie(cookieString: string): AnalyticsConsent | null {
  for (const part of cookieString.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${CONSENT_COOKIE}=`)) continue;

    try {
      return parseConsent(
        decodeURIComponent(trimmed.slice(CONSENT_COOKIE.length + 1)),
      );
    } catch {
      return null;
    }
  }
  return null;
}

export function serializeConsentCookie(
  consent: AnalyticsConsent,
  secure: boolean,
): string {
  return [
    `${CONSENT_COOKIE}=${consent}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function expiredConsentCookie(secure: boolean): string {
  return [
    `${CONSENT_COOKIE}=`,
    "Max-Age=0",
    "Path=/",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
