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

/**
 * Published gpt-5.6-luna rates, read on 2026-09-26
 * from https://developers.openai.com/api/docs/models/gpt-5.6-luna: per 1M
 * tokens, input $0.20, cached input $0.02, output $1.20 up to 272K input
 * tokens; above that, 2× input and 1.5× output for the whole request. Cache
 * writes cost 1.25× uncached input. Output includes reasoning. The long-context cached-input rate is not
 * published, so such a request is left unknown rather than guessed.
 */
export const openAiGuestPricingRevision = "openai-gpt-5.6-luna-2026-09-26";

const LONG_CONTEXT_THRESHOLD = 272_000;
/** Hundredths of a micro-dollar per token, so every published rate is an integer. */
const rates = {
  standard: { input: 20, cacheRead: 2, cacheWrite: 25, output: 120 },
  long: { input: 40, cacheRead: undefined, cacheWrite: 50, output: 180 },
} as const;

type Priced = { centi: number } | Extract<GuestTurnCost, { state: "unknown" }>;

function priceCall(call: GuestProviderUsage["calls"][number]): Priced {
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
    centi:
      uncached * tier.input +
      call.cacheRead * (tier.cacheRead ?? 0) +
      cacheWrite * tier.cacheWrite +
      call.output * tier.output,
  };
}

/** A guest turn's cost from the provider's reported usage; never a quote. */
export function priceOpenAiGuestTurn(usage: GuestProviderUsage): GuestTurnCost {
  const parts: Priced[] = usage.calls.map(priceCall);
  const unknown = parts.find(
    (part): part is Extract<Priced, { state: "unknown" }> => "state" in part,
  );
  if (unknown) return unknown;
  const centi = parts.reduce(
    (sum, part) => sum + ("centi" in part ? part.centi : 0),
    0,
  );
  return {
    state: "known",
    microUsd: Math.ceil(centi / 100),
    pricing: openAiGuestPricingRevision,
  };
}

/**
 * A guest turn's settlement from each model call's reported usage. A call that
 * reported no usage, or a model without pricing, leaves the cost unknown.
 */
export function guestTurnSettlement(
  steps: ReadonlyArray<{ usage?: Partial<LanguageModelUsage> | undefined }>,
  pricing: GuestPricing | undefined,
): GuestTurnSettlement {
  const calls = steps.flatMap(({ usage }) =>
    usage?.inputTokens === undefined || usage.outputTokens === undefined
      ? []
      : [
          {
            input: usage.inputTokens,
            cacheRead: usage.inputTokenDetails?.cacheReadTokens,
            cacheWrite: usage.inputTokenDetails?.cacheWriteTokens,
            output: usage.outputTokens,
            reasoning: usage.outputTokenDetails?.reasoningTokens ?? 0,
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

/** Combine independently measured work without converting missing usage to zero cost. */
export function sumGuestSettlements(
  left: GuestTurnSettlement,
  right: GuestTurnSettlement,
): GuestTurnSettlement {
  const empty = (value: GuestTurnSettlement): boolean =>
    value.cost.state === "known" &&
    value.cost.microUsd === 0 &&
    Object.values(value.usage).every((amount) => amount === 0);
  if (empty(left)) return right;
  if (empty(right)) return left;
  const usage = {
    modelCalls: left.usage.modelCalls + right.usage.modelCalls,
    inputTokens: left.usage.inputTokens + right.usage.inputTokens,
    cachedInputTokens:
      left.usage.cachedInputTokens + right.usage.cachedInputTokens,
    outputTokens: left.usage.outputTokens + right.usage.outputTokens,
    reasoningTokens: left.usage.reasoningTokens + right.usage.reasoningTokens,
    embeddingTokens: left.usage.embeddingTokens + right.usage.embeddingTokens,
  };
  if (left.cost.state === "unknown") return { usage, cost: left.cost };
  if (right.cost.state === "unknown") return { usage, cost: right.cost };
  return {
    usage,
    cost: {
      state: "known",
      microUsd: left.cost.microUsd + right.cost.microUsd,
      pricing: [
        ...new Set([
          ...left.cost.pricing.split("+"),
          ...right.cost.pricing.split("+"),
        ]),
      ].join("+"),
    },
  };
}

/**
 * Published text-embedding-3-small rate, read on 2026-09-30 from
 * https://developers.openai.com/api/docs/models/text-embedding-3-small:
 * $0.02 per 1M tokens.
 */
export const openAiEmbeddingPricingRevision =
  "openai-text-embedding-3-small-2026-09-30";

/** Hundredths of a micro-dollar per token, by embedding model. */
const embeddingRates: Readonly<Record<string, number>> = {
  "text-embedding-3-small": 2,
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
  if (embeddings.some((call) => call.incomplete))
    return { usage, cost: { state: "unknown", reason: "missing-usage" } };
  if (settlement.cost.state === "unknown")
    return { usage, cost: settlement.cost };
  const centis = embeddings.map((call) => {
    const rate = embeddingRates[call.model];
    return rate === undefined ? undefined : call.tokens * rate;
  });
  if (centis.includes(undefined))
    return { usage, cost: { state: "unknown", reason: "unsupported-pricing" } };
  const centi = centis.reduce<number>((sum, part) => sum + (part ?? 0), 0);
  return {
    usage,
    cost: {
      state: "known",
      microUsd: settlement.cost.microUsd + Math.ceil(centi / 100),
      pricing: `${settlement.cost.pricing}+${openAiEmbeddingPricingRevision}`,
    },
  };
}
