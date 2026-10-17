import { createDefaultRetriever } from "../src/rag.js";

const retriever = await createDefaultRetriever();
const results = await retriever.search("How are unknown answers represented?", 2);
if (results.length === 0 || results.some((result) => !result.chunkId || !Number.isFinite(result.score))) {
  console.error("Local embedding retrieval returned no valid project-guidance matches.");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    query: "How are unknown answers represented?",
    results: results.map(({ sourceId, chunkId, heading, score }) => ({ sourceId, chunkId, heading, score })),
  }, null, 2));
}
