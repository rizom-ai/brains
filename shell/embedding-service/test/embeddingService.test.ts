import { describe, expect, it, beforeEach, mock, afterEach } from "bun:test";
import { EmbeddingService } from "@/embeddingService";
import { createSilentLogger } from "@brains/utils";
import * as fastembed from "fastembed";

// Mock the fastembed module
const mockEmbedModel = {
  embed: mock((texts: string[]): AsyncGenerator<number[][], void, unknown> => {
    // Return async generator that yields batches of embeddings
    return (async function* (): AsyncGenerator<number[][], void, unknown> {
      const embeddings = texts.map(() => new Array(384).fill(0.1));
      yield embeddings;
    })();
  }),
};

void mock.module("fastembed", () => ({
  EmbeddingModel: {
    AllMiniLML6V2: "fast-all-MiniLM-L6-v2", // Use the actual value
  },
  FlagEmbedding: {
    init: mock(() => Promise.resolve(mockEmbedModel)),
  },
}));

// Mock node:os for tmpdir
void mock.module("node:os", () => ({
  tmpdir: (): string => "/tmp",
}));

describe("EmbeddingService", () => {
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    EmbeddingService.resetInstance();
    logger = createSilentLogger();
    // Reset mocks
    (fastembed.FlagEmbedding.init as ReturnType<typeof mock>).mockClear();
    (mockEmbedModel.embed as ReturnType<typeof mock>).mockClear();
  });

  afterEach(() => {
    EmbeddingService.resetInstance();
  });

  describe("Component Interface Standardization", () => {
    it("should implement singleton pattern", () => {
      const instance1 = EmbeddingService.getInstance(logger);
      const instance2 = EmbeddingService.getInstance(logger);

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = EmbeddingService.getInstance(logger);

      EmbeddingService.resetInstance();

      const instance2 = EmbeddingService.getInstance(logger);
      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance without affecting singleton", () => {
      const singleton = EmbeddingService.getInstance(logger);
      const fresh = EmbeddingService.createFresh(logger);

      expect(fresh).not.toBe(singleton);
      expect(EmbeddingService.getInstance(logger)).toBe(singleton);
    });
  });

  describe("Initialization", () => {
    it("should initialize model on first use", async () => {
      const service = EmbeddingService.createFresh(logger);

      await service.generateEmbedding("test");

      expect(fastembed.FlagEmbedding.init).toHaveBeenCalledTimes(1);
      const initCall = (fastembed.FlagEmbedding.init as ReturnType<typeof mock>)
        .mock.calls[0]?.[0];
      expect(initCall.model).toBe("fast-all-MiniLM-L6-v2");
      expect(initCall.maxLength).toBe(512);
      expect(initCall.cacheDir).toBe("./cache/embeddings");
      expect(initCall.showDownloadProgress).toBe(false);
    });

    it("should only initialize once", async () => {
      const service = EmbeddingService.createFresh(logger);

      await service.generateEmbedding("test1");
      await service.generateEmbedding("test2");
      await service.generateEmbedding("test3");

      expect(fastembed.FlagEmbedding.init).toHaveBeenCalledTimes(1);
    });


    it("should handle initialization errors", async () => {
      const service = EmbeddingService.createFresh(logger);
      const error = new Error("Model loading failed");

      (
        fastembed.FlagEmbedding.init as ReturnType<typeof mock>
      ).mockRejectedValueOnce(error);

      void expect(service.generateEmbedding("test")).rejects.toThrow(
        "Failed to initialize embedding model: Error: Model loading failed",
      );
    });

    it("should handle concurrent initialization requests", async () => {
      const service = EmbeddingService.createFresh(logger);

      // Delay the initialization to test concurrent calls
      (
        fastembed.FlagEmbedding.init as ReturnType<typeof mock>
      ).mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockEmbedModel), 10),
          ),
      );

      // Call generateEmbedding multiple times concurrently
      const promises = [
        service.generateEmbedding("test1"),
        service.generateEmbedding("test2"),
        service.generateEmbedding("test3"),
      ];

      await Promise.all(promises);

      // Should only initialize once
      expect(fastembed.FlagEmbedding.init).toHaveBeenCalledTimes(1);
    });
  });

  describe("Single Embedding Generation", () => {
    it("should generate embedding for text", async () => {
      const service = EmbeddingService.createFresh(logger);

      const embedding = await service.generateEmbedding("Hello, world!");

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
      expect(embedding[0]).toBeCloseTo(0.1);

      expect(mockEmbedModel.embed).toHaveBeenCalledWith(["Hello, world!"]);
    });

    it("should handle empty text", async () => {
      const service = EmbeddingService.createFresh(logger);

      const embedding = await service.generateEmbedding("");

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("should handle very long text", async () => {
      const service = EmbeddingService.createFresh(logger);
      const longText = "x".repeat(1000);

      const embedding = await service.generateEmbedding(longText);

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("should handle special characters", async () => {
      const service = EmbeddingService.createFresh(logger);
      const specialText = "Hello 👋 World 🌍 with émojis and spëcial çhars!";

      const embedding = await service.generateEmbedding(specialText);

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("should throw if no embedding is generated", async () => {
      const service = EmbeddingService.createFresh(logger);

      // Mock embed to return empty batch
      (mockEmbedModel.embed as ReturnType<typeof mock>).mockImplementationOnce(
        (): AsyncGenerator<number[][], void, unknown> => {
          return (async function* (): AsyncGenerator<
            number[][],
            void,
            unknown
          > {
            yield [];
          })();
        },
      );

      void expect(service.generateEmbedding("test")).rejects.toThrow(
        "No embedding generated for text",
      );
    });

    it("should validate embedding dimensions", async () => {
      const service = EmbeddingService.createFresh(logger);

      // Mock embed to return wrong dimensions
      (mockEmbedModel.embed as ReturnType<typeof mock>).mockImplementationOnce(
        (): AsyncGenerator<number[][], void, unknown> => {
          return (async function* (): AsyncGenerator<
            number[][],
            void,
            unknown
          > {
            yield [new Array(256).fill(0.1)]; // Wrong dimensions
          })();
        },
      );

      void expect(service.generateEmbedding("test")).rejects.toThrow(
        "Invalid embedding dimensions: expected 384, got 256",
      );
    });

    it("should handle generation errors", async () => {
      const service = EmbeddingService.createFresh(logger);

      (mockEmbedModel.embed as ReturnType<typeof mock>).mockImplementationOnce(
        (): AsyncGenerator<number[][], void, unknown> => {
          throw new Error("Embedding generation failed");
        },
      );

      void expect(service.generateEmbedding("test")).rejects.toThrow(
        "Failed to generate embedding: Error: Embedding generation failed",
      );
    });
  });

  describe("Batch Embedding Generation", () => {
    it("should generate embeddings for multiple texts", async () => {
      const service = EmbeddingService.createFresh(logger);
      const texts = ["Hello", "World", "Test"];

      const embeddings = await service.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toBeInstanceOf(Float32Array);
      expect(embeddings[0]?.length).toBe(384);
      expect(embeddings[1]).toBeInstanceOf(Float32Array);
      expect(embeddings[2]).toBeInstanceOf(Float32Array);

      expect(mockEmbedModel.embed).toHaveBeenCalledWith(texts);
    });

    it("should handle empty array", async () => {
      const service = EmbeddingService.createFresh(logger);

      const embeddings = await service.generateEmbeddings([]);

      expect(embeddings).toEqual([]);
    });

    it("should handle single text in batch", async () => {
      const service = EmbeddingService.createFresh(logger);

      const embeddings = await service.generateEmbeddings(["single"]);

      expect(embeddings).toHaveLength(1);
      expect(embeddings[0]).toBeInstanceOf(Float32Array);
    });

    it("should handle large batches", async () => {
      const service = EmbeddingService.createFresh(logger);
      const texts = Array(100).fill("text");

      // Mock to return embeddings in multiple batches
      (mockEmbedModel.embed as ReturnType<typeof mock>).mockImplementationOnce(
        (): AsyncGenerator<number[][], void, unknown> => {
          return (async function* (): AsyncGenerator<
            number[][],
            void,
            unknown
          > {
            // Yield in batches of 25
            for (let i = 0; i < 100; i += 25) {
              const batch = Array(25).fill(new Array(384).fill(0.1));
              yield batch;
            }
          })();
        },
      );

      const embeddings = await service.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(100);
    });

    it("should handle batch generation errors", async () => {
      const service = EmbeddingService.createFresh(logger);

      (mockEmbedModel.embed as ReturnType<typeof mock>).mockImplementationOnce(
        (): AsyncGenerator<number[][], void, unknown> => {
          throw new Error("Batch generation failed");
        },
      );

      void expect(
        service.generateEmbeddings(["test1", "test2"]),
      ).rejects.toThrow(
        "Failed to generate embeddings: Error: Batch generation failed",
      );
    });
  });

  describe("Edge Cases", () => {
    it("should throw if model is not initialized", async () => {
      const service = EmbeddingService.createFresh(logger);

      // Mock init to return null model
      (
        fastembed.FlagEmbedding.init as ReturnType<typeof mock>
      ).mockResolvedValueOnce(null);

      void expect(service.generateEmbedding("test")).rejects.toThrow(
        "Embedding model not initialized",
      );
    });

    it("should handle Unicode text correctly", async () => {
      const service = EmbeddingService.createFresh(logger);
      const unicodeText = "Hello 世界 مرحبا мир";

      const embedding = await service.generateEmbedding(unicodeText);

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });

    it("should handle newlines and whitespace", async () => {
      const service = EmbeddingService.createFresh(logger);
      const textWithWhitespace = "Line 1\n\nLine 2\t\tTabbed";

      const embedding = await service.generateEmbedding(textWithWhitespace);

      expect(embedding).toBeInstanceOf(Float32Array);
      expect(embedding.length).toBe(384);
    });
  });
});
