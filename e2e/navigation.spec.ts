import { expect, test } from "@playwright/test";

test("footer links customers to order tracking and support", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");

  await expect(footer.getByRole("link", { name: "Track Order" })).toHaveAttribute(
    "href",
    "/track-order",
  );
  await expect(footer.getByRole("link", { name: "Contact Us" })).toHaveAttribute(
    "href",
    "/contact",
  );
});

test("the tracking page links back to support", async ({ page }) => {
  await page.goto("/track-order");
  await expect(page.getByRole("link", { name: "Contact us" })).toHaveAttribute(
    "href",
    "/contact",
  );
});

test("structured data does not advertise a query-based search action", async ({
  page,
}) => {
  await page.goto("/");
  const structuredData = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent();

  expect(structuredData).toContain('"@type":"WebSite"');
  expect(structuredData).not.toContain("SearchAction");
  expect(structuredData).not.toContain("/search?q=");
});

test("search forms keep terms out of the URL", async ({ page }) => {
  await page.goto("/");

  const headerSearch = page.locator("#site-search");
  await headerSearch.fill("tote");
  await headerSearch.press("Enter");

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator("#search-input")).toHaveValue("tote");

  const searchCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "zitsy_search_query",
  );
  expect(searchCookie?.httpOnly).toBe(true);
  expect(searchCookie?.sameSite).toBe("Lax");
  expect(searchCookie?.path).toBe("/search");

  await page.locator("#search-input").fill("hoodie");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator("#search-input")).toHaveValue("hoodie");

  await page.locator("#site-search").fill("");
  await page.locator("#site-search").press("Enter");

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator("#search-input")).toHaveValue("");
  expect(
    (await page.context().cookies()).find(
      (cookie) => cookie.name === "zitsy_search_query",
    ),
  ).toBeUndefined();
});

test("redirects legacy search URLs without keeping the query", async ({ page }) => {
  await page.goto("/search?q=tote");

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator("#search-input")).toHaveValue("tote");
});

test("masks search inputs from session replay", async ({ page }) => {
  await page.goto("/search?q=tote");

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator('form[data-clarity-mask="true"] #site-search')).toHaveCount(1);
  await expect(page.locator('div[data-clarity-mask="true"] #search-input')).toHaveCount(1);
});
