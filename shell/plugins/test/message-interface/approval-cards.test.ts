import { describe, expect, it } from "bun:test";
import type { ToolApprovalCard } from "../../src/contracts/agent";
import {
  buildApprovalResultView,
  formatApprovalRequestText,
  getPendingApprovalCards,
  getResolvedApprovalCard,
} from "../../src/message-interface/approval-cards";

function approvalCard(
  overrides: Partial<ToolApprovalCard> = {},
): ToolApprovalCard {
  return {
    kind: "tool-approval",
    id: "approval:call-1",
    toolName: "system_publish",
    summary: "Publish one note",
    state: "approval-requested",
    ...overrides,
  };
}

describe("getPendingApprovalCards", () => {
  it("returns only approval-requested tool-approval cards", () => {
    const pending = approvalCard();
    const resolved = approvalCard({
      id: "approval:call-2",
      state: "output-available",
    });
    const attachment = {
      kind: "attachment" as const,
      id: "attachment-1",
      title: "Artifact",
      attachment: { mediaType: "image/png", url: "https://example.com/a.png" },
    };

    expect(getPendingApprovalCards([pending, resolved, attachment])).toEqual([
      pending,
    ]);
  });

  it("returns an empty array when cards are undefined", () => {
    expect(getPendingApprovalCards(undefined)).toEqual([]);
  });
});

describe("getResolvedApprovalCard", () => {
  it.each(["output-available", "output-error", "output-denied"] as const)(
    "finds cards in %s state",
    (state) => {
      const resolved = approvalCard({ state });
      expect(getResolvedApprovalCard([approvalCard(), resolved])).toEqual(
        resolved,
      );
    },
  );

  it("ignores pending and responded cards", () => {
    expect(
      getResolvedApprovalCard([
        approvalCard(),
        approvalCard({ id: "approval:call-2", state: "approval-responded" }),
      ]),
    ).toBeUndefined();
  });

  it("returns undefined when cards are undefined", () => {
    expect(getResolvedApprovalCard(undefined)).toBeUndefined();
  });
});

describe("formatApprovalRequestText", () => {
  it("returns the agent text unchanged when no approvals are pending", () => {
    expect(formatApprovalRequestText("Hello", [])).toBe("Hello");
  });

  it("keeps non-empty agent text", () => {
    expect(formatApprovalRequestText("Please confirm.", [approvalCard()])).toBe(
      "Please confirm.",
    );
  });

  it("falls back to the card summary for a single approval", () => {
    expect(formatApprovalRequestText("  ", [approvalCard()])).toBe(
      "Publish one note",
    );
  });

  it("falls back to a generic prompt for multiple approvals", () => {
    expect(
      formatApprovalRequestText("", [
        approvalCard(),
        approvalCard({ id: "approval:call-2" }),
      ]),
    ).toBe("Multiple approvals required.");
  });
});

describe("buildApprovalResultView", () => {
  it("maps output-available to completed", () => {
    expect(
      buildApprovalResultView(approvalCard({ state: "output-available" })),
    ).toEqual({
      resolution: "completed",
      summary: "Publish one note",
      toolName: "system_publish",
      error: undefined,
    });
  });

  it("maps output-denied to declined", () => {
    expect(
      buildApprovalResultView(approvalCard({ state: "output-denied" })),
    ).toEqual({
      resolution: "declined",
      summary: "Publish one note",
      toolName: "system_publish",
      error: undefined,
    });
  });

  it("maps output-error to failed and keeps the error message", () => {
    expect(
      buildApprovalResultView(
        approvalCard({ state: "output-error", error: "Disk full" }),
      ),
    ).toEqual({
      resolution: "failed",
      summary: "Publish one note",
      toolName: "system_publish",
      error: "Disk full",
    });
  });

  it("only exposes the error for failed resolutions", () => {
    expect(
      buildApprovalResultView(
        approvalCard({ state: "output-denied", error: "Ignored" }),
      ).error,
    ).toBeUndefined();
  });
});
