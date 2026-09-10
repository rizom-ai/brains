import type { EnabledGuestPolicy } from "../../src/guest-policy";

// Test policy only; no production defaults or launch approval.
export const testGuestPolicy: EnabledGuestPolicy = {
  enabled: true,
  origin: "https://brain.test",
  issuance: {
    requestsPerMinute: 30,
    requestsPerDay: 100,
    maxStoredCredentials: 100,
  },
  limits: {
    messageCharacters: 4000,
    outputTokens: 1200,
    contextTokens: 8000,
    contextBytes: 32000,
    toolCalls: 3,
    userTurns: 20,
    toolSteps: 3,
    toolResultCharacters: 12000,
    requestsPerMinute: 5,
    requestsPerDay: 20,
    globalRequestsPerMinute: 30,
    globalRequestsPerDay: 100,
    globalConcurrency: 4,
    requestTimeoutSeconds: 90,
    streamIdleTimeoutSeconds: 30,
  },
  retention: { idleSeconds: 86400, maxAgeSeconds: 604800 },
  budget: { dailyUsd: 10, maxTurnUsd: 0.1 },
  disclosure: {
    provider: "Test provider",
    notice:
      "Messages reach this Brain and its AI provider. Do not share sensitive information.",
    deletionLimitations: "Provider and security-log retention are separate.",
  },
};
