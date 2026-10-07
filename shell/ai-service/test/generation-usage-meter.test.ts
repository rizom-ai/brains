import { describe, expect, it } from "bun:test";
import { caughtError } from "@brains/test-utils";
import { GenerationUsageMeter } from "../src/generation-usage-meter";
import { EmbeddingUsageMeter } from "../src/embedding-usage-meter";
import {
  guestTurnSettlement,
  priceOpenAiGuestTurn,
  withEmbeddingUsage,
} from "../src/openai-guest-pricing";

describe("auxiliary usage scopes", () => {
  it("does not certify zero embedding spend for an uninstrumented injected provider", async () => {
    const measured = await EmbeddingUsageMeter.createFresh(false).measure(
      async () => undefined,
    );
    const settlement = withEmbeddingUsage(
      guestTurnSettlement([], priceOpenAiGuestTurn),
      measured.usage,
    );
    expect(settlement.cost).toEqual({
      state: "unknown",
      reason: "missing-usage",
    });
    expect(settlement.usage.embeddingTokens).toBe(0);
  });
  it("isolates concurrent generation measurements and refuses late calls", async () => {
    const meter = GenerationUsageMeter.createFresh();
    const gate = Promise.withResolvers<void>();
    let late: Promise<unknown> = Promise.resolve();
    const [left, right] = await Promise.all([
      meter.measure(async () => {
        await Promise.resolve();
        const call = meter.begin("gpt-5.6-luna");
        if (!call) throw new Error("Missing measurement");
        call.finish({
          inputTokens: 10,
          outputTokens: 3,
          totalTokens: 13,
          inputTokenDetails: {
            noCacheTokens: 10,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
        });
        late = gate.promise.then(() => meter.begin("gpt-5.6-luna"));
      }),
      meter.measure(async () => {
        meter.begin("unpriced");
        meter.begin("unpriced");
      }),
    ]);
    gate.resolve();
    expect(await late.catch(caughtError)).toBeInstanceOf(Error);
    expect(left.settlement.usage.modelCalls).toBe(1);
    expect(left.settlement.cost).toMatchObject({ state: "known", microUsd: 6 });
    expect(right.settlement.usage.modelCalls).toBe(2);
    expect(right.settlement.cost.state).toBe("unknown");
    expect(meter.begin("gpt-5.6-luna")).toBeUndefined();
  });

  it("keeps unfinished embeddings unknown and detaches their settlement on scope exit", async () => {
    const meter = EmbeddingUsageMeter.createFresh();
    const measured = await meter.measure(async () => ({
      call: meter.begin("text-embedding-3-small"),
      signal: meter.currentSignal(),
    }));
    expect(measured.usage).toEqual([
      { model: "text-embedding-3-small", tokens: 0, incomplete: true },
    ]);
    expect(measured.value.signal?.aborted).toBe(true);
    measured.value.call?.finish(500);
    expect(measured.usage).toEqual([
      { model: "text-embedding-3-small", tokens: 0, incomplete: true },
    ]);
  });

  it("refuses already-cancelled work before auxiliary provider admission", async () => {
    const controller = new AbortController();
    const reason = new Error("Guest cancelled");
    controller.abort(reason);
    let entered = false;
    const work = async (): Promise<void> => {
      entered = true;
    };
    expect(
      await GenerationUsageMeter.createFresh()
        .measure(work, controller.signal)
        .catch(caughtError),
    ).toBe(reason);
    expect(
      await EmbeddingUsageMeter.createFresh()
        .measure(work, controller.signal)
        .catch(caughtError),
    ).toBe(reason);
    expect(entered).toBe(false);
  });
});
