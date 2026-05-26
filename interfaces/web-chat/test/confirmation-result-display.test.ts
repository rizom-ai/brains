import { describe, expect, it } from "bun:test";
import { formatConfirmationResult } from "../ui-react/src/ai-elements/data-parts";

describe("confirmation result display", () => {
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
});
