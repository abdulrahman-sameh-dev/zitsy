import { describe, expect, it } from "vitest";

import { isPrivateAnalyticsPath } from "@/lib/analytics/client";
import {
  CONSENT_MAX_AGE_SECONDS,
  expiredConsentCookie,
  parseConsent,
  readConsentCookie,
  serializeConsentCookie,
} from "@/lib/analytics/consent";
import {
  ecommerceParams,
  purchaseParams,
  searchEventParams,
  viewItemParams,
  type AnalyticsLineInput,
} from "@/lib/analytics/events";
import {
  claimPurchaseReport,
  purchaseDedupeKey,
  shouldTrackPurchase,
} from "@/lib/analytics/purchase";

const line: AnalyticsLineInput = {
  productId: "prod_1",
  variantId: "var_1",
  productTitle: "Forest hoodie",
  variantTitle: "M / Forest",
  unitPriceMinor: 4200,
  quantity: 2,
  currency: "GBP",
  category: "Hoodies",
};

describe("analytics consent", () => {
  it("accepts only explicit granted or denied values", () => {
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
    expect(parseConsent("true")).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it("reads the consent cookie from a cookie string", () => {
    expect(readConsentCookie("a=1; zitsy_consent=granted; b=2")).toBe("granted");
    expect(readConsentCookie("zitsy_consent=denied")).toBe("denied");
    expect(readConsentCookie("other=value")).toBeNull();
  });

  it("ignores malformed percent-encoding instead of throwing", () => {
    expect(readConsentCookie("zitsy_consent=%E0%A4%A")).toBeNull();
    expect(readConsentCookie("zitsy_consent=%")).toBeNull();
  });

  it("identifies private analytics paths without matching lookalikes", () => {
    for (const path of [
      "/admin",
      "/admin/analytics",
      "/checkout",
      "/checkout/success",
      "/track-order",
      "/track-order/token",
    ]) {
      expect(isPrivateAnalyticsPath(path)).toBe(true);
    }

    for (const path of ["/", "/shop", "/administrator", "/checkout-other"]) {
      expect(isPrivateAnalyticsPath(path)).toBe(false);
    }
  });

  it("serialises a browser-readable consent cookie", () => {
    const cookie = serializeConsentCookie("granted", true);
    expect(cookie).toContain("zitsy_consent=granted");
    expect(cookie).toContain(`Max-Age=${CONSENT_MAX_AGE_SECONDS}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("expires the consent cookie immediately", () => {
    const cookie = expiredConsentCookie(false);
    expect(cookie).toContain("zitsy_consent=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).not.toContain("Secure");
  });
});

describe("analytics ecommerce payloads", () => {
  it("maps a line to GA4 item fields and major units", () => {
    const params = viewItemParams(line);
    expect(params.currency).toBe("GBP");
    expect(params.value).toBe(84);
    expect(params.items).toEqual([
      {
        item_id: "var_1",
        item_name: "Forest hoodie",
        item_variant: "M / Forest",
        item_brand: "Zitsy",
        item_category: "Hoodies",
        price: 42,
        quantity: 2,
      },
    ]);
  });

  it("sums multiple lines into one cart value", () => {
    const params = ecommerceParams([
      line,
      {
        ...line,
        variantId: "var_2",
        unitPriceMinor: 1550,
        quantity: 1,
        category: undefined,
      },
    ]);
    expect(params.value).toBe(99.5);
    expect(params.items).toHaveLength(2);
    expect(params.items[1]).not.toHaveProperty("item_category");
  });

  it("builds a purchase payload from the authoritative order total", () => {
    const params = purchaseParams([line], {
      orderNumber: "ZIT-1001",
      totalMinor: 9000,
      shippingMinor: 600,
      currency: "GBP",
    });
    expect(params.transaction_id).toBe("ZIT-1001");
    expect(params.value).toBe(90);
    expect(params.shipping).toBe(6);
    expect(params.items[0]?.item_id).toBe("var_1");
  });

  it("builds search params without the raw search term", () => {
    const params = searchEventParams(3);
    expect(params).toEqual({ results: 3 });
    expect(params).not.toHaveProperty("search_term");
  });
});

describe("purchase tracking eligibility", () => {
  it("tracks paid orders that are not cancelled", () => {
    expect(
      shouldTrackPurchase({ paidAt: new Date("2026-10-26T12:00:00Z"), status: "PAID" }),
    ).toBe(true);
  });

  it("does not track unpaid orders", () => {
    expect(shouldTrackPurchase({ paidAt: null, status: "PAYMENT_PENDING" })).toBe(false);
  });

  it("does not track paid orders that were later cancelled", () => {
    expect(
      shouldTrackPurchase({
        paidAt: new Date("2026-10-26T12:00:00Z"),
        status: "CANCELLED",
      }),
    ).toBe(false);
  });
});

describe("purchase dedupe", () => {
  it("claims an order only once", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    expect(claimPurchaseReport(storage, "ZIT-1001", "now")).toBe(true);
    expect(claimPurchaseReport(storage, "ZIT-1001", "later")).toBe(false);
    expect(store.get(purchaseDedupeKey("ZIT-1001"))).toBe("now");
  });
});
