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
    console.log("PRODUCT:", slug);
    const product = await db.product.findUnique({
      where: { slug },
      select: {
        id: true,
        printifyId: true,
        slug: true,
        title: true,
        currency: true,
        minPriceMinor: true,
        variants: {
          orderBy: { priceMinor: "asc" },
          take: 15,
          select: {
            id: true,
            title: true,
            priceMinor: true,
            costMinor: true,
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
      console.log("Not found:", slug);
      continue;
    }

    console.log("Title:", product.title);
    console.log("Currency:", product.currency);
    console.log("Price:", product.minPriceMinor / 100, product.currency);
    console.log("Colors/Sizes (first 15):");
    for (const v of product.variants) {
      console.log(
        `  - ${v.colorName || "N/A"} ${v.sizeName || "N/A"} | ${v.priceMinor/100} ${v.currency} | avail: ${v.isAvailable} | enabled: ${v.isEnabled} | default: ${v.isDefault}`
      );
    }
    console.log("Total variants:", product.variants.length);
    console.log("");
  }
}

main();
