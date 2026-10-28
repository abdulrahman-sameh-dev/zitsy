import { z } from "zod";

// This module reads server secrets. It must never be imported from client code —
// browser-safe values live in `@/lib/config/public-env`.
if (typeof window !== "undefined") {
  throw new Error(
    "@/lib/config/env must not be imported into client code. Use @/lib/config/public-env instead.",
  );
}


const optionalString = z.string().trim().optional().default("");

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL is required")
    .refine((v) => /^(postgres|postgresql):\/\//.test(v), "DATABASE_URL must be a postgres:// URL"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters"),
  STORE_CURRENCY: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "STORE_CURRENCY must be a 3-letter uppercase currency code"),

  PRINTIFY_API_TOKEN: optionalString,
  PRINTIFY_SHOP_ID: optionalString,
  PRINTIFY_WEBHOOK_SECRET: optionalString,
  PRINTIFY_USER_AGENT: optionalString,
  PRINTIFY_AUTO_SEND_TO_PRODUCTION: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform((v) => v === "true"),
  PRINTIFY_COST_CURRENCY: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "PRINTIFY_COST_CURRENCY must be a 3-letter currency code")
    .optional()
    .default("USD"),

  STORE_FX_RATES: optionalString,
  /**
   * Markup applied to the FX-converted Printify production cost when pricing a
   * variant. This is a MARKUP (price = cost × (1 + pct/100)), not a gross margin.
   */
  STORE_MARKUP_PERCENT: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "STORE_MARKUP_PERCENT must be a number")
    .optional()
    .default("40")
    .transform(Number),
  /**
   * Payment-processing allowance (assumption, not a contractual PayPal fee):
   * feeMinor = ceil(orderRevenue × PAYMENT_FEE_PERCENT / 100) + PAYMENT_FEE_FIXED_MINOR.
   */
  PAYMENT_FEE_PERCENT: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "PAYMENT_FEE_PERCENT must be a number")
    .optional()
    .default("3.4")
    .transform(Number),
  PAYMENT_FEE_FIXED_MINOR: z
    .string()
    .trim()
    .regex(/^\d+$/, "PAYMENT_FEE_FIXED_MINOR must be a non-negative integer")
    .optional()
    .default("20")
    .transform(Number),
  /**
   * Minimum acceptable expected contribution per order, in store minor units.
   * Must be positive so a zero-profit order is always rejected.
   */
  STORE_MIN_CONTRIBUTION_MINOR: z
    .string()
    .trim()
    .regex(/^[1-9]\d*$/, "STORE_MIN_CONTRIBUTION_MINOR must be a positive integer")
    .optional()
    .default("1")
    .transform(Number),
  /**
   * Fixed merchant-side cost allowance per order (overhead), in store minor
   * units. Defaults to 0. Not a tax engine.
   */
  STORE_MERCHANT_COST_MINOR: z
    .string()
    .trim()
    .regex(/^\d+$/, "STORE_MERCHANT_COST_MINOR must be a non-negative integer")
    .optional()
    .default("0")
    .transform(Number),
  CRON_SECRET: optionalString,
  ADMIN_USERNAME: optionalString,
  ADMIN_PASSWORD: optionalString,

  PAYPAL_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  PAYPAL_CLIENT_ID: optionalString,
  PAYPAL_CLIENT_SECRET: optionalString,
  PAYPAL_WEBHOOK_ID: optionalString,

  /**
   * Server-only analytics reporting credentials. These never ship to the
   * browser; the public GA4/Clarity collection IDs live in `publicSchema`.
   */
  VERCEL_ANALYTICS_TOKEN: optionalString,
  VERCEL_ANALYTICS_PROJECT_ID: optionalString,
  VERCEL_ANALYTICS_TEAM_ID: optionalString,
  GA4_PROPERTY_ID: optionalString,
  GA4_CLIENT_EMAIL: optionalString,
  GA4_PRIVATE_KEY: optionalString,
  CLARITY_API_TOKEN: optionalString,

  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  /**
   * Recipient of store-facing mail (contact form submissions, internal new-order
   * notifications). Deliberately separate from EMAIL_FROM, which is only the
   * sender identity. Unset = store mail is disabled (never hardcoded).
   */
  SUPPORT_EMAIL: optionalString,
  /**
   * Optional override of the Resend API base URL. Exists only so automated
   * tests can point the SDK at a local stub instead of the real API; leave
   * unset in every real environment.
   */
  RESEND_API_URL: z.string().url().optional().or(z.literal("")),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .refine((v) => !v.includes("localhost") || process.env.NODE_ENV !== "production", {
      message: "NEXT_PUBLIC_APP_URL must not point at localhost in production",
    }),
  NEXT_PUBLIC_SITE_NAME: z.string().trim().min(1).default("Zitsy"),
  NEXT_PUBLIC_SITE_TAGLINE: z.string().trim().min(1).default("Easy as Zitsy"),
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: optionalString,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: optionalString,
  NEXT_PUBLIC_CLARITY_PROJECT_ID: optionalString,
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

function parse<T extends z.ZodTypeAny>(schema: T, value: Record<string, string | undefined>, label: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid environment configuration (${label}):\n${formatIssues(result.error)}`);
  }
  return result.data;
}

const serverRaw = {
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  STORE_CURRENCY: process.env.STORE_CURRENCY,
  PRINTIFY_API_TOKEN: process.env.PRINTIFY_API_TOKEN,
  PRINTIFY_SHOP_ID: process.env.PRINTIFY_SHOP_ID,
  PRINTIFY_WEBHOOK_SECRET: process.env.PRINTIFY_WEBHOOK_SECRET,
  PRINTIFY_USER_AGENT: process.env.PRINTIFY_USER_AGENT,
  PRINTIFY_AUTO_SEND_TO_PRODUCTION: process.env.PRINTIFY_AUTO_SEND_TO_PRODUCTION,
  PRINTIFY_COST_CURRENCY: process.env.PRINTIFY_COST_CURRENCY,
  STORE_FX_RATES: process.env.STORE_FX_RATES,
  STORE_MARKUP_PERCENT: process.env.STORE_MARKUP_PERCENT,
  PAYMENT_FEE_PERCENT: process.env.PAYMENT_FEE_PERCENT,
  PAYMENT_FEE_FIXED_MINOR: process.env.PAYMENT_FEE_FIXED_MINOR,
  STORE_MIN_CONTRIBUTION_MINOR: process.env.STORE_MIN_CONTRIBUTION_MINOR,
  STORE_MERCHANT_COST_MINOR: process.env.STORE_MERCHANT_COST_MINOR,
  CRON_SECRET: process.env.CRON_SECRET,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
  VERCEL_ANALYTICS_TOKEN: process.env.VERCEL_ANALYTICS_TOKEN,
  VERCEL_ANALYTICS_PROJECT_ID: process.env.VERCEL_ANALYTICS_PROJECT_ID,
  VERCEL_ANALYTICS_TEAM_ID: process.env.VERCEL_ANALYTICS_TEAM_ID,
  GA4_PROPERTY_ID: process.env.GA4_PROPERTY_ID,
  GA4_CLIENT_EMAIL: process.env.GA4_CLIENT_EMAIL,
  GA4_PRIVATE_KEY: process.env.GA4_PRIVATE_KEY,
  CLARITY_API_TOKEN: process.env.CLARITY_API_TOKEN,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  RESEND_API_URL: process.env.RESEND_API_URL,
};

export const serverEnv: ServerEnv = parse(serverSchema, serverRaw, "server");

const publicRaw = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
  NEXT_PUBLIC_SITE_TAGLINE: process.env.NEXT_PUBLIC_SITE_TAGLINE,
  NEXT_PUBLIC_PAYPAL_CLIENT_ID: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
};

export const publicEnv: PublicEnv = parse(publicSchema, publicRaw, "public");

/**
 * Browser-safe PayPal client id. Falls back to PAYPAL_CLIENT_ID because a PayPal
 * client id is public by design (it is shipped to the browser by the PayPal SDK).
 */
export function paypalClientId(): string {
  return publicEnv.NEXT_PUBLIC_PAYPAL_CLIENT_ID || serverEnv.PAYPAL_CLIENT_ID;
}

export const integrations = {
  printify:
    Boolean(serverEnv.PRINTIFY_API_TOKEN) && Boolean(serverEnv.PRINTIFY_SHOP_ID),
  printifyWebhooks: Boolean(serverEnv.PRINTIFY_WEBHOOK_SECRET),
  paypal:
    Boolean(serverEnv.PAYPAL_CLIENT_ID) &&
    Boolean(serverEnv.PAYPAL_CLIENT_SECRET),
  paypalWebhooks: Boolean(serverEnv.PAYPAL_WEBHOOK_ID),
  email: Boolean(serverEnv.RESEND_API_KEY) && Boolean(serverEnv.EMAIL_FROM),
  support: Boolean(serverEnv.RESEND_API_KEY) && Boolean(serverEnv.SUPPORT_EMAIL),
  cron: Boolean(serverEnv.CRON_SECRET),
  admin: Boolean(serverEnv.ADMIN_USERNAME && serverEnv.ADMIN_PASSWORD),
  analyticsVercel: Boolean(
    serverEnv.VERCEL_ANALYTICS_TOKEN &&
      serverEnv.VERCEL_ANALYTICS_PROJECT_ID,
  ),
  analyticsGa4: Boolean(
    serverEnv.GA4_PROPERTY_ID &&
      serverEnv.GA4_CLIENT_EMAIL &&
      serverEnv.GA4_PRIVATE_KEY,
  ),
  analyticsClarity: Boolean(
    serverEnv.CLARITY_API_TOKEN && publicEnv.NEXT_PUBLIC_CLARITY_PROJECT_ID,
  ),
} as const;

export const appUrl = (): string => publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
export const storeCurrency = (): string => serverEnv.STORE_CURRENCY;
export const printifyCostCurrency = (): string => serverEnv.PRINTIFY_COST_CURRENCY;
export const storeMarkupPercent = (): number => serverEnv.STORE_MARKUP_PERCENT;
export const paymentFeePercent = (): number => serverEnv.PAYMENT_FEE_PERCENT;
export const paymentFeeFixedMinor = (): number => serverEnv.PAYMENT_FEE_FIXED_MINOR;
export const storeMinContributionMinor = (): number =>
  serverEnv.STORE_MIN_CONTRIBUTION_MINOR;
export const storeMerchantCostMinor = (): number => serverEnv.STORE_MERCHANT_COST_MINOR;
export const storeFxRatesSpec = (): string => serverEnv.STORE_FX_RATES;
export const cronSecret = (): string => serverEnv.CRON_SECRET;
export const adminCredentials = (): {
  username: string;
  password: string;
} | null => {
  if (!serverEnv.ADMIN_USERNAME || !serverEnv.ADMIN_PASSWORD) return null;
  return {
    username: serverEnv.ADMIN_USERNAME,
    password: serverEnv.ADMIN_PASSWORD,
  };
};
/** Sender identity for all outbound mail ("Zitsy <orders@…>"). */
export const emailFrom = (): string => serverEnv.EMAIL_FROM ?? "";
/** Store-side recipient for support + admin notifications. Empty when unset. */
export const supportEmail = (): string => serverEnv.SUPPORT_EMAIL ?? "";
/** Test-only override of the Resend API base URL; empty means the real API. */
export const resendApiUrl = (): string => serverEnv.RESEND_API_URL ?? "";
