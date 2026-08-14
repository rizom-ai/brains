import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  MOCK_LOAD_PROBE_MARKER,
  MOCK_LOAD_UPDATE_MARKER,
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

    const [embedding, updateEmbedding, secondUpdateEmbedding, generated] =
      await Promise.all([
        embeddings.generateEmbedding(MOCK_LOAD_PROBE_MARKER),
        embeddings.generateEmbedding(
          `${MOCK_LOAD_PROBE_MARKER} ${MOCK_LOAD_UPDATE_MARKER}`,
        ),
        embeddings.generateEmbedding(
          `${MOCK_LOAD_PROBE_MARKER} ${MOCK_LOAD_UPDATE_MARKER} second`,
        ),
        ai.generateObject(
          "system",
          "prompt",
          z.object({ topics: z.array(z.string()) }),
        ),
      ]);

    expect(embedding.embedding.length).toBe(4);
    expect(updateEmbedding.embedding.length).toBe(4);
    expect(secondUpdateEmbedding.embedding.length).toBe(4);
    expect(generated.object).toEqual({ topics: [] });
    expect(tracker.snapshot()).toEqual({
      embeddingCalls: 3,
      probeEmbeddingCalls: 3,
      completedProbeEmbeddingCalls: 3,
      updateEmbeddingCalls: 2,
      completedUpdateEmbeddingCalls: 2,
      maxConcurrentUpdateEmbeddingCalls: 2,
      objectCalls: 1,
      textCalls: 0,
      activeCalls: 0,
      maxConcurrentCalls: 4,
    });
  });
});
