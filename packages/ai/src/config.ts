import { AiServiceError } from "./errors.js";

export interface AmdConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  reasoningEffort: "none" | "low" | "medium" | "high" | "xhigh";
}

export function loadAmdConfig(env: NodeJS.ProcessEnv = process.env): AmdConfig {
  const apiKey = env.RADEON_API_KEY?.trim();
  const model = env.RADEON_MODEL?.trim();
  const baseUrl = (env.RADEON_BASE_URL || "https://developer.amd.com.cn/radeon/api/v1").trim().replace(/\/$/, "");
  const timeoutMs = Number(env.RADEON_TIMEOUT_MS || "30000");
  const reasoningEffort = (env.RADEON_REASONING_EFFORT || "low").trim();

  if (!apiKey) throw new AiServiceError("configuration_error", "RADEON_API_KEY is required.");
  if (!model) throw new AiServiceError("configuration_error", "RADEON_MODEL is required.");
  if (!/^https:\/\//.test(baseUrl)) throw new AiServiceError("configuration_error", "RADEON_BASE_URL must use HTTPS.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new AiServiceError("configuration_error", "RADEON_TIMEOUT_MS must be an integer from 1000 to 600000.");
  }
  if (!["none", "low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
    throw new AiServiceError("configuration_error", "RADEON_REASONING_EFFORT must be none, low, medium, high, or xhigh.");
  }
  return { baseUrl, apiKey, model, timeoutMs, reasoningEffort: reasoningEffort as AmdConfig["reasoningEffort"] };
}
