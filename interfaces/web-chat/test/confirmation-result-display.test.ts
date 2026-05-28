import { describe, expect, it } from "bun:test";
import {
  formatConfirmationResult,
  formatNativeToolDisplay,
} from "../ui-react/src/ai-elements/data-parts";

describe("confirmation result display", () => {
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

  it("summarizes failed confirmed actions without showing raw JSON", () => {
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

  it("summarizes native tool success output without raw JSON", () => {
    const display = formatNativeToolDisplay({
      type: "dynamic-tool",
      toolName: "system_delete",
      state: "output-available",
      title: "Delete note?",
      output: {
        success: true,
        data: { deleted: "typescript-patterns" },
      },
    });

    expect(display).toEqual({
      variant: "success",
      label: "Delete completed",
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

  it("recognizes the Failed: prefix on legacy result text", () => {
    const display = formatConfirmationResult(
      {
        text: 'Failed: Delete note?\n\nResult: {\n  "success": false,\n  "error": "Entity not found: base/woodchuck-note"\n}',
      },
      "approved",
    );

    expect(display).toEqual({
      variant: "error",
      label: "Action failed · Entity not found: base/woodchuck-note",
    });
  });
});
