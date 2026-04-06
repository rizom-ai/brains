import { describe, test, expect, afterEach } from "bun:test";
import { OnlineEmbeddingProvider } from "../src/online-embedding-provider";
import { createSilentLogger } from "@brains/test-utils";

describe("OnlineEmbeddingProvider", () => {
  afterEach(() => {
    OnlineEmbeddingProvider.resetInstance();
  });

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
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(provider).toBeDefined();
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

  describe("singleton", () => {
    test("getInstance returns same instance", () => {
      const a = OnlineEmbeddingProvider.getInstance({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      const b = OnlineEmbeddingProvider.getInstance({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(a).toBe(b);
    });

    test("resetInstance clears singleton", () => {
      const a = OnlineEmbeddingProvider.getInstance({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      OnlineEmbeddingProvider.resetInstance();
      const b = OnlineEmbeddingProvider.getInstance({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(a).not.toBe(b);
    });
  });

  describe("implements IEmbeddingService", () => {
    test("has dimensions property", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(provider.dimensions).toBe(1536);
    });

    test("has generateEmbedding method", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(typeof provider.generateEmbedding).toBe("function");
    });

    test("has generateEmbeddings method", () => {
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        logger: createSilentLogger(),
      });
      expect(typeof provider.generateEmbeddings).toBe("function");
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
  });
});
