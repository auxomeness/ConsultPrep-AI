import { describe, expect, it } from "vitest";
import { chunkMarkdown, InMemoryRetriever, type Embedder } from "../src/rag.js";

const keywordEmbedder: Embedder = async (texts) => texts.map((text) => {
  const lowered = text.toLowerCase();
  return [Number(lowered.includes("source traceability")), Number(lowered.includes("unknown")), Number(lowered.includes("headache"))];
});

describe("local RAG pipeline", () => {
  it("chunks Markdown by heading and retains source metadata", () => {
    const chunks = chunkMarkdown([{ sourceId: "guide", markdown: "# One\nsource traceability rule\n## Two\nunknown state" }]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ sourceId: "guide", heading: "One" });
    expect(chunks[1]?.heading).toBe("Two");
  });

  it("retrieves the most relevant section with a stable citation", async () => {
    const retriever = await InMemoryRetriever.create([
      { sourceId: "rules", markdown: "# Source links\nEvery reported field needs source traceability." },
      { sourceId: "states", markdown: "# Unknown state\nUnknown is different from unanswered." },
    ], keywordEmbedder);
    const results = await retriever.search("source traceability", 1);
    expect(results[0]).toMatchObject({ sourceId: "rules", heading: "Source links" });
    expect(results[0]?.score).toBeGreaterThan(0.9);
  });

  it("returns no results for empty query or empty corpus", async () => {
    const empty = await InMemoryRetriever.create([], keywordEmbedder);
    expect(await empty.search("anything")).toEqual([]);
    const populated = await InMemoryRetriever.create([{ sourceId: "x", markdown: "# Heading\ntext" }], keywordEmbedder);
    expect(await populated.search(" ")).toEqual([]);
  });
});
