import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

import { STUB_PORT } from "./e2e/resend-stub";
import { STORE_TEST_DATABASE_URL } from "./tests/test-db";

// The config module is evaluated before the web server and the workers start,
// so both the app under test and the test workers inherit these overrides.
// E2E must never touch the development database or the real Resend API.
loadEnv();
process.env.DATABASE_URL = STORE_TEST_DATABASE_URL;
process.env.RESEND_API_URL = `http://127.0.0.1:${STUB_PORT}`;
process.env.ADMIN_USERNAME = "e2e-admin@example.com";
process.env.ADMIN_PASSWORD = "e2e-only-admin-password-123";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
