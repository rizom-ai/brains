import { describe, expect, it } from "bun:test";
import { NOTIFICATION_FAILURES, notificationFailureCode } from "../src";

describe("notification failure codes", () => {
  it("names why notifications:send refused, with the transport's own code", () => {
    expect(
      notificationFailureCode(NOTIFICATION_FAILURES.recipientMissing),
    ).toBe("recipient-missing");
    expect(
      notificationFailureCode(NOTIFICATION_FAILURES.transportMissing),
    ).toBe("transport-missing");
    expect(
      notificationFailureCode(
        `${NOTIFICATION_FAILURES.deliveryFailed}: resend_validation_error`,
      ),
    ).toBe("resend_validation_error");
    expect(notificationFailureCode(NOTIFICATION_FAILURES.deliveryFailed)).toBe(
      "delivery-failed",
    );
  });

  it("never lets free text through as a code", () => {
    expect(
      notificationFailureCode(
        `${NOTIFICATION_FAILURES.deliveryFailed}: user@example.com is invalid`,
      ),
    ).toBe("delivery-failed");
    expect(notificationFailureCode("anything else")).toBe("unconfirmed");
    expect(notificationFailureCode(undefined)).toBe("unconfirmed");
  });
});
