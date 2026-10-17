import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "@huggingface/transformers";
import { AiServiceError } from "./errors.js";

export const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

export interface KnowledgeSource {
  sourceId: string;
  markdown: string;
}

export interface KnowledgeChunk {
  chunkId: string;
  sourceId: string;
  heading: string;
  text: string;
}

export interface RetrievedChunk extends KnowledgeChunk {
  score: number;
}

export type Embedder = (texts: string[]) => Promise<number[][]>;
type FeatureExtractorRunner = (texts: string[], options: { pooling: "mean"; normalize: true }) => Promise<{ tolist(): unknown }>;
type FeaturePipelineFactory = (
  task: "feature-extraction",
  modelId: string,
  options: { device: "cpu"; dtype: "fp32" },
) => Promise<FeatureExtractorRunner>;

export function chunkMarkdown(sources: KnowledgeSource[], maxCharacters = 1_800): KnowledgeChunk[] {
  if (!Number.isInteger(maxCharacters) || maxCharacters < 200) throw new Error("maxCharacters must be at least 200");
  const chunks: KnowledgeChunk[] = [];
  for (const source of sources) {
    const lines = source.markdown.split(/\r?\n/);
    let heading = "Document";
    let section: string[] = [];
    const flush = () => {
      const text = section.join("\n").trim();
      if (!text) return;
      for (let offset = 0; offset < text.length; offset += maxCharacters) {
        const part = text.slice(offset, offset + maxCharacters).trim();
        if (!part) continue;
        chunks.push({
          chunkId: `${source.sourceId}#${chunks.length + 1}`,
          sourceId: source.sourceId,
          heading,
          text: part,
        });
      }
    };
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) {
        flush();
        heading = line.replace(/^#{1,6}\s+/, "").trim();
        section = [line];
      } else {
        section.push(line);
      }
    }
    flush();
  }
  return chunks;
}

export function createLocalEmbedder(modelId = DEFAULT_EMBEDDING_MODEL): Embedder {
  let extractorPromise: Promise<FeatureExtractorRunner> | undefined;
  return async (texts) => {
    if (texts.length === 0) return [];
    const createPipeline = pipeline as unknown as FeaturePipelineFactory;
    // The compact MiniLM embedding model is intentionally run as fp32 on CPU.
    // Make the choice explicit so Transformers.js does not emit a default-dtype warning.
    extractorPromise ??= createPipeline("feature-extraction", modelId, { device: "cpu", dtype: "fp32" });
    try {
      const extractor = await extractorPromise;
      const tensor = await extractor(texts, { pooling: "mean", normalize: true });
      const rows = tensor.tolist() as number[][];
      if (rows.length !== texts.length || rows.some((row) => !row.every(Number.isFinite))) {
        throw new Error("Embedding model returned invalid vectors");
      }
      return rows;
    } catch (error) {
      extractorPromise = undefined;
      const detail = error instanceof Error ? ` ${error.message.slice(0, 300)}` : "";
      throw new AiServiceError("provider_unavailable", `Local embedding model could not be loaded or run.${detail}`);
    }
  };
}

export async function loadKnowledgeSources(directory: string): Promise<KnowledgeSource[]> {
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".md")).sort();
  return Promise.all(names.map(async (name) => ({
    sourceId: name.replace(/\.md$/i, ""),
    markdown: await readFile(join(directory, name), "utf8"),
  })));
}

export async function createDefaultRetriever(embed: Embedder = createLocalEmbedder()): Promise<InMemoryRetriever> {
  const candidates = [
    new URL("../knowledge/", import.meta.url).pathname,
    new URL("../../knowledge/", import.meta.url).pathname,
  ];
  for (const directory of candidates) {
    try {
      const sources = await loadKnowledgeSources(directory);
      if (sources.length > 0) return InMemoryRetriever.create(sources, embed);
    } catch {
      // Try the package-root corpus when running from compiled dist output.
    }
  }
  throw new Error("Could not find the AI package knowledge corpus.");
}

function dotCosine(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) throw new Error("Embedding dimensions do not match");
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
}

export class InMemoryRetriever {
  private constructor(private readonly vectors: Array<{ chunk: KnowledgeChunk; embedding: number[] }>, private readonly embed: Embedder) {}

  static async create(sources: KnowledgeSource[], embed: Embedder, maxCharacters = 1_800): Promise<InMemoryRetriever> {
    const chunks = chunkMarkdown(sources, maxCharacters);
    const embeddings = await embed(chunks.map((chunk) => `${chunk.heading}\n${chunk.text}`));
    if (embeddings.length !== chunks.length) throw new Error("Embedder result count does not match corpus chunks");
    return new InMemoryRetriever(chunks.map((chunk, index) => ({ chunk, embedding: embeddings[index]! })), embed);
  }

  async search(query: string, limit = 4): Promise<RetrievedChunk[]> {
    if (!query.trim() || limit <= 0 || this.vectors.length === 0) return [];
    const [queryVector] = await this.embed([query]);
    if (!queryVector) throw new Error("Embedder returned no query vector");
    return this.vectors
      .map(({ chunk, embedding }) => ({ ...chunk, score: dotCosine(queryVector, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
