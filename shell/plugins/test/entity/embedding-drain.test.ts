import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import { waitForEmbeddingsToDrain } from "../../src";

function jobs(activeReads: number): {
  reads: string[][];
  getActiveJobs: (types?: string[]) => Promise<unknown[]>;
} {
  const reads: string[][] = [];
  return {
    reads,
    getActiveJobs: async (types?: string[]): Promise<unknown[]> => {
      reads.push(types ?? []);
      return reads.length <= activeReads ? [{}] : [];
    },
  };
}

describe("waitForEmbeddingsToDrain", () => {
  it("resolves once no embedding job is active", async () => {
    const queue = jobs(2);

    await waitForEmbeddingsToDrain(queue, { pollMs: 1, timeoutMs: 1000 });

    expect(queue.reads).toEqual([
      ["shell:embedding"],
      ["shell:embedding"],
      ["shell:embedding"],
    ]);
  });

  it("fails instead of waiting forever on a stuck queue", async () => {
    const queue = jobs(Number.POSITIVE_INFINITY);

    const failure = await waitForEmbeddingsToDrain(queue, {
      pollMs: 1,
      timeoutMs: 20,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(caughtError(failure).message).toContain("Embeddings did not drain");
  });
});
