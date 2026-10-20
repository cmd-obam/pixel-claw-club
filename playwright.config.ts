import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npx next dev --port 3100",
    url: "http://localhost:3100/auth",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
