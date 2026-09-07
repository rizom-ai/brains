import type { GuestExecutionPolicy } from "@brains/contracts/chat";
import type { GuestExecutionAccounting } from "../../src/guest-turn-budget";

// Mock-provider values only: NOT launch defaults, token estimates or real prices.
export const testGuestExecution: GuestExecutionPolicy = {
  limits: {
    messageCharacters: 4000,
    outputTokens: 1200,
    contextTokens: 8000,
    contextBytes: 32000,
    toolSteps: 3,
    toolCalls: 3,
    toolResultCharacters: 12000,
    retrieval: { rows: 5, rowBytes: 12000, queryCharacters: 4000 },
    requestTimeoutSeconds: 90,
  },
  maxCostMicroUsd: 100000,
};
export const testGuestAccounting: GuestExecutionAccounting = {
  model: async () => ({ inputTokens: 8000, maxCostMicroUsd: 1 }),
  tool: async () => ({ maxCostMicroUsd: 1 }),
};
