import { join } from "path";

async function loadCliEnvironment(): Promise<void> {
  const { config } = await import("dotenv");
  config({ path: join(import.meta.dir, "..", ".env") });
}

/** Environment variables any of which lets an eval run reach a model. */
export const API_KEY_VARIABLES = [
  "AI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

/**
 * Whether the environment can reach any provider.
 *
 * Takes the environment rather than reading `process.env` so the check is
 * testable without mutating the runner's own environment, and separate from
 * `assertApiKeyConfigured` so the decision can be exercised without a
 * `process.exit` that would end the test run.
 */
export function hasConfiguredApiKey(
  env: Record<string, string | undefined>,
): boolean {
  return API_KEY_VARIABLES.some((name) => {
    const value = env[name];
    return value !== undefined && value.trim() !== "";
  });
}

export function assertApiKeyConfigured(): void {
  if (!hasConfiguredApiKey(process.env)) {
    console.error(
      "No API key found. Set AI_API_KEY (or provider-specific keys) in shell/ai-evaluation/.env",
    );
    process.exit(1);
  }
}

export async function bootstrapCliEnvironment(): Promise<void> {
  await loadCliEnvironment();
  assertApiKeyConfigured();
}
