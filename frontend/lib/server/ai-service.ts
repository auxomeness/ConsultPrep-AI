import "server-only";
import {
  AmdChatClient,
  createAiService,
  InMemoryRetriever,
  emergencyContactFromEnvironment,
  loadAmdConfig,
  type AiService,
} from "@consultprep/ai";

let servicePromise: Promise<AiService> | undefined;

/** Use AMD as the only model provider for this server process. */
export function getAiService(): Promise<AiService> {
  servicePromise ??= InMemoryRetriever.create([], async () => []).then((retriever) =>
    createAiService(new AmdChatClient(loadAmdConfig()), retriever, { emergencyContact: emergencyContactFromEnvironment() }),
  ).catch((error: unknown) => {
    servicePromise = undefined;
    throw error;
  });
  return servicePromise;
}
