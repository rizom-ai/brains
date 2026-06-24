import { describe, expect, it } from "bun:test";
import { PendingApprovalTracker } from "../../src/message-interface/pending-approval-tracker";

describe("PendingApprovalTracker", () => {
  it("remembers pending approval ids from agent responses", async () => {
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => [],
    });

    tracker.rememberFromResponse("conv-1", {
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
      ],
    });

    expect([...(await tracker.getApprovalIds("conv-1"))]).toEqual([
      "approval:call-1",
    ]);
  });

  it("restores approval ids from stored conversation metadata", async () => {
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => [
        {
          metadata: {
            cards: [
              {
                kind: "tool-approval",
                id: "approval:call-1",
                toolName: "system_publish",
                summary: "Publish one",
                state: "approval-requested",
              },
            ],
          },
        },
      ],
    });

    expect([...(await tracker.getApprovalIds("conv-1"))]).toEqual([
      "approval:call-1",
    ]);
  });

  it("removes resolved approval ids", async () => {
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => [],
    });
    tracker.rememberFromResponse("conv-1", {
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval:call-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ],
    });

    tracker.removeApproval("conv-1", "approval:call-1");

    expect([...(await tracker.getApprovalIds("conv-1"))]).toEqual([
      "approval:call-2",
    ]);
  });

  it("syncs pending ids returned by a confirmed action", async () => {
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => [],
    });
    tracker.rememberFromResponse("conv-1", {
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
      ],
    });

    tracker.syncFromResponse(
      "conv-1",
      {
        pendingConfirmations: [
          {
            id: "approval:call-1",
            toolName: "system_publish",
            summary: "Publish one",
            args: {},
          },
          {
            id: "approval:call-2",
            toolName: "system_publish",
            summary: "Publish two",
            args: {},
          },
        ],
      },
      "approval:call-1",
    );

    expect([...(await tracker.getApprovalIds("conv-1"))]).toEqual([
      "approval:call-2",
    ]);
  });

  it("formats remaining approval help when response does not include pending confirmations", () => {
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => [],
    });
    tracker.rememberFromResponse("conv-1", {
      pendingConfirmations: [
        {
          id: "approval:call-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ],
    });

    expect(tracker.formatRemainingApprovalHelp("conv-1", {})).toBe(
      "Remaining pending approval ids: `approval:call-2`.",
    );
  });

  it("does not format remaining help when response carries pending confirmations", () => {
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => [],
    });
    tracker.rememberFromResponse("conv-1", {
      pendingConfirmations: [
        {
          id: "approval:call-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ],
    });

    expect(
      tracker.formatRemainingApprovalHelp("conv-1", {
        pendingConfirmations: [],
      }),
    ).toBeUndefined();
  });

  it("reports restore errors and returns an empty set", async () => {
    const error = new Error("load failed");
    const restoreErrors: unknown[] = [];
    const tracker = new PendingApprovalTracker({
      loadMessages: async (): Promise<readonly unknown[]> => {
        throw error;
      },
      onRestoreError: (restoreError): void => {
        restoreErrors.push(restoreError);
      },
    });

    expect([...(await tracker.getApprovalIds("conv-1"))]).toEqual([]);
    expect(restoreErrors).toEqual([error]);
  });
});
