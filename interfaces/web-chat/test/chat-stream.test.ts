import { describe, expect, it, mock } from "bun:test";
import type { StructuredChatCard } from "@brains/plugins";
import {
  handleStreamedChat,
  handleStreamedConfirmations,
} from "../src/chat-stream";

const leakedFooter =
  '\n\n[Entities affected this turn: anchor-profile "anchor-profile" (updated). Reference these IDs directly in follow-ups instead of searching for them.]';

function createWriter(): {
  writer: { write: ReturnType<typeof mock> };
  writes: unknown[];
} {
  const writes: unknown[] = [];
  const writer = {
    write: mock((part: unknown) => {
      writes.push(part);
    }),
  };
  return { writer, writes };
}

function textDeltas(writes: unknown[]): string[] {
  return writes.flatMap((write) => {
    if (
      typeof write === "object" &&
      write !== null &&
      "type" in write &&
      write.type === "text-delta" &&
      "delta" in write &&
      typeof write.delta === "string"
    ) {
      return [write.delta];
    }
    return [];
  });
}

function createDeps(
  agent: {
    chat?: ReturnType<typeof mock>;
    confirmPendingAction?: ReturnType<typeof mock>;
  },
  options?: {
    getEntity?: (ref: {
      entityType: string;
      id: string;
      visibilityScope?: unknown;
    }) => Promise<{
      content: unknown;
      metadata: Record<string, unknown>;
    } | null>;
  },
): Parameters<typeof handleStreamedChat>[1] {
  return {
    activeStreams: new Map(),
    agent: agent as never,
    startProcessingInput: mock(() => {}),
    endProcessingInput: mock(() => {}),
    handleAgentResponseToolStatuses: mock(async () => {}),
    createId: (prefix: string) => `${prefix}-id`,
    displayBaseUrl: undefined,
    // Default: every artifact is visible (existing tests have no attachments).
    entityService: {
      getEntity:
        options?.getEntity ??
        (async (): Promise<{
          content: unknown;
          metadata: Record<string, unknown>;
        }> => ({
          content: "data:application/pdf;base64,AA==",
          metadata: {},
        })),
    },
  };
}

function attachmentEvents(writes: unknown[]): string[] {
  return writes.flatMap((write) =>
    typeof write === "object" &&
    write !== null &&
    "type" in write &&
    write.type === "data-attachment" &&
    "id" in write &&
    typeof write.id === "string"
      ? [write.id]
      : [],
  );
}

describe("chat stream", () => {
  it("does not stream internal entity memory footer text from chat responses", async () => {
    const { writer, writes } = createWriter();
    const deps = createDeps({
      chat: mock(async () => ({
        text: `Completed: Updated anchor profile.${leakedFooter}`,
        toolResults: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      })),
    });

    await handleStreamedChat(
      {
        writer: writer as never,
        conversationId: "conversation-1",
        message: "Yeehaa",
        permissionLevel: "anchor",
        attachments: [],
        interfaceType: "web-chat",
      },
      deps,
    );

    const streamedText = textDeltas(writes).join("\n");
    expect(streamedText).toBe("Completed: Updated anchor profile.");
    expect(streamedText).not.toContain("Entities affected this turn");
    expect(streamedText).not.toContain("Reference these IDs directly");
  });

  it("does not stream attachment cards for permission-denied artifacts", async () => {
    const { writer, writes } = createWriter();
    const restrictedCard: StructuredChatCard = {
      kind: "attachment",
      id: "card-restricted",
      title: "Restricted report",
      attachment: {
        filename: "q3-financials.pdf",
        mediaType: "application/pdf",
        url: "/api/files/q3-financials.pdf",
        source: { entityType: "document", entityId: "q3-financials" },
      },
    };
    const visibleCard: StructuredChatCard = {
      kind: "attachment",
      id: "card-visible",
      title: "Public report",
      attachment: {
        filename: "public.pdf",
        mediaType: "application/pdf",
        url: "/api/files/public.pdf",
        source: { entityType: "document", entityId: "public-doc" },
      },
    };
    const deps = createDeps(
      {
        chat: mock(async () => ({
          text: "Here are the files.",
          toolResults: [],
          cards: [restrictedCard, visibleCard],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        })),
      },
      {
        getEntity: async (ref) => {
          const restricted = ref.id === "q3-financials";
          // Visibility-scoped query: the restricted artifact is invisible to
          // a public caller, but it still exists (unscoped lookup finds it).
          if (ref.visibilityScope !== undefined) {
            return restricted
              ? null
              : { content: "data:application/pdf;base64,AA==", metadata: {} };
          }
          return { content: "data:application/pdf;base64,AA==", metadata: {} };
        },
      },
    );

    await handleStreamedChat(
      {
        writer: writer as never,
        conversationId: "conversation-1",
        message: "show me the files",
        permissionLevel: "public",
        attachments: [],
        interfaceType: "web-chat",
      },
      deps,
    );

    const streamed = attachmentEvents(writes);
    expect(streamed).toContain("card-visible");
    expect(streamed).not.toContain("card-restricted");
  });

  it("does not stream internal entity memory footer text from confirmation responses", async () => {
    const { writer, writes } = createWriter();
    const deps = createDeps({
      confirmPendingAction: mock(async () => ({
        text: `Completed: Updated anchor profile.${leakedFooter}`,
        toolResults: [],
        cards: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      })),
    });

    await handleStreamedConfirmations(
      {
        writer: writer as never,
        conversationId: "conversation-1",
        approvalResponses: [{ id: "approval-1", approved: true }],
        permissionLevel: "anchor",
        interfaceType: "web-chat",
      },
      deps,
    );

    const streamedText = textDeltas(writes).join("\n");
    expect(streamedText).toBe("Completed: Updated anchor profile.");
    expect(streamedText).not.toContain("Entities affected this turn");
    expect(streamedText).not.toContain("Reference these IDs directly");
  });
});
