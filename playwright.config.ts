import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E for @entviz/react — see docs/playwright-e2e-design.md.
 *
 * Drives the dev-only /e2e.html fixture (apps/playground) against a real Chromium,
 * closing the gaps the Vitest/jsdom suite fakes: real geometry, real canvas raster,
 * real clipboard, real focus/a11y. Chromium only in v1. The webServer runs the Vite
 * DEV server (workspace-linked live source; also lets the fixture's seeded rng be
 * honored for the rare order-specific spec — the shipped prod gate is untouched).
 */
const PORT = 5273;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "packages/react/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Modest worker count on a RAM-limited dev box / CI runner.
  workers: 2,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    // P1 clipboard specs need real read/write grants.
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -w @entviz/playground -- --port ${PORT} --strictPort`,
    url: `${BASE}/e2e.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
