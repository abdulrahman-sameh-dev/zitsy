import "dotenv/config";

import { db } from "../src/lib/db/prisma.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const ASSETS_DIR = join(
  process.cwd(),
  "zitsy-marketing",
  "assets",
  "products"
);

if (!existsSync(ASSETS_DIR)) {
  mkdirSync(ASSETS_DIR, { recursive: true });
}

interface ProductImageRecord {
  id: string;
  src: string;
  position: number;
  isDefault: boolean;
  variantIds: number[];
}

interface ProductRecord {
  id: string;
  printifyId: string;
  title: string;
  slug: string;
  description: string;
  currency: string;
  minPriceMinor: number;
  images: ProductImageRecord[];
}

async function main() {
  console.log("Starting product image download...");
  console.log("Assets directory:", ASSETS_DIR);

  const products = await db.product.findMany({
    where: { visible: true },
    select: {
      id: true,
      printifyId: true,
      title: true,
      slug: true,
      description: true,
      currency: true,
      minPriceMinor: true,
      images: {
        orderBy: [{ isDefault: "desc" }, { position: "asc" }],
        take: 1,
      },
    },
    orderBy: { title: "asc" },
  });

  console.log("Found", products.length, "visible products");

  const downloadResults: {
    productSlug: string;
    title: string;
    imageUrl: string;
    filepath: string;
    size: number;
    success: boolean;
    error?: string;
  }[] = [];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const [firstImage] = product.images;

    if (!firstImage) {
      console.log(`No images for ${product.title}`);
      failCount++;
      downloadResults.push({
        productSlug: product.slug,
        title: product.title,
        imageUrl: "",
        filepath: "",
        size: 0,
        success: false,
        error: "No images found",
      });
      continue;
    }

    // Create a safe filename from title + position
    const safeTitle = product.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const filename = `${product.id}-${i}-${safeTitle}.jpg`;
    const filepath = join(ASSETS_DIR, filename);

    try {
      console.log(`Downloading ${product.title}...`);
      console.log(`  URL: ${firstImage.src}`);

      // Use curl to download the image
      const { execSync } = await import("child_process");
      const result = execSync(
        `curl -L -o "${filepath}" -w "%{http_code} %{size_download}" "${firstImage.src}"`
      );
      const output = result.toString().trim();
      const [httpCode, size] = output.split(" ").map(Number);

      if (httpCode === 200 && size > 0) {
        console.log(`  Downloaded: ${filepath} (${size} bytes)`);
        successCount++;
        downloadResults.push({
          productSlug: product.slug,
          title: product.title,
          imageUrl: firstImage.src,
          filepath,
          size,
          success: true,
        });
      } else {
        console.log(`  Failed: HTTP ${httpCode}, size ${size}`);
        failCount++;
        downloadResults.push({
          productSlug: product.slug,
          title: product.title,
          imageUrl: firstImage.src,
          filepath,
          size: 0,
          success: false,
          error: `HTTP ${httpCode}`,
        });
      }
    } catch (err) {
      console.log(`  Error: ${err}`);
      failCount++;
      downloadResults.push({
        productSlug: product.slug,
        title: product.title,
        imageUrl: firstImage.src,
        filepath: "",
        size: 0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("");
  console.log("=== DOWNLOAD SUMMARY ===");
  console.log("Total products:", products.length);
  console.log("Successful downloads:", successCount);
  console.log("Failed downloads:", failCount);
  console.log("");

  // Print the results table
  console.log("Result table:");
  console.log(
    downloadResults
      .map(
        (r) =>
          `${r.productSlug} | ${r.title} | success=${r.success} | size=${
            r.size
          } | error=${r.error || "-"}`
      )
      .join("\n")
  );

  // Write mapping file
  const mappingPath = join(ASSETS_DIR, "..", "product-image-mapping.json");
  writeFileSync(
    mappingPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        assetDir: ASSETS_DIR,
        products: downloadResults,
      },
      null,
      2
    )
  );
  console.log("\nMapping written to:", mappingPath);

  await db.$disconnect();
}

main();
