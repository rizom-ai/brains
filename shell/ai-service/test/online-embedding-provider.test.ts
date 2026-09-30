import { describe, test, expect, afterEach } from "bun:test";
import { OnlineEmbeddingProvider } from "../src/online-embedding-provider";
import { EmbeddingUsageMeter } from "../src/embedding-usage-meter";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";

/** The part of an OpenAI embeddings request the fake answers from. */
const requestSchema = z.object({ input: z.array(z.string()) });

describe("OnlineEmbeddingProvider", () => {
  afterEach(() => {});

  describe("construction", () => {
    test("requires an API key", () => {
      expect(() =>
        OnlineEmbeddingProvider.createFresh({
          apiKey: "",
          logger: createSilentLogger(),
        }),
      ).toThrow("API key is required");
    });

    test("creates provider with valid config", () => {
      // Counterpart to the missing-key case above: a valid key is accepted.
      expect(() =>
        OnlineEmbeddingProvider.createFresh({
          apiKey: "test-key",
          logger: createSilentLogger(),
        }),
      ).not.toThrow();
    });

    test("uses text-embedding-3-small as default model", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(provider.model).toBe("text-embedding-3-small");
    });

    test("accepts custom model", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        model: "text-embedding-3-large",
        logger: createSilentLogger(),
      });
      expect(provider.model).toBe("text-embedding-3-large");
    });

    test("accepts custom dimensions", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        dimensions: 768,
        logger: createSilentLogger(),
      });
      expect(provider.dimensions).toBe(768);
    });

    test("defaults to 1536 dimensions", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(provider.dimensions).toBe(1536);
    });
  });

  describe("generateEmbeddings edge cases", () => {
    test("returns empty result for empty input", async () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      const result = await provider.generateEmbeddings([]);
      expect(result.embeddings).toEqual([]);
      expect(result.usage.tokens).toBe(0);
    });

    test("preserves cancellation before a provider request", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      const controller = new AbortController();
      const reason = new Error("embedding cancelled");
      controller.abort(reason);

      void expect(
        provider.generateEmbeddings(["text"], controller.signal),
      ).rejects.toBe(reason);
    });
  });

  describe("usage reporting", () => {
    // OpenAI's embeddings response, as the provider receives it.
    const respond = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const body = requestSchema.parse(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          object: "list",
          data: body.input.map((_, index) => ({
            object: "embedding",
            index,
            embedding: [0.1, 0.2],
          })),
          model: "text-embedding-3-small",
          usage: {
            prompt_tokens: 7 * body.input.length,
            total_tokens: 7 * body.input.length,
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    const openAi: typeof fetch = Object.assign(respond, {
      preconnect: globalThis.fetch.preconnect,
    });

    test("reports each call's tokens to the meter of the work that made it", async () => {
      const usage = EmbeddingUsageMeter.createFresh();
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
        usage,
        fetch: openAi,
      });
      const { usage: measured } = await usage.measure(async () => {
        await provider.generateEmbedding("a query");
        await provider.generateEmbeddings(["one", "two"]);
      });
      expect(measured).toEqual([
        { model: "text-embedding-3-small", tokens: 7 },
        { model: "text-embedding-3-small", tokens: 14 },
      ]);
    });
  });
});
