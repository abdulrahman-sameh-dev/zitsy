import { beforeAll, describe, expect, it, vi } from "vitest";

import { syncCatalog, upsertProductFromApi } from "@/lib/catalog/sync";
import { db } from "@/lib/db/prisma";
import { pricingFromCost } from "@/lib/pricing";
import { PrintifyClient } from "@/lib/printify/client";
import { processPrintifyWebhook } from "@/lib/printify/handlers";
import type { PrintifyProduct } from "@/lib/printify/types";

const mugFixture: PrintifyProduct = {
  id: "PRD-A",
  title: "Classic Mug",
  description: "A nice mug",
  tags: ["Home", "Drink"],
  visible: true,
  blueprint_id: 68,
  print_provider_id: 9,
  options: [
    {
      name: "Colors",
      type: "color",
      values: [
        { id: 101, title: "Black" },
        { id: 102, title: "White" },
      ],
    },
    { name: "Sizes", type: "size", values: [{ id: 1189, title: "11oz" }] },
  ],
  variants: [
    {
      id: 1001,
      sku: "A-1",
      cost: 1000,
      price: 860,
      is_enabled: true,
      is_default: true,
      is_available: true,
      options: [101, 1189],
    },
    {
      id: 1002,
      sku: "A-2",
      cost: 1200,
      price: 920,
      is_enabled: false,
      is_default: false,
      is_available: true,
      options: [102, 1189],
    },
  ],
  images: [
    {
      src: "https://images.printify.com/mockup/a.jpg",
      variant_ids: [1001, 1002],
      is_default: true,
    },
  ],
};

const toteFixture: PrintifyProduct = {
  id: "PRD-B",
  title: "Canvas Tote",
  description: "Everyday tote",
  tags: ["Bags"],
  visible: true,
  blueprint_id: 12,
  print_provider_id: 3,
  options: [{ name: "Colors", type: "color", values: [{ id: 201, title: "Natural" }] }],
  variants: [
    {
      id: 2001,
      sku: "B-1",
      cost: 1500,
      price: 1500,
      is_enabled: true,
      is_default: true,
      is_available: true,
      options: [201],
    },
  ],
  images: [{ src: "https://images.printify.com/mockup/b.jpg", is_default: true }],
};

function stubCatalogFetch(products: PrintifyProduct[]): void {
  vi.stubGlobal("fetch", async () => {
    return new Response(JSON.stringify({ data: products, next_page_url: null }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function client(): PrintifyClient {
  return new PrintifyClient({ token: "tok", shopId: "shop-1" });
}

function loadCatalogProduct(printifyId: string) {
  return db.product.findUniqueOrThrow({
    where: { printifyId },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { printifyVariantId: "asc" } },
    },
  });
}

beforeAll(async () => {
  await db.catalogSyncRun.deleteMany();
  await db.product.deleteMany();
});

describe("catalog sync (integration)", () => {
  it("upserts products, variants and images from Printify", async () => {
    stubCatalogFetch([mugFixture, toteFixture]);

    const summary = await syncCatalog(client());

    expect(summary.productsSeen).toBe(2);
    expect(summary.productsUpserted).toBe(2);
    expect(summary.errors).toEqual([]);

    const mug = await db.product.findUniqueOrThrow({
      where: { printifyId: "PRD-A" },
      include: { variants: { orderBy: { printifyVariantId: "asc" } }, images: true },
    });
    expect(mug.title).toBe("Classic Mug");
    expect(mug.slug).toBe("classic-mug");
    expect(mug.visible).toBe(true);
    expect(mug.blueprintId).toBe(68);
    const mugPrice = pricingFromCost(1000)!;
    const mugPrice2 = pricingFromCost(1200)!;
    // The advertised minimum is the sellable variant's price, not a price
    // derived from the disabled variant (1200 → mugPrice2).
    expect(mug.minPriceMinor).toBe(mugPrice.priceMinor);
    expect(mug.minPriceMinor).not.toBe(mugPrice2.priceMinor);
    expect(mug.variants).toHaveLength(2);
    expect(mug.variants[0]).toMatchObject({
      printifyVariantId: 1001,
      priceMinor: mugPrice.priceMinor,
      costMinor: mugPrice.costMinor,
      colorName: "Black",
      sizeName: "11oz",
      title: "Black / 11oz",
    });
    expect(mug.variants[1].isEnabled).toBe(false);
    expect(mug.images).toHaveLength(1);
    expect(mug.images[0].src).toContain("a.jpg");

    // Printify retail price (860) is ignored: the stored price is derived from
    // the production cost (1000) via markup + charm rounding, not variant.price.
    expect(mug.variants[0].priceMinor).toBe(mugPrice.priceMinor);
    expect(mug.variants[0].priceMinor).not.toBe(pricingFromCost(860)!.priceMinor);

    const run = await db.catalogSyncRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    expect(run.status).toBe("ok");
    expect(run.productsSeen).toBe(2);
  });

  it("hides products removed from the Printify catalog", async () => {
    stubCatalogFetch([mugFixture]);

    const summary = await syncCatalog(client());

    expect(summary.productsHidden).toBe(1);

    const hidden = await db.product.findUniqueOrThrow({ where: { printifyId: "PRD-B" } });
    expect(hidden.visible).toBe(false);
    const mug = await db.product.findUniqueOrThrow({ where: { printifyId: "PRD-A" } });
    expect(mug.visible).toBe(true);
  });

  it("is idempotent on repeat syncs", async () => {
    stubCatalogFetch([mugFixture, { ...toteFixture, visible: false }]);

    await syncCatalog(client());
    await syncCatalog(client());

    const mug = await db.product.findUniqueOrThrow({ where: { printifyId: "PRD-A" } });
    const variantCount = await db.productVariant.count({ where: { productId: mug.id } });
    expect(variantCount).toBe(2);
    const imageCount = await db.productImage.count({ where: { productId: mug.id } });
    expect(imageCount).toBe(1);
  });

  it("processes webhook product updates and ignores unmappable order events", async () => {
    const updated = { ...mugFixture, title: "Classic Mug v2", description: "Fresh" };
    const status = await processPrintifyWebhook(client(), {
      id: "evt-update-1",
      type: "product:updated",
      data: { resource_id: "PRD-A", resource: updated },
    });
    expect(status).toBe("processed");

    const mug = await db.product.findUniqueOrThrow({ where: { printifyId: "PRD-A" } });
    expect(mug.title).toBe("Classic Mug v2");

    // An order event without a resource id cannot be matched to a local order.
    const ignored = await processPrintifyWebhook(client(), {
      id: "evt-order-1",
      type: "order:created",
      data: { status: "created" },
    });
    expect(ignored).toBe("ignored");

    const event = await db.webhookEvent.findFirstOrThrow({
      where: { eventId: "evt-order-1" },
    });
    expect(event.status).toBe("ignored");

    const processed = await db.webhookEvent.findFirstOrThrow({
      where: { eventId: "evt-update-1" },
    });
    expect(processed.status).toBe("processed");
  });

  it("fetches the full product when a product event only carries a summary", async () => {
    const requested: string[] = [];
    const fake = {
      getProduct: async (id: string) => {
        requested.push(id);
        return { ...mugFixture, title: "Fetched Mug" };
      },
    } as unknown as PrintifyClient;

    const status = await processPrintifyWebhook(fake, {
      id: "evt-summary-1",
      type: "product:updated",
      resource: {
        id: "PRD-A",
        data: { id: "PRD-A", title: "Classic Mug" },
      },
    });

    expect(status).toBe("processed");
    expect(requested).toEqual(["PRD-A"]);
    const mug = await db.product.findUniqueOrThrow({ where: { printifyId: "PRD-A" } });
    expect(mug.title).toBe("Fetched Mug");
  });

  it("does not fetch when the product event already carries the full product", async () => {
    let fetched = 0;
    const fake = {
      getProduct: async () => {
        fetched += 1;
        return mugFixture;
      },
    } as unknown as PrintifyClient;
    const status = await processPrintifyWebhook(fake, {
      id: "evt-full-1",
      type: "product:updated",
      data: { resource_id: "PRD-A", resource: { ...mugFixture, title: "Full Mug" } },
    });
    expect(status).toBe("processed");
    expect(fetched).toBe(0);
  });

  it("recorded duplicate webhook delivery once", async () => {
    await processPrintifyWebhook(client(), {
      id: "evt-dup-1",
      type: "product:updated",
      data: { resource_id: "PRD-A", resource: mugFixture },
    });
    const count = await db.webhookEvent.count({ where: { eventId: "evt-dup-1" } });
    expect(count).toBe(1);
  });

  it("advertises the cheapest sellable price, never a disabled variant's price", async () => {
    await upsertProductFromApi({
      ...mugFixture,
      id: "PRD-CHEAP",
      title: "Cheap Disabled",
      variants: [
        {
          id: 3001,
          sku: "C-1",
          cost: 1000,
          price: 900,
          is_enabled: true,
          is_default: true,
          is_available: true,
          options: [101, 1189],
        },
        {
          id: 3002,
          sku: "C-2",
          cost: 600,
          price: 400,
          is_enabled: false,
          is_default: false,
          is_available: true,
          options: [102, 1189],
        },
      ],
    });

    const row = await db.product.findUniqueOrThrow({ where: { printifyId: "PRD-CHEAP" } });
    const sellable = pricingFromCost(1000)!;
    const disabledCheaper = pricingFromCost(600)!;
    expect(disabledCheaper.priceMinor).toBeLessThan(sellable.priceMinor);
    expect(row.minPriceMinor).toBe(sellable.priceMinor);
  });

  it("upsertProductFromApi returns created flag", async () => {
    const { created } = await upsertProductFromApi({
      ...mugFixture,
      id: "PRD-C",
      title: "Brand New",
    });
    expect(created).toBe(true);

    const again = await upsertProductFromApi({
      ...mugFixture,
      id: "PRD-C",
      title: "Brand New",
    });
    expect(again.created).toBe(false);
  });

  it("rolls back a failed image replacement and recovers on retry", async () => {
    const originalImage = "https://images.printify.com/mockup/atomic-original.jpg";
    const original = {
      ...mugFixture,
      id: "PRD-ATOMIC-IMAGES",
      title: "Atomic Images",
      images: [{ src: originalImage, is_default: true }],
    };
    await upsertProductFromApi(original);

    await expect(
      upsertProductFromApi({
        ...original,
        title: "Broken Images",
        images: [
          { src: "https://images.printify.com/mockup/duplicate.jpg", is_default: true },
          { src: "https://images.printify.com/mockup/duplicate.jpg" },
        ],
      }),
    ).rejects.toThrow();

    const afterFailure = await loadCatalogProduct("PRD-ATOMIC-IMAGES");
    expect(afterFailure.title).toBe("Atomic Images");
    expect(afterFailure.images.map((image) => image.src)).toEqual([originalImage]);
    expect(afterFailure.variants).toHaveLength(2);

    const recoveredImage = "https://images.printify.com/mockup/atomic-recovered.jpg";
    await upsertProductFromApi({
      ...original,
      title: "Recovered Images",
      images: [{ src: recoveredImage, is_default: true }],
    });

    const recovered = await loadCatalogProduct("PRD-ATOMIC-IMAGES");
    expect(recovered.title).toBe("Recovered Images");
    expect(recovered.images.map((image) => image.src)).toEqual([recoveredImage]);
  });

  it("rolls back earlier variant changes when a later variant fails", async () => {
    const originalImage = "https://images.printify.com/mockup/variant-original.jpg";
    const original = {
      ...mugFixture,
      id: "PRD-ATOMIC-VARIANTS",
      title: "Atomic Variants",
      images: [{ src: originalImage, is_default: true }],
    };
    await upsertProductFromApi(original);

    const changedImage = "https://images.printify.com/mockup/variant-changed.jpg";
    const failing = {
      ...original,
      title: "Partial Variants",
      images: [{ src: changedImage, is_default: true }],
      variants: [
        { ...mugFixture.variants![0], cost: 1400 },
        { ...mugFixture.variants![1], cost: 9_000_000_000 },
      ],
    };

    await expect(upsertProductFromApi(failing)).rejects.toThrow();

    const afterFailure = await loadCatalogProduct("PRD-ATOMIC-VARIANTS");
    expect(afterFailure.title).toBe("Atomic Variants");
    expect(afterFailure.images.map((image) => image.src)).toEqual([originalImage]);
    expect(
      afterFailure.variants.find((variant) => variant.printifyVariantId === 1001)
        ?.costMinor,
    ).toBe(pricingFromCost(1000)!.costMinor);
    expect(
      afterFailure.variants.find((variant) => variant.printifyVariantId === 1002)
        ?.costMinor,
    ).toBe(pricingFromCost(1200)!.costMinor);

    await upsertProductFromApi({
      ...failing,
      title: "Recovered Variants",
      variants: [
        { ...mugFixture.variants![0], cost: 1400 },
        { ...mugFixture.variants![1], cost: 1200 },
      ],
    });

    const recovered = await loadCatalogProduct("PRD-ATOMIC-VARIANTS");
    expect(recovered.title).toBe("Recovered Variants");
    expect(recovered.images.map((image) => image.src)).toEqual([changedImage]);
    expect(
      recovered.variants.find((variant) => variant.printifyVariantId === 1001)
        ?.costMinor,
    ).toBe(pricingFromCost(1400)!.costMinor);
  });

  it("does not let a stale full-sync snapshot overwrite a newer webhook snapshot", async () => {
    const productId = "PRD-RACE-FULL-SYNC";
    const initialImage = "https://images.printify.com/mockup/race-initial.jpg";
    const freshImage = "https://images.printify.com/mockup/race-fresh.jpg";
    const initial = {
      ...mugFixture,
      id: productId,
      title: "Initial Race",
      images: [{ src: initialImage, is_default: true }],
    };
    await upsertProductFromApi(initial);

    const stale = {
      ...initial,
      title: "Stale Full Sync",
      description: "stale",
      images: [{ src: "https://images.printify.com/mockup/race-stale.jpg", is_default: true }],
    };
    const fresh = {
      ...initial,
      title: "Fresh Webhook",
      description: "fresh",
      images: [{ src: freshImage, is_default: true }],
      variants: [
        { ...mugFixture.variants![0], cost: 1400 },
        { ...mugFixture.variants![1], cost: 1200 },
      ],
    };

    const fake = {
      getAllProducts: async () => {
        // A webhook is applied after the full-sync list snapshot was taken,
        // but before the stale snapshot is written back.
        await processPrintifyWebhook(client(), {
          id: "evt-race-full-sync",
          type: "product:updated",
          created_at: new Date(Date.now() + 60_000).toISOString(),
          data: { resource_id: productId, resource: fresh },
        });
        return [stale];
      },
    } as unknown as PrintifyClient;

    const summary = await syncCatalog(fake);
    expect(summary.errors).toEqual([]);

    const row = await loadCatalogProduct(productId);
    expect(row.title).toBe("Fresh Webhook");
    expect(row.description).toBe("fresh");
    expect(row.images.map((image) => image.src)).toEqual([freshImage]);
    expect(
      row.variants.find((variant) => variant.printifyVariantId === 1001)?.costMinor,
    ).toBe(pricingFromCost(1400)!.costMinor);
  });

  it("ignores a stale webhook snapshot after a newer full sync", async () => {
    const productId = "PRD-RACE-WEBHOOK";
    const initialImage = "https://images.printify.com/mockup/race-webhook-initial.jpg";
    const initial = {
      ...mugFixture,
      id: productId,
      title: "Initial Webhook Race",
      images: [{ src: initialImage, is_default: true }],
    };
    await upsertProductFromApi(initial);

    const fresh = {
      ...initial,
      title: "Fresh Full Sync",
      description: "fresh-full",
    };
    stubCatalogFetch([fresh]);
    await syncCatalog(client());

    const stale = {
      ...initial,
      title: "Stale Webhook",
      description: "stale-webhook",
    };
    const status = await processPrintifyWebhook(client(), {
      id: "evt-race-webhook",
      type: "product:updated",
      created_at: "2020-01-01T00:00:00.000Z",
      data: { resource_id: productId, resource: stale },
    });
    expect(status).toBe("processed");

    const row = await loadCatalogProduct(productId);
    expect(row.title).toBe("Fresh Full Sync");
    expect(row.description).toBe("fresh-full");
    expect(row.images.map((image) => image.src)).toEqual([initialImage]);
  });
});
