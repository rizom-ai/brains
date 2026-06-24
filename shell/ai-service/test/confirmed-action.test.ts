import { describe, expect, test } from "bun:test";
import { buildConfirmedActionResult } from "../src/confirmed-action";
import type { PendingConfirmation } from "../src/agent-types";

const pending: PendingConfirmation = {
  id: "approval-1",
  toolCallId: "call-1",
  toolName: "system_update",
  summary: 'Update "My Note"?',
  args: {
    entityType: "note",
    id: "my-note",
    confirmed: true,
    confirmationToken: "token-1",
    contentHash: "hash-1",
  },
};

describe("buildConfirmedActionResult", () => {
  test("reports success and records structured entity memory refs", () => {
    const result = buildConfirmedActionResult(pending, {
      success: true,
      data: { entityId: "my-note", status: "updated" },
    });

    expect(result.resultText).toBe('Completed: Update "My Note"');
    expect(result.toolResult).toEqual({
      toolName: "system_update",
      data: { success: true, data: { entityId: "my-note", status: "updated" } },
      args: pending.args as Record<string, unknown>,
    });
    expect(result.entityMemoryRefs).toEqual([
      {
        entityType: "note",
        entityId: "my-note",
        operation: "created",
        status: "updated",
      },
    ]);

    const approvalCard = result.cards[0];
    expect(approvalCard).toMatchObject({
      kind: "tool-approval",
      id: "approval-1",
      toolCallId: "call-1",
      toolName: "system_update",
      summary: 'Update "My Note"?',
      state: "output-available",
    });
  });

  test("strips internal confirmation fields from the approval card input", () => {
    const result = buildConfirmedActionResult(pending, {
      success: true,
      data: { status: "updated" },
    });

    const approvalCard = result.cards[0];
    expect(approvalCard).toMatchObject({
      input: { entityType: "note", id: "my-note" },
    });
  });

  test("reports failure with the tool error and no memory refs", () => {
    const result = buildConfirmedActionResult(pending, {
      success: false,
      error: "boom",
    });

    expect(result.resultText).toBe('Failed: Update "My Note"\n\nboom');
    expect(result.entityMemoryRefs).toEqual([]);
    expect(result.cards[0]).toMatchObject({
      state: "output-error",
      error: "boom",
    });
  });

  test("falls back to the message field for failure details", () => {
    const result = buildConfirmedActionResult(pending, {
      success: false,
      message: "not allowed",
    });

    expect(result.resultText).toBe('Failed: Update "My Note"\n\nnot allowed');
  });

  test("omits args and card input for non-record args", () => {
    const result = buildConfirmedActionResult(
      { ...pending, args: "raw-string" },
      { success: true, data: { status: "done" } },
    );

    expect(result.toolResult).toEqual({
      toolName: "system_update",
      data: { success: true, data: { status: "done" } },
    });
    expect(result.cards[0]).not.toHaveProperty("input");
  });
});
