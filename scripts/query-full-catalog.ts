import "dotenv/config";

import { db } from "../src/lib/db/prisma.js";

async function main() {
  try {
    const products = await db.product.findMany({
      where: { visible: true },
      include: {
        images: {
          orderBy: [{ isDefault: "desc" }, { position: "asc" }],
        },
        variants: { orderBy: { title: "asc" } },
      },
      orderBy: { title: "asc" },
    });

    console.log("Total visible products:", products.length);
    console.log("");

    for (const p of products) {
      console.log("=".repeat(80));
      console.log("Product:");
      console.log("  id:", p.id);
      console.log("  printifyId:", p.printifyId);
      console.log("  title:", p.title);
      console.log("  slug:", p.slug);
      console.log("  description:", p.description || "(empty)");
      console.log("  tags:", p.tags);
      console.log("  currency:", p.currency);
      console.log("  minPriceMinor:", p.minPriceMinor);
      console.log("  options:", JSON.stringify(p.options, null, 2));
      console.log("  visible:", p.visible);
      console.log("  blueprintId:", p.blueprintId);
      console.log("  printProviderId:", p.printProviderId);
      console.log("  createdAt:", p.createdAt);
      console.log("  updatedAt:", p.updatedAt);
      console.log("  syncedAt:", p.syncedAt);

      // Categories
      const categoryIds = (p.categories as { categoryId: string }[]).map((c) => c.categoryId);
      console.log("  categories:", categoryIds.length > 0 ? categoryIds : "(none)");

      // Images
      const images = p.images.map((img) => ({
        src: img.src,
        position: img.position,
        isDefault: img.isDefault,
        variantIds: img.variantIds,
      }));
      console.log("  images:", JSON.stringify(images, null, 2));

      // Variants
      const variants = p.variants.map((v) => ({
        id: v.id,
        printifyVariantId: v.printifyVariantId,
        title: v.title,
        sku: v.sku,
        priceMinor: v.priceMinor,
        costMinor: v.costMinor,
        currency: v.currency,
        isEnabled: v.isEnabled,
        isAvailable: v.isAvailable,
        isDefault: v.isDefault,
        colorName: v.colorName,
        sizeName: v.sizeName,
        optionValueIds: v.optionValueIds,
        options: JSON.stringify(v.options, null, 2),
      }));
      console.log("  variants:", JSON.stringify(variants, null, 2));

      console.log("");
    }
  } catch (e) {
    console.error("Error:", e);
    console.error(e instanceof Error ? e.stack : String(e));
  } finally {
    await db.$disconnect();
  }
}

main();
