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

  describe("input over the model's limit", () => {
    // OpenAI's limits, with one token per UTF-8 byte: the most a byte-level
    // tokenizer can produce, so passing here passes against the real API.
    const MAX_INPUT_TOKENS = 8_191;
    const MAX_REQUEST_TOKENS = 300_000;
    const MAX_REQUEST_INPUTS = 2_048;
    const bytes = (text: string): number => Buffer.byteLength(text, "utf8");
    // A distinct direction per input, so a combination is checkable.
    const vectorOf = (text: string): number[] => [(bytes(text) % 7) + 1, 1];

    function fakeOpenAi(): { fetch: typeof fetch; requests: string[][] } {
      const requests: string[][] = [];
      const respond = async (
        _input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const { input } = requestSchema.parse(JSON.parse(String(init?.body)));
        requests.push(input);
        const tooLong = input.findIndex(
          (text) => bytes(text) > MAX_INPUT_TOKENS,
        );
        const total = input.reduce((sum, text) => sum + bytes(text), 0);
        if (
          tooLong >= 0 ||
          total > MAX_REQUEST_TOKENS ||
          input.length > MAX_REQUEST_INPUTS
        ) {
          return new Response(
            JSON.stringify({
              error: {
                message: `Invalid 'input[${Math.max(tooLong, 0)}]': maximum input length is 8192 tokens.`,
                type: "invalid_request_error",
                param: null,
                code: null,
              },
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            object: "list",
            data: input.map((text, index) => ({
              object: "embedding",
              index,
              embedding: vectorOf(text),
            })),
            model: "text-embedding-3-small",
            usage: { prompt_tokens: total, total_tokens: total },
          }),
          { headers: { "content-type": "application/json" } },
        );
      };
      return {
        fetch: Object.assign(respond, {
          preconnect: globalThis.fetch.preconnect,
        }),
        requests,
      };
    }

    function providerFor(api: {
      fetch: typeof fetch;
    }): OnlineEmbeddingProvider {
      return OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        dimensions: 2,
        logger: createSilentLogger(),
        fetch: api.fetch,
      });
    }

    const paragraph = (index: number): string =>
      `Paragraph ${index} ${"about a long note on new institutions ".repeat(40)}`.trim();
    const longNote = Array.from({ length: 40 }, (_, index) =>
      paragraph(index),
    ).join("\n\n");

    const normalize = (vector: number[]): number[] => {
      const norm = Math.hypot(...vector);
      return vector.map((value) => value / norm);
    };
    const withoutWhitespace = (text: string): string =>
      text.replace(/\s+/gu, "");

    test("sends input within the limit unchanged, in one request", async () => {
      const api = fakeOpenAi();
      await providerFor(api).generateEmbedding("a short query");
      expect(api.requests).toEqual([["a short query"]]);
    });

    test("embeds a note longer than the limit from every part of it", async () => {
      expect(bytes(longNote)).toBeGreaterThan(4 * MAX_INPUT_TOKENS);
      const api = fakeOpenAi();

      const { embedding } = await providerFor(api).generateEmbedding(longNote);

      const chunks = api.requests.flat();
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(bytes(chunk)).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
      }
      // Nothing is dropped: the chunks hold the whole note, in order.
      expect(withoutWhitespace(chunks.join(""))).toBe(
        withoutWhitespace(longNote),
      );
      const expected = normalize(
        chunks.reduce(
          (sum, chunk) => {
            const vector = vectorOf(chunk);
            return [
              (sum[0] ?? 0) + bytes(chunk) * (vector[0] ?? 0),
              (sum[1] ?? 0) + bytes(chunk) * (vector[1] ?? 0),
            ];
          },
          [0, 0],
        ),
      );
      expect(embedding.length).toBe(2);
      expect(embedding[0]).toBeCloseTo(expected[0] ?? 0, 5);
      expect(embedding[1]).toBeCloseTo(expected[1] ?? 0, 5);
    });

    test("splits at paragraph boundaries when the paragraphs fit", async () => {
      const api = fakeOpenAi();
      await providerFor(api).generateEmbedding(longNote);

      for (const chunk of api.requests.flat()) {
        expect(chunk).toMatch(/^Paragraph \d+ /u);
        expect(chunk).toMatch(/institutions$/u);
      }
    });

    test("splits one oversized run of text without breaking a character", async () => {
      const run = "é🌍".repeat(5_000);
      const api = fakeOpenAi();

      await providerFor(api).generateEmbedding(run);

      const chunks = api.requests.flat();
      for (const chunk of chunks) {
        expect(bytes(chunk)).toBeLessThanOrEqual(MAX_INPUT_TOKENS);
        expect(chunk).not.toContain("\uFFFD");
        expect(Buffer.from(chunk, "utf8").toString("utf8")).toBe(chunk);
      }
      expect(chunks.join("")).toBe(run);
    });

    test("keeps every request within the per-request limits", async () => {
      const huge = Array.from({ length: 900 }, (_, index) =>
        paragraph(index),
      ).join("\n\n");
      expect(bytes(huge)).toBeGreaterThan(MAX_REQUEST_TOKENS);
      const api = fakeOpenAi();

      const { usage } = await providerFor(api).generateEmbedding(huge);

      expect(api.requests.length).toBeGreaterThan(1);
      const sent = api.requests.flat();
      expect(usage.tokens).toBe(
        sent.reduce((sum, chunk) => sum + bytes(chunk), 0),
      );
    });

    test("returns one embedding per text, in order, those within the limit as given", async () => {
      const api = fakeOpenAi();

      const { embeddings } = await providerFor(api).generateEmbeddings([
        "first",
        longNote,
        "third",
      ]);

      expect(embeddings).toHaveLength(3);
      expect(Array.from(embeddings[0] ?? [])).toEqual(vectorOf("first"));
      expect(Array.from(embeddings[2] ?? [])).toEqual(vectorOf("third"));
    });

    test("reports a chunked call's tokens once, as the sum of its requests", async () => {
      const usage = EmbeddingUsageMeter.createFresh();
      const api = fakeOpenAi();
      const provider = OnlineEmbeddingProvider.createFresh({
        apiKey: "test-key",
        dimensions: 2,
        logger: createSilentLogger(),
        usage,
        fetch: api.fetch,
      });

      const { usage: measured } = await usage.measure(() =>
        provider.generateEmbedding(longNote),
      );

      expect(measured).toEqual([
        {
          model: "text-embedding-3-small",
          tokens: bytes(api.requests.flat().join("")),
        },
      ]);
    });
  });
});
