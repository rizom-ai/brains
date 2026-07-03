import { describe, expect, it } from "bun:test";
import { formatStructuredCardFallback } from "../../src/message-interface/structured-card-fallback";
import type { StructuredChatCard } from "../../src/contracts/agent";

const baseOptions = {
  deniedCardIds: undefined,
  resolveUrl: (url: string | undefined): string | undefined => url,
  isHiddenUrl: (url: string): boolean => url.includes("localhost"),
  eventActionUnavailableLabel: "not available in Discord",
};

describe("formatStructuredCardFallback", () => {
  it("formats denied artifact fallback without links", () => {
    const card: StructuredChatCard = {
      kind: "attachment",
      id: "artifact-1",
      title: "Secret report",
      attachment: {
        mediaType: "application/pdf",
        url: "https://example.com/report.pdf",
      },
    };

    expect(
      formatStructuredCardFallback(card, {
        ...baseOptions,
        deniedCardIds: new Set(["artifact-1"]),
      }),
    ).toBe("Artifact: Not available at your access level.");
  });

  it("formats visible artifact fallback and hides local links", () => {
    const card: StructuredChatCard = {
      kind: "attachment",
      id: "artifact-1",
      title: "Report",
      description: "A generated report",
      attachment: {
        filename: "report.pdf",
        mediaType: "application/pdf",
        url: "http://localhost:3000/report.pdf",
        downloadUrl: "https://example.com/report.pdf",
        sizeBytes: 1024,
      },
    };

    expect(formatStructuredCardFallback(card, baseOptions)).toBe(
      [
        "Artifact: Report",
        "A generated report",
        "File: report.pdf",
        "Type: application/pdf",
        "Size: 1.0 KB",
        "Download: https://example.com/report.pdf",
      ].join("\n"),
    );
  });

  it("formats tool approval fallback with summarized output", () => {
    const card: StructuredChatCard = {
      kind: "tool-approval",
      id: "approval:call-1",
      toolName: "system_create",
      summary: "Create note",
      state: "output-error",
      output: { success: false, error: "No permission" },
    };

    expect(formatStructuredCardFallback(card, baseOptions)).toBe(
      "Approval: Create note\nStatus: output-error\nResult: Failed · No permission",
    );
  });

  it("formats source fallback with public links only", () => {
    const card: StructuredChatCard = {
      kind: "sources",
      id: "sources-1",
      title: "Context",
      sources: [
        { id: "source-1", source: "local", url: "http://localhost:3000/a" },
        { id: "source-2", source: "remote", url: "https://example.com/b" },
      ],
    };

    expect(formatStructuredCardFallback(card, baseOptions)).toBe(
      "Sources: Context\n- local\n- remote — https://example.com/b",
    );
  });

  it("formats action fallback with transport unavailable labels", () => {
    const card: StructuredChatCard = {
      kind: "actions",
      id: "actions-1",
      title: "Next steps",
      actions: [
        {
          type: "prompt",
          id: "prompt-1",
          label: "Summarize",
          prompt: "Summarize this",
        },
        {
          type: "event",
          id: "event-1",
          label: "Open modal",
          event: "modal.open",
        },
      ],
    };

    expect(formatStructuredCardFallback(card, baseOptions)).toBe(
      "Actions: Next steps\n- Summarize\n- Open modal (not available in Discord)",
    );
  });
});
