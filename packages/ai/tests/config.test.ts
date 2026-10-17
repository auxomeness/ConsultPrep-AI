import { describe, expect, it } from "vitest";
import { loadAmdConfig } from "../src/config.js";

describe("AMD configuration", () => {
  it("loads explicit config and uses documented shared endpoint default", () => {
    expect(loadAmdConfig({ RADEON_API_KEY: "synthetic", RADEON_MODEL: "model" })).toMatchObject({
      baseUrl: "https://developer.amd.com.cn/radeon/api/v1",
      model: "model",
      reasoningEffort: "low",
    });
  });

  it("rejects missing secrets and insecure endpoints", () => {
    expect(() => loadAmdConfig({ RADEON_MODEL: "model" })).toThrow(/RADEON_API_KEY/);
    expect(() => loadAmdConfig({ RADEON_API_KEY: "synthetic", RADEON_MODEL: "model", RADEON_BASE_URL: "http://bad.test" })).toThrow(/HTTPS/);
  });
});
