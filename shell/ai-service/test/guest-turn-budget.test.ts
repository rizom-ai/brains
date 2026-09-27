import { describe, expect, it, mock } from "bun:test";
import { deferred } from "@brains/utils/deferred";
import type { GuestTurnCost } from "@brains/contracts/chat";
import { MockLanguageModelV3 } from "ai/test";
import {
  GuestTurnBudget,
  type GuestModelCall,
  type GuestProviderUsage,
} from "../src/guest-turn-budget";
import {
  testGuestExecution,
  testGuestAccounting,
} from "./fixtures/guest-execution";

type ModelReply = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
function reply(outputTokens: number): ModelReply {
  return {
    content: [{ type: "text", text: "answer" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
    },
    warnings: [],
  };
}

const params: GuestModelCall = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
};

describe("guest turn budget", () => {
  it("refuses generation without verified server-side accounting", () => {
    expect(() => new GuestTurnBudget(testGuestExecution)).toThrow(
      "Guest accounting unavailable",
    );
  });

  it("rejects oversized request bytes before the provider runs, and a report beyond the context bound", async () => {
    const small = new GuestTurnBudget(
      {
        ...testGuestExecution,
        limits: { ...testGuestExecution.limits, contextBytes: 1 },
      },
      testGuestAccounting,
    );
    const model = new MockLanguageModelV3();
    try {
      expect(small.wrapModel(model).doGenerate(params)).rejects.toThrow(
        "Guest context limit exceeded",
      );
      expect(model.doGenerateCalls).toHaveLength(0);
    } finally {
      small.dispose();
    }
    const budget = new GuestTurnBudget(testGuestExecution, testGuestAccounting);
    const oversized = reply(1);
    const counted = new MockLanguageModelV3({
      doGenerate: {
        ...oversized,
        usage: {
          ...oversized.usage,
          inputTokens: {
            total: testGuestExecution.limits.contextTokens + 1,
            noCache: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
        },
      },
    });
    try {
      expect(budget.wrapModel(counted).doGenerate(params)).rejects.toThrow(
        "Guest provider exceeded accounted token bounds",
      );
    } finally {
      budget.dispose();
    }
  });

  it("bounds a turn by its caps alone, never refusing a call over cost", async () => {
    const budget = new GuestTurnBudget(
      { ...testGuestExecution, maxCostMicroUsd: 1 },
      testGuestAccounting,
    );
    const model = new MockLanguageModelV3({ doGenerate: reply(1) });
    const handler = mock(async () => ({ success: true }));
    try {
      const wrapped = budget.wrapModel(model);
      for (const _step of [1, 2, 3]) {
        await wrapped.doGenerate(params);
        await budget.executeTool("system_search", {}, handler);
      }
      expect(model.doGenerateCalls).toHaveLength(3);
      expect(handler).toHaveBeenCalledTimes(3);
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest model step limit exceeded",
      );
    } finally {
      budget.dispose();
    }
  });

  it("reduces the actual provider output ceiling on each step and enforces the step count", async () => {
    const replies = [reply(7), reply(3)];
    const model = new MockLanguageModelV3({
      doGenerate: async (): Promise<ModelReply> => {
        const result = replies.shift();
        if (!result) throw new Error("Unexpected provider call");
        return result;
      },
    });
    const budget = new GuestTurnBudget(
      {
        ...testGuestExecution,
        limits: { ...testGuestExecution.limits, outputTokens: 10 },
      },
      testGuestAccounting,
    );
    try {
      const wrapped = budget.wrapModel(model);
      await wrapped.doGenerate(params);
      await wrapped.doGenerate(params);
      expect(model.doGenerateCalls.map((call) => call.maxOutputTokens)).toEqual(
        [10, 3],
      );
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest output limit exceeded",
      );
      expect(model.doGenerateCalls).toHaveLength(2);
    } finally {
      budget.dispose();
    }
    const single = new GuestTurnBudget(
      {
        ...testGuestExecution,
        limits: { ...testGuestExecution.limits, toolSteps: 1 },
      },
      testGuestAccounting,
    );
    const singleModel = new MockLanguageModelV3({ doGenerate: reply(1) });
    try {
      const wrapped = single.wrapModel(singleModel);
      await wrapped.doGenerate(params);
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest model step limit exceeded",
      );
      expect(singleModel.doGenerateCalls).toHaveLength(1);
    } finally {
      single.dispose();
    }
  });

  it("requests cancellation at the deadline without pretending ignored work has stopped", async () => {
    const entered = deferred();
    const result = deferred<ModelReply>();
    const model = new MockLanguageModelV3({
      doGenerate: (): Promise<ModelReply> => {
        entered.resolve();
        return result.promise;
      },
    });
    const budget = new GuestTurnBudget(
      {
        ...testGuestExecution,
        limits: { ...testGuestExecution.limits, requestTimeoutSeconds: 1 },
      },
      testGuestAccounting,
    );
    const finished = mock(() => {});
    try {
      const pending = Promise.resolve(
        budget.wrapModel(model).doGenerate(params),
      )
        .finally(finished)
        .catch((error: unknown) => error);
      await entered.promise;
      if (!budget.signal.aborted)
        await new Promise<void>((resolve) =>
          budget.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        );
      expect(model.doGenerateCalls[0]?.abortSignal?.aborted).toBe(true);
      expect(finished).not.toHaveBeenCalled();
      result.resolve(reply(1));
      expect(await pending).toMatchObject({
        message: "Guest request deadline exceeded",
      });
      expect(finished).toHaveBeenCalledTimes(1);
    } finally {
      budget.dispose();
    }
  });

  it("caps provider attempts and total tool executions, including parallel calls", async () => {
    const budget = new GuestTurnBudget(
      {
        ...testGuestExecution,
        limits: { ...testGuestExecution.limits, toolCalls: 1 },
      },
      testGuestAccounting,
    );
    const handler = mock(async () => ({ success: true }));
    try {
      const results = await Promise.allSettled([
        budget.executeTool("system_search", {}, handler),
        budget.executeTool("system_search", {}, handler),
      ]);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(
        results.filter((entry) => entry.status === "rejected"),
      ).toHaveLength(1);
    } finally {
      budget.dispose();
    }
  });

  it("does not reuse the output allowance after an uncertain provider failure", () => {
    const model = new MockLanguageModelV3({
      doGenerate: async (): Promise<never> => {
        throw new Error("Connection lost");
      },
    });
    const budget = new GuestTurnBudget(testGuestExecution, testGuestAccounting);
    try {
      const wrapped = budget.wrapModel(model);
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest provider unavailable",
      );
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest output limit exceeded",
      );
      expect(model.doGenerateCalls).toHaveLength(1);
    } finally {
      budget.dispose();
    }
  });

  it("does not expose oversized tool results or invoke tools with oversized inputs", async () => {
    const budget = new GuestTurnBudget(
      {
        ...testGuestExecution,
        limits: { ...testGuestExecution.limits, toolResultCharacters: 100 },
      },
      testGuestAccounting,
    );
    const handler = mock(async () => ({
      success: true,
      data: "PRIVATE LARGE RESULT".repeat(100),
    }));
    try {
      const result = await budget.executeTool("system_get", {}, handler);
      expect(JSON.stringify(result)).not.toContain("PRIVATE");
      expect(result).toEqual({
        success: false,
        error: "Public retrieval exceeds guest result limit",
      });
      expect(
        budget.executeTool("system_get", { query: "x".repeat(5000) }, handler),
      ).rejects.toThrow("Guest tool input limit exceeded");
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      budget.dispose();
    }
  });

  it("rejects overlapping model calls against one output allowance", async () => {
    const answer = deferred<ModelReply>();
    const entered = deferred();
    const model = new MockLanguageModelV3({
      doGenerate: (): Promise<ModelReply> => {
        entered.resolve();
        return answer.promise;
      },
    });
    const budget = new GuestTurnBudget(testGuestExecution, testGuestAccounting);
    try {
      const wrapped = budget.wrapModel(model);
      const first = wrapped.doGenerate(params);
      await entered.promise;
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest model call already active",
      );
      answer.resolve(reply(1));
      expect(await first).toMatchObject({ finishReason: { unified: "stop" } });
      expect(model.doGenerateCalls).toHaveLength(1);
    } finally {
      budget.dispose();
    }
  });

  it("requests cancellation on disposal without claiming that an active tool has stopped", async () => {
    const budget = new GuestTurnBudget(testGuestExecution, testGuestAccounting);
    const entered = deferred<void>();
    const release = deferred<void>();
    let settled = false;
    const pending = budget
      .executeTool("system_get", {}, async () => {
        entered.resolve();
        await release.promise;
        return { success: true };
      })
      .catch(() => null)
      .finally(() => {
        settled = true;
      });
    await entered.promise;
    budget.dispose();
    expect(budget.signal.aborted).toBe(true);
    await Promise.resolve();
    expect(settled).toBe(false);
    release.resolve();
    expect(await pending).toBeNull();
  });

  it("does not permit new work after its budget is disposed", () => {
    const budget = new GuestTurnBudget(testGuestExecution, testGuestAccounting);
    budget.dispose();
    const handler = mock(async () => ({ success: true }));
    expect(budget.executeTool("system_get", {}, handler)).rejects.toThrow(
      "Guest budget closed",
    );
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("guest turn settlement", () => {
  function reporting(): MockLanguageModelV3 {
    return new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "answer" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: {
            total: 5,
            noCache: 3,
            cacheRead: 2,
            cacheWrite: undefined,
          },
          outputTokens: { total: 7, text: 5, reasoning: 2 },
        },
        warnings: [],
      },
    });
  }

  it("settles from the usage the provider reported", async () => {
    const priced: GuestProviderUsage[] = [];
    const budget = new GuestTurnBudget(testGuestExecution, {
      ...testGuestAccounting,
      settle: (usage): GuestTurnCost => {
        priced.push(usage);
        return { state: "known", microUsd: 42, pricing: "test-revision" };
      },
    });
    try {
      await budget.wrapModel(reporting()).doGenerate(params);
      budget.embedded(12);
      expect(budget.settlement()).toEqual({
        usage: {
          modelCalls: 1,
          inputTokens: 5,
          cachedInputTokens: 2,
          outputTokens: 7,
          reasoningTokens: 2,
          embeddingTokens: 12,
        },
        cost: { state: "known", microUsd: 42, pricing: "test-revision" },
      });
      expect(priced).toEqual([
        {
          calls: [{ input: 5, cacheRead: 2, cacheWrite: undefined, output: 7 }],
          embeddings: [12],
        },
      ]);
    } finally {
      budget.dispose();
    }
  });

  it("leaves cost unknown when the accounting cannot price the turn, without its error", async () => {
    const unpriced = new GuestTurnBudget(
      testGuestExecution,
      testGuestAccounting,
    );
    const failing = new GuestTurnBudget(testGuestExecution, {
      ...testGuestAccounting,
      settle: (): never => {
        throw new Error("private-pricing-detail");
      },
    });
    try {
      await unpriced.wrapModel(reporting()).doGenerate(params);
      await failing.wrapModel(reporting()).doGenerate(params);
      expect(unpriced.settlement().cost).toEqual({
        state: "unknown",
        reason: "unsupported-pricing",
      });
      expect(failing.settlement().cost).toEqual({
        state: "unknown",
        reason: "unsupported-pricing",
      });
    } finally {
      unpriced.dispose();
      failing.dispose();
    }
  });

  it("passes an embedding that reported no usage on as missing", () => {
    const priced: GuestProviderUsage[] = [];
    const budget = new GuestTurnBudget(testGuestExecution, {
      ...testGuestAccounting,
      settle: (usage): GuestTurnCost => {
        priced.push(usage);
        return { state: "unknown", reason: "missing-usage" };
      },
    });
    try {
      budget.embedded(undefined);
      expect(budget.settlement().cost).toEqual({
        state: "unknown",
        reason: "missing-usage",
      });
      expect(priced[0]?.embeddings).toEqual([undefined]);
    } finally {
      budget.dispose();
    }
  });
});
