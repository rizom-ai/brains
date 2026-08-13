import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  MOCK_LOAD_PROBE_MARKER,
  MockLoadAIService,
  MockLoadEmbeddingService,
  MockLoadTracker,
} from "./helpers/mocked-ai-load-services";

describe("mocked feature-load services", () => {
  it("tracks bounded shared concurrency and validates generated objects", async () => {
    const tracker = new MockLoadTracker();
    const embeddings = new MockLoadEmbeddingService(tracker, {
      delayMs: 5,
      dimensions: 4,
    });
    const ai = new MockLoadAIService(tracker, { delayMs: 5 });

    const [embedding, generated] = await Promise.all([
      embeddings.generateEmbedding(MOCK_LOAD_PROBE_MARKER),
      ai.generateObject(
        "system",
        "prompt",
        z.object({ topics: z.array(z.string()) }),
      ),
    ]);

    expect(embedding.embedding.length).toBe(4);
    expect(generated.object).toEqual({ topics: [] });
    expect(tracker.snapshot()).toEqual({
      embeddingCalls: 1,
      probeEmbeddingCalls: 1,
      completedProbeEmbeddingCalls: 1,
      objectCalls: 1,
      textCalls: 0,
      activeCalls: 0,
      maxConcurrentCalls: 2,
    });
  });
});
