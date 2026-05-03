import { join } from "path";

export async function loadCliEnvironment(): Promise<void> {
  const { config } = await import("dotenv");
  config({ path: join(import.meta.dir, "..", ".env") });
}

export function assertApiKeyConfigured(): void {
  const hasAnyKey =
    process.env["AI_API_KEY"] ??
    process.env["OPENAI_API_KEY"] ??
    process.env["ANTHROPIC_API_KEY"] ??
    process.env["GOOGLE_GENERATIVE_AI_API_KEY"];

  if (!hasAnyKey) {
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
