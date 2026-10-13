import type {
  GuestTurnCost,
  GuestTurnSettlement,
} from "@brains/contracts/chat";
import type { LanguageModelUsage } from "ai";
import type { EmbeddingUsage } from "./embedding-usage-meter";

/** What the provider reported for each model call of a guest turn. */
export interface GuestProviderUsage {
  calls: Array<{
    input: number;
    cacheRead: number | undefined;
    cacheWrite: number | undefined;
    /** Includes reasoning, as the provider bills it. */
    output: number;
  }>;
}

/** Prices a guest turn's reported usage; absent when the model is unpriced. */
export type GuestPricing = (usage: GuestProviderUsage) => GuestTurnCost;

/** Per-token rates in nano-dollars, so every published rate is an integer. */
interface TokenRates {
  input: number;
  /** Absent where the provider publishes no rate; such a call stays unknown. */
  cacheRead: number | undefined;
  cacheWrite: number;
  output: number;
}

interface ModelRates {
  revision: string;
  standard: TokenRates;
  /** Applies to the whole request once its input passes the threshold. */
  long: TokenRates;
}

const LONG_CONTEXT_THRESHOLD = 272_000;

/**
 * Published OpenAI rates per model, per 1M tokens. Above 272K input tokens the
 * whole request is billed at 2× input and 1.5× output; cache writes cost 1.25×
 * uncached input; output includes reasoning.
 *
 * gpt-5.6-luna, read 2026-09-26 from
 * https://developers.openai.com/api/docs/models/gpt-5.6-luna: input $0.20,
 * cached input $0.02, output $1.20. Its long-context cached-input rate is not
 * published, so such a request is left unknown rather than guessed.
 *
 * gpt-6-luna, read 2026-10-10 from
 * https://developers.openai.com/api/docs/models/gpt-6-luna: input $0.10,
 * cached input $0.01, cache writes $0.125, output $0.50; long context doubles
 * the cached-input rate too.
 */
const openAiModelRates: Readonly<Record<string, ModelRates>> = {
  "gpt-5.6-luna": {
    revision: "openai-gpt-5.6-luna-2026-09-26",
    standard: { input: 200, cacheRead: 20, cacheWrite: 250, output: 1_200 },
    long: { input: 400, cacheRead: undefined, cacheWrite: 500, output: 1_800 },
  },
  "gpt-6-luna": {
    revision: "openai-gpt-6-luna-2026-10-10",
    standard: { input: 100, cacheRead: 10, cacheWrite: 125, output: 500 },
    long: { input: 200, cacheRead: 20, cacheWrite: 250, output: 750 },
  },
};

/** The pricing label of a turn that made no model call. */
export const noModelCallPricing = "no-model-call";

type Priced = { nano: number } | Extract<GuestTurnCost, { state: "unknown" }>;

function priceCall(
  rates: ModelRates,
  call: GuestProviderUsage["calls"][number],
): Priced {
  if (call.cacheRead === undefined)
    return { state: "unknown", reason: "missing-usage" };
  // The guest wire policy sends no cache writes; the provider reports none.
  const cacheWrite = call.cacheWrite ?? 0;
  const uncached = call.input - call.cacheRead - cacheWrite;
  if (uncached < 0) return { state: "unknown", reason: "missing-usage" };
  const tier =
    call.input > LONG_CONTEXT_THRESHOLD ? rates.long : rates.standard;
  if (call.cacheRead > 0 && tier.cacheRead === undefined)
    return { state: "unknown", reason: "unsupported-pricing" };
  return {
    nano:
      uncached * tier.input +
      call.cacheRead * (tier.cacheRead ?? 0) +
      cacheWrite * tier.cacheWrite +
      call.output * tier.output,
  };
}

/**
 * A model's guest-turn pricing from its reported usage, never a quote; absent
 * for a model whose rates are not published here.
 */
export function openAiGuestPricing(
  modelId: string | undefined,
): GuestPricing | undefined {
  if (modelId === undefined) return undefined;
  const rates = openAiModelRates[modelId];
  if (!rates) return undefined;
  return (usage) => {
    const parts = usage.calls.map((call) => priceCall(rates, call));
    const unknown = parts.find(
      (part): part is Extract<Priced, { state: "unknown" }> => "state" in part,
    );
    if (unknown) return unknown;
    const nano = parts.reduce(
      (sum, part) => sum + ("nano" in part ? part.nano : 0),
      0,
    );
    return {
      state: "known",
      microUsd: Math.ceil(nano / 1_000),
      pricing: rates.revision,
    };
  };
}

/**
 * A guest turn's settlement from each model call's reported usage. A call that
 * reported no usage, or a model without pricing, leaves the cost unknown.
 */
export function guestTurnSettlement(
  steps: ReadonlyArray<{ usage?: LanguageModelUsage | undefined }>,
  pricing: GuestPricing | undefined,
): GuestTurnSettlement {
  const calls = steps.flatMap(({ usage }) =>
    usage?.inputTokens === undefined || usage.outputTokens === undefined
      ? []
      : [
          {
            input: usage.inputTokens,
            cacheRead: usage.inputTokenDetails.cacheReadTokens,
            cacheWrite: usage.inputTokenDetails.cacheWriteTokens,
            output: usage.outputTokens,
            reasoning: usage.outputTokenDetails.reasoningTokens ?? 0,
          },
        ],
  );
  const sum = (values: Array<number | undefined>): number =>
    values.reduce<number>((total, value) => total + (value ?? 0), 0);
  const missing = calls.length !== steps.length;
  return {
    usage: {
      modelCalls: steps.length,
      inputTokens: sum(calls.map((call) => call.input)),
      cachedInputTokens: sum(calls.map((call) => call.cacheRead)),
      outputTokens: sum(calls.map((call) => call.output)),
      reasoningTokens: sum(calls.map((call) => call.reasoning)),
      embeddingTokens: 0,
    },
    cost: missing
      ? { state: "unknown", reason: "missing-usage" }
      : pricing
        ? pricing({ calls })
        : { state: "unknown", reason: "unsupported-pricing" },
  };
}

/**
 * Published text-embedding-3-small rate, read on 2026-09-30 from
 * https://developers.openai.com/api/docs/models/text-embedding-3-small:
 * $0.02 per 1M tokens.
 */
export const openAiEmbeddingPricingRevision =
  "openai-text-embedding-3-small-2026-09-30";

/** Nano-dollars per token, by embedding model. */
const embeddingRates: Readonly<Record<string, number>> = {
  "text-embedding-3-small": 20,
};

/**
 * A guest turn's settlement with the embeddings it made: its searches and the
 * search that found its sources. Their tokens always count; their cost joins
 * a known cost at the model's rate, and an unpriced model leaves it unknown.
 */
export function withEmbeddingUsage(
  settlement: GuestTurnSettlement,
  embeddings: readonly EmbeddingUsage[],
): GuestTurnSettlement {
  if (embeddings.length === 0) return settlement;
  const tokens = embeddings.reduce((sum, call) => sum + call.tokens, 0);
  const usage = {
    ...settlement.usage,
    embeddingTokens: settlement.usage.embeddingTokens + tokens,
  };
  if (settlement.cost.state === "unknown")
    return { usage, cost: settlement.cost };
  const nanos = embeddings.map((call) => {
    const rate = embeddingRates[call.model];
    return rate === undefined ? undefined : call.tokens * rate;
  });
  if (nanos.includes(undefined))
    return { usage, cost: { state: "unknown", reason: "unsupported-pricing" } };
  const nano = nanos.reduce<number>((sum, part) => sum + (part ?? 0), 0);
  return {
    usage,
    cost: {
      state: "known",
      microUsd: settlement.cost.microUsd + Math.ceil(nano / 1_000),
      pricing: `${settlement.cost.pricing}+${openAiEmbeddingPricingRevision}`,
    },
  };
}
