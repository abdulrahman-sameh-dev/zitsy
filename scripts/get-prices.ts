import "dotenv/config";

import { db } from "../src/lib/db/prisma.js";

async function main() {
  const slugs = [
    "minimal-sunrise-hoodie-small-sunrise-graphic-hooded-sweatshirt",
    "believe-yourself-hoodie-minimal-script-text-sweatshirt",
    "black-ink-dripping-skull-phone-case"
  ];

  for (const slug of slugs) {
    console.log("=".repeat(100));
    console.log("Product:", slug);
    const product = await db.product.findUnique({
      where: { slug },
      select: {
        id: true,
        printifyId: true,
        slug: true,
        title: true,
        currency: true,
        minPriceMinor: true,
        createdAt: true,
        updatedAt: true,
        variants: {
          orderBy: { priceMinor: "asc" },
          take: 5,
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
          },
        },
      },
    });

    if (!product) {
      console.log("Product not found:", slug);
      continue;
    }

    console.log("ID:", product.id);
    console.log("Printify ID:", product.printifyId);
    console.log("Title:", product.title);
    console.log("Currency:", product.currency);
    console.log("minPriceMinor:", product.minPriceMinor, "(-)", product.minPriceMinor / 100);
    console.log("Variants (first 5 by price):");
    for (const v of product.variants) {
      console.log(
        `  - ${v.title} | Price: ${v.priceMinor/100} ${v.currency} | Cost: ${v.costMinor/100} ${v.currency} | Available: ${v.isAvailable} | Enabled: ${v.isEnabled} | Default: ${v.isDefault} | Color: ${v.colorName} | Size: ${v.sizeName}`
      );
    }

    // Calculate margin if we have cost and price data
    if (product.variants.length > 0) {
      for (const v of product.variants) {
        if (v.priceMinor > 0 && v.costMinor > 0) {
          const price = v.priceMinor;
          const cost = v.costMinor;
          const grossMargin = ((price - cost) / price) * 100;
          const markup = ((price - cost) / cost) * 100;
          console.log(`  Variant ${v.title}:`);
          console.log(`    Gross margin: ${grossMargin.toFixed(1)}%`);
          console.log(`    Markup: ${markup.toFixed(1)}%`);
        }
      }
    }
    console.log("");
  }

  await db.$disconnect();
}

main();
