import { describe, expect, it } from "bun:test";
import {
  containsApprovalIdToken,
  extractApprovalId,
  parseConfirmationIntent,
  routeConfirmationResponse,
} from "../../src/message-interface/confirmation-routing";

describe("routeConfirmationResponse", () => {
  it("returns not-confirmation when no approvals are pending", () => {
    expect(
      routeConfirmationResponse({ message: "yes", approvalIds: new Set() }),
    ).toEqual({ kind: "not-confirmation" });
  });

  it("confirms a single pending approval with yes", () => {
    expect(
      routeConfirmationResponse({
        message: "yes",
        approvalIds: new Set(["approval:call-1"]),
      }),
    ).toEqual({
      kind: "confirm",
      approvalId: "approval:call-1",
      confirmed: true,
    });
  });

  it("cancels a single pending approval with no", () => {
    expect(
      routeConfirmationResponse({
        message: "no",
        approvalIds: new Set(["approval:call-1"]),
      }),
    ).toEqual({
      kind: "confirm",
      approvalId: "approval:call-1",
      confirmed: false,
    });
  });

  it("accepts confirmation tokens in a longer reply", () => {
    expect(
      routeConfirmationResponse({
        message: "yes approval:call-2 please",
        approvalIds: new Set(["approval:call-1", "approval:call-2"]),
      }),
    ).toEqual({
      kind: "confirm",
      approvalId: "approval:call-2",
      confirmed: true,
    });
  });

  it("requires an approval id when multiple approvals are pending", () => {
    expect(
      routeConfirmationResponse({
        message: "yes",
        approvalIds: new Set(["approval:call-1", "approval:call-2"]),
      }),
    ).toEqual({
      kind: "notice",
      message:
        "Multiple approvals are pending; include one approval id with yes or no/cancel: approval:call-1, approval:call-2.",
    });
  });

  it("reports explicit unknown approval ids", () => {
    expect(
      routeConfirmationResponse({
        message: "yes approval:missing",
        approvalIds: new Set(["approval:call-1"]),
      }),
    ).toEqual({
      kind: "notice",
      message:
        "No matching pending approval id. Pending approval ids: approval:call-1.",
    });
  });

  it("prompts for yes/no when text does not contain confirmation intent", () => {
    expect(
      routeConfirmationResponse({
        message: "what will happen?",
        approvalIds: new Set(["approval:call-1"]),
      }),
    ).toEqual({
      kind: "notice",
      message: "Please reply with yes to confirm or no/cancel to abort.",
    });
  });
});

describe("parseConfirmationIntent", () => {
  it("finds approval ids with the longest match first", () => {
    expect(
      parseConfirmationIntent(
        "yes approval:call-10",
        new Set(["approval:call-1", "approval:call-10"]),
      ),
    ).toEqual({ confirmed: true, approvalId: "approval:call-10" });
  });
});

describe("extractApprovalId", () => {
  it("does not match approval ids inside larger tokens", () => {
    expect(
      extractApprovalId("yes xapproval:call-1", new Set(["approval:call-1"])),
    ).toBeUndefined();
  });
});

describe("containsApprovalIdToken", () => {
  it("matches ids surrounded by punctuation", () => {
    expect(
      containsApprovalIdToken("approve (approval:call-1)", "approval:call-1"),
    ).toBe(true);
  });

  it("does not match ids embedded in words", () => {
    expect(
      containsApprovalIdToken("approval:call-1-extra", "approval:call-1"),
    ).toBe(false);
  });
});
