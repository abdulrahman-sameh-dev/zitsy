export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ProviderRequestInit extends RequestInit {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly timedOut: boolean;

  constructor(
    provider: string,
    message: string,
    status = 0,
    timedOut = false,
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.timedOut = timedOut;
  }
}

function statusMessage(provider: string, status: number): string {
  if (status === 401 || status === 403) {
    return `${provider} rejected the configured credentials (${status}).`;
  }
  if (status === 429) {
    return `${provider} rate limit reached (429). Try again after its quota resets.`;
  }
  if (status >= 500) {
    return `${provider} is temporarily unavailable (${status}).`;
  }
  return `${provider} request failed (${status}).`;
}

function errorDetail(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
  const candidate = nested?.message ?? record.message;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed ? trimmed.slice(0, 180) : null;
}

export async function fetchProviderJson<T>(
  provider: string,
  url: string | URL,
  init: ProviderRequestInit,
  fetchImpl: ProviderFetch = fetch,
  timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    } as RequestInit);
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const detail = errorDetail(body);
      throw new ProviderError(
        provider,
        detail
          ? `${statusMessage(provider, response.status)} ${detail}`
          : statusMessage(provider, response.status),
        response.status,
      );
    }

    if (body === null) {
      throw new ProviderError(provider, `${provider} returned an invalid response.`);
    }

    return body as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new ProviderError(
      provider,
      timedOut
        ? `${provider} request timed out after ${timeoutMs}ms.`
        : `${provider} network request failed.`,
      0,
      timedOut,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function providerErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  return "Provider request failed.";
}
