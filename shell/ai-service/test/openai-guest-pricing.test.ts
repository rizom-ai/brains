import { describe, expect, it } from "bun:test";
import {
  openAiGuestPricingRevision,
  priceOpenAiGuestTurn,
} from "../src/openai-guest-pricing";

describe("guest turn pricing at the pinned Luna revision", () => {
  it("prices a turn from the usage the provider reported", () => {
    // 6,000 uncached × $0.20/M + 4,000 cached × $0.02/M + 500 output × $1.20/M
    // + an 800-token query embedding × $0.02/M
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
        embeddings: [800],
      }),
    ).toEqual({
      state: "known",
      microUsd: 1_896,
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
        embeddings: [],
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
        embeddings: [],
      }),
    ).toMatchObject({ state: "known", microUsd: 200 + 120 + 120_000 + 180 });
  });

  it("charges cache writes at 1.25× the uncached input rate", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [{ input: 1_000, cacheRead: 0, cacheWrite: 1_000, output: 0 }],
        embeddings: [],
      }),
    ).toMatchObject({ state: "known", microUsd: 250 });
  });

  it("rounds a fraction of a micro-dollar up, never down", () => {
    expect(
      priceOpenAiGuestTurn({
        calls: [{ input: 1, cacheRead: 0, cacheWrite: undefined, output: 0 }],
        embeddings: [],
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
        embeddings: [],
      }),
    ).toEqual({ state: "unknown", reason: "unsupported-pricing" });
  });

  it("leaves cost unknown when a call or embedding reported no usage", () => {
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
        embeddings: [],
      }),
    ).toEqual({ state: "unknown", reason: "missing-usage" });
    expect(
      priceOpenAiGuestTurn({ calls: [], embeddings: [undefined] }),
    ).toEqual({ state: "unknown", reason: "missing-usage" });
  });
});
