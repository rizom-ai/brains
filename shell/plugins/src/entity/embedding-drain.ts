import { SHELL_CHANNELS } from "@brains/contracts";

export interface EmbeddingDrainOptions {
  pollMs?: number;
  timeoutMs?: number;
}

/**
 * Wait until no embedding job is active, so entities just written can be
 * found by meaning. Fails after `timeoutMs` rather than waiting on a stuck
 * queue. For evals and other callers that must search what they just stored.
 */
export async function waitForEmbeddingsToDrain(
  jobs: { getActiveJobs(types?: string[]): Promise<unknown[]> },
  options: EmbeddingDrainOptions = {},
): Promise<void> {
  const pollMs = options.pollMs ?? 100;
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);

  const poll = async (): Promise<void> => {
    const active = await jobs.getActiveJobs([SHELL_CHANNELS.embedding]);
    if (active.length === 0) return;
    if (Date.now() >= deadline) {
      throw new Error("Embeddings did not drain before the deadline");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    return poll();
  };
  return poll();
}
