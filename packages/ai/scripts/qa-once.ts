import { loadAmdConfig } from "../src/config.js";
import { AmdChatClient } from "../src/amd-client.js";
import { createDefaultRetriever } from "../src/rag.js";
import { createAiService } from "../src/service.js";

const question = process.argv.slice(2).join(" ").trim();
if (process.env.AMD_QA_DEMO_CONFIRM !== "RUN_ONE_REQUEST") {
  console.error("Refusing to call AMD. Set AMD_QA_DEMO_CONFIRM=RUN_ONE_REQUEST to allow exactly one request.");
  process.exitCode = 2;
} else if (!question) {
  console.error('Usage: AMD_QA_DEMO_CONFIRM=RUN_ONE_REQUEST npm run demo:qa -- "What is a fever?"');
  process.exitCode = 2;
} else {
  await runOneQuestion(question);
}

async function runOneQuestion(prompt: string): Promise<void> {
  try {
    const config = loadAmdConfig();
    const retriever = await createDefaultRetriever();
    const service = createAiService(new AmdChatClient(config), retriever);
    const result = await service.answerQuestion({ question: prompt });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Keep credentials and provider response bodies out of terminal output.
    console.error(error instanceof Error ? error.message : "The Q&A request failed.");
    process.exitCode = 1;
  }
}
