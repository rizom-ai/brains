import { describe, expect, it } from "bun:test";
import {
  notificationsSendContract,
  sendNotificationResultSchema,
} from "../src";

describe("notification refusals", () => {
  it("are answers that name why notifications:send refused", () => {
    for (const answer of [
      { status: "failed", failure: "recipient-missing" },
      { status: "failed", failure: "transport-missing" },
      {
        status: "failed",
        failure: "delivery-failed",
        transportCode: "resend_validation_error",
      },
      { status: "failed", failure: "delivery-failed" },
    ]) {
      const parsed: unknown = sendNotificationResultSchema.parse(answer);
      expect(parsed).toEqual(answer);
    }
    // The contract answers with exactly this schema.
    expect(
      Object.is(
        notificationsSendContract.response,
        sendNotificationResultSchema,
      ),
    ).toBe(true);
  });

  it("never let free text through as a reason or a transport code", () => {
    for (const answer of [
      { status: "failed", failure: "the inbox was full" },
      {
        status: "failed",
        failure: "delivery-failed",
        transportCode: "user@example.com is invalid",
      },
      { status: "failed" },
    ]) {
      expect(sendNotificationResultSchema.safeParse(answer).success).toBe(
        false,
      );
    }
  });
});
