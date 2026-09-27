import { describe, expect, it } from "bun:test";
import type { LanguageModelUsage } from "ai";
import {
  guestTurnSettlement,
  openAiGuestPricingRevision,
  priceOpenAiGuestTurn,
} from "../src/openai-guest-pricing";

function stepUsage(
  input: number,
  cacheRead: number,
  output: number,
  reasoning = 0,
): LanguageModelUsage {
  return {
    inputTokens: input,
    inputTokenDetails: {
      noCacheTokens: input - cacheRead,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: undefined,
    },
    outputTokens: output,
    outputTokenDetails: {
      textTokens: output - reasoning,
      reasoningTokens: reasoning,
    },
    totalTokens: input + output,
  };
}

describe("guest turn pricing at the pinned Luna revision", () => {
  it("prices a turn from the usage the provider reported", () => {
    // 6,000 uncached × $0.20/M + 4,000 cached × $0.02/M + 500 output × $1.20/M
    expect(
      priceOpenAiGuestTurn({
        calls: [
          {
            input: 10_000,
            cacheRead: 4_000,
            cacheWrite: undefined,
            output: 500,
          },
        ],
      }),
    ).toEqual({
      state: "known",
      microUsd: 1_880,
      pricing: openAiGuestPricingRevision,
    });
  });

  it("charges a request over 272K input tokens at the long-context rates throughout", () => {
    // 300,000 × $0.40/M + 1,000 × $1.80/M
    expect(
      priceOpenAiGuestTurn({
        calls: [
          {
            input: 300_000,
            cacheRead: 0,
            cacheWrite: undefined,
            output: 1_000,
          },
        ],
      }),
    ).toMatchObject({ state: "known", microUsd: 121_800 });
  });

  it("prices each model call at its own tier and sums the turn", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [
          { input: 1_000, cacheRead: 0, cacheWrite: undefined, output: 100 },
          { input: 300_000, cacheRead: 0, cacheWrite: undefined, output: 100 },
        ],
      }),
    ).toMatchObject({ state: "known", microUsd: 200 + 120 + 120_000 + 180 });
  });

  it("charges cache writes at 1.25× the uncached input rate", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [{ input: 1_000, cacheRead: 0, cacheWrite: 1_000, output: 0 }],
      }),
    ).toMatchObject({ state: "known", microUsd: 250 });
  });

  it("rounds a fraction of a micro-dollar up, never down", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [{ input: 1, cacheRead: 0, cacheWrite: undefined, output: 0 }],
      }),
    ).toMatchObject({ state: "known", microUsd: 1 });
  });

  it("leaves cost unknown rather than guess the unpublished long-context cached rate", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [
          {
            input: 300_000,
            cacheRead: 1_000,
            cacheWrite: undefined,
            output: 10,
          },
        ],
      }),
    ).toEqual({ state: "unknown", reason: "unsupported-pricing" });
  });

  it("leaves cost unknown when a call reported no cached-input usage", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [
          {
            input: 1_000,
            cacheRead: undefined,
            cacheWrite: undefined,
            output: 10,
          },
        ],
      }),
    ).toEqual({ state: "unknown", reason: "missing-usage" });
  });
});

describe("guest turn settlement from the agent's steps", () => {
  it("sums each step's reported usage and prices it", () => {
    const settlement = guestTurnSettlement(
      [
        { usage: stepUsage(10_000, 4_000, 300, 100) },
        { usage: stepUsage(0, 0, 200) },
      ],
      priceOpenAiGuestTurn,
    );
    expect(settlement.usage).toEqual({
      modelCalls: 2,
      inputTokens: 10_000,
      cachedInputTokens: 4_000,
      outputTokens: 500,
      reasoningTokens: 100,
      embeddingTokens: 0,
    });
    expect(settlement.cost).toEqual({
      state: "known",
      microUsd: 1_880,
      pricing: openAiGuestPricingRevision,
    });
  });

  it("leaves cost unknown when a step reported no usage", () => {
    expect(
      guestTurnSettlement(
        [{ usage: stepUsage(10, 0, 1) }, {}],
        priceOpenAiGuestTurn,
      ).cost,
    ).toEqual({ state: "unknown", reason: "missing-usage" });
  });

  it("leaves cost unknown for a model without pricing", () => {
    expect(
      guestTurnSettlement([{ usage: stepUsage(10, 0, 1) }], undefined).cost,
    ).toEqual({ state: "unknown", reason: "unsupported-pricing" });
  });
});
