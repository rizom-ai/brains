/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createChatClient } from "@brains/contracts/chat";
import { ChatTurn } from "./studio-chat-thread";

describe("a turn's sources", () => {
  test("name and link each source, without its raw record", () => {
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
  });
});
