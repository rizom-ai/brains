import { describe, expect, it, mock, spyOn } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { deferred } from "@brains/utils/deferred";
import {
  GuestTurnBudget,
  type GuestExecutionAccounting,
  type GuestModelCall,
} from "../src/guest-turn-budget";
import {
  testGuestExecution,
  testGuestAccounting,
} from "./fixtures/guest-execution";

const policy = {
  ...testGuestExecution,
  limits: { ...testGuestExecution.limits, requestTimeoutSeconds: 1 },
};
const params: GuestModelCall = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
};

describe("guest elapsed-time deadlines", () => {
  for (const operation of ["model", "tool"] as const) {
    it(`blocks ${operation} execution after accounting crosses the deadline without a timer tick`, async () => {
      let now = 100;
      const accounting: GuestExecutionAccounting = {
        model: async () => {
          now = 1100;
          return { inputTokens: 1, maxCostMicroUsd: 1 };
        },
        tool: async () => {
          now = 1100;
          return { maxCostMicroUsd: 1 };
        },
      };
      const budget = new GuestTurnBudget(
        policy,
        accounting,
        undefined,
        () => now,
      );
      const model = new MockLanguageModelV3();
      const handler = mock(async () => ({ success: true }));
      try {
        const pending =
          operation === "model"
            ? Promise.resolve(budget.wrapModel(model).doGenerate(params))
            : budget.executeTool("system_get", {}, handler);
        const error: unknown = await pending.catch((error: unknown) => error);
        expect(error).toMatchObject({
          message: "Guest request deadline exceeded",
        });
        expect(model.doGenerateCalls).toHaveLength(0);
        expect(handler).not.toHaveBeenCalled();
        expect(budget.signal.aborted).toBe(true);
      } finally {
        budget.dispose();
      }
    });
  }

  it("admits work just before the deadline, then keeps ignored cancellation pending", async () => {
    let now = 100;
    const entered = deferred<void>();
    const release = deferred<void>();
    const budget = new GuestTurnBudget(
      policy,
      testGuestAccounting,
      undefined,
      () => now,
    );
    let settled = false;
    try {
      now = 1099;
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
      now = 1100;
      expect(budget.exhausted()).toBe(true);
      expect(budget.signal.aborted).toBe(true);
      await Promise.resolve();
      expect(settled).toBe(false);
      release.resolve();
      expect(await pending).toBeNull();
    } finally {
      release.resolve();
      budget.dispose();
    }
  });

  it("rejects expired work before even starting accounting", async () => {
    let now = 0;
    const quote = mock(testGuestAccounting.tool);
    const budget = new GuestTurnBudget(
      policy,
      { ...testGuestAccounting, tool: quote },
      undefined,
      () => now,
    );
    try {
      now = 1000;
      expect(
        await budget
          .executeTool("system_get", {}, async () => ({ success: true }))
          .catch(() => null),
      ).toBeNull();
      expect(quote).not.toHaveBeenCalled();
    } finally {
      budget.dispose();
    }
  });

  it("fails closed on invalid, regressing or failed clock readings without exposing errors", async () => {
    for (const invalid of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        () =>
          new GuestTurnBudget(
            policy,
            testGuestAccounting,
            undefined,
            () => invalid,
          ),
      ).toThrow("Guest execution clock unavailable");
    }
    for (const failure of ["rollback", "invalid", "exception"] as const) {
      let failing = false;
      const budget = new GuestTurnBudget(
        policy,
        testGuestAccounting,
        undefined,
        () => {
          if (!failing) return 100;
          if (failure === "exception")
            throw new Error("PRIVATE clock backend details");
          return failure === "rollback" ? 99 : NaN;
        },
      );
      try {
        failing = true;
        const error: unknown = await budget
          .executeTool("system_get", {}, async () => ({ success: true }))
          .catch((error: unknown) => error);
        expect(error).toMatchObject({
          message: "Guest execution clock unavailable",
        });
        expect(error).not.toHaveProperty("cause");
        expect(budget.exhausted()).toBe(true);
      } finally {
        budget.dispose();
      }
    }
  });

  it("observes elapsed wall time on resume even before the timer runs", () => {
    const nativeNow = Date.now;
    let shift = 0;
    const wall = spyOn(Date, "now").mockImplementation(
      () => nativeNow() + shift,
    );
    const budget = new GuestTurnBudget(policy, testGuestAccounting);
    try {
      shift = 2000;
      expect(budget.exhausted()).toBe(true);
      expect(budget.signal.aborted).toBe(true);
    } finally {
      budget.dispose();
      wall.mockRestore();
    }
  });
});
