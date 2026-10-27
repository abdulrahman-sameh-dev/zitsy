import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { upsertProductFromApi } from "@/lib/catalog/sync";
import { db } from "@/lib/db/prisma";
import { applyPrintifyOrderUpdate } from "@/lib/fulfillment/service";
import { log } from "@/lib/log";
import type { PrintifyClient } from "@/lib/printify/client";
import type { PrintifyProduct, PrintifyWebhookEvent } from "@/lib/printify/types";

type WebhookStatus = "processed" | "deferred" | "ignored";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface ResourceRef {
  /** Provider resource id (product id or printify order id). */
  id?: string;
  /** Resource payload in the modern `resource.data` shape, or legacy data. */
  data: Record<string, unknown>;
  /** Legacy top-level `data` object (old Printify payloads). */
  legacy: Record<string, unknown>;
}

/**
 * Read a Printify webhook in either the modern shape
 * (`{ resource: { id, type, data } }`) or the legacy shape
 * (`{ data: { resource_id, resource } }`).
 */
function extractResource(payload: PrintifyWebhookEvent): ResourceRef {
  const legacy = (payload.data ?? {}) as Record<string, unknown>;
  if (payload.resource) {
    return {
      id: payload.resource.id,
      data: (payload.resource.data ?? {}) as Record<string, unknown>,
      legacy,
    };
  }
  const resource = legacy.resource as Record<string, unknown> | undefined;
  const id =
    typeof legacy.resource_id === "string"
      ? legacy.resource_id
      : typeof resource?.id === "string"
        ? resource.id
        : undefined;
  return { id, data: legacy, legacy };
}

/**
 * Record a Printify webhook and dispatch it. Returns the resulting status:
 * "processed", "deferred" (unhandled topic), or "ignored" (no matching local
 * record). Throws on processing failure so the route can return 5xx and let
 * Printify retry. Idempotent per Printify event id.
 */
export async function processPrintifyWebhook(
  client: PrintifyClient,
  payload: PrintifyWebhookEvent,
): Promise<WebhookStatus> {
  const type = payload.type ?? "unknown";
  const eventId = payload.id ?? `${type}:${randomUUID()}`;

  const event = await db.webhookEvent.upsert({
    where: {
      provider_eventId: { provider: "printify", eventId },
    },
    create: {
      provider: "printify",
      eventId,
      type,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });

  // Already fully handled: do nothing so duplicate deliveries can't double-apply.
  if (event.status === "processed") return "processed";

  try {
    let result: WebhookStatus;
    if (type.startsWith("product:")) {
      await handleProductEvent(
        client,
        type,
        extractResource(payload),
        webhookSnapshotVersion(payload, event.receivedAt),
      );
      result = "processed";
    } else if (type.startsWith("order:")) {
      result = await handleOrderEvent(type, payload, extractResource(payload));
    } else {
      result = "deferred";
    }

    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: result, processedAt: new Date() },
    });
    return result;
  } catch (err) {
    const messageText = message(err).slice(0, 2000);
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: "error", error: messageText },
    });
    log.error("printify webhook processing failed", { eventId, type, err });
    throw err;
  }
}

/**
 * A webhook "product" payload is only authoritative when it actually carries
 * the full product shape. Modern product events deliver a summary object, so we
 * must never treat it as a full product (that would wipe variants on upsert).
 */
function isFullProduct(value: unknown): value is PrintifyProduct {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { id?: unknown; variants?: unknown };
  return (
    typeof candidate.id === "string" &&
    Array.isArray(candidate.variants) &&
    candidate.variants.length > 0
  );
}

/**
 * Order complete product snapshots by when Printify created the event. Fall
 * back to the stable receipt time for legacy events without `created_at`.
 */
function webhookSnapshotVersion(
  payload: PrintifyWebhookEvent,
  receivedAt: Date,
): Date {
  if (payload.created_at) {
    const parsed = new Date(payload.created_at);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return receivedAt;
}

async function handleProductEvent(
  client: PrintifyClient,
  type: string,
  ref: ResourceRef,
  snapshotVersion: Date,
): Promise<void> {
  const productFromData = ref.legacy.resource as PrintifyProduct | undefined;
  const productFromResource = ref.data as unknown as PrintifyProduct | undefined;
  const resourceId =
    ref.id ??
    (typeof ref.legacy.resource_id === "string" ? ref.legacy.resource_id : undefined) ??
    productFromData?.id ??
    productFromResource?.id;

  if (!resourceId) {
    log.warn("printify product event missing resource id", { type, ref });
    return;
  }

  if (type === "product:deleted") {
    // Advance the version even when the row is already hidden so a delayed
    // pre-delete update cannot bring it back.
    await db.product.updateMany({
      where: { printifyId: resourceId, syncedAt: { lte: snapshotVersion } },
      data: { visible: false, syncedAt: snapshotVersion },
    });
    return;
  }

  const product = isFullProduct(productFromData)
    ? productFromData
    : isFullProduct(productFromResource)
      ? productFromResource
      : await client.getProduct(resourceId);
  await upsertProductFromApi(product, undefined, snapshotVersion);
}

function orderResult(applied: boolean): WebhookStatus {
  return applied ? "processed" : "ignored";
}

async function handleOrderEvent(
  type: string,
  payload: PrintifyWebhookEvent,
  ref: ResourceRef,
): Promise<WebhookStatus> {
  if (!ref.id) {
    log.warn("printify order event missing resource id", { type });
    return "ignored";
  }

  const carrier = ref.data.carrier as
    | { code?: string; tracking_number?: string; tracking_url?: string }
    | undefined;
  const shipmentTracking = carrier
    ? {
        carrier: carrier.code ?? null,
        number: carrier.tracking_number ?? null,
        url: carrier.tracking_url ?? null,
      }
    : undefined;

  switch (type) {
    case "order:created": {
      const res = await applyPrintifyOrderUpdate(ref.id, { status: "pending" });
      return orderResult(res.applied);
    }
    case "order:updated": {
      const status = typeof ref.data.status === "string" ? ref.data.status : null;
      const res = await applyPrintifyOrderUpdate(ref.id, { status });
      return orderResult(res.applied);
    }
    case "order:sent-to-production": {
      const status =
        typeof ref.data.status === "string" ? ref.data.status : "sending-to-production";
      const res = await applyPrintifyOrderUpdate(ref.id, {
        status,
        sentToProductionAt: payload.created_at ?? null,
      });
      return orderResult(res.applied);
    }
    case "order:shipment:created": {
      const res = await applyPrintifyOrderUpdate(ref.id, {
        status: "fulfilled",
        shipment: shipmentTracking,
      });
      return orderResult(res.applied);
    }
    case "order:shipment:delivered": {
      const res = await applyPrintifyOrderUpdate(ref.id, {
        status: "fulfilled",
        shipment: {
          ...shipmentTracking,
          deliveredAt:
            typeof ref.data.delivered_at === "string" ? ref.data.delivered_at : null,
        },
      });
      return orderResult(res.applied);
    }
    default:
      return "deferred";
  }
}