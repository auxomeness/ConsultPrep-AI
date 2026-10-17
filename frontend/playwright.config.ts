import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3217";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3217",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
