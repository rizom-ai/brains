import { describe, expect, it } from "bun:test";
import { GUEST_DENIAL_STATUS } from "../src/guest-http";

describe("GUEST_DENIAL_STATUS", () => {
  it("answers each admission denial with its HTTP status", () => {
    expect(GUEST_DENIAL_STATUS).toEqual({
      unavailable: 503,
      "invalid-input": 400,
      "conversation-unavailable": 404,
      "submission-conflict": 409,
      "visitor-busy": 429,
      "deployment-busy": 429,
      "visitor-rate-limit": 429,
      "deployment-rate-limit": 429,
      "conversation-limit": 429,
      "budget-exhausted": 429,
    });
  });
});
