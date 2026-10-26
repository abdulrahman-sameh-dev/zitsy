import "dotenv/config";

import { db } from "../src/lib/db/prisma.js";

async function main() {
  try {
    // Debug: check what's in the product record
    const products = await db.product.findMany({
      where: { visible: true },
      select: {
        id: true,
        printifyId: true,
        title: true,
        slug: true,
        description: true,
        tags: true,
        currency: true,
        minPriceMinor: true,
        options: true,
        visible: true,
        blueprintId: true,
        printProviderId: true,
        createdAt: true,
        updatedAt: true,
        syncedAt: true,
        images: {
          orderBy: [{ isDefault: "desc" }, { position: "asc" }],
          select: {
            id: true,
            src: true,
            position: true,
            isDefault: true,
            variantIds: true,
          },
        },
        variants: {
          orderBy: { title: "asc" },
          select: {
            id: true,
            printifyVariantId: true,
            title: true,
            priceMinor: true,
            costMinor: true,
            currency: true,
            isEnabled: true,
            isAvailable: true,
            isDefault: true,
            colorName: true,
            sizeName: true,
            optionValueIds: true,
          },
        },
        categories: {
          select: {
            categoryId: true,
          },
        },
      },
      orderBy: { title: "asc" },
    });

    console.log("Total visible products:", products.length);
    console.log("");

    for (const [i, p] of products.entries()) {
      console.log("=".repeat(80));
      console.log("Product", i + 1, ":");
      console.log("  id:", p.id);
      console.log("  printifyId:", p.printifyId);
      console.log("  title:", p.title);
      console.log("  slug:", p.slug);
      console.log("  currency:", p.currency);
      console.log("  minPriceMinor:", p.minPriceMinor);
      console.log("  tags:", JSON.stringify(p.tags));
      console.log("  images count:", p.images?.length ?? 0);
      console.log("  variants count:", p.variants?.length ?? 0);
      console.log("  categories:", p.categories ?? "(none)");
      console.log("");

      // Print full details for first product
      if (i === 0) {
        console.log("=== First product full details ===");
        console.log("Description:", p.description || "(empty)");
        console.log("Options:", JSON.stringify(p.options, null, 2));
        console.log("Images:", JSON.stringify(p.images, null, 2));
        console.log("Variants:", JSON.stringify(p.variants, null, 2));
      }
    }

    // Also collect all data for export
    console.log("=== SUMMARY ===");
    console.log("Total products:", products.length);
    for (const p of products) {
      console.log(
        `- ${p.title} | printifyId=${p.printifyId} | ${p.currency} ${p.minPriceMinor} | images=${p.images?.length ?? 0} | variants=${p.variants?.length ?? 0} | categories=${p.categories?.length ?? 0}`
      );
    }
  } catch (e) {
    console.error("Error:", e);
    console.error(e instanceof Error ? e.stack : String(e));
  } finally {
    await db.$disconnect();
  }
}

main();
