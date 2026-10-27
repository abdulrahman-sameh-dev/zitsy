import { expect, test } from "@playwright/test";

import { readCapturedEmails } from "./resend-stub";
import { resetStore } from "./seed";

test.beforeAll(async () => {
  await resetStore();
});

test("shows the support form", async ({ page }) => {
  await page.goto("/contact");

  await expect(page.getByRole("heading", { name: "Contact us" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel(/Reason/)).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
  await expect(
    page
      .locator('[data-clarity-mask="true"]')
      .filter({ has: page.getByLabel("Message") }),
  ).toBeVisible();
});

test("validates the form server-side", async ({ page }) => {
  await page.goto("/contact");

  await page.getByLabel("Name").fill("Jane Smith");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Message").fill("Where is my order?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
});

test("submits a message and emails the store and the customer", async ({ page }) => {
  const email = `e2e-customer-${Date.now()}@zitsu.darkhub.dev`;
  await page.goto("/contact");

  await page.getByLabel("Name").fill("Jane Smith");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Reason/).selectOption("shipping");
  await page.getByLabel("Message").fill("When will my order ship?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("Your message has been sent.")).toBeVisible();

  const emails = readCapturedEmails();
  const toStore = emails.filter((entry) => entry.subject.includes("Shipping question"));
  const receipt = emails.filter((entry) => entry.to === email);
  expect(toStore.length).toBeGreaterThan(0);
  expect(toStore[0].replyTo).toBeTruthy();
  expect(receipt.length).toBeGreaterThan(0);
  expect(receipt[0].subject).toContain("received");
});
