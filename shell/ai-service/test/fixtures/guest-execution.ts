import type { GuestExecutionPolicy } from "@brains/contracts/chat";

// Mock-provider values only: NOT launch defaults or real prices.
export const testGuestExecution: GuestExecutionPolicy = {
  limits: {
    messageCharacters: 4000,
    requestTimeoutSeconds: 90,
  },
  maxCostMicroUsd: 100000,
};
