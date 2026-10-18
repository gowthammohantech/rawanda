import { defineConfig, devices } from "@playwright/test";

/**
 * CTZ-09 web E2E: `pnpm --filter @laif/citizen-wallet test:e2e`. The FRD journeys (Scenario 1 /
 * 2, demo-script minute, representative scope) and a DemoBanner route walk run headless against
 * the Expo WEB export (`web-build/`, built with `EXPO_PUBLIC_LAIF_E2E=1` — no simulated latency)
 * at a phone viewport. The same journeys run on devices with Maestro (`test:maestro`).
 * Port 8092 (citizen Expo dev server is 8082). Every test starts from a fresh browser context
 * (= fresh IndexedDB = the seeded baseline).
 */
const PORT = 8092;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "chromium-phone", use: { browserName: "chromium" } }],
  webServer: {
    command: `expo export --platform web --output-dir web-build && node e2e/serve.mjs web-build ${PORT}`,
    url: `http://127.0.0.1:${PORT}/welcome`,
    env: { EXPO_PUBLIC_LAIF_E2E: "1" },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
