import { describe, expect, it, mock } from "bun:test";
import { deferred } from "@brains/utils/deferred";
import { MockLanguageModelV3 } from "ai/test";
import {
  GuestTurnBudget,
  type GuestModelCall,
  type GuestExecutionAccounting,
} from "../src/guest-turn-budget";
import {
  testGuestExecution,
  testGuestAccounting,
} from "./fixtures/guest-execution";

type ModelReply = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
type ModelQuote = Awaited<ReturnType<GuestExecutionAccounting["model"]>>;
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

  it("rejects oversized request bytes and counted context tokens before the provider runs", async () => {
    for (const accounting of [
      testGuestAccounting,
      {
        ...testGuestAccounting,
        model: async (): Promise<ModelQuote> => ({
          inputTokens: 1_000_000,
          maxCostMicroUsd: 1,
        }),
      },
    ]) {
      const budget = new GuestTurnBudget(
        {
          ...testGuestExecution,
          limits: {
            ...testGuestExecution.limits,
            contextBytes: accounting === testGuestAccounting ? 1 : 32000,
          },
        },
        accounting,
      );
      const model = new MockLanguageModelV3();
      try {
        expect(budget.wrapModel(model).doGenerate(params)).rejects.toThrow(
          "Guest context limit exceeded",
        );
        expect(model.doGenerateCalls).toHaveLength(0);
      } finally {
        budget.dispose();
      }
    }
  });

  it("caps output across model steps and charges the same budget for tools and generation", async () => {
    const accounting: GuestExecutionAccounting = {
      model: async () => ({ inputTokens: 5, maxCostMicroUsd: 60 }),
      tool: async () => ({ maxCostMicroUsd: 30 }),
    };
    const budget = new GuestTurnBudget(
      {
        ...testGuestExecution,
        maxCostMicroUsd: 100,
        limits: { ...testGuestExecution.limits, outputTokens: 10 },
      },
      accounting,
    );
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "answer" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 7, text: 7, reasoning: 0 },
        },
        warnings: [],
      },
    });
    try {
      const wrapped = budget.wrapModel(model);
      await wrapped.doGenerate({ ...params, maxOutputTokens: 99999 });
      expect(model.doGenerateCalls[0]?.maxOutputTokens).toBe(10);
      await budget.executeTool("system_search", {}, async () => ({
        success: true,
      }));
      expect(wrapped.doGenerate(params)).rejects.toThrow(
        "Guest cost limit exceeded",
      );
      expect(model.doGenerateCalls).toHaveLength(1);
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

  it("reserves one shared cost allowance across concurrent tools and subsequent generation", async () => {
    const accounting: GuestExecutionAccounting = {
      model: async () => ({ inputTokens: 8000, maxCostMicroUsd: 5 }),
      tool: async () => ({ maxCostMicroUsd: 6 }),
    };
    const budget = new GuestTurnBudget(
      { ...testGuestExecution, maxCostMicroUsd: 10 },
      accounting,
    );
    const handler = mock(async () => ({ success: true }));
    const model = new MockLanguageModelV3();
    try {
      const results = await Promise.allSettled([
        budget.executeTool("system_get", {}, handler),
        budget.executeTool("system_get", {}, handler),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "rejected",
      ]);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(budget.wrapModel(model).doGenerate(params)).rejects.toThrow(
        "Guest cost limit exceeded",
      );
      expect(model.doGenerateCalls).toHaveLength(0);
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

  it("rejects invalid accounting rather than starting unpaid work", () => {
    for (const cost of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const accounting: GuestExecutionAccounting = {
        ...testGuestAccounting,
        model: async () => ({ inputTokens: 1, maxCostMicroUsd: cost }),
      };
      const budget = new GuestTurnBudget(testGuestExecution, accounting);
      const model = new MockLanguageModelV3();
      try {
        expect(budget.wrapModel(model).doGenerate(params)).rejects.toThrow(
          "Guest accounting unavailable",
        );
        expect(model.doGenerateCalls).toHaveLength(0);
      } finally {
        budget.dispose();
      }
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

  it("fails closed without leaking accounting service errors", () => {
    const budget = new GuestTurnBudget(testGuestExecution, {
      ...testGuestAccounting,
      model: async (): Promise<never> => {
        throw new Error("PRIVATE pricing backend details");
      },
    });
    const model = new MockLanguageModelV3();
    try {
      expect(budget.wrapModel(model).doGenerate(params)).rejects.toThrow(
        "Guest accounting unavailable",
      );
      expect(model.doGenerateCalls).toHaveLength(0);
    } finally {
      budget.dispose();
    }
  });

  it("rejects overlapping model calls against one output allowance", async () => {
    const quote = deferred<ModelQuote>();
    const entered = deferred();
    const budget = new GuestTurnBudget(testGuestExecution, {
      ...testGuestAccounting,
      model: (): Promise<ModelQuote> => {
        entered.resolve();
        return quote.promise;
      },
    });
    const model = new MockLanguageModelV3();
    try {
      const wrapped = budget.wrapModel(model);
      const first = Promise.resolve(wrapped.doGenerate(params)).catch(
        (error: unknown) => error,
      );
      await entered.promise;
      const second = wrapped.doGenerate(params);
      quote.reject(new Error("Accounting unavailable"));
      expect(second).rejects.toThrow("Guest model call already active");
      expect(await first).toMatchObject({
        message: "Guest accounting unavailable",
      });
      expect(model.doGenerateCalls).toHaveLength(0);
    } finally {
      budget.dispose();
    }
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

  it("keeps ignored cancellation pending and blocks late work once accounting returns", async () => {
    const controller = new AbortController();
    const counted = deferred<ModelQuote>();
    const entered = deferred();
    const budget = new GuestTurnBudget(
      testGuestExecution,
      {
        ...testGuestAccounting,
        model: (): Promise<ModelQuote> => {
          entered.resolve();
          return counted.promise;
        },
      },
      controller.signal,
    );
    const model = new MockLanguageModelV3();
    try {
      const pending = budget.wrapModel(model).doGenerate(params);
      await entered.promise;
      controller.abort(new Error("Guest request stopped"));
      counted.resolve({ inputTokens: 1, maxCostMicroUsd: 1 });
      expect(pending).rejects.toThrow("Guest request stopped");
      expect(model.doGenerateCalls).toHaveLength(0);
    } finally {
      budget.dispose();
    }
  });
});
