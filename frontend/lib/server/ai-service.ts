import "server-only";
import {
  createAiService,
  InMemoryRetriever,
  emergencyContactFromEnvironment,
  LocalQwenChatClient,
  type AiService,
} from "@consultprep/ai";

let servicePromise: Promise<AiService> | undefined;

/** Reuse one local model instance so its weights stay loaded between turns. */
export function getAiService(): Promise<AiService> {
  servicePromise ??= InMemoryRetriever.create([], async () => []).then((retriever) =>
    (() => {
      const client = new LocalQwenChatClient();
      // Begin loading the local model during the opening request so its cold
      // startup overlaps with the time spent reading the intake introduction.
      void client.warmup().catch(() => undefined);
      return createAiService(client, retriever, { emergencyContact: emergencyContactFromEnvironment() });
    })(),
  ).catch((error: unknown) => {
    servicePromise = undefined;
    throw error;
  });
  return servicePromise;
}
