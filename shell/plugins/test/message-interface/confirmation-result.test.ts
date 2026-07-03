import { describe, expect, it } from "bun:test";
import {
  formatConfirmationResult,
  formatStructuredOutputSummary,
  getConfirmationResultTitle,
} from "../../src/message-interface/confirmation-result";

describe("formatConfirmationResult", () => {
  it("prefers structured approval cards over legacy tool results", () => {
    const display = formatConfirmationResult(
      {
        text: "Completed: Delete note?",
        toolResults: [
          {
            toolName: "delete_note",
            data: { success: true },
          },
        ],
        cards: [
          {
            kind: "tool-approval",
            id: "approval:call-1",
            toolName: "delete_note",
            summary: "Delete note?",
            state: "output-error",
            output: {
              success: false,
              error: "Entity not found: base/woodchuck-note",
            },
            error: "Entity not found: base/woodchuck-note",
          },
        ],
      },
      "approved",
    );

    expect(display).toEqual({
      variant: "error",
      label: "Delete note failed · Entity not found: base/woodchuck-note",
    });
  });

  it("summarizes failed confirmed actions without exposing raw JSON", () => {
    const display = formatConfirmationResult(
      {
        text: 'Completed: Delete note?\n\nResult: {\n  "success": false,\n  "error": "Entity not found: base/woodchuck-note"\n}',
        toolResults: [
          {
            toolName: "delete_note",
            data: {
              success: false,
              error: "Entity not found: base/woodchuck-note",
            },
          },
        ],
      },
      "approved",
    );

    expect(display).toEqual({
      variant: "error",
      label: "Delete note failed · Entity not found: base/woodchuck-note",
    });
    expect(display.label).not.toContain('"success"');
  });

  it("summarizes native tool success output", () => {
    const display = formatConfirmationResult(
      {
        text: "Delete note?",
        cards: [
          {
            kind: "tool-approval",
            toolName: "system_delete",
            state: "output-available",
            output: {
              success: true,
              data: { deleted: "typescript-patterns" },
            },
          },
        ],
      },
      null,
    );

    expect(display).toEqual({
      variant: "success",
      label: "Delete completed",
    });
  });

  it("summarizes denied tool output", () => {
    const display = formatConfirmationResult(
      {
        text: "Delete note?",
        cards: [
          {
            kind: "tool-approval",
            toolName: "system_delete",
            state: "output-denied",
          },
        ],
      },
      null,
    );

    expect(display).toEqual({
      variant: "declined",
      label: "Delete denied",
    });
  });

  it("falls back to parsing legacy result text", () => {
    const display = formatConfirmationResult(
      {
        text: 'Completed: Delete note?\n\nResult: {\n  "success": false,\n  "error": "Entity not found: base/woodchuck-note"\n}',
      },
      "approved",
    );

    expect(display).toEqual({
      variant: "error",
      label: "Action failed · Entity not found: base/woodchuck-note",
    });
  });

  it("recognizes declined decisions", () => {
    expect(formatConfirmationResult({ text: "" }, "declined")).toEqual({
      variant: "declined",
      label: "Declined",
    });
  });
});

describe("getConfirmationResultTitle", () => {
  it("maps confirmation variants to concise titles", () => {
    expect(getConfirmationResultTitle("success")).toBe("Approval confirmed");
    expect(getConfirmationResultTitle("declined")).toBe("Approval declined");
    expect(getConfirmationResultTitle("error")).toBe("Action failed");
  });
});

describe("formatStructuredOutputSummary", () => {
  it("passes through primitive output values", () => {
    expect(formatStructuredOutputSummary("done")).toBe("done");
    expect(formatStructuredOutputSummary(42)).toBe("42");
    expect(formatStructuredOutputSummary(true)).toBe("true");
  });

  it("summarizes failed structured output without raw JSON", () => {
    expect(
      formatStructuredOutputSummary({
        success: false,
        error: "Publish failed",
        internal: { request: "secret" },
      }),
    ).toBe("Failed · Publish failed");
  });

  it("omits unsupported object output", () => {
    expect(
      formatStructuredOutputSummary({ success: true, internal: "hidden" }),
    ).toBeUndefined();
  });
});
