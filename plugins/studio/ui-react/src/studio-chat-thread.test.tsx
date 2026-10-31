/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createChatClient } from "@brains/contracts/chat";
import { ChatTurn } from "./studio-chat-thread";

describe("a turn's sources", () => {
  test("name and link each source, without its raw record or excerpt", () => {
    const html = renderToStaticMarkup(
      <ChatTurn
        disabled={false}
        client={createChatClient()}
        onAction={async () => {}}
        onApproval={async () => {}}
        message={{
          id: "m1",
          role: "assistant",
          content: "Answer.",
          timestamp: "2026-10-12T00:00:00.000Z",
          cards: [
            {
              kind: "sources",
              id: "sources:tool-results",
              title: "Retrieved sources",
              sources: [
                {
                  id: "book-section:ecce-homo:00008-3",
                  title: "EH-Weise-3",
                  source: "book-section",
                  entityType: "book-section",
                  entityId: "ecce-homo:00008-3",
                  url: "https://friedrich.rizom.ai/books/ecce-homo/8",
                  excerpt: "… der tiefste Einwand …",
                  provenance: { toolName: "system_search", score: 0.8 },
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(html).toContain(
      'href="https://friedrich.rizom.ai/books/ecce-homo/8"',
    );
    expect(html).toContain(">EH-Weise-3</a>");
    expect(html).toContain("book-section");
    expect(html).not.toContain("Source details");
    expect(html).not.toContain("provenance");
    expect(html).not.toContain("der tiefste Einwand");
  });
});

describe("an approval card", () => {
  function renderApproval(
    state: "approval-requested" | "output-available",
  ): string {
    return renderToStaticMarkup(
      <ChatTurn
        disabled={false}
        client={createChatClient()}
        onAction={async () => {}}
        onApproval={async () => {}}
        message={{
          id: "m2",
          role: "assistant",
          content: "Confirmation required.",
          timestamp: "2026-10-31T00:00:00.000Z",
          cards: [
            {
              kind: "tool-approval",
              id: "approval:call-1",
              toolName: "system_create",
              summary: "Save 2 uploaded files?",
              completionSummary: 'Saved 2 uploaded files: note "Harbor Log".',
              state,
            },
          ],
        }}
      />,
    );
  }

  test("does not say what was saved while it waits for approval", () => {
    const html = renderApproval("approval-requested");
    expect(html).toContain("Save 2 uploaded files?");
    expect(html).not.toContain("Saved 2 uploaded files");
  });

  test("says what was saved once the action completed", () => {
    expect(renderApproval("output-available")).toContain(
      "Saved 2 uploaded files",
    );
  });
});
