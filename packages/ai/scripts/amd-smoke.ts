import { performance } from "node:perf_hooks";
import { loadAmdConfig } from "../src/config.js";
import { AmdChatClient } from "../src/amd-client.js";
import { NextTurnResultSchema, validateFieldSourceIds } from "../src/contracts.js";
import { AiServiceError } from "../src/errors.js";
import { SYSTEM_INSTRUCTIONS } from "../src/prompts.js";
import { makeSyntheticSmokePayload } from "../src/service.js";

const confirmation = process.env.AMD_LIVE_SMOKE_CONFIRM;
if (confirmation !== "RUN_SINGLE_REQUEST") {
  console.error("Refusing to call AMD. Set AMD_LIVE_SMOKE_CONFIRM=RUN_SINGLE_REQUEST only after the offline completion gate.");
  process.exitCode = 2;
} else {
  await runOneRequest();
}

async function runOneRequest(): Promise<void> {
  let config;
  try {
    config = loadAmdConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "AMD configuration is invalid.");
    process.exitCode = 2;
    return;
  }

  const { prompt } = makeSyntheticSmokePayload();
  const client = new AmdChatClient(config);
  const start = performance.now();
  try {
    // This script deliberately performs exactly one chat completion and no retries.
    const content = await client.complete([
      { role: "system", content: `${SYSTEM_INSTRUCTIONS}\nReturn a JSON object with assistantMessage, askedQuestion, and fieldUpdates.` },
      { role: "user", content: `${prompt} Use response ID synthetic-response-1 for any patient-supported field.` },
    ], { maxTokens: 400, temperature: 0 });
    const decoded: unknown = JSON.parse(content);
    const validated = NextTurnResultSchema.parse(decoded);
    validateFieldSourceIds(validated.fieldUpdates, new Set(["synthetic-response-1"]));
    const latencyMs = Math.round(performance.now() - start);
    console.log(JSON.stringify({ ok: true, model: config.model, latencyMs, schemaValid: true, response: validated }, null, 2));
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    const safeMessage = error instanceof AiServiceError ? error.message : "Response failed JSON or schema validation.";
    console.error(JSON.stringify({ ok: false, model: config.model, latencyMs, error: safeMessage }));
    process.exitCode = 1;
  }
}
