import { createOpenAI } from "@ai-sdk/openai";
import { embed, wrapLanguageModel } from "ai";
import type { QueryEmbedding } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { FetchLike } from "@brains/utils/fetch-like";
import type { GuestExecutionAccounting } from "./guest-turn-budget";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export interface GuestModelProfile {
  model: Model;
  accounting: GuestExecutionAccounting;
  /** One request per search; its complete cost must be included in the tool quote. */
  queryEmbedding: QueryEmbedding;
}
export interface OpenAiGuestProfileOptions {
  apiKey: string;
  /** Host assertion: semantic search/indexing is enabled. */
  embeddingsEnabled: boolean;
  /** Trusted transport injection for tests. Never derived from visitor input. */
  fetch?: FetchLike;
}

export const openAiGuestContextTokens = 1_050_000;
const modelId = "gpt-5.6-luna";
const endpoint = "https://api.openai.com/v1/responses";
const embeddingEndpoint = "https://api.openai.com/v1/embeddings";
export const openAiGuestEmbeddingModel = "text-embedding-3-small";
export const openAiGuestEmbeddingDimensions = 1536;
// Full published per-input ceiling (8192 tokens at $0.02/M), rounded up.
const embeddingCostMicroUsd = 164;
const embeddingWireSchema = z.strictObject({
  model: z.literal(openAiGuestEmbeddingModel),
  input: z.array(z.string().min(1).max(4000)).length(1),
  dimensions: z.literal(openAiGuestEmbeddingDimensions),
  encoding_format: z.enum(["float", "base64"]),
});
const tools = z.enum(["system_search", "system_get", "system_list"]);
const text = z.strictObject({
  type: z.enum(["input_text", "output_text"]),
  text: z.string(),
});
const input = z.union([
  z.strictObject({
    role: z.enum(["system", "developer", "user", "assistant"]),
    content: z.union([z.string(), z.array(text)]),
    id: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("function_call"),
    name: tools,
    call_id: z.string(),
    arguments: z.string(),
    id: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("function_call_output"),
    call_id: z.string(),
    output: z.string(),
  }),
  z.strictObject({
    type: z.literal("reasoning"),
    id: z.string().optional(),
    encrypted_content: z.string(),
    summary: z.array(
      z.strictObject({ type: z.literal("summary_text"), text: z.string() }),
    ),
  }),
]);
const wireSchema = z.strictObject({
  model: z.literal(modelId),
  input: z.array(input),
  max_output_tokens: z.number().int().positive().max(1200),
  store: z.literal(false),
  service_tier: z.literal("default"),
  reasoning: z.strictObject({ effort: z.literal("low") }),
  include: z.array(z.literal("reasoning.encrypted_content")).optional(),
  tools: z
    .array(
      z.strictObject({
        type: z.literal("function"),
        name: tools,
        description: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()),
        strict: z.boolean().optional(),
      }),
    )
    .optional(),
  tool_choice: z
    .union([
      z.enum(["auto", "none", "required"]),
      z.strictObject({ type: z.literal("function"), name: tools }),
    ])
    .optional(),
});

/**
 * Narrow direct-OpenAI profile. No online quote, tokenizer or fallback pricing.
 * Published Luna limits/prices: https://developers.openai.com/api/docs/models/gpt-5.6-luna
 * Quote the full context ceiling at LONG-context uncached rates ($0.40/M input,
 * $1.80/M output), including non-visible output. The wire policy below is part
 * of that proof: standard tier, no cache writes, no provider tools or redirects.
 * This is not a readiness declaration or permission to issue a paid request.
 */
export function createOpenAiGuestProfile(
  options: OpenAiGuestProfileOptions,
): GuestModelProfile {
  if (options.embeddingsEnabled !== true || !options.apiKey.trim())
    throw new Error("Guest profile unavailable");
  const send = options.fetch ?? globalThis.fetch;
  const guardedFetch = Object.assign(
    async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      if (
        (String(url) !== endpoint && String(url) !== embeddingEndpoint) ||
        init?.method !== "POST" ||
        typeof init.body !== "string" ||
        new TextEncoder().encode(init.body).byteLength > 32000
      )
        throw new Error("Guest provider request denied");
      let raw: unknown;
      try {
        raw = JSON.parse(init.body);
      } catch {
        throw new Error("Guest provider request denied");
      }
      if (String(url) === embeddingEndpoint) {
        const parsedEmbedding = embeddingWireSchema.safeParse(raw);
        if (!parsedEmbedding.success)
          throw new Error("Guest provider request denied");
        init.signal?.throwIfAborted();
        const response = await send(embeddingEndpoint, {
          ...init,
          redirect: "error",
        });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          throw new Error("Guest provider request denied");
        }
        return response;
      }
      const parsed = wireSchema.safeParse(raw);
      if (!parsed.success) throw new Error("Guest provider request denied");
      // The installed SDK does not yet expose prompt_cache_options. Explicit
      // mode without any breakpoints prevents writes, including implicit ones.
      // The strict input schema rejects native breakpoints/reference-only input.
      const body = JSON.stringify({
        ...parsed.data,
        prompt_cache_options: { mode: "explicit" },
      });
      if (new TextEncoder().encode(body).byteLength > 32000)
        throw new Error("Guest provider request denied");
      init.signal?.throwIfAborted();
      const response = await send(endpoint, {
        ...init,
        body,
        redirect: "error",
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error("Guest provider request denied");
      }
      return response;
    },
    {
      preconnect: (): void => {
        // Do not open speculative connections outside the validated request path.
      },
    },
  );
  const client = createOpenAI({
    apiKey: options.apiKey,
    // Never inherit OPENAI_BASE_URL, regional endpoints or third-party proxies.
    baseURL: "https://api.openai.com/v1",
    fetch: guardedFetch,
  });
  const base = client.responses(modelId);
  const model = wrapLanguageModel({
    model: base,
    middleware: {
      specificationVersion: "v3",
      transformParams: async ({ type, params }) => {
        if (
          type !== "generate" ||
          Object.keys(params.headers ?? {}).some(
            (key) => key.toLowerCase() !== "user-agent",
          ) ||
          (params.providerOptions &&
            Object.keys(params.providerOptions).length > 0) ||
          (params.responseFormat && params.responseFormat.type !== "text")
        )
          throw new Error("Guest provider request denied");
        params.abortSignal?.throwIfAborted();
        // Inject reviewed settings below the guest budget's untrusted-options
        // boundary, before SDK serialization (not after it chooses stored IDs).
        const bounded = {
          ...params,
          providerOptions: {
            openai: {
              store: false,
              serviceTier: "default",
              reasoningEffort: "low",
            },
          },
        };
        delete bounded.temperature;
        delete bounded.topP;
        return bounded;
      },
      wrapGenerate: async ({ doGenerate }) => {
        try {
          const result = await doGenerate();
          const tier = z
            .object({ openai: z.object({ serviceTier: z.literal("default") }) })
            .safeParse(result.providerMetadata);
          if (!tier.success || result.response?.modelId !== modelId)
            throw new Error("Guest provider pricing unavailable");
          return result;
        } catch {
          // SDK errors can retain request bodies, provider diagnostics and URLs.
          throw new Error("Guest provider unavailable");
        }
      },
    },
  });
  const accounting: GuestExecutionAccounting = {
    model: async (request) => {
      request.params.abortSignal?.throwIfAborted();
      const output = request.params.maxOutputTokens;
      if (
        request.provider !== base.provider ||
        request.modelId !== modelId ||
        !Number.isSafeInteger(output) ||
        output === undefined ||
        output <= 0 ||
        output > 1200
      )
        throw new Error("Guest accounting unavailable");
      return {
        inputTokens: openAiGuestContextTokens,
        maxCostMicroUsd: 420_000 + Math.ceil((output * 18) / 10),
      };
    },
    tool: async (request) => {
      request.signal.throwIfAborted();
      if (!tools.safeParse(request.name).success)
        throw new Error("Guest accounting unavailable");
      return {
        maxCostMicroUsd:
          request.name === "system_search" ? embeddingCostMicroUsd : 0,
      };
    },
  };
  const queryEmbedding: QueryEmbedding = async (query, signal) => {
    signal.throwIfAborted();
    try {
      const result = await embed({
        model: client.embedding(openAiGuestEmbeddingModel),
        value: query,
        abortSignal: signal,
        maxRetries: 0,
        providerOptions: {
          openai: { dimensions: openAiGuestEmbeddingDimensions },
        },
      });
      signal.throwIfAborted();
      if (
        !z
          .object({ model: z.literal(openAiGuestEmbeddingModel) })
          .safeParse(result.response?.body).success ||
        !Number.isSafeInteger(result.usage.tokens) ||
        result.usage.tokens < 0 ||
        result.usage.tokens > 8192 ||
        result.embedding.length !== openAiGuestEmbeddingDimensions ||
        !result.embedding.every(Number.isFinite)
      )
        throw new Error("Guest embedding bounds exceeded");
      const vector = new Float32Array(result.embedding);
      if (!vector.every(Number.isFinite))
        throw new Error("Guest embedding bounds exceeded");
      return vector;
    } catch {
      signal.throwIfAborted();
      throw new Error("Guest query embedding unavailable");
    }
  };
  return { model, accounting, queryEmbedding };
}
