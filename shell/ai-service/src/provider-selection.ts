/**
 * Select the text generation provider based on config.
 *
 * Pure function — no SDK imports, no side effects.
 * The AI service uses this to decide which SDK provider to call.
 */
export function selectTextProvider(config: { provider?: string }): string {
  return config.provider ?? "anthropic";
}
