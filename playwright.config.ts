import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Escape hatch for machines with a Chromium already installed but without
// network access to the Playwright CDN. Normal runs should use `pnpm e2e:install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @vela/app-desktop dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @vela/app-components dev",
      url: "http://localhost:5174",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @vela/marketplace dev",
      url: "http://127.0.0.1:4320/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        MARKETPLACE_ADMIN_TOKEN: "test-admin-token",
        MARKETPLACE_DATA_DIR: path.join(tmpdir(), `vela-marketplace-e2e-${process.pid}`),
      },
    },
  ],
});
