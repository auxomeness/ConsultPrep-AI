import { ApiError } from "./errors.ts";

/** Fail closed when the server has no configured AI integration. */
export function requireConfiguredAiDependency<T>(dependency: T | null | undefined): T {
  if (dependency === null || dependency === undefined) {
    throw new ApiError("AI_UNAVAILABLE");
  }
  return dependency;
}
