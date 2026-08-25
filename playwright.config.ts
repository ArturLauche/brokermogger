import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env", quiet: true });

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [
        ["list"],
        ["html", { open: "never" }],
        ["junit", { outputFile: "test-results/junit.xml" }],
      ]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    testIdAttribute: "data-testid",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(process.env.E2E_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: isCI
            ? "npm run prepare:standalone && npm run start:standalone"
            : "npm run dev",
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 180_000,
          env: {
            EMAIL_PROVIDER: "mock",
            ALLOW_EXTERNAL_SENDING: "false",
            APP_ENV: process.env.APP_ENV ?? "development",
            PORT: "3000",
            HOSTNAME: "127.0.0.1",
          },
        },
      }),
});
