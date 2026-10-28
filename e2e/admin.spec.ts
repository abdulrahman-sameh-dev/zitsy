import { expect, test } from "@playwright/test";

import { db } from "@/lib/db/prisma";

test.beforeEach(async () => {
  await db.rateLimitBucket.deleteMany();
});

test.afterAll(async () => {
  await db.rateLimitBucket.deleteMany();
});

test("redirects unauthenticated visitors to the admin sign-in page", async ({
  page,
}) => {
  await page.goto("/admin/analytics");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("rejects wrong credentials and signs in with the configured ones", async ({
  page,
}) => {
  await page.goto("/admin/login");

  await page.getByLabel("Username").fill("wrong@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Incorrect username or password.", { exact: true }),
  ).toBeVisible();

  await page.getByLabel("Username").fill("e2e-admin@example.com");
  await page.getByLabel("Password").fill("e2e-only-admin-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin\/analytics$/);
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByText("Paid orders", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("blocks repeated failed sign-ins across the durable limiter", async ({
  page,
}) => {
  await page.goto("/admin/login");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.getByLabel("Username").fill("wrong@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("Incorrect username or password.", { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await db.rateLimitBucket.findFirst())?.count ?? 0)
      .toBe(attempt + 1);
  }

  await page.getByLabel("Username").fill("wrong@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Too many attempts. Try again in a few minutes.", {
      exact: true,
    }),
  ).toBeVisible();
});
